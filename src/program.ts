/**
 * Autoresearch Solana - Program Definition
 * 
 * This is the "skill" that guides the AI agent.
 * Modify this to change the research direction.
 */

export const PROGRAM = `
# Autoresearch Solana Trading

## Goal
Design, test, and optimize profitable trading strategies on Solana DEXs (Jupiter, Raydium, Orca).

## Architecture
1. **Strategy Generator**: Creates strategy variations
2. **Backtest Engine**: Tests on historical data
3. **Paper Trader**: Forward tests without real money
4. **Live Trader**: Executes real trades when profitable
5. **Metrics Analyzer**: Evaluates performance

## Experiment Loop
1. Generate hypothesis (new strategy or parameter tweak)
2. Backtest on 30 days of data
3. If backtest Sharpe > 1.5, paper trade for 6 hours
4. If paper trade profitable, promote to live
5. Log results, iterate

## Strategy Types to Explore
- Momentum: RSI, MACD, volume spikes
- Mean reversion: Bollinger Bands, VWAP deviation
- Arbitrage: Jupiter vs Raydium price differences
- Sentiment: Social metrics, whale movements
- On-chain: Wallet tracking, smart money flow

## Risk Management (NEVER VIOLATE)
- Max 5% daily loss
- Max 50% position size
- Stop losses on every trade
- No martingale or doubling down

## Metrics to Optimize
- Sharpe ratio (primary)
- Win rate
- Profit factor
- Max drawdown
- Average trade duration

## Files
- strategies/experiment.ts: Current experiment config
- strategies/active.ts: Currently running strategy
- research/loop.ts: Experiment orchestration
- backtest/runner.ts: Historical testing
- execution/paper.ts: Simulated trading
- execution/live.ts: Real trading
- metrics/analyzer.ts: Performance calculation
`;

export const INITIAL_STRATEGY = {
  name: "momentum_vwap",
  version: "1.0.0",
  description: "Entry on momentum break above VWAP with volume confirmation",
  parameters: {
    vwapPeriod: 20,
    momentumPeriod: 14,
    volumeMultiplier: 1.5,
    profitThreshold: 0.03,
    stopLoss: 0.02,
    maxHoldTime: 120, // minutes
  },
  indicators: ["vwap", "rsi", "volume_ma"],
  timeframes: ["5m", "15m"],
  tokens: ["SOL", "BONK", "JUP", "RAY"],
};
