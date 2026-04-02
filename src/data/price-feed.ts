import { createLogger } from '../utils/logger';
import { getDb } from '../utils/database';
import { dataProvider } from './provider';

const logger = createLogger('PriceFeed');

/**
 * Price Feed with Smart Polling
 * 
 * - Polls every 20 seconds (3 tokens × 1 req/sec = 3 sec, well under 60 RPM)
 * - Uses cached prices when available
 * - Batches all token requests together
 */

interface TokenPrice {
  token: string;
  price: number;
  timestamp: number;
  source: string;
}

interface PriceSubscriber {
  callback: (price: TokenPrice) => void;
  token: string;
}

export class PriceFeed {
  private subscribers: Map<string, Set<PriceSubscriber>> = new Map();
  private priceCache: Map<string, TokenPrice> = new Map();
  private candleCache: Map<string, Array<{timestamp: number, open: number, high: number, low: number, close: number, volume: number}>> = new Map();
  private isRunning = false;
  private pollInterval?: NodeJS.Timeout;
  private tokens: string[] = [];

  constructor() {
    logger.info('PriceFeed initialized');
  }

  async start(tokens: string[]): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    this.tokens = tokens;

    logger.info(`Starting price feed for: ${tokens.join(', ')}`);

    // Initialize candles
    for (const token of tokens) {
      this.candleCache.set(token, []);
    }

    // Initial fetch
    await this.fetchPrices();

    // Poll every 20 seconds (conservative for rate limits)
    this.pollInterval = setInterval(() => {
      this.fetchPrices().catch(err => logger.error('Fetch failed:', err.message));
    }, 20000);

    logger.info('Price feed running (20s interval)');
  }

  stop(): void {
    this.isRunning = false;
    if (this.pollInterval) clearInterval(this.pollInterval);
    logger.info('Price feed stopped');
  }

  private async fetchPrices(): Promise<void> {
    try {
      const prices = await dataProvider.getPrices(this.tokens);
      
      for (const price of prices) {
        this.priceCache.set(price.token, price);
        this.updateCandle(price.token, price.price);
        this.notifySubscribers(price);
        await this.cachePrice(price);
      }

      logger.debug(`Updated ${prices.length} prices`);
    } catch (error: any) {
      logger.error('Price fetch failed:', error.message);
    }
  }

  private updateCandle(token: string, price: number): void {
    const candles = this.candleCache.get(token);
    if (!candles) return;

    const now = Date.now();
    const lastCandle = candles[candles.length - 1];
    const interval = 5 * 60 * 1000;

    if (!lastCandle || now - lastCandle.timestamp >= interval) {
      candles.push({
        timestamp: now,
        open: price,
        high: price,
        low: price,
        close: price,
        volume: Math.random() * 100000,
      });
      if (candles.length > 100) candles.shift();
    } else {
      lastCandle.high = Math.max(lastCandle.high, price);
      lastCandle.low = Math.min(lastCandle.low, price);
      lastCandle.close = price;
    }
  }

  getOHLCV(token: string, limit: number = 50): Array<{timestamp: number, open: number, high: number, low: number, close: number, volume: number}> {
    const candles = this.candleCache.get(token) || [];
    
    // Fill with synthetic data if we don't have enough
    if (candles.length < limit) {
      const price = this.getPrice(token);
      if (price) {
        const synthetic = this.generateSyntheticCandles(price, limit - candles.length);
        return [...synthetic, ...candles].slice(-limit);
      }
    }
    
    return candles.slice(-limit);
  }

  private generateSyntheticCandles(price: number, count: number) {
    const candles = [];
    const now = Date.now();
    for (let i = count - 1; i >= 0; i--) {
      candles.push({
        timestamp: now - i * 5 * 60 * 1000,
        open: price * (1 + (Math.random() - 0.5) * 0.02),
        high: price * 1.02,
        low: price * 0.98,
        close: price,
        volume: 500000,
      });
    }
    return candles;
  }

  getPrice(token: string): number | null {
    return this.priceCache.get(token)?.price || null;
  }

  subscribe(token: string, callback: (price: TokenPrice) => void): () => void {
    const subscriber = { callback, token };
    if (!this.subscribers.has(token)) this.subscribers.set(token, new Set());
    this.subscribers.get(token)!.add(subscriber);
    return () => this.subscribers.get(token)?.delete(subscriber);
  }

  private notifySubscribers(price: TokenPrice): void {
    this.subscribers.get(price.token)?.forEach(sub => {
      try { sub.callback(price); } catch (e) {}
    });
  }

  private async cachePrice(price: TokenPrice): Promise<void> {
    try {
      const db = getDb();
      await db.run(
        `INSERT OR REPLACE INTO price_cache (token, timestamp, price) VALUES (?, ?, ?)`,
        [price.token, Math.floor(price.timestamp / 1000), price.price]
      );
    } catch {}
  }
}
