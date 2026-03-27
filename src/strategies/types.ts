/**
 * Strategy Types and Interfaces
 */

export interface StrategyParams {
  // Entry conditions
  entryRsiLower: number;
  entryRsiUpper: number;
  volumeMultiplier: number;
  momentumPeriod: number;
  
  // Exit conditions
  profitThreshold: number;
  stopLoss: number;
  maxHoldTime: number; // minutes
  
  // Position sizing
  positionSizePct: number;
  maxPositions: number;
  
  // Filters
  minLiquidityUsd: number;
  minVolume24h: number;
}

export interface Strategy {
  id: string;
  name: string;
  version: string;
  description: string;
  hypothesis: string;
  params: StrategyParams;
  indicators: string[];
  tokens: string[];
  timeframes: string[];
  createdAt: Date;
}

export interface Signal {
  token: string;
  side: 'buy' | 'sell';
  confidence: number; // 0-1
  price: number;
  size: number;
  reason: string;
  timestamp: Date;
  metadata: Record<string, any>;
}

export interface Trade {
  id?: number;
  experimentId: string;
  strategyName: string;
  strategyVersion: string;
  token: string;
  side: 'buy' | 'sell';
  entryPrice: number;
  exitPrice?: number;
  sizeUsd: number;
  pnlUsd?: number;
  pnlPct?: number;
  entryTime: Date;
  exitTime?: Date;
  status: 'open' | 'closed';
  exitReason?: 'take_profit' | 'stop_loss' | 'timeout' | 'manual';
  params: StrategyParams;
  isPaper: boolean;
  txSignature?: string;
}

export interface PerformanceMetrics {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  sharpeRatio: number;
  totalPnlUsd: number;
  maxDrawdownPct: number;
  avgTradeDuration: number; // minutes
}

export interface ExperimentResult {
  experimentId: string;
  strategy: Strategy;
  startTime: Date;
  endTime: Date;
  metrics: PerformanceMetrics;
  isProfitable: boolean;
  shouldPromote: boolean;
}

// Default strategy parameters
export const DEFAULT_PARAMS: StrategyParams = {
  entryRsiLower: 30,
  entryRsiUpper: 70,
  volumeMultiplier: 1.5,
  momentumPeriod: 14,
  profitThreshold: 0.03,
  stopLoss: 0.02,
  maxHoldTime: 120,
  positionSizePct: 0.1,
  maxPositions: 5,
  minLiquidityUsd: 100000,
  minVolume24h: 50000,
};

// Parameter ranges for optimization
export const PARAM_RANGES: Record<string, [number, number, number]> = {
  // [min, max, step]
  entryRsiLower: [20, 40, 5],
  entryRsiUpper: [60, 80, 5],
  volumeMultiplier: [1.0, 3.0, 0.25],
  momentumPeriod: [7, 21, 7],
  profitThreshold: [0.01, 0.10, 0.01],
  stopLoss: [0.01, 0.05, 0.005],
  maxHoldTime: [30, 240, 30],
  positionSizePct: [0.05, 0.25, 0.05],
};

// Strategy variations to test
export const STRATEGY_TEMPLATES = [
  {
    name: 'momentum_rsi',
    description: 'Trade RSI oversold/overbought with volume confirmation',
    indicators: ['rsi', 'volume_ma'],
  },
  {
    name: 'breakout_vwap',
    description: 'Enter on price breaking VWAP with momentum',
    indicators: ['vwap', 'momentum', 'volume'],
  },
  {
    name: 'mean_reversion_bb',
    description: 'Trade Bollinger Band bounces',
    indicators: ['bollinger_bands', 'rsi'],
  },
  {
    name: 'trend_following',
    description: 'Follow established trends with EMA crossovers',
    indicators: ['ema_9', 'ema_21', 'adx'],
  },
  {
    name: 'volatility_expansion',
    description: 'Trade volatility breakouts',
    indicators: ['atr', 'volume', 'bb_width'],
  },
];
