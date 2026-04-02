import axios from 'axios';
import { createLogger } from '../utils/logger';
import { rateLimiter } from './rate-limiter';

const logger = createLogger('BirdeyeAPI');

/**
 * Birdeye API Client with Smart Rate Limiting
 * 
 * Features:
 * - Global rate limit coordination (60 RPM)
 * - Request queuing and prioritization
 * - Automatic retry with backoff
 * - Price caching to minimize API calls
 */

const BIRDEYE_API_URL = 'https://public-api.birdeye.so';

// Token mint addresses for Solana
const TOKEN_MINTS: Record<string, string> = {
  'WIF': 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
  'BONK': 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
  'PEPE': '2RSQFSLUmMZW278FhM2su8rRtwAa45X6sP1ujpAm7d9r',
};

export interface TokenPrice {
  token: string;
  price: number;
  timestamp: number;
  volume24h?: number;
  change24h?: number;
  source: string;
}

interface BirdeyePriceResponse {
  success: boolean;
  data: {
    value: number;
    updateUnixTime: number;
    updateHumanTime: string;
  };
}

export class BirdeyeAPI {
  private apiKey: string;
  private enabled: boolean;
  private priceCache: Map<string, TokenPrice> = new Map();
  private readonly CACHE_TTL = 15000; // 15 seconds cache

  constructor(apiKey?: string) {
    const key = apiKey || process.env.BIRDEYE_API_KEY || '';
    // Disable if placeholder, disabled, or invalid
    this.apiKey = key && !key.includes('your_') && !key.includes('xxx') && !key.includes('disabled') ? key : '';
    this.enabled = !!this.apiKey;
    
    if (this.enabled) {
      logger.info('Birdeye API initialized with smart rate limiting');
    } else {
      logger.warn('Birdeye API key not configured');
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Get cached price if available and fresh
   */
  getCachedPrice(token: string): TokenPrice | null {
    const cached = this.priceCache.get(token);
    if (!cached) return null;
    
    const age = Date.now() - cached.timestamp;
    if (age < this.CACHE_TTL) {
      return cached;
    }
    return null;
  }

  /**
   * Get token prices with rate limiting and caching
   */
  async getPrices(tokens: string[]): Promise<TokenPrice[]> {
    if (!this.enabled) {
      throw new Error('Birdeye API not configured');
    }

    const prices: TokenPrice[] = [];
    const tokensToFetch: string[] = [];

    // Check cache first
    for (const token of tokens) {
      const cached = this.getCachedPrice(token);
      if (cached) {
        logger.debug(`Using cached price for ${token}: $${cached.price.toFixed(6)}`);
        prices.push(cached);
      } else {
        tokensToFetch.push(token);
      }
    }

    // Fetch missing prices with rate limiting
    for (const token of tokensToFetch) {
      const mint = TOKEN_MINTS[token];
      if (!mint) {
        logger.warn(`No mint address for token: ${token}`);
        continue;
      }

      try {
        const price = await rateLimiter.execute(
          'birdeye',
          () => this.fetchPrice(mint, token),
          5 // normal priority
        );
        
        if (price) {
          this.priceCache.set(token, price);
          prices.push(price);
        }
      } catch (error) {
        logger.error(`Failed to get ${token} price:`, error);
        // Continue with other tokens
      }
    }

    if (prices.length === 0) {
      throw new Error('No prices fetched from Birdeye');
    }

    logger.info(`Birdeye prices: ${prices.map(p => `${p.token}=$${p.price.toFixed(6)}`).join(', ')}`);
    return prices;
  }

  /**
   * Fetch price from API (internal use)
   */
  private async fetchPrice(mint: string, tokenSymbol: string): Promise<TokenPrice | null> {
    const response = await axios.get(
      `${BIRDEYE_API_URL}/defi/price?address=${mint}`,
      {
        timeout: 10000,
        headers: {
          'X-API-KEY': this.apiKey,
          'Accept': 'application/json',
        }
      }
    );

    const data = response.data as BirdeyePriceResponse;

    if (!data.success || !data.data?.value) {
      logger.warn(`No price data for ${tokenSymbol}`);
      return null;
    }

    return {
      token: tokenSymbol,
      price: data.data.value,
      timestamp: Date.now(),
      source: 'birdeye',
    };
  }

  /**
   * Get OHLCV historical data
   */
  async getOHLCV(
    token: string,
    timeframe: '1m' | '5m' | '15m' | '1h' | '4h' | '1d' = '5m',
    limit: number = 50
  ): Promise<Array<{timestamp: number, open: number, high: number, low: number, close: number, volume: number}>> {
    if (!this.enabled) {
      throw new Error('Birdeye API not configured');
    }

    const mint = TOKEN_MINTS[token];
    if (!mint) {
      throw new Error(`No mint address for: ${token}`);
    }

    const typeMap: Record<string, string> = {
      '1m': '1m', '5m': '5m', '15m': '15m',
      '1h': '1H', '4h': '4H', '1d': '1D',
    };

    return rateLimiter.execute(
      'birdeye',
      async () => {
        const response = await axios.get(
          `${BIRDEYE_API_URL}/defi/ohlcv?base_address=${mint}&type=${typeMap[timeframe]}&time_from=${Math.floor(Date.now()/1000) - limit * 300}&time_to=${Math.floor(Date.now()/1000)}`,
          {
            timeout: 15000,
            headers: {
              'X-API-KEY': this.apiKey,
              'Accept': 'application/json',
            }
          }
        );

        const data = response.data;
        if (!data.success || !Array.isArray(data.data)) {
          throw new Error('Invalid OHLCV response');
        }

        return data.data.map((candle: any) => ({
          timestamp: candle.unixTime * 1000,
          open: candle.o,
          high: candle.h,
          low: candle.l,
          close: candle.c,
          volume: candle.v,
        }));
      },
      3 // higher priority for OHLCV
    );
  }

  clearCache(): void {
    this.priceCache.clear();
  }
}

export const birdeyeAPI = new BirdeyeAPI();
