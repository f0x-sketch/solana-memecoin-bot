import { createLogger } from '../utils/logger';
import { Strategy, StrategyParams, Signal } from './types';

const logger = createLogger('SignalEngine');

interface PriceData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// Track last signal time per token to prevent spam
const lastSignalTime: Map<string, number> = new Map();
const MIN_SIGNAL_INTERVAL = 300000; // 5 minutes between signals

function calculateRSI(prices: number[], period: number = 14): number {
  if (prices.length < period + 1) return 50;

  let gains = 0;
  let losses = 0;

  for (let i = prices.length - period; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;

  if (avgLoss === 0) return 100;

  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function calculateSMA(prices: number[], period: number): number {
  if (prices.length < period) return prices[prices.length - 1];
  return prices.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function calculateVWAP(candles: PriceData[]): number {
  if (candles.length < 5) return candles[candles.length - 1]?.close || 0;
  
  const recent = candles.slice(-10);
  let totalPV = 0;
  let totalVolume = 0;

  for (const candle of recent) {
    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    totalPV += typicalPrice * candle.volume;
    totalVolume += candle.volume;
  }

  return totalVolume > 0 ? totalPV / totalVolume : recent[recent.length - 1].close;
}

/**
 * AGGRESSIVE Signal Generator - Designed to trade frequently
 */
export function generateSignal(
  strategy: Strategy,
  token: string,
  candles: PriceData[],
  currentPrice: number
): Signal | null {
  // Rate limiting - max 1 signal per 5 minutes per token
  const now = Date.now();
  const lastTime = lastSignalTime.get(token) || 0;
  if (now - lastTime < MIN_SIGNAL_INTERVAL) {
    return null;
  }

  // Need at least some data
  if (candles.length < 10) {
    return null;
  }

  const closes = candles.map(c => c.close);
  const prevClose = closes[closes.length - 2] || currentPrice;
  const priceChange = (currentPrice - prevClose) / prevClose;
  
  // Calculate RSI with shorter period for more signals
  const rsi = calculateRSI(closes, Math.min(strategy.params.momentumPeriod, 10));
  const vwap = calculateVWAP(candles);
  
  let side: 'buy' | 'sell' | null = null;
  let confidence = 0.5;
  let reason = '';

  // AGGRESSIVE Strategy 1: RSI Mean Reversion (relaxed thresholds)
  if (rsi < strategy.params.entryRsiLower) {
    side = 'buy';
    confidence = Math.min(0.8, 0.5 + (strategy.params.entryRsiLower - rsi) / 50);
    reason = `RSI oversold (${rsi.toFixed(1)})`;
  } else if (rsi > strategy.params.entryRsiUpper) {
    side = 'sell';
    confidence = Math.min(0.8, 0.5 + (rsi - strategy.params.entryRsiUpper) / 50);
    reason = `RSI overbought (${rsi.toFixed(1)})`;
  }

  // AGGRESSIVE Strategy 2: Price momentum (no volume requirement)
  if (!side && Math.abs(priceChange) > 0.005) { // 0.5% move
    if (priceChange > 0) {
      side = 'buy';
      confidence = 0.6;
      reason = `Upward momentum (+${(priceChange * 100).toFixed(2)}%)`;
    } else {
      side = 'sell';
      confidence = 0.6;
      reason = `Downward momentum (${(priceChange * 100).toFixed(2)}%)`;
    }
  }

  // AGGRESSIVE Strategy 3: VWAP deviation
  if (!side) {
    const vwapDev = (currentPrice - vwap) / vwap;
    if (vwapDev < -0.01) { // 1% below VWAP
      side = 'buy';
      confidence = 0.55;
      reason = `Below VWAP (${(vwapDev * 100).toFixed(2)}%)`;
    } else if (vwapDev > 0.01) { // 1% above VWAP
      side = 'sell';
      confidence = 0.55;
      reason = `Above VWAP (+${(vwapDev * 100).toFixed(2)}%)`;
    }
  }

  if (!side) {
    return null;
  }

  // Record signal time
  lastSignalTime.set(token, now);

  logger.info(`🎯 SIGNAL: ${token} ${side.toUpperCase()} @ $${currentPrice.toFixed(6)} - ${reason}`);

  return {
    token,
    side,
    confidence,
    price: currentPrice,
    size: 0,
    reason,
    timestamp: new Date(),
    metadata: {
      rsi,
      vwap,
      priceChange,
      strategy: strategy.name,
    },
  };
}

export function calculatePositionSize(
  signal: Signal,
  capitalUsd: number,
  maxPositionUsd: number,
  openPositions: number,
  maxPositions: number
): number {
  if (openPositions >= maxPositions) {
    return 0;
  }

  // Fixed 20% of capital per trade for consistent testing
  const size = capitalUsd * 0.20;
  
  return Math.min(Math.max(Math.round(size), 50), maxPositionUsd);
}
