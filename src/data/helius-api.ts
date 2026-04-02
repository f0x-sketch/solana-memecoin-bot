import axios from 'axios';
import { createLogger } from '../utils/logger';

const logger = createLogger('HeliusAPI');

/**
 * Helius API Client - Enhanced Solana Data Provider
 * 
 * Helius provides:
 * - Token balances with prices
 * - Parsed transaction history
 * - Token metadata
 * - Enhanced RPC endpoints
 * 
 * Free tier: 10M credits/month
 * Docs: https://docs.helius.xyz/
 */

const HELIUS_API_URL = 'https://api.helius.xyz/v0';
const HELIUS_RPC_URL = 'https://mainnet.helius-rpc.com';

// Token addresses for the 3 memecoins
const TOKEN_ADDRESSES: Record<string, string> = {
  'WIF': 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
  'BONK': 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
  'PEPE': 'nB93Wg2saBn2CPp5r4vTcK9V6Q3LbjnQZq8Z9QjJmx', // Note: This is Solana PEPE, verify address
};

export interface TokenPrice {
  token: string;
  price: number;
  timestamp: number;
  volume24h?: number;
  marketCap?: number;
  change24h?: number;
}

export interface TokenBalance {
  mint: string;
  amount: number;
  decimals: number;
  uiAmount: number;
  priceUsd?: number;
  valueUsd?: number;
}

export class HeliusAPI {
  private apiKey: string;
  private enabled: boolean;

  constructor(apiKey?: string) {
    const key = apiKey || process.env.HELIUS_API_KEY || '';
    // Ignore placeholder values like 'your_helius_key_here' or 'xxx'
    this.apiKey = key && !key.includes('your_') && !key.includes('xxx') ? key : '';
    this.enabled = !!this.apiKey;
    
    if (this.enabled) {
      logger.info('Helius API initialized');
    } else {
      logger.info('Helius API not configured, using fallback');
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Get token prices from Helius
   * Uses the token-metadata API which returns USD prices
   */
  async getTokenPrices(tokens: string[]): Promise<TokenPrice[]> {
    if (!this.enabled) {
      throw new Error('Helius API not configured');
    }

    try {
      const addresses = tokens
        .map(t => TOKEN_ADDRESSES[t])
        .filter(Boolean);

      if (addresses.length === 0) {
        throw new Error('No valid token addresses');
      }

      // Helius doesn't have a direct bulk price API, so we use their
      // enhanced RPC or fall back to Jupiter price API
      const prices: TokenPrice[] = [];

      for (const token of tokens) {
        const address = TOKEN_ADDRESSES[token];
        if (!address) continue;

        try {
          // Try to get token info from Helius
          const response = await axios.get(
            `${HELIUS_API_URL}/tokens/?api-key=${this.apiKey}&mint=${address}`,
            { timeout: 5000 }
          );

          if (response.data?.[0]) {
            const data = response.data[0];
            prices.push({
              token,
              price: data.priceUsd || 0,
              timestamp: Date.now(),
              volume24h: data.volume24h,
              marketCap: data.marketCap,
              change24h: data.change24h,
            });
          }
        } catch (err) {
          logger.debug(`Failed to get ${token} price from Helius:`, err);
        }
      }

      return prices;
    } catch (error) {
      logger.error('Helius price fetch failed:', error);
      throw error;
    }
  }

  /**
   * Get wallet token balances with USD values
   */
  async getTokenBalances(walletAddress: string): Promise<TokenBalance[]> {
    if (!this.enabled) {
      throw new Error('Helius API not configured');
    }

    try {
      const response = await axios.post(
        `${HELIUS_RPC_URL}/?api-key=${this.apiKey}`,
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'getTokenAccountsByOwner',
          params: [
            walletAddress,
            { programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' },
            { encoding: 'jsonParsed' }
          ]
        },
        { timeout: 10000 }
      );

      const accounts = response.data?.result?.value || [];
      const balances: TokenBalance[] = [];

      for (const account of accounts) {
        const parsed = account.account.data.parsed.info;
        const mint = parsed.mint;
        const amount = parseInt(parsed.tokenAmount.amount);
        const decimals = parsed.tokenAmount.decimals;
        const uiAmount = parsed.tokenAmount.uiAmount;

        // Skip zero balances
        if (amount === 0) continue;

        // Check if it's one of our tracked tokens
        const token = Object.entries(TOKEN_ADDRESSES).find(
          ([, addr]) => addr === mint
        )?.[0];

        balances.push({
          mint,
          amount,
          decimals,
          uiAmount,
          priceUsd: undefined, // Would need separate price fetch
          valueUsd: undefined,
        });
      }

      return balances;
    } catch (error) {
      logger.error('Helius balance fetch failed:', error);
      throw error;
    }
  }

  /**
   * Get parsed transaction history
   */
  async getTransactionHistory(
    walletAddress: string,
    limit: number = 20
  ): Promise<any[]> {
    if (!this.enabled) {
      throw new Error('Helius API not configured');
    }

    try {
      const response = await axios.post(
        `${HELIUS_API_URL}/addresses/?api-key=${this.apiKey}`,
        {
          addresses: [walletAddress],
          query: {
            types: ['SWAP', 'TRANSFER'],
          },
          options: {
            limit,
          },
        },
        { timeout: 10000 }
      );

      return response.data || [];
    } catch (error) {
      logger.error('Helius transaction fetch failed:', error);
      throw error;
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    if (!this.enabled) return false;

    try {
      const response = await axios.get(
        `${HELIUS_RPC_URL}/?api-key=${this.apiKey}`,
        { timeout: 5000 }
      );
      return response.status === 200;
    } catch {
      return false;
    }
  }
}

// Singleton instance
export const heliusAPI = new HeliusAPI();
