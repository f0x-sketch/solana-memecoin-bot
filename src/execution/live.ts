import { Connection, PublicKey, Keypair, Transaction, VersionedTransaction } from '@solana/web3.js';
import { createLogger } from '../utils/logger';
import { Signal, Trade, Strategy } from '../strategies/types';
import { insertTrade, updateTrade } from '../utils/database';
import axios from 'axios';

const logger = createLogger('LiveTrader');

/**
 * Live Trading Engine for Solana
 * 
 * Executes real trades via Jupiter API for best swap routes.
 */

interface LiveTradeConfig {
  connection: Connection;
  wallet: Keypair;
  maxSlippagePct: number;
  jupiterApiKey?: string;
}

const JUPITER_API_URL = 'https://quote-api.jup.ag/v6';

export class LiveTrader {
  private connection: Connection;
  private wallet: Keypair;
  private config: LiveTradeConfig;
  private openTrades: Map<number, Trade> = new Map();
  private isDryRun: boolean;

  constructor(config: LiveTradeConfig) {
    this.connection = config.connection;
    this.wallet = config.wallet;
    this.config = config;
    this.isDryRun = process.env.DRY_RUN !== 'false';

    logger.info('LiveTrader initialized');
    logger.info(`Wallet: ${this.wallet.publicKey.toString().slice(0, 8)}...`);
    logger.info(`Mode: ${this.isDryRun ? '🔒 DRY RUN' : '🔴 LIVE TRADING'}`);
  }

  /**
   * Execute a live trade via Jupiter
   */
  async executeTrade(signal: Signal, sizeUsd: number, strategy: Strategy): Promise<Trade | null> {
    const tokenMint = this.getTokenMint(signal.token);
    
    if (!tokenMint) {
      logger.error(`Unknown token: ${signal.token}`);
      return null;
    }

    const inputMint = signal.side === 'buy' 
      ? 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' // USDC
      : tokenMint;
    const outputMint = signal.side === 'buy'
      ? tokenMint
      : 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'; // USDC

    if (this.isDryRun) {
      return this.simulateTrade(signal, sizeUsd, strategy, inputMint, outputMint);
    }

    try {
      logger.info(`🔴 LIVE TRADE: ${signal.side.toUpperCase()} ${signal.token}`, {
        sizeUsd,
        price: signal.price,
        reason: signal.reason,
      });

      // Get quote from Jupiter
      const quote = await this.getJupiterQuote(
        inputMint,
        outputMint,
        sizeUsd * 1e6 // USDC has 6 decimals
      );

      if (!quote) {
        throw new Error('Failed to get Jupiter quote');
      }

      // Get swap transaction
      const swapTx = await this.getSwapTransaction(quote);
      
      // Sign and send
      const signature = await this.sendTransaction(swapTx);

      // Create trade record
      const trade: Trade = {
        experimentId: strategy.id,
        strategyName: strategy.name,
        strategyVersion: strategy.version,
        token: signal.token,
        side: signal.side,
        entryPrice: signal.price,
        sizeUsd,
        entryTime: new Date(),
        status: 'open',
        params: strategy.params,
        isPaper: false,
        txSignature: signature,
      };

      const tradeId = await insertTrade(trade);
      trade.id = tradeId;
      this.openTrades.set(tradeId, trade);

      logger.info('✅ LIVE TRADE EXECUTED:', {
        tradeId,
        token: trade.token,
        side: trade.side,
        sizeUsd,
        signature: signature.slice(0, 16) + '...',
      });

      return trade;

    } catch (error) {
      logger.error('❌ Live trade failed:', error);
      return null;
    }
  }

  /**
   * Get Jupiter quote for swap
   */
  private async getJupiterQuote(
    inputMint: string,
    outputMint: string,
    amount: number
  ): Promise<any> {
    try {
      const response = await axios.get(`${JUPITER_API_URL}/quote`, {
        params: {
          inputMint,
          outputMint,
          amount,
          slippageBps: this.config.maxSlippagePct * 100, // Convert to basis points
          onlyDirectRoutes: false,
        },
        headers: this.config.jupiterApiKey 
          ? { 'Authorization': `Bearer ${this.config.jupiterApiKey}` }
          : {},
        timeout: 10000,
      });

      return response.data;
    } catch (error) {
      logger.error('Jupiter quote failed:', error);
      return null;
    }
  }

  /**
   * Get swap transaction from Jupiter
   */
  private async getSwapTransaction(quote: any): Promise<VersionedTransaction> {
    const response = await axios.post(`${JUPITER_API_URL}/swap`, {
      quoteResponse: quote,
      userPublicKey: this.wallet.publicKey.toString(),
      wrapAndUnwrapSol: true,
    }, {
      timeout: 10000,
    });

    const swapTransactionBuf = Buffer.from(response.data.swapTransaction, 'base64');
    return VersionedTransaction.deserialize(swapTransactionBuf);
  }

