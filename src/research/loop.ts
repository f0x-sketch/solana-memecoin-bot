import { createLogger } from '../utils/logger';
import { initializeDatabase, updateExperiment, getActiveExperiments, insertExperiment } from '../utils/database';
import { experimentGenerator } from '../strategies/generator';
import { PaperTrader } from '../execution/paper';
import { PriceFeed } from '../data/price-feed';
import { generateSignal, calculatePositionSize } from '../strategies/signals';
import { Strategy, ExperimentResult, PerformanceMetrics } from '../strategies/types';
import * as cron from 'node-cron';
import dotenv from 'dotenv';

dotenv.config();

const logger = createLogger('ResearchLoop');

/**
 * Autonomous Research Loop
 * 
 * 1. Generate new strategy experiment
 * 2. Run paper trading for X hours
 * 3. Evaluate metrics
 * 4. If profitable, promote to live trading
 * 5. Log results and iterate
 */

interface ResearchConfig {
  experimentDurationHours: number;
  minWinRatePct: number;
  minSharpeRatio: number;
  minTradesForEvaluation: number;
  tokens: string[];
  initialCapital: number;
}

export class ResearchLoop {
  private config: ResearchConfig;
  private priceFeed: PriceFeed;
  private paperTrader?: PaperTrader;
  private activeStrategy?: Strategy;
  private experimentId?: string;
  private isRunning = false;
  private cronJob?: any;

  constructor(config?: Partial<ResearchConfig>) {
    const envTokens = process.env.TOKENS?.split(',').map(t => t.trim()) || [
      'SOL', 'BONK', 'JUP', 'RAY', 'WIF', 'BOME', 'POPCAT', 'MEW', 
      'JTO', 'PYTH', 'RENDER', 'TNSR', 'W', 'HNT', 'FIDA'
    ];
    
    this.config = {
      experimentDurationHours: config?.experimentDurationHours || 6,
      minWinRatePct: config?.minWinRatePct || parseFloat(process.env.MIN_WIN_RATE_PCT || '55'),
      minSharpeRatio: config?.minSharpeRatio || parseFloat(process.env.MIN_SHARPE_RATIO || '1.2'),
      minTradesForEvaluation: config?.minTradesForEvaluation || 10,
      tokens: config?.tokens || envTokens,
      initialCapital: config?.initialCapital || parseFloat(process.env.INITIAL_CAPITAL_USD || '1000'),
    };

    this.priceFeed = new PriceFeed();

    logger.info('ResearchLoop initialized');
    logger.info(`Tokens: ${this.config.tokens.join(', ')}`);
    logger.info(`Experiment duration: ${this.config.experimentDurationHours}h`);
    logger.info(`Min win rate: ${this.config.minWinRatePct}%`);
    logger.info(`Min Sharpe: ${this.config.minSharpeRatio}`);
  }

  /**
   * Start the research loop
   */
  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    logger.info('═══════════════════════════════════════════════════');
    logger.info('  🧠 AUTORESEARCH SOLANA - Starting Research Loop');
    logger.info('═══════════════════════════════════════════════════\n');

    // Initialize database
    await initializeDatabase();

    // Start first experiment immediately
    await this.runNewExperiment();

    // Schedule new experiments every X hours
    const interval = process.env.EXPERIMENT_INTERVAL_HOURS || '6';
    logger.info(`📅 Scheduling new experiments every ${interval} hours`);
    
    this.cronJob = cron.schedule(`0 */${interval} * * *`, () => {
      this.runNewExperiment().catch(err => logger.error('Experiment failed:', err));
    });

