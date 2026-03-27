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
 * Generates new strategy experiments based on:
 * 1. Parameter sweeps around current best
 * 2. Random mutations for exploration
 * 3. Combining successful strategies
 */

export class ExperimentGenerator {
  private experimentCount = 0;

  /**
   * Generate a new experiment
   */
  generate(
    baseStrategy?: Strategy,
    method: 'sweep' | 'mutate' | 'combine' = 'mutate'
  ): Strategy {
    this.experimentCount++;
    
    switch (method) {
      case 'sweep':
        return this.parameterSweep(baseStrategy);
      case 'mutate':
        return this.randomMutation(baseStrategy);
      case 'combine':
        return this.combineStrategies(baseStrategy);
      default:
        return this.randomMutation(baseStrategy);
    }
  }

  /**
   * Parameter sweep: systematically vary one parameter
   */
  private parameterSweep(baseStrategy?: Strategy): Strategy {
    const base = baseStrategy?.params || DEFAULT_PARAMS;
    const template = STRATEGY_TEMPLATES[0];

    // Pick a random parameter to sweep
    const paramKeys = Object.keys(PARAM_RANGES);
    const paramToSweep = paramKeys[Math.floor(Math.random() * paramKeys.length)];
    const [min, max, step] = PARAM_RANGES[paramToSweep];

    // Generate new value
    const newValue = this.randomInRange(min, max, step);

    const newParams: StrategyParams = {
      ...base,
      [paramToSweep]: newValue,
    };

    return {
      id: uuidv4(),
      name: template.name,
      version: `sweep_${this.experimentCount}`,
      description: `${template.description} | Sweeping ${paramToSweep}: ${newValue}`,
      hypothesis: `Increasing ${paramToSweep} to ${newValue} improves win rate`,
      params: newParams,
      indicators: template.indicators,
      tokens: ['SOL', 'BONK', 'JUP'],
      timeframes: ['5m', '15m'],
      createdAt: new Date(),
    };
  }

  /**
   * Random mutation: vary multiple parameters slightly
   */
  private randomMutation(baseStrategy?: Strategy): Strategy {
    const base = baseStrategy?.params || DEFAULT_PARAMS;
    const template = STRATEGY_TEMPLATES[
      Math.floor(Math.random() * STRATEGY_TEMPLATES.length)
    ];

    // Mutate 2-4 random parameters
    const numMutations = 2 + Math.floor(Math.random() * 3);
    const paramKeys = Object.keys(PARAM_RANGES);
    const newParams: StrategyParams = { ...base };

    for (let i = 0; i < numMutations; i++) {
      const param = paramKeys[Math.floor(Math.random() * paramKeys.length)];
      const [min, max, step] = PARAM_RANGES[param];
      newParams[param as keyof StrategyParams] = this.randomInRange(min, max, step);
    }

    return {
      id: uuidv4(),
      name: template.name,
      version: `mutate_${this.experimentCount}`,
      description: template.description,
      hypothesis: `Random mutation: ${numMutations} params changed`,
      params: newParams,
      indicators: template.indicators,
      tokens: ['SOL', 'BONK', 'JUP', 'RAY'],
      timeframes: ['5m', '15m'],
      createdAt: new Date(),
    };
  }

  /**
   * Combine strategies: take best params from multiple strategies
   */
  private combineStrategies(baseStrategy?: Strategy): Strategy {
    // For now, just do a larger mutation
    const template = STRATEGY_TEMPLATES[
      Math.floor(Math.random() * STRATEGY_TEMPLATES.length)
    ];

    // Generate completely new params
    const newParams: StrategyParams = {
      entryRsiLower: this.randomInRange(20, 40, 5),
      entryRsiUpper: this.randomInRange(60, 80, 5),
      volumeMultiplier: this.randomInRange(1.0, 3.0, 0.25),
      momentumPeriod: [7, 14, 21][Math.floor(Math.random() * 3)],
      profitThreshold: this.randomInRange(0.01, 0.10, 0.01),
      stopLoss: this.randomInRange(0.01, 0.05, 0.005),
      maxHoldTime: [30, 60, 90, 120, 180, 240][Math.floor(Math.random() * 6)],
      positionSizePct: [0.05, 0.1, 0.15, 0.2][Math.floor(Math.random() * 4)],
      maxPositions: [3, 5, 7][Math.floor(Math.random() * 3)],
      minLiquidityUsd: 100000,
      minVolume24h: 50000,
    };

    return {
      id: uuidv4(),
      name: template.name,
      version: `combine_${this.experimentCount}`,
      description: template.description,
      hypothesis: 'New parameter combination from scratch',
      params: newParams,
      indicators: template.indicators,
      tokens: ['SOL', 'BONK', 'JUP'],
      timeframes: ['5m', '15m'],
      createdAt: new Date(),
    };
  }

  /**
   * Generate a grid of experiments for systematic testing
   */
  generateGrid(paramName: keyof StrategyParams, values: number[]): Strategy[] {
    const template = STRATEGY_TEMPLATES[0];
    
    return values.map((value, idx) => ({
      id: uuidv4(),
      name: template.name,
      version: `grid_${idx}`,
      description: `${template.description} | ${paramName}=${value}`,
      hypothesis: `Testing ${paramName}=${value}`,
      params: {
        ...DEFAULT_PARAMS,
        [paramName]: value,
      },
      indicators: template.indicators,
      tokens: ['SOL', 'BONK'],
      timeframes: ['15m'],
      createdAt: new Date(),
    }));
  }

  /**
   * Create variations around a winning strategy
   */
  createVariations(winningStrategy: Strategy, count: number = 5): Strategy[] {
    const variations: Strategy[] = [];
    
    for (let i = 0; i < count; i++) {
      variations.push(this.randomMutation(winningStrategy));
    }
    
    return variations;
  }

  private randomInRange(min: number, max: number, step: number): number {
    const steps = Math.floor((max - min) / step);
    const randomStep = Math.floor(Math.random() * (steps + 1));
    return min + randomStep * step;
  }
}

export const experimentGenerator = new ExperimentGenerator();
