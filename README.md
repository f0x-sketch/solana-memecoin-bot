# 🤖 Autoresearch Solana

Autonomous trading strategy research and optimization for Solana DEXs.

Inspired by [karpathy/autoresearch](https://github.com/karpathy/autoresearch) - this system automatically designs, tests, and improves trading strategies without human intervention.

## 🎯 How It Works

1. **Generate** - Creates new strategy variations (parameter sweeps, mutations, combinations)
2. **Paper Trade** - Tests strategies in real-time with simulated money
3. **Evaluate** - Calculates Sharpe ratio, win rate, max drawdown
4. **Promote** - Profitable strategies graduate to live trading
5. **Iterate** - Continuously improves 24/7

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your credentials

# Run research mode (paper trading + optimization)
npm run research

# Or run single paper trading session
npm run paper
```

## 📁 Project Structure

```
src/
├── strategies/
│   ├── types.ts          # Strategy definitions
│   ├── generator.ts      # Experiment generation
│   └── signals.ts        # Technical indicators
├── execution/
│   ├── paper.ts          # Paper trading engine
│   └── live.ts           # Live trading via Jupiter
├── data/
│   └── price-feed.ts     # Jupiter/Birdeye price feeds
├── research/
│   └── loop.ts           # Autonomous research loop
├── utils/
│   ├── logger.ts         # Winston logging
│   └── database.ts       # SQLite storage
├── program.ts            # Research "skill" definition
└── index.ts              # Main entry point
```

## ⚙️ Configuration

Edit `.env` file:

```env
# Solana
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
SOLANA_PRIVATE_KEY=your_base58_key

# APIs
JUPITER_API_KEY=optional
BIRDEYE_API_KEY=optional_for_ohlcv

# Risk
DRY_RUN=true              # Start with paper trading
INITIAL_CAPITAL_USD=1000
MAX_POSITION_SIZE_USD=500

# Research
EXPERIMENT_INTERVAL_HOURS=6
MIN_WIN_RATE_PCT=55
MIN_SHARPE_RATIO=1.2
```

## 📊 Strategy Types

The system automatically experiments with:

- **RSI Momentum** - Oversold/overbought with volume
- **VWAP Breakout** - Price breaking volume-weighted average
- **Bollinger Bands** - Mean reversion at band extremes
- **Trend Following** - EMA crossovers with ADX
- **Volatility Expansion** - ATR-based breakouts

## 📈 Performance Metrics

Strategies are evaluated on:

| Metric | Target | Why It Matters |
|--------|--------|----------------|
| **Sharpe Ratio** | > 1.2 | Risk-adjusted returns |
| **Win Rate** | > 55% | Consistency |
| **Profit Factor** | > 1.3 | Profit vs loss ratio |
| **Max Drawdown** | < 10% | Worst case scenario |
| **Avg Duration** | Variable | Capital efficiency |

## 🔒 Safety Features

- **DRY_RUN mode** - All strategies start in paper trading
- **Daily loss limits** - Stops trading if exceeded
- **Position sizing** - Never risks too much on one trade
- **Stop losses** - Every trade has defined exit
- **Graduated promotion** - Only proven strategies go live

## 🧠 Research Loop

```
Generate Strategy → Paper Trade (6h) → Evaluate Metrics
                                         ↓
              Promote to Live ←── Profitable? ──→ Discard
                                         ↓
                              Generate New Variation
```

The system runs 24/7, automatically finding better strategies while you sleep.

## 📜 Program Definition

The research behavior is controlled by `src/program.ts` - a "skill" file that guides the AI agent. Modify this to change:

- Which indicators to use
- Parameter ranges to explore
- Risk management rules
- Evaluation criteria

## 📝 Logs

All activity is logged to:

- `logs/combined.log` - All log levels
- `logs/error.log` - Errors only
- `logs/experiments.log` - Experiment results
- `data/trades.db` - SQLite database

## 🎓 Inspired By

- [karpathy/autoresearch](https://github.com/karpathy/autoresearch) - Autonomous LLM research
- [karpathy/nanoGPT](https://github.com/karpathy/nanoGPT) - Minimal, hackable code

## ⚠️ Disclaimer

**Trading carries risk. This software is for educational purposes.**

- Always start with DRY_RUN=true
- Never risk more than you can afford to lose
- Past performance doesn't guarantee future results
- Review all strategies before live trading

## 📄 License

MIT
