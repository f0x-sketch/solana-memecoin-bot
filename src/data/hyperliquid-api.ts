import axios from 'axios';
import { ethers } from 'ethers';
import { createLogger } from '../utils/logger';

const logger = createLogger('HyperliquidAPI');

/**
 * Hyperliquid API Client
 * 
 * Hyperliquid is a decentralized perpetual futures exchange
 * Docs: https://hyperliquid.gitbook.io/hyperliquid-docs
 * 
 * This adapter converts our strategy signals to Hyperliquid orders
 */

const HYPERLIQUID_API_URL = 'https://api.hyperliquid.xyz';

// Map strategy tokens to Hyperliquid symbols
const TOKEN_MAP: Record<string, string> = {
  'BTC': 'BTC-PERP',
  'ETH': 'ETH-PERP',
  'SOL': 'SOL-PERP',
  'WIF': 'WIF-PERP',
  'BONK': 'BONK-PERP',
  'PEPE': 'PEPE-PERP',
};

interface HyperliquidMarket {
  name: string;
  szDecimals: number;
  maxLeverage: number;
  funding: string;
  openInterest: string;
  oraclePrice: string;
  markPrice: string;
  midPrice: string;
  volume24h: string;
}

interface HyperliquidPosition {
  coin: string;
  entryPx: string;
  leverage: { type: string; value: number };
  liquidationPx: string | null;
  marginUsed: string;
  positionValue: string;
  returnOnEquity: string;
  szi: string; // Signed position size
  unrealizedPnl: string;
}

export class HyperliquidAPI {
  private wallet: ethers.Wallet | null = null;
  private address: string;
  private isTestnet: boolean;

  constructor(privateKey?: string, isTestnet = false) {
    this.isTestnet = isTestnet;
    
    if (privateKey) {
      this.wallet = new ethers.Wallet(privateKey);
      this.address = this.wallet.address;
      logger.info(`Hyperliquid API initialized for ${this.address}`);
    } else {
      this.address = '';
      logger.warn('Hyperliquid API: No private key, read-only mode');
    }
  }

  /**
   * Check if API is configured for trading
   */
  isConfigured(): boolean {
    return !!this.wallet;
  }

  /**
   * Get market data for all perps
   */
  async getMarkets(): Promise<HyperliquidMarket[]> {
    try {
      const response = await axios.post(
        `${HYPERLIQUID_API_URL}/info`,
        { type: 'metaAndAssetCtxs' },
        { timeout: 10000 }
      );

      const markets: HyperliquidMarket[] = [];
      const universe = response.data[0].universe;
      const assetCtxs = response.data[1];

      for (let i = 0; i < universe.length; i++) {
        markets.push({
          name: universe[i].name,
          szDecimals: universe[i].szDecimals,
          maxLeverage: universe[i].maxLeverage,
          ...assetCtxs[i],
        });
      }

      return markets;
    } catch (error) {
      logger.error('Failed to fetch Hyperliquid markets:', error);
      throw error;
    }
  }

  /**
   * Get current price for a token
   */
  async getPrice(token: string): Promise<number> {
    const symbol = TOKEN_MAP[token] || `${token}-PERP`;
    
    try {
      const markets = await this.getMarkets();
      const market = markets.find(m => m.name === symbol);
      
      if (!market) {
        throw new Error(`Market not found: ${symbol}`);
      }

      return parseFloat(market.markPrice);
    } catch (error) {
      logger.error(`Failed to get ${token} price:`, error);
      throw error;
    }
  }

  /**
   * Get OHLCV data for technical analysis
   * Note: Hyperliquid doesn't provide historical OHLCV directly
   * You may need to aggregate from their candle endpoint or use external source
   */
  async getOHLCV(
    token: string,
    timeframe: '1m' | '5m' | '15m' | '1h' | '4h' | '1d' = '5m',
    limit: number = 100
  ): Promise<Array<{timestamp: number, open: number, high: number, low: number, close: number, volume: number}>> {
    const symbol = TOKEN_MAP[token] || `${token}-PERP`;
    
    try {
      const response = await axios.post(
        `${HYPERLIQUID_API_URL}/info`,
        {
          type: 'candleSnapshot',
          req: {
            coin: symbol,
            interval: timeframe === '1m' ? '1m' : timeframe,
            startTime: Date.now() - limit * this.timeframeToMs(timeframe),
            endTime: Date.now(),
          },
        },
        { timeout: 15000 }
      );

      return response.data.map((candle: any) => ({
        timestamp: candle.t,
        open: parseFloat(candle.o),
        high: parseFloat(candle.h),
        low: parseFloat(candle.l),
        close: parseFloat(candle.c),
        volume: parseFloat(candle.v),
      }));
    } catch (error) {
      logger.error(`Failed to get OHLCV for ${token}:`, error);
      throw error;
    }
  }

