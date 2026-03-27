import { createLogger } from '../utils/logger';
import { Strategy, StrategyParams, Signal } from './types';

const logger = createLogger('SignalEngine');

/**
 * Technical Analysis Indicators
 */
interface PriceData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Calculate RSI
 */
function calculateRSI(prices: number[], period: number = 14): number {
  if (prices.length < period + 1) return 50;

  let gains = 0;
  let losses = 0;

  // Initial average
  for (let i = 1; i <= period; i++) {
    const change = prices[prices.length - i] - prices[prices.length - i - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;

  if (avgLoss === 0) return 100;

  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/**
 * Calculate Simple Moving Average
 */
function calculateSMA(prices: number[], period: number): number {
  if (prices.length < period) return prices[prices.length - 1];
  const sum = prices.slice(-period).reduce((a, b) => a + b, 0);
  return sum / period;
}

/**
 * Calculate VWAP
 */
function calculateVWAP(candles: PriceData[], period: number = 20): number {
  if (candles.length < period) {
    return candles[candles.length - 1]?.close || 0;
  }

  const recent = candles.slice(-period);
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
 * Calculate Bollinger Bands
 */
function calculateBollingerBands(
  prices: number[],
  period: number = 20,
  stdDev: number = 2
): { upper: number; middle: number; lower: number } {
  const sma = calculateSMA(prices, period);
  
  const squaredDiffs = prices.slice(-period).map(p => Math.pow(p - sma, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / period;
  const standardDev = Math.sqrt(variance);

  return {
    upper: sma + stdDev * standardDev,
    middle: sma,
    lower: sma - stdDev * standardDev,
  };
}

/**
 * Calculate ATR (Average True Range)
 */
function calculateATR(candles: PriceData[], period: number = 14): number {
  if (candles.length < period + 1) return 0;

  const trValues: number[] = [];
  
  for (let i = candles.length - period; i < candles.length; i++) {
    const candle = candles[i];
    const prevClose = candles[i - 1]?.close || candle.open;
    
    const tr1 = candle.high - candle.low;
    const tr2 = Math.abs(candle.high - prevClose);
    const tr3 = Math.abs(candle.low - prevClose);
    
    trValues.push(Math.max(tr1, tr2, tr3));
  }

  return trValues.reduce((a, b) => a + b, 0) / period;
}

/**
 * Generate trading signal based on strategy
 */
export function generateSignal(
  strategy: Strategy,
  token: string,
  candles: PriceData[],
  currentPrice: number,
  volume24h: number
): Signal | null {
  const params = strategy.params;

  // Extract price series
  const closes = candles.map(c => c.close);
  const volumes = candles.map(c => c.volume);
  
  // Calculate indicators
  const rsi = calculateRSI(closes, params.momentumPeriod);
  const vwap = calculateVWAP(candles, 20);
  const bb = calculateBollingerBands(closes, 20, 2);
  const smaVolume = calculateSMA(volumes, 20);
  const atr = calculateATR(candles, 14);

  // Check volume filter
  if (volume24h < params.minVolume24h) {
    return null;
  }

  let side: 'buy' | 'sell' | null = null;
  let confidence = 0;
  let reason = '';

  // Strategy: RSI + Volume
  if (strategy.indicators.includes('rsi')) {
    if (rsi < params.entryRsiLower && volumes[volumes.length - 1] > smaVolume * params.volumeMultiplier) {
      side = 'buy';
      confidence = (params.entryRsiLower - rsi) / params.entryRsiLower * 0.5 +
                   (volumes[volumes.length - 1] / smaVolume - 1) * 0.5;
      reason = `RSI oversold (${rsi.toFixed(1)}) with volume spike`;
    } else if (rsi > params.entryRsiUpper && volumes[volumes.length - 1] > smaVolume * params.volumeMultiplier) {
      side = 'sell';
      confidence = (rsi - params.entryRsiUpper) / (100 - params.entryRsiUpper) * 0.5 +
                   (volumes[volumes.length - 1] / smaVolume - 1) * 0.5;
      reason = `RSI overbought (${rsi.toFixed(1)}) with volume spike`;
    }
  }

  // Strategy: VWAP Breakout
  if (strategy.indicators.includes('vwap') && !side) {
    const prevClose = closes[closes.length - 2];
    if (prevClose < vwap && currentPrice > vwap * 1.01) {
      side = 'buy';
      confidence = 0.6;
      reason = `Break above VWAP (${vwap.toFixed(4)})`;
    } else if (prevClose > vwap && currentPrice < vwap * 0.99) {
      side = 'sell';
      confidence = 0.6;
      reason = `Break below VWAP (${vwap.toFixed(4)})`;
    }
  }

  // Strategy: Bollinger Band Mean Reversion
  if (strategy.indicators.includes('bollinger_bands') && !side) {
    if (currentPrice < bb.lower * 1.01 && rsi < 40) {
      side = 'buy';
      confidence = 0.5 + (bb.lower - currentPrice) / bb.lower * 5;
      reason = `Price near lower BB (${bb.lower.toFixed(4)})`;
    } else if (currentPrice > bb.upper * 0.99 && rsi > 60) {
      side = 'sell';
      confidence = 0.5 + (currentPrice - bb.upper) / bb.upper * 5;
      reason = `Price near upper BB (${bb.upper.toFixed(4)})`;
    }
  }

  // Apply minimum confidence threshold
  if (!side || confidence < 0.3) {
    return null;
  }

  // Cap confidence at 1.0
  confidence = Math.min(confidence, 1.0);

  return {
    token,
    side,
    confidence,
    price: currentPrice,
    size: 0, // Will be set by position sizer
    reason,
    timestamp: new Date(),
    metadata: {
      rsi,
      vwap,
      bbUpper: bb.upper,
      bbLower: bb.lower,
      atr,
      volumeRatio: volumes[volumes.length - 1] / smaVolume,
      strategy: strategy.name,
    },
  };
}

/**
 * Calculate position size based on confidence and risk params
 */
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

  // Base size on available capital and signal confidence
  const baseSize = capitalUsd * 0.1; // 10% of capital per trade
  const confidenceMultiplier = signal.confidence;
  
  let size = baseSize * confidenceMultiplier;
  
  // Cap at max position size
  size = Math.min(size, maxPositionUsd);
  
  // Ensure minimum trade size
  size = Math.max(size, 50);

  return size;
}

export { calculateRSI, calculateVWAP, calculateBollingerBands, calculateATR };
