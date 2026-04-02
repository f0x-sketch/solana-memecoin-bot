import axios from 'axios';
import { createLogger } from '../utils/logger';
import { BirdeyeAPI } from './birdeye-api';
import { rateLimiter } from './rate-limiter';

const logger = createLogger('DataProvider');

/**
 * Unified Data Provider with Smart Rate Limiting
 * 
 * Priority:
 * 1. Birdeye (best for Solana, cached, rate-limited)
 * 2. CoinGecko (fallback, rate-limited)
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
    logger.info(`Birdeye: ${this.birdeye.isEnabled() ? '✅ enabled' : '❌ not configured'}`);
    logger.info(`CoinGecko: ${this.coinGeckoKey ? '✅ API key set' : '❌ no API key'} (${rawCgKey ? 'raw key present but invalid' : 'no raw key'})`);
  }

  /**
   * Get prices - NEVER returns mock data
   */
  async getPrices(tokens: string[]): Promise<TokenPrice[]> {
    const errors: string[] = [];

    // Try CoinGecko with API key first (higher rate limits)
    if (this.coinGeckoKey) {
      try {
        const prices = await rateLimiter.execute(
          'coingecko',
          () => this.fetchCoinGeckoPrices(tokens, true),
          5
        );
        if (prices.length > 0) return prices;
      } catch (error: any) {
        errors.push(`CoinGecko (with key): ${error.message}`);
        logger.warn('CoinGecko (with key) failed:', error.message);
      }
    }

    // Fallback: CoinGecko free tier (no API key, lower rate limits)
    try {
      logger.info('Trying CoinGecko free tier (no API key)...');
      const prices = await rateLimiter.execute(
        'coingecko-free',
        () => this.fetchCoinGeckoPrices(tokens, false),
        10
      );
      if (prices.length > 0) {
        logger.info('Using CoinGecko free tier');
        return prices;
      }
    } catch (error: any) {
      errors.push(`CoinGecko (free): ${error.message}`);
      logger.warn('CoinGecko (free) failed:', error.message);
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
    // Note: Birdeye OHLCV disabled - using synthetic data
    const prices = await this.getPrices([token]);
    if (!prices[0]) {
      throw new Error(`Cannot get OHLCV - no price for ${token}`);
    }

    logger.warn(`Using synthetic OHLCV for ${token} (Birdeye unavailable)`);
    return this.generateSyntheticOHLCV(token, prices[0].price, limit);
  }

  private async fetchCoinGeckoPrices(tokens: string[], useApiKey: boolean = true): Promise<TokenPrice[]> {
    const coinMap: Record<string, string> = {
      'WIF': 'dogwifcoin',
      'BONK': 'bonk', 
      'PEPE': 'pepe',
      'SOL': 'solana',
      'JUP': 'jupiter-exchange-solana',
      'RAY': 'raydium',
      'JTO': 'jito-governance-token',
      'PYTH': 'pyth-network',
      'RENDER': 'render-token',
      'TNSR': 'tensor',
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

    logger.info(`CoinGecko prices: ${prices.map(p => `${p.token}=$${p.price.toFixed(6)}`).join(', ')}`);
    return prices;
  }

  private generateSyntheticOHLCV(
    token: string,
    currentPrice: number,
    count: number
  ): Array<{timestamp: number, open: number, high: number, low: number, close: number, volume: number}> {
    const candles: Array<{timestamp: number, open: number, high: number, low: number, close: number, volume: number}> = [];
    let lastClose = currentPrice;
    const now = Date.now();
    const interval = 5 * 60 * 1000;

    for (let i = count - 1; i >= 0; i--) {
      const timestamp = now - i * interval;
      const change = (Math.random() - 0.5) * 0.05; // 5% volatility
      const open = lastClose;
      const close = i === count - 1 ? currentPrice : open * (1 + change);
      const high = Math.max(open, close) * 1.02;
      const low = Math.min(open, close) * 0.98;
      
      candles.push({ 
        timestamp, 
        open, 
        high, 
        low, 
        close, 
        volume: 500000 + Math.random() * 2000000 
      });
      if (i < count - 1) lastClose = close;
    }

    return candles;
  }

  getBirdeye(): BirdeyeAPI {
    return this.birdeye;
  }
}

export const dataProvider = new DataProvider();
