import { createLogger } from '../utils/logger';
import { Signal, Trade, Strategy, PerformanceMetrics } from '../strategies/types';
import { insertTrade, updateTrade, getOpenTrades, getDb } from '../utils/database';

const logger = createLogger('PaperTrader');

interface PaperTradeConfig {
  initialCapital: number;
  maxPositions: number;
}

interface PriceUpdate {
  token: string;
  price: number;
  timestamp: Date;
}

export class PaperTrader {
  private openTrades: Map<number, Trade> = new Map();
  private capital: number;
  private config: PaperTradeConfig;
  private experimentId: string;
  private strategy: Strategy;

  constructor(
    experimentId: string,
    strategy: Strategy,
    config: Partial<PaperTradeConfig> = {}
  ) {
    this.experimentId = experimentId;
    this.strategy = strategy;
    this.config = {
      initialCapital: config.initialCapital || 1000,
      maxPositions: config.maxPositions || 3, // REDUCED to 3 for volatile tokens
    };
    this.capital = this.config.initialCapital;

    logger.info(`PaperTrader initialized for experiment ${experimentId}`);
    logger.info(`Strategy: ${strategy.name} v${strategy.version}`);
    logger.info(`Initial capital: $${this.config.initialCapital}`);
    logger.info(`Max positions: ${this.config.maxPositions}`);
  }

  /**
   * Execute a new paper trade - FIXED position tracking
   */
  async enterTrade(signal: Signal, sizeUsd: number): Promise<Trade | null> {
    // Check position limits - STRICT
    if (this.openTrades.size >= this.config.maxPositions) {
      logger.debug(`Max positions (${this.config.maxPositions}) reached, skipping ${signal.token}`);
      return null;
    }

    // Check if already in position for this token - prevent duplicate
    for (const trade of this.openTrades.values()) {
      if (trade.token === signal.token) {
        logger.debug(`Already in position for ${signal.token}, skipping`);
        return null;
      }
    }

    // Validate size
    if (sizeUsd < 20 || sizeUsd > this.capital * 0.5) {
      logger.debug(`Invalid size $${sizeUsd}, skipping`);
      return null;
    }

    const trade: Trade = {
      experimentId: this.experimentId,
      strategyName: this.strategy.name,
      strategyVersion: this.strategy.version,
      token: signal.token,
      side: signal.side,
      entryPrice: signal.price,
      sizeUsd,
      entryTime: new Date(),
      status: 'open',
      params: this.strategy.params,
      isPaper: true,
    };

    try {
      // Save to database
      const tradeId = await insertTrade(trade);
      trade.id = tradeId;

      this.openTrades.set(tradeId, trade);

      logger.info('📊 PAPER TRADE ENTERED:', {
        tradeId,
        token: trade.token,
        side: trade.side,
        entryPrice: trade.entryPrice.toFixed(6),
        sizeUsd: trade.sizeUsd,
        openPositions: this.openTrades.size,
        reason: signal.reason,
      });

      return trade;
    } catch (error) {
      logger.error('Failed to enter trade:', error);
      return null;
    }
  }

  /**
   * Update open trades with new price data - FIXED exit logic
   */
  async updatePrices(priceUpdate: PriceUpdate): Promise<void> {
    const { token, price } = priceUpdate;

    for (const [tradeId, trade] of this.openTrades) {
      if (trade.token !== token) continue;

      const params = trade.params;
      const entryPrice = trade.entryPrice;

      // Calculate unrealized PnL
      let pnlPct: number;
      if (trade.side === 'buy') {
        pnlPct = (price - entryPrice) / entryPrice;
      } else {
        pnlPct = (entryPrice - price) / entryPrice;
      }

      // Check exit conditions
      let shouldExit = false;
      let exitReason: Trade['exitReason'];

      // Take profit
      if (pnlPct >= params.profitThreshold) {
        shouldExit = true;
        exitReason = 'take_profit';
      }
      // Stop loss
      else if (pnlPct <= -params.stopLoss) {
        shouldExit = true;
        exitReason = 'stop_loss';
      }
      // Max hold time
      else {
        const holdTimeMinutes = (Date.now() - trade.entryTime.getTime()) / 60000;
        if (holdTimeMinutes >= params.maxHoldTime) {
          shouldExit = true;
          exitReason = 'timeout';
        }
      }

      if (shouldExit) {
        await this.exitTrade(tradeId, price, exitReason!);
      }
    }
  }

