# Solana Memecoin Trading Strategy - Research Document

## Executive Summary

**Goal:** Design profitable trading strategies for Solana memecoins (WIF, BONK) using autoresearch methodology.

**Current Setup:**
- Tokens: WIF, BONK (2 most volatile Solana memecoins)
- Price Source: CoinGecko (reliable, API key configured)
- Mode: Paper trading (DRY_RUN=true)
- Capital: $1,000

## Research-Backed Strategy Parameters

### 1. Momentum RSI Strategy (Current)

**Hypothesis:** Memecoins exhibit mean reversion when RSI reaches extremes with volume confirmation.

**Parameters:**
```javascript
{
  entryRsiLower: 25,        // Buy when oversold
  entryRsiUpper: 75,        // Sell when overbought
  volumeMultiplier: 1.5,    // Confirm with volume spike
  profitThreshold: 0.05,    // 5% profit target
  stopLoss: 0.02,           // 2% stop loss
  maxHoldTime: 45,          // 45 minutes max
  maxPositions: 2,          // 1 per token
  positionSizePct: 0.25     // 25% per trade
}
```

**Expected Performance:**
- Win Rate: 55-65%
- Avg Profit: 3-5%
- Sharpe Ratio: 1.2-1.8

### 2. VWAP Breakout Strategy

**Hypothesis:** Breaks above/below VWAP indicate momentum shifts in volatile memecoins.

**Parameters:**
```javascript
{
  vwapDeviation: 0.015,     // 1.5% deviation for breakout
  volumeConfirmation: true, // Require volume spike
  profitThreshold: 0.04,    // 4% target
  stopLoss: 0.02,           // 2% stop
  maxHoldTime: 30,          // 30 minutes
  maxPositions: 2
}
```

### 3. Bollinger Band Squeeze

**Hypothesis:** Low volatility periods (squeeze) precede explosive moves in memecoins.

**Parameters:**
```javascript
{
  bbPeriod: 20,
  bbStdDev: 2,
  squeezeThreshold: 0.05,   // Band width < 5% of price
  breakoutConfirmation: 2,  // 2 candles outside band
  profitThreshold: 0.08,    // 8% target (explosive moves)
  stopLoss: 0.03,           // 3% stop
  maxHoldTime: 60
}
```

## Risk Management Framework

### Position Sizing
- Max 2 positions (1 per token)
- 25% capital per position ($250 each)
- Never exceed 50% total exposure

### Exit Rules
1. **Take Profit:** 5% (conservative for memecoins)
2. **Stop Loss:** 2% (tight, preserves capital)
3. **Time Stop:** 45 minutes (memecoins move fast)
4. **Trailing Stop:** 1% below peak after 3% profit

### Daily Limits
- Max daily loss: $50 (5% of capital)
- Max trades per day: 10
- Cooldown after 3 consecutive losses: 30 minutes

## Experiment Design

### Phase 1: Baseline (Week 1)
- Strategy: Momentum RSI
- Duration: 7 days
- Goal: Establish baseline metrics

### Phase 2: Optimization (Week 2)
- Grid search: RSI thresholds (20-40 lower, 60-80 upper)
- Grid search: Hold times (30-90 minutes)
- Select top 3 parameter sets

### Phase 3: Validation (Week 3)
- Run top 3 strategies in parallel
- Compare: Win rate, Sharpe, max drawdown
- Select winner for live trading

## Key Metrics to Track

1. **Win Rate:** > 55% (minimum viable)
2. **Profit Factor:** > 1.5 (gross profit / gross loss)
3. **Sharpe Ratio:** > 1.2 (risk-adjusted returns)
4. **Max Drawdown:** < 10% (capital preservation)
5. **Avg Trade Duration:** 15-45 minutes (target)

## Implementation Notes

### Current Bot Status
- ✅ Real price data (CoinGecko)
- ✅ Rate limiting (60 RPM)
- ✅ Position tracking
- ✅ Paper trading
- ✅ Strategy rotation every hour

### Next Steps
1. Let current experiment run for 6 hours
2. Analyze results
3. Mutate parameters based on performance
4. Repeat until Sharpe > 1.2

---

**Research Source:** karpathy/autoresearch methodology
**Last Updated:** 2026-03-29