  /**
   * Get user's open positions
   */
  async getPositions(): Promise<HyperliquidPosition[]> {
    if (!this.wallet) {
      throw new Error('Wallet not configured');
    }

    try {
      const response = await axios.post(
        `${HYPERLIQUID_API_URL}/info`,
        {
          type: 'clearinghouseState',
          user: this.address,
        },
        { timeout: 10000 }
      );

      return response.data.assetPositions.map((pos: any) => pos.position);
    } catch (error) {
      logger.error('Failed to fetch positions:', error);
      throw error;
    }
  }

  /**
   * Place an order
   * 
   * WARNING: This executes real trades!
   * Set IS_PAPER_TRADING=true in .env to disable
   */
  async placeOrder(
    token: string,
    side: 'buy' | 'sell',
    size: number,
    leverage: number = 1,
    orderType: 'market' | 'limit' = 'market',
    price?: number
  ): Promise<any> {
    if (!this.wallet) {
      throw new Error('Wallet not configured - cannot place orders');
    }

    const symbol = TOKEN_MAP[token] || `${token}-PERP`;
    
    // Check if paper trading
    if (process.env.IS_PAPER_TRADING === 'true') {
      logger.info(`[PAPER TRADE] ${side.toUpperCase()} ${size} ${symbol} @ ${orderType}`);
      return { paper: true, side, size, symbol };
    }

    try {
      // Build order action
      const orderAction = {
        type: 'order',
        orders: [{
          coin: symbol,
          isBuy: side === 'buy',
          sz: size.toString(),
          limitPx: orderType === 'limit' ? price!.toString() : undefined,
          orderType: orderType === 'market' ? 'Market' : 'Limit',
          reduceOnly: false,
          cloid: this.generateCloid(), // Client order ID
        }],
        grouping: 'na',
      };

      // Sign the action
      const signature = await this.signAction(orderAction);

      // Send order
      const response = await axios.post(
        `${HYPERLIQUID_API_URL}/exchange`,
        {
          action: orderAction,
          nonce: Date.now(),
          signature,
        },
        { timeout: 15000 }
      );

      logger.info(`Order placed: ${side.toUpperCase()} ${size} ${symbol}`, response.data);
      return response.data;
    } catch (error) {
      logger.error(`Failed to place order:`, error);
      throw error;
    }
  }

  /**
   * Close a position
   */
  async closePosition(token: string): Promise<any> {
    const positions = await this.getPositions();
    const symbol = TOKEN_MAP[token] || `${token}-PERP`;
    const position = positions.find(p => p.coin === symbol);

    if (!position) {
      logger.warn(`No position to close for ${token}`);
      return null;
    }

    const size = Math.abs(parseFloat(position.szi));
    const side = parseFloat(position.szi) > 0 ? 'sell' : 'buy';

    return this.placeOrder(token, side as 'buy' | 'sell', size, 1, 'market');
  }

  /**
   * Get account summary
   */
  async getAccountSummary(): Promise<{
    equity: number;
    availableMargin: number;
    totalPositionValue: number;
  }> {
    if (!this.wallet) {
      throw new Error('Wallet not configured');
    }

    try {
      const response = await axios.post(
        `${HYPERLIQUID_API_URL}/info`,
        {
          type: 'clearinghouseState',
          user: this.address,
        },
        { timeout: 10000 }
      );

      return {
        equity: parseFloat(response.data.marginSummary.accountValue),
        availableMargin: parseFloat(response.data.marginSummary.totalRawUsd),
        totalPositionValue: parseFloat(response.data.marginSummary.totalNtlPos),
      };
    } catch (error) {
      logger.error('Failed to get account summary:', error);
      throw error;
    }
  }

  /**
   * Sign an action for Hyperliquid
   */
  private async signAction(action: any): Promise<string> {
    if (!this.wallet) throw new Error('Wallet not configured');
    
    // Hyperliquid uses EIP-712 structured signing
    // This is simplified - actual implementation needs their specific format
    const message = JSON.stringify(action);
    const signature = await this.wallet.signMessage(message);
    return signature;
  }

  /**
   * Generate unique client order ID
   */
  private generateCloid(): string {
    return `bot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Convert timeframe to milliseconds
   */
  private timeframeToMs(tf: string): number {
    const map: Record<string, number> = {
      '1m': 60 * 1000,
      '5m': 5 * 60 * 1000,
      '15m': 15 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      '4h': 4 * 60 * 60 * 1000,
      '1d': 24 * 60 * 60 * 1000,
    };
    return map[tf] || 5 * 60 * 1000;
  }
}

// Export singleton
export const hyperliquidAPI = new HyperliquidAPI();
