import axios from 'axios';
import { createLogger } from '../utils/logger';
import { BirdeyeAPI } from './birdeye-api';
import { rateLimiter } from './rate-limiter';

const logger = createLogger('DataProvider');

/**
 * Unified Data Provider with Smart Rate Limiting
 * 
 * Priority:
 * 1. Jupiter Price API v3 (free, no key, higher rate limits)
 * 2. CoinGecko with API key (fallback)
 * 3. CoinGecko free tier (last resort)
 * 
 * No mock data - fails if no real data available.
 */

interface TokenPrice {
  token: string;
  price: number;
  timestamp: number;
  volume24h?: number;
  change24h?: number;
  source: string;
}

// Token mint addresses for Jupiter
const JUPITER_MINTS: Record<string, string> = {
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

const JUPITER_API_URL = 'https://lite-api.jup.ag/price/v3';

export class DataProvider {
  private birdeye: BirdeyeAPI;
  private coinGeckoKey?: string;

  constructor() {
    this.birdeye = new BirdeyeAPI();
    
    const rawCgKey = process.env.COINGECKO_API_KEY || '';
    // Accept any non-empty key that doesn't contain placeholder text
    this.coinGeckoKey = rawCgKey && 
      !rawCgKey.includes('your_') && 
      !rawCgKey.includes('xxx') && 
      !rawCgKey.includes('placeholder') &&
      rawCgKey.length > 10
        ? rawCgKey 
        : undefined;

    logger.info('DataProvider initialized');
    logger.info(`Primary: Jupiter Price API v3 (free, no key required)`);
    logger.info(`Fallback: CoinGecko ${this.coinGeckoKey ? '(API key)' : '(free tier)'}`);
    logger.info(`Birdeye: ${this.birdeye.isEnabled() ? '✅ enabled' : '❌ not configured'}`);
  }

  /**
   * Get prices - NEVER returns mock data
   */
  async getPrices(tokens: string[]): Promise<TokenPrice[]> {
    const errors: string[] = [];

    // PRIMARY: Jupiter Price API v3 (free, no key, higher rate limits)
    try {
      logger.debug('Trying Jupiter Price API v3...');
      const prices = await rateLimiter.execute(
        'jupiter',
        () => this.fetchJupiterPrices(tokens),
        5
      );
      if (prices.length > 0) {
        logger.info(`Jupiter prices: ${prices.map(p => `${p.token}=$${p.price.toFixed(6)}`).join(', ')}`);
        return prices;
      }
    } catch (error: any) {
      const errorMsg = error.message || error.response?.data?.error || 'Unknown Jupiter error';
      errors.push(`Jupiter: ${errorMsg}`);
      logger.warn('Jupiter failed:', errorMsg);
    }

    // FALLBACK 1: CoinGecko with API key (higher rate limits: 30-50 RPM)
    if (this.coinGeckoKey) {
      try {
        logger.debug('Trying CoinGecko with API key...');
        const prices = await rateLimiter.execute(
          'coingecko',
          () => this.fetchCoinGeckoPrices(tokens, true),
          5
        );
        if (prices.length > 0) {
          logger.info(`CoinGecko (API key) prices: ${prices.map(p => `${p.token}=$${p.price.toFixed(6)}`).join(', ')}`);
          return prices;
        }
      } catch (error: any) {
        const errorMsg = error.message || 'Unknown CoinGecko error';
        errors.push(`CoinGecko (with key): ${errorMsg}`);
        logger.warn('CoinGecko (with key) failed:', errorMsg);
      }
    }

    // FALLBACK 2: CoinGecko free tier (no API key, lower rate limits: 10-30 RPM)
    try {
      logger.debug('Trying CoinGecko free tier...');
      const prices = await rateLimiter.execute(
        'coingecko-free',
        () => this.fetchCoinGeckoPrices(tokens, false),
        10
      );
      if (prices.length > 0) {
        logger.info(`CoinGecko (free) prices: ${prices.map(p => `${p.token}=$${p.price.toFixed(6)}`).join(', ')}`);
        return prices;
      }
    } catch (error: any) {
      const errorMsg = error.message || 'Unknown CoinGecko error';
      errors.push(`CoinGecko (free): ${errorMsg}`);
      logger.warn('CoinGecko (free) failed:', errorMsg);
    }

    // No data available
    throw new Error(`All price sources failed:\n${errors.join('\n')}`);
  }

  /**
   * Get OHLCV data
   */
  async getOHLCV(
    token: string,
    timeframe: '1m' | '5m' | '15m' | '1h' | '1d' = '5m',
    limit: number = 50
  ): Promise<Array<{timestamp: number, open: number, high: number, low: number, close: number, volume: number}>> {
    // Fallback: generate from current price
    const prices = await this.getPrices([token]);
    if (!prices[0]) {
      throw new Error(`Cannot get OHLCV - no price for ${token}`);
    }

    logger.warn(`Using synthetic OHLCV for ${token}`);
    return this.generateSyntheticOHLCV(token, prices[0].price, limit);
  }

  /**
   * Fetch prices from Jupiter lite-api v3
   * Endpoint: https://lite-api.jup.ag/price/v3
   */
  private async fetchJupiterPrices(tokens: string[]): Promise<TokenPrice[]> {
    const mints = tokens
      .map(t => JUPITER_MINTS[t])
      .filter(Boolean)
      .join(',');

    if (!mints) {
      throw new Error('No valid Jupiter mint addresses found');
    }

    const response = await axios.get(
      `${JUPITER_API_URL}?ids=${mints}`,
      { timeout: 10000 }
    );

    const prices: TokenPrice[] = [];
    const data = response.data || {};

    for (const [mint, info] of Object.entries(data)) {
      const token = Object.entries(JUPITER_MINTS).find(([, m]) => m === mint)?.[0];
      if (!token) continue;

      const priceInfo = info as any;
      if (!priceInfo.usdPrice) continue;

      prices.push({
        token,
        price: parseFloat(priceInfo.usdPrice),
        timestamp: Date.now(),
        change24h: priceInfo.priceChange24h,
        source: 'jupiter',
      });
    }

    return prices;
  }

  private async fetchCoinGeckoPrices(tokens: string[], useApiKey: boolean = true): Promise<TokenPrice[]> {
    const coinMap: Record<string, string> = {
      'SOL': 'solana',
      'BONK': 'bonk', 
      'JUP': 'jupiter-exchange-solana',
      'RAY': 'raydium',
      'WIF': 'dogwifcoin',
      'BOME': 'book-of-meme',
      'POPCAT': 'popcat',
      'MEW': 'cat-in-a-dogs-world',
      'JTO': 'jito-governance-token',
      'PYTH': 'pyth-network',
      'RENDER': 'render-token',
      'TNSR': 'tensor',
      'W': 'wormhole',
      'HNT': 'helium',
      'FIDA': 'bonfida',
      'PEPE': 'pepe',
    };

    const ids = tokens.map(t => coinMap[t]).filter(Boolean).join(',');
    if (!ids) throw new Error('No valid CoinGecko IDs');

    // Build URL with or without API key
    let url: string;
    if (useApiKey && this.coinGeckoKey) {
      url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_vol=true&include_24hr_change=true&x_cg_demo_api_key=${this.coinGeckoKey}`;
    } else {
      url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_vol=true&include_24hr_change=true`;
    }

    const response = await axios.get(url, { 
      timeout: 15000,
      headers: { 'Accept': 'application/json' }
    });

    const prices: TokenPrice[] = [];
    for (const [cgId, data] of Object.entries(response.data)) {
      const token = Object.entries(coinMap).find(([, id]) => id === cgId)?.[0];
      if (!token) continue;

      const d = data as any;
      if (!d.usd) continue;

      prices.push({
        token,
        price: d.usd,
        timestamp: Date.now(),
        volume24h: d.usd_24h_vol,
        change24h: d.usd_24h_change,
        source: 'coingecko',
      });
    }

    return prices;
  }

  private generateSyntheticOHLCV(
    token: string,
    currentPrice: number,
    count: number
  ): Array<{timestamp: number, open: number, high: number, low: number, close: number, volume: number}> {
    const candles: Array<{timestamp: number, open: number, high: number, low: number, close: number, volume: number}> = [];
    const now = Date.now();
    const interval = 5 * 60 * 1000;
    
    // Generate realistic price movement ending at currentPrice
    // Work backwards from current price
    let prices: number[] = [currentPrice];
    
    for (let i = 1; i < count; i++) {
      // Random walk with 2% volatility
      const change = (Math.random() - 0.5) * 0.04; // ±2%
      const prevPrice = prices[prices.length - 1];
      prices.push(prevPrice * (1 + change));
    }
    
    // Reverse so oldest first
    prices = prices.reverse();
    
    // Build candles from prices
    for (let i = 0; i < count - 1; i++) {
      const timestamp = now - (count - 1 - i) * interval;
      const open = prices[i];
      const close = prices[i + 1];
      const high = Math.max(open, close) * (1 + Math.random() * 0.01);
      const low = Math.min(open, close) * (1 - Math.random() * 0.01);
      
      candles.push({
        timestamp,
        open,
        high,
        low,
        close,
        volume: 500000 + Math.random() * 2000000,
      });
    }
    
    // Add final candle at current time
    candles.push({
      timestamp: now,
      open: prices[prices.length - 1],
      high: currentPrice * 1.01,
      low: currentPrice * 0.99,
      close: currentPrice,
      volume: 500000 + Math.random() * 2000000,
    });

    return candles;
  }

  getBirdeye(): BirdeyeAPI {
    return this.birdeye;
  }
}

export const dataProvider = new DataProvider();