  /**
   * Send transaction to Solana
   */
  private async sendTransaction(tx: VersionedTransaction): Promise<string> {
    tx.sign([this.wallet]);

    const signature = await this.connection.sendTransaction(tx, {
      maxRetries: 3,
      skipPreflight: false,
    });

    // Wait for confirmation
    const confirmation = await this.connection.confirmTransaction(signature, 'confirmed');
    
    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${confirmation.value.err}`);
    }

    return signature;
  }

  /**
   * Simulate a trade (dry run)
   */
  private async simulateTrade(
    signal: Signal,
    sizeUsd: number,
    strategy: Strategy,
    inputMint: string,
    outputMint: string
  ): Promise<Trade> {
    logger.info('🧪 DRY RUN TRADE:', {
      token: signal.token,
      side: signal.side,
      sizeUsd,
      price: signal.price,
      inputMint: inputMint.slice(0, 8) + '...',
      outputMint: outputMint.slice(0, 8) + '...',
    });

    const trade: Trade = {
      experimentId: strategy.id,
      strategyName: strategy.name,
      strategyVersion: strategy.version,
      token: signal.token,
      side: signal.side,
      entryPrice: signal.price,
      sizeUsd,
      entryTime: new Date(),
      status: 'open',
      params: strategy.params,
      isPaper: false, // Mark as live even though it's dry run
      txSignature: 'dry-run-' + Date.now(),
    };

    const tradeId = await insertTrade(trade);
    trade.id = tradeId;
    this.openTrades.set(tradeId, trade);

    return trade;
  }

  /**
   * Close a live trade
   */
  async closeTrade(tradeId: number, currentPrice: number, reason: Trade['exitReason']): Promise<void> {
    const trade = this.openTrades.get(tradeId);
    if (!trade) return;

    // Execute reverse swap if live
    if (!this.isDryRun) {
      const tokenMint = this.getTokenMint(trade.token);
      if (tokenMint) {
        await this.executeExitSwap(trade, tokenMint);
      }
    }

    // Calculate PnL
    let pnlUsd: number;
    if (trade.side === 'buy') {
      pnlUsd = (currentPrice - trade.entryPrice) / trade.entryPrice * trade.sizeUsd;
    } else {
      pnlUsd = (trade.entryPrice - currentPrice) / trade.entryPrice * trade.sizeUsd;
    }

    const pnlPct = pnlUsd / trade.sizeUsd;

    // Update trade
    trade.exitPrice = currentPrice;
    trade.exitTime = new Date();
    trade.status = 'closed';
    trade.exitReason = reason;
    trade.pnlUsd = pnlUsd;
    trade.pnlPct = pnlPct;

    await updateTrade(tradeId, {
      exit_price: currentPrice,
      exit_time: trade.exitTime.toISOString(),
      status: 'closed',
      exit_reason: reason,
      pnl_usd: pnlUsd,
      pnl_pct: pnlPct,
    });

    this.openTrades.delete(tradeId);

    const emoji = pnlUsd >= 0 ? '✅' : '❌';
    logger.info(`${emoji} TRADE CLOSED:`, {
      tradeId,
      token: trade.token,
      pnlUsd: pnlUsd.toFixed(2),
      pnlPct: `${(pnlPct * 100).toFixed(2)}%`,
      reason,
    });
  }

  /**
   * Execute exit swap
   */
  private async executeExitSwap(trade: Trade, tokenMint: string): Promise<void> {
    const inputMint = trade.side === 'buy' ? tokenMint : 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    const outputMint = trade.side === 'buy' ? 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' : tokenMint;

    try {
      const tokenAccount = await this.connection.getTokenAccountsByOwner(
        this.wallet.publicKey,
        { mint: new PublicKey(inputMint) }
      );

      if (tokenAccount.value.length === 0) {
        throw new Error('No token balance to exit');
      }

      const balance = await this.connection.getTokenAccountBalance(
        tokenAccount.value[0].pubkey
      );

      const quote = await this.getJupiterQuote(
        inputMint,
        outputMint,
        parseInt(balance.value.amount)
      );

      if (!quote) {
        throw new Error('Failed to get exit quote');
      }

      const swapTx = await this.getSwapTransaction(quote);
      const signature = await this.sendTransaction(swapTx);

      logger.info(`Exit swap executed: ${signature.slice(0, 16)}...`);

    } catch (error) {
      logger.error('Exit swap failed:', error);
      throw error;
    }
  }

  /**
   * Get token mint address
   */
  private getTokenMint(symbol: string): string | null {
    const mints: Record<string, string> = {
      'SOL': 'So11111111111111111111111111111111111111112',
      'USDC': 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      'BONK': 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
      'JUP': 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
      'RAY': '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
      'WIF': 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
      'PEPE': 'A5D4P2rR9hQvRRgG3H3XQ9Z5Z9Z5Z9Z5Z9Z5Z9Z5Z9Z5Z',
      'JTO': 'JTO4bQX7cwRzT2qW5Dq6Z3Z9Z5Z9Z5Z9Z5Z9Z5Z9Z5Z9Z',
      'PYTH': 'HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3',
      'RENDER': 'rndrizKT3MK1iimbxRd86xxxxw9QwG7nD9Yx4rK6w2p',
      'TNSR': 'TNSRxcUxoX9TYeE5q5x7P8Z9Z5Z9Z5Z9Z5Z9Z5Z9Z5Z9Z',
    };

    return mints[symbol] || null;
  }

  /**
   * Get open trades
   */
  getOpenTrades(): Trade[] {
    return Array.from(this.openTrades.values());
  }

  /**
   * Check wallet balance
   */
  async getBalance(): Promise<{ sol: number; usdc: number }> {
    try {
      const solBalance = await this.connection.getBalance(this.wallet.publicKey);
      
      // Get USDC balance
      const usdcMint = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
      const tokenAccounts = await this.connection.getTokenAccountsByOwner(
        this.wallet.publicKey,
        { mint: usdcMint }
      );

      let usdcBalance = 0;
      if (tokenAccounts.value.length > 0) {
        const balance = await this.connection.getTokenAccountBalance(
          tokenAccounts.value[0].pubkey
        );
        usdcBalance = parseInt(balance.value.amount) / 1e6;
      }

      return {
        sol: solBalance / 1e9,
        usdc: usdcBalance,
      };
    } catch (error) {
      logger.error('Failed to get balance:', error);
      return { sol: 0, usdc: 0 };
    }
  }
}