  /**
   * Close a paper trade
   */
  async exitTrade(
    tradeId: number,
    exitPrice: number,
    reason: Trade['exitReason']
  ): Promise<void> {
    const trade = this.openTrades.get(tradeId);
    if (!trade) return;

    // Calculate PnL
    let pnlUsd: number;
    if (trade.side === 'buy') {
      pnlUsd = (exitPrice - trade.entryPrice) / trade.entryPrice * trade.sizeUsd;
    } else {
      pnlUsd = (trade.entryPrice - exitPrice) / trade.entryPrice * trade.sizeUsd;
    }

    const pnlPct = pnlUsd / trade.sizeUsd;

    // Update trade
    trade.exitPrice = exitPrice;
    trade.exitTime = new Date();
    trade.status = 'closed';
    trade.exitReason = reason;
    trade.pnlUsd = pnlUsd;
    trade.pnlPct = pnlPct;

    try {
      await updateTrade(tradeId, {
        exit_price: exitPrice,
        exit_time: trade.exitTime.toISOString(),
        status: 'closed',
        exit_reason: reason,
        pnl_usd: pnlUsd,
        pnl_pct: pnlPct,
      });

      // Update capital
      this.capital += pnlUsd;

      this.openTrades.delete(tradeId);

      const emoji = pnlUsd >= 0 ? '✅' : '❌';
      logger.info(`${emoji} PAPER TRADE CLOSED:`, {
        tradeId,
        token: trade.token,
        side: trade.side,
        entryPrice: trade.entryPrice.toFixed(6),
        exitPrice: exitPrice.toFixed(6),
        pnlUsd: pnlUsd.toFixed(2),
        pnlPct: `${(pnlPct * 100).toFixed(2)}%`,
        reason,
        capital: `$${this.capital.toFixed(2)}`,
        openPositions: this.openTrades.size,
      });
    } catch (error) {
      logger.error('Failed to exit trade:', error);
    }
  }

  /**
   * Get current performance metrics
   */
  async getMetrics(): Promise<PerformanceMetrics> {
    const db = getDb();
    
    const trades: any[] = await new Promise((resolve, reject) => {
      db.all(
        `SELECT * FROM trades WHERE experiment_id = ? AND status = 'closed'`,
        [this.experimentId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows as any[]);
        }
      );
    });

    if (trades.length === 0) {
      return {
        totalTrades: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
        avgWin: 0,
        avgLoss: 0,
        profitFactor: 0,
        sharpeRatio: 0,
        totalPnlUsd: 0,
        maxDrawdownPct: 0,
        avgTradeDuration: 0,
      };
    }

    const wins = trades.filter((t: any) => t.pnl_usd > 0);
    const losses = trades.filter((t: any) => t.pnl_usd <= 0);

    const winPnls = wins.map((t: any) => t.pnl_usd);
    const lossPnls = losses.map((t: any) => t.pnl_usd);

    const avgWin = winPnls.length > 0 ? winPnls.reduce((a: number, b: number) => a + b, 0) / winPnls.length : 0;
    const avgLoss = lossPnls.length > 0 ? lossPnls.reduce((a: number, b: number) => a + b, 0) / lossPnls.length : 0;

    const grossProfit = winPnls.reduce((a: number, b: number) => a + b, 0);
    const grossLoss = Math.abs(lossPnls.reduce((a: number, b: number) => a + b, 0));

    const durations: number[] = [];
    for (const t of trades) {
      if (t.entry_time && t.exit_time) {
        const entry = new Date(t.entry_time).getTime();
        const exit = new Date(t.exit_time).getTime();
        durations.push((exit - entry) / 60000);
      }
    }

    // Calculate returns for Sharpe ratio
    const returns = trades.map((t: any) => t.pnl_pct || 0);
    const avgReturn = returns.reduce((a: number, b: number) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum: number, r: number) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(365) : 0;

    // Calculate max drawdown
    let maxDrawdown = 0;
    let peak = this.config.initialCapital;
    let runningCapital = this.config.initialCapital;
    
    for (const trade of trades) {
      runningCapital += (trade.pnl_usd || 0);
      if (runningCapital > peak) {
        peak = runningCapital;
      }
      const drawdown = (peak - runningCapital) / peak;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }

    return {
      totalTrades: trades.length,
      wins: wins.length,
      losses: losses.length,
      winRate: wins.length / trades.length,
      avgWin,
      avgLoss,
      profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0,
      sharpeRatio,
      totalPnlUsd: trades.reduce((sum: number, t: any) => sum + (t.pnl_usd || 0), 0),
      maxDrawdownPct: maxDrawdown * 100,
      avgTradeDuration: durations.length > 0 
        ? durations.reduce((a: number, b: number) => a + b, 0) / durations.length 
        : 0,
    };
  }

  getState(): {
    openPositions: number;
    capital: number;
    pnl: number;
    pnlPct: number;
  } {
    return {
      openPositions: this.openTrades.size,
      capital: this.capital,
      pnl: this.capital - this.config.initialCapital,
      pnlPct: (this.capital - this.config.initialCapital) / this.config.initialCapital * 100,
    };
  }

  getOpenPositionCount(): number {
    return this.openTrades.size;
  }

  async closeAllPositions(currentPrices: Map<string, number>): Promise<void> {
    for (const [tradeId, trade] of this.openTrades) {
      const price = currentPrices.get(trade.token);
      if (price) {
        await this.exitTrade(tradeId, price, 'manual');
      }
    }
  }
}
