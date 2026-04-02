import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../utils/logger';
import {
  Strategy,
  StrategyParams,
  DEFAULT_PARAMS,
  PARAM_RANGES,
  STRATEGY_TEMPLATES,
} from './types';

const logger = createLogger('ExperimentGenerator');

/**
 * Generates aggressive strategy experiments to ensure trades execute
 */

export class ExperimentGenerator {
  private experimentCount = 0;
  private bestStrategies: Strategy[] = [];

  generate(
    baseStrategy?: Strategy,
    method: 'sweep' | 'mutate' | 'combine' | 'aggressive' = 'aggressive'
  ): Strategy {
    this.experimentCount++;
    
    // Use aggressive strategy by default to ensure trades
    return this.createAggressiveStrategy();
  }

  /**
   * AGGRESSIVE Strategy - Guaranteed to trade
   */
  private createAggressiveStrategy(): Strategy {
    const strategies = [
      this.createUltraAggressiveRSI(),
      this.createMomentumStrategy(),
      this.createVWAPStrategy(),
      this.createPriceActionStrategy(),
    ];
    
    return strategies[this.experimentCount % strategies.length];
  }

  /**
   * Ultra-aggressive RSI - Very low thresholds
   */
  private createUltraAggressiveRSI(): Strategy {
    return {
      id: uuidv4(),
      name: 'ultra_aggressive_rsi',
      version: `aggr_${this.experimentCount}`,
      description: 'Ultra-aggressive RSI with no volume filter',
      hypothesis: 'Trade on any RSI movement outside 40-60 range',
      params: {
        entryRsiLower: 40,        // Very easy to trigger
        entryRsiUpper: 60,        // Very easy to trigger
        volumeMultiplier: 0.5,    // No real volume requirement
        momentumPeriod: 7,        // Short period = more signals
        profitThreshold: 0.02,    // 2% take profit
        stopLoss: 0.015,          // 1.5% stop loss
        maxHoldTime: 15,          // 15 minutes max
        positionSizePct: 0.20,    // 20% per trade
        maxPositions: 2,          // Max 2 concurrent
        minLiquidityUsd: 1000,    // Very low requirement
        minVolume24h: 1000,       // Very low requirement
      },
      indicators: ['rsi'],
      tokens: ['WIF', 'BONK'],
      timeframes: ['5m'],
      createdAt: new Date(),
    };
  }

  /**
   * Momentum Strategy - Trade any 0.5% move
   */
  private createMomentumStrategy(): Strategy {
    return {
      id: uuidv4(),
      name: 'momentum_chaser',
      version: `aggr_${this.experimentCount}`,
      description: 'Trade on any significant price movement',
      hypothesis: '0.5% price moves tend to continue short-term',
      params: {
        entryRsiLower: 30,
        entryRsiUpper: 70,
        volumeMultiplier: 0.5,
        momentumPeriod: 5,        // Very short
        profitThreshold: 0.015,   // 1.5% profit
        stopLoss: 0.01,           // 1% stop
        maxHoldTime: 10,          // 10 minutes
        positionSizePct: 0.20,
        maxPositions: 2,
        minLiquidityUsd: 1000,
        minVolume24h: 1000,
      },
      indicators: ['momentum'],
      tokens: ['WIF', 'BONK'],
      timeframes: ['5m'],
      createdAt: new Date(),
    };
  }

  /**
   * VWAP Strategy - Trade VWAP deviations
   */
  private createVWAPStrategy(): Strategy {
    return {
      id: uuidv4(),
      name: 'vwap_scalper',
      version: `aggr_${this.experimentCount}`,
      description: 'Scalp 1% deviations from VWAP',
      hypothesis: 'Price reverts to VWAP after 1% deviation',
      params: {
        entryRsiLower: 35,
        entryRsiUpper: 65,
        volumeMultiplier: 0.5,
        momentumPeriod: 10,
        profitThreshold: 0.012,   // 1.2% profit
        stopLoss: 0.008,          // 0.8% stop
        maxHoldTime: 12,          // 12 minutes
        positionSizePct: 0.25,    // 25% per trade
        maxPositions: 2,
        minLiquidityUsd: 1000,
        minVolume24h: 1000,
      },
      indicators: ['vwap'],
      tokens: ['WIF', 'BONK'],
      timeframes: ['5m'],
      createdAt: new Date(),
    };
  }

  /**
   * Price Action - Trade on raw price changes
   */
  private createPriceActionStrategy(): Strategy {
    return {
      id: uuidv4(),
      name: 'price_action',
      version: `aggr_${this.experimentCount}`,
      description: 'Trade any 0.5% price move',
      hypothesis: 'Small price moves create scalping opportunities',
      params: {
        entryRsiLower: 25,
        entryRsiUpper: 75,
        volumeMultiplier: 0.5,
        momentumPeriod: 7,
        profitThreshold: 0.025,   // 2.5% profit
        stopLoss: 0.012,          // 1.2% stop
        maxHoldTime: 20,          // 20 minutes
        positionSizePct: 0.20,
        maxPositions: 2,
        minLiquidityUsd: 1000,
        minVolume24h: 1000,
      },
      indicators: ['price_change'],
      tokens: ['WIF', 'BONK'],
      timeframes: ['5m'],
      createdAt: new Date(),
    };
  }

  createVariations(winningStrategy: Strategy, count: number = 5): Strategy[] {
    const variations: Strategy[] = [];
    for (let i = 0; i < count; i++) {
      variations.push(this.createAggressiveStrategy());
    }
    return variations;
  }

  recordWin(strategy: Strategy, sharpe: number): void {
    this.bestStrategies.push({ ...strategy, sharpe } as any);
    this.bestStrategies.sort((a: any, b: any) => b.sharpe - a.sharpe);
    this.bestStrategies = this.bestStrategies.slice(0, 5);
  }

  private randomInRange(min: number, max: number, step: number): number {
    const steps = Math.floor((max - min) / step);
    return min + Math.floor(Math.random() * (steps + 1)) * step;
  }
}

export const experimentGenerator = new ExperimentGenerator();
