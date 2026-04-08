import axios from 'axios';
import { createLogger } from '../utils/logger';

const logger = createLogger('JupiterPriceAPI');

/**
 * Jupiter Price API Client
 * 
 * Jupiter provides free token price feeds:
 * - Real-time prices for SPL tokens
 * - No API key required for basic usage
 * - Rate limit: 600 requests per 10 minutes (1 req/sec average)
 * - Docs: https://station.jup.ag/docs/apis/price-api
 */

const JUPITER_PRICE_URL = 'https://api.jup.ag/price/v2';

// Token mint addresses for Solana
const TOKEN_MINTS: Record<string, string> = {
  'SOL': 'So11111111111111111111111111111111111111112',
  'BONK': 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
  'JUP': 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
  'RAY': '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
  'WIF': 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
  'BOME': 'ukHH6c7mMyiWCf1b9pnWe25TSpkddt3H5pQZgD74n82',
  'POPCAT': '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr',
  'MEW': 'MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREZQzSPWrH',
  'JTO': 'JTO4fXxRvsqMXUr8gqVgrcFS6ob1P98AS5M1sPXs8Wv',
  'PYTH': 'HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3',
  'RENDER': 'rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof',
  'TNSR': 'TNSRxcUxoT9xBGQdezRHm6eUeAKpZrKAAryWdPQB4jF',
  'W': '85VBFQZC9TZkfaptKmjvMVrRjA1Cp9f4KsU4JrsN9HhL',
  'HNT': 'hntyVP6YFm1Hg25TN9bFnau4rqqg1JbXvkZz79q4MYR',
  'FIDA': 'EchesyfXePKdLtoiZSLiP8TZkbyMW1NynzMFNZ8fT5Kx',
  'PEPE': 'nB93Wg2saBn2CPp5r4vTcK9V6Q3LbjnQZq8Z9QjJmx',
};

export interface TokenPrice {
  token: string;
  price: number;
  timestamp: number;
  volume24h?: number;
  change24h?: number;
  source: string;
}

export class JupiterPriceAPI {
  private lastRequestTime = 0;
  private readonly MIN_REQUEST_INTERVAL = 1000; // 1 second between requests

  /**
   * Get token prices from Jupiter
   * Can fetch multiple tokens in one request
   */
  async getPrices(tokens: string[]): Promise<TokenPrice[]> {
    // Rate limiting
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.MIN_REQUEST_INTERVAL) {
      await new Promise(resolve => 
        setTimeout(resolve, this.MIN_REQUEST_INTERVAL - timeSinceLastRequest)
      );
    }

    const mints = tokens
      .map(t => TOKEN_MINTS[t])
      .filter(Boolean)
      .join(',');

    if (!mints) {
      throw new Error('No valid token mints found');
    }

    try {
      const response = await axios.get(
        `${JUPITER_PRICE_URL}?ids=${mints}`,
        { timeout: 10000 }
      );

      this.lastRequestTime = Date.now();

      const prices: TokenPrice[] = [];
      const data = response.data?.data || {};

      for (const [mint, info] of Object.entries(data)) {
        const token = Object.entries(TOKEN_MINTS).find(([, m]) => m === mint)?.[0];
        if (!token) continue;

        const priceInfo = info as any;
        prices.push({
          token,
          price: parseFloat(priceInfo.price) || 0,
          timestamp: Date.now(),
          change24h: priceInfo.extraInfo?.last1HourPrice 
            ? ((parseFloat(priceInfo.price) - parseFloat(priceInfo.extraInfo.last1HourPrice)) / parseFloat(priceInfo.extraInfo.last1HourPrice)) * 100
            : undefined,
          source: 'jupiter',
        });
      }

      return prices;
    } catch (error) {
      logger.error('Jupiter price fetch failed:', error);
      throw error;
    }
  }

  /**
   * Get single token price
   */
  async getPrice(token: string): Promise<TokenPrice | null> {
    try {
      const prices = await this.getPrices([token]);
      return prices[0] || null;
    } catch {
      return null;
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await axios.get(
        `${JUPITER_PRICE_URL}?ids=${TOKEN_MINTS['SOL']}`,
        { timeout: 5000 }
      );
      return response.status === 200 && response.data?.data?.[TOKEN_MINTS['SOL']]?.price;
    } catch {
      return false;
    }
  }
}

// Singleton instance
export const jupiterPriceAPI = new JupiterPriceAPI();
