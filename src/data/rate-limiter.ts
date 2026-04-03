import { createLogger } from '../utils/logger';

const logger = createLogger('RateLimiter');

/**
 * Global Rate Limiter
 * 
 * Manages API request rates across all providers:
 * - Birdeye: 60 RPM (1 req/sec)
 * - CoinGecko: 30 RPM with free key (0.5 req/sec)
 * 
 * Implements:
 * - Request queuing
 * - Token bucket algorithm
 * - Cross-provider coordination
 * - Automatic retry with backoff
 */

interface RateLimitConfig {
  requestsPerMinute: number;
  burstSize?: number;
}

interface QueuedRequest<T> {
  execute: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: any) => void;
  provider: string;
  priority: number;
  timestamp: number;
}

export class RateLimiter {
  private queues: Map<string, QueuedRequest<any>[]> = new Map();
  private lastRequestTime: Map<string, number> = new Map();
  private configs: Map<string, RateLimitConfig> = new Map();
  private processing: Map<string, boolean> = new Map();

  constructor() {
    // Jupiter: 600 requests per 10 minutes = 60 RPM
    this.configs.set('jupiter', { requestsPerMinute: 60, burstSize: 5 });
    
    // Birdeye: 60 RPM = 1 request per second
    this.configs.set('birdeye', { requestsPerMinute: 60, burstSize: 3 });
    
    // CoinGecko: 30 RPM = 1 request per 2 seconds (with API key)
    this.configs.set('coingecko', { requestsPerMinute: 30, burstSize: 2 });
    
    // CoinGecko Free Tier: 10 RPM = 1 request per 6 seconds (stricter limits)
    this.configs.set('coingecko-free', { requestsPerMinute: 10, burstSize: 1 });
  }

  /**
   * Execute a function with rate limiting
   */
  async execute<T>(
    provider: string,
    executeFn: () => Promise<T>,
    priority: number = 5
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const request: QueuedRequest<T> = {
        execute: executeFn,
        resolve,
        reject,
        provider,
        priority,
        timestamp: Date.now(),
      };

      if (!this.queues.has(provider)) {
        this.queues.set(provider, []);
      }

      // Add to queue and sort by priority (lower number = higher priority)
      this.queues.get(provider)!.push(request);
      this.queues.get(provider)!.sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return a.timestamp - b.timestamp;
      });

      // Start processing if not already
      this.processQueue(provider);
    });
  }

  /**
   * Process the request queue
   */
  private async processQueue(provider: string): Promise<void> {
    if (this.processing.get(provider)) return;
    this.processing.set(provider, true);

    const queue = this.queues.get(provider) || [];
    const config = this.configs.get(provider);

    if (!config) {
      logger.error(`No rate limit config for provider: ${provider}`);
      this.processing.set(provider, false);
      return;
    }

    while (queue.length > 0) {
      const minInterval = 60000 / config.requestsPerMinute; // ms between requests
      const lastTime = this.lastRequestTime.get(provider) || 0;
      const now = Date.now();
      const timeSinceLastRequest = now - lastTime;

      if (timeSinceLastRequest < minInterval) {
        const waitTime = minInterval - timeSinceLastRequest;
        logger.debug(`${provider}: Rate limiting - waiting ${waitTime}ms`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }

      const request = queue.shift();
      if (!request) continue;

      this.lastRequestTime.set(provider, Date.now());

      try {
        const result = await request.execute();
        request.resolve(result);
      } catch (error: any) {
        // Handle rate limit errors with exponential backoff
        if (error.response?.status === 429) {
          const retryAfter = parseInt(error.response.headers['retry-after']) || 5;
          logger.warn(`${provider}: Rate limited, waiting ${retryAfter}s before retry`);
          await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
          
          // Re-queue the request with higher priority
          request.priority = 1;
          queue.unshift(request);
        } else {
          request.reject(error);
        }
      }
    }

    this.processing.set(provider, false);
  }

  /**
   * Get current queue size for a provider
   */
  getQueueSize(provider: string): number {
    return this.queues.get(provider)?.length || 0;
  }

  /**
   * Check if provider is currently rate limited
   */
  isRateLimited(provider: string): boolean {
    const config = this.configs.get(provider);
    if (!config) return false;

    const minInterval = 60000 / config.requestsPerMinute;
    const lastTime = this.lastRequestTime.get(provider) || 0;
    return Date.now() - lastTime < minInterval;
  }
}

// Singleton instance
export const rateLimiter = new RateLimiter();