    // Keep process alive
    logger.info('\n✅ Research loop running. Press Ctrl+C to stop.\n');
  }

  /**
   * Stop the research loop
   */
  stop(): void {
    this.isRunning = false;
    this.cronJob?.stop();
    this.priceFeed.stop();
    logger.info('Research loop stopped');
  }

  /**
   * Run a new experiment
   */
  private async runNewExperiment(): Promise<void> {
    try {
      // Finish current experiment if exists
      if (this.activeStrategy && this.paperTrader) {
        await this.finishExperiment();
      }

      // Generate new strategy
      this.activeStrategy = experimentGenerator.generate(undefined, 'mutate');
      this.experimentId = this.activeStrategy.id;

      logger.info('\n═══════════════════════════════════════════════════');
      logger.info(`  🧪 NEW EXPERIMENT: ${this.activeStrategy.name}`);
      logger.info(`  ID: ${this.experimentId}`);
      logger.info(`  Hypothesis: ${this.activeStrategy.hypothesis}`);
      logger.info('═══════════════════════════════════════════════════\n');

      // Log parameters
      logger.info('Parameters:', this.activeStrategy.params);

      // Create paper trader
      this.paperTrader = new PaperTrader(
        this.experimentId,
        this.activeStrategy,
        {
          initialCapital: this.config.initialCapital,
          maxPositions: this.activeStrategy.params.maxPositions,
        }
      );

      // Save experiment to database
      await insertExperiment({
        id: this.experimentId,
        name: this.activeStrategy.name,
        description: this.activeStrategy.description,
        hypothesis: this.activeStrategy.hypothesis,
        params: this.activeStrategy.params,
      });

      // Start price feed
      await this.priceFeed.start(this.config.tokens);

      // Subscribe to price updates for signal generation
      for (const token of this.config.tokens) {
        this.priceFeed.subscribe(token, async (priceUpdate: {price: number}) => {
          await this.onPriceUpdate(token, priceUpdate.price);
        });
      }

      // Schedule experiment end
      setTimeout(() => {
        this.finishExperiment().catch(err => logger.error('Finish experiment failed:', err));
      }, this.config.experimentDurationHours * 60 * 60 * 1000);

    } catch (error) {
      logger.error('Failed to start experiment:', error);
    }
  }

  private lastSignalTime: Map<string, number> = new Map();
  private readonly SIGNAL_COOLDOWN_MS = 30000; // 30 seconds between signals for same token
  private signalsGeneratedThisCycle: number = 0;
  private readonly MAX_SIGNALS_PER_CYCLE = 2; // Max 2 signals per price update cycle
  private lastCycleTime: number = 0;

  /**
   * Handle price update - check for signals
   */
  private async onPriceUpdate(token: string, price: number): Promise<void> {
    if (!this.activeStrategy || !this.paperTrader) return;

    // Reset signal counter for new cycle
    const now = Date.now();
    if (now - this.lastCycleTime > 5000) { // 5 second window = one cycle
      this.signalsGeneratedThisCycle = 0;
      this.lastCycleTime = now;
    }

    // Check if we've already generated max signals this cycle
    if (this.signalsGeneratedThisCycle >= this.MAX_SIGNALS_PER_CYCLE) {
      // Just update prices for exit checks
      await this.paperTrader.updatePrices({ token, price, timestamp: new Date() });
      return;
    }

    // Rate limiting - don't check too frequently for same token
    const lastTime = this.lastSignalTime.get(token) || 0;
    if (now - lastTime < this.SIGNAL_COOLDOWN_MS) {
      // Just update prices for exit checks
      await this.paperTrader.updatePrices({ token, price, timestamp: new Date() });
      return;
    }

    try {
      // Check if we can take new positions
      if (this.paperTrader.getOpenPositionCount() >= this.activeStrategy.params.maxPositions) {
        // Just update prices for exit checks
        await this.paperTrader.updatePrices({ token, price, timestamp: new Date() });
        return;
      }

      // Get OHLCV data for indicators
      const ohlcv = this.priceFeed.getOHLCV(token, 50);
      
      if (ohlcv.length < 20) {
        return;
      }

      // Generate signal
      const signal = generateSignal(
        this.activeStrategy,
        token,
        ohlcv,
        price
      );

      if (signal) {
        this.lastSignalTime.set(token, now);
        this.signalsGeneratedThisCycle++;
        
        // Calculate position size
        const state = this.paperTrader.getState();
        const size = calculatePositionSize(
          signal,
          state.capital,
          this.config.initialCapital * 0.3, // Max 30% per position
          state.openPositions,
          this.activeStrategy.params.maxPositions
        );

        if (size >= 20) { // Minimum $20 trade
          signal.size = size;
          await this.paperTrader.enterTrade(signal, size);
        }
      }

      // Update open trades with new price
      await this.paperTrader.updatePrices({ token, price, timestamp: new Date() });

    } catch (error) {
      logger.error('Error in price update handler:', error);
    }
  }

  /**
   * Finish current experiment and evaluate
   */
  private async finishExperiment(): Promise<void> {
    if (!this.activeStrategy || !this.paperTrader || !this.experimentId) return;

    logger.info('\n═══════════════════════════════════════════════════');
    logger.info(`  📊 FINISHING EXPERIMENT: ${this.activeStrategy.name}`);
    logger.info('═══════════════════════════════════════════════════\n');

    try {
      // Get final metrics
      const metrics = await this.paperTrader.getMetrics();
      const state = this.paperTrader.getState();

      // Log results
      this.logResults(metrics, state);

      // Determine if strategy should be promoted
      const shouldPromote = this.evaluateStrategy(metrics);

      // Update experiment in database
      await updateExperiment(this.experimentId, {
        end_time: new Date().toISOString(),
        status: 'completed',
        trades_count: metrics.totalTrades,
        win_rate: metrics.winRate * 100,
        sharpe_ratio: metrics.sharpeRatio,
        profit_factor: metrics.profitFactor,
        total_pnl_usd: metrics.totalPnlUsd,
        max_drawdown_pct: metrics.maxDrawdownPct,
        is_promoted: shouldPromote ? 1 : 0,
      });

      if (shouldPromote) {
        logger.info('\n🎉 STRATEGY PROMOTED TO LIVE TRADING!');
        logger.info('Update .env to use this strategy in live mode.\n');
        
        // Save promoted strategy config
        await this.savePromotedStrategy(this.activeStrategy, metrics);
      } else {
        logger.info('\n❌ Strategy did not meet criteria for promotion.\n');
      }

      // Clean up
      this.priceFeed.stop();
      this.paperTrader = undefined;
      this.activeStrategy = undefined;
      this.experimentId = undefined;

    } catch (error) {
      logger.error('Error finishing experiment:', error);
    }
  }

  /**
   * Evaluate if strategy meets criteria for promotion
   */
  private evaluateStrategy(metrics: PerformanceMetrics): boolean {
    const checks = {
      'Min trades': {
        pass: metrics.totalTrades >= this.config.minTradesForEvaluation,
        value: metrics.totalTrades,
        threshold: this.config.minTradesForEvaluation,
      },
      'Win rate': {
        pass: metrics.winRate * 100 >= this.config.minWinRatePct,
        value: `${(metrics.winRate * 100).toFixed(1)}%`,
        threshold: `${this.config.minWinRatePct}%`,
      },
      'Sharpe ratio': {
        pass: metrics.sharpeRatio >= this.config.minSharpeRatio,
        value: metrics.sharpeRatio.toFixed(2),
        threshold: this.config.minSharpeRatio.toString(),
      },
      'Profitable': {
        pass: metrics.totalPnlUsd > 0,
        value: `$${metrics.totalPnlUsd.toFixed(2)}`,
        threshold: '$0',
      },
      'Max drawdown': {
        pass: metrics.maxDrawdownPct < 10,
        value: `${metrics.maxDrawdownPct.toFixed(1)}%`,
        threshold: '10%',
      },
    };

    logger.info('Evaluation Criteria:');
    for (const [name, check] of Object.entries(checks)) {
      const icon = check.pass ? '✅' : '❌';
      logger.info(`  ${icon} ${name}: ${check.value} (need ${check.threshold})`);
    }

    const allPassed = Object.values(checks).every(c => c.pass);
    return allPassed;
  }

  /**
   * Log experiment results
   */
  private logResults(metrics: PerformanceMetrics, state: { capital: number; pnl: number; pnlPct: number }): void {
    logger.info('\n📈 EXPERIMENT RESULTS:');
    logger.info('───────────────────────────────────────────────────');
    logger.info(`Total Trades: ${metrics.totalTrades}`);
    logger.info(`Wins: ${metrics.wins} | Losses: ${metrics.losses}`);
    logger.info(`Win Rate: ${(metrics.winRate * 100).toFixed(1)}%`);
    logger.info(`Avg Win: $${metrics.avgWin.toFixed(2)} | Avg Loss: $${metrics.avgLoss.toFixed(2)}`);
    logger.info(`Profit Factor: ${metrics.profitFactor.toFixed(2)}`);
    logger.info(`Sharpe Ratio: ${metrics.sharpeRatio.toFixed(2)}`);
    logger.info(`Total PnL: $${metrics.totalPnlUsd.toFixed(2)}`);
    logger.info(`Max Drawdown: ${metrics.maxDrawdownPct.toFixed(1)}%`);
    logger.info(`Avg Trade Duration: ${metrics.avgTradeDuration.toFixed(0)} min`);
    logger.info(`Final Capital: $${state.capital.toFixed(2)} (${state.pnlPct.toFixed(1)}%)`);
    logger.info('───────────────────────────────────────────────────\n');
  }

  /**
   * Save promoted strategy to file
   */
  private async savePromotedStrategy(strategy: Strategy, metrics: PerformanceMetrics): Promise<void> {
    const fs = await import('fs');
    const path = await import('path');

    const promotedDir = path.join(process.cwd(), 'promoted-strategies');
    if (!fs.existsSync(promotedDir)) {
      fs.mkdirSync(promotedDir, { recursive: true });
    }

    const filename = `${strategy.name}_${strategy.id.slice(0, 8)}.json`;
    const filepath = path.join(promotedDir, filename);

    const data = {
      strategy,
      metrics,
      promotedAt: new Date().toISOString(),
    };

    fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
    logger.info(`Promoted strategy saved to: ${filepath}`);
  }
}

// Run if called directly
if (require.main === module) {
  const loop = new ResearchLoop();
  
  loop.start().catch(err => {
    logger.error('Fatal error:', err);
    process.exit(1);
  });

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    logger.info('\n\nShutting down...');
    loop.stop();
    process.exit(0);
  });
}
