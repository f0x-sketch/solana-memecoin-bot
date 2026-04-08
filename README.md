# Solana Memecoin Trading Bot

[![Docker](https://img.shields.io/badge/docker-ready-blue.svg)](https://docker.com)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)

**Autonomous trading bot for Solana memecoins with 15+ tokens, real-time dashboard, and autonomous research loop.**

## 🚀 Quick Start

```bash
# Clone and run
git clone https://github.com/f0x-sketch/solana-memecoin-bot.git
cd solana-memecoin-bot

# Set up environment
cp .env.example .env
# Edit .env to add your API keys (optional - bot works without them)

# Start with Docker
docker-compose up -d

# Access dashboard
open http://localhost:3000
```

## 📊 Supported Tokens (15 Total)

| Symbol | Name | Type |
|--------|------|------|
| SOL | Solana | L1 |
| BONK | Bonk | Meme |
| JUP | Jupiter | DeFi |
| RAY | Raydium | DeFi |
| WIF | dogwifhat | Meme |
| BOME | Book of Meme | Meme |
| POPCAT | Popcat | Meme |
| MEW | cat in a dogs world | Meme |
| JTO | Jito | Infrastructure |
| PYTH | Pyth Network | Oracle |
| RENDER | Render | Compute |
| TNSR | Tensor | NFT |
| W | Wormhole | Bridge |
| HNT | Helium | IoT |
| FIDA | Bonfida | DeFi |

## 🎯 Key Features

### 1. Autonomous Research Loop
- Automatically generates and tests new strategies
- Paper trades experiments for 6+ hours
- Promotes winning strategies to live trading
- Continuous optimization without human intervention

### 2. Real-Time Dashboard
- **Live Price Ticker** - All 15 tokens with 24h % change
- **PnL Chart** - Equity curve with Chart.js visualization
- **Performance Metrics** - Sharpe ratio, max drawdown, profit factor
- **Status Indicators** - Health monitoring for price feeds
- **Filtered Logs** - Filter by All/Trades/Errors/Warnings/Info
- **Trade Details** - Duration, exit reason, entry/exit prices

### 3. Multiple Price Sources
- **Primary:** Jupiter Price API v3 (free, no API key)
- **Fallback 1:** CoinGecko with API key (30-50 RPM)
- **Fallback 2:** CoinGecko free tier (10-30 RPM)

### 4. Smart Trading Strategies
| Strategy | Tokens | Description |
|----------|--------|-------------|
| Ultra Aggressive RSI | Meme coins (BONK, WIF, BOME, POPCAT, MEW) | RSI 40-60 range trades |
| Momentum Chaser | All tokens | 0.5% price move scalping |
| VWAP Scalper | DeFi/Infrastructure | 1% VWAP deviation trades |
| Price Action | All tokens | Raw price change signals |

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Dashboard (Port 3000)                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Price Ticker │  │  PnL Chart   │  │   Stats Cards        │  │
│  │ (15 tokens)  │  │  (Chart.js)  │  │ (Sharpe/Drawdown)    │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Trade Table  │  │  Log Filter  │  │   Status Indicators  │  │
│  │ (w/ Duration)│  │  (5 levels)  │  │   (Price Feed/DB)    │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Trading Bot Core                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Research Loop│  │Signal Engine │  │   Paper Trading      │  │
│  │ (Generator)  │  │ (RSI/VWAP)   │  │   (Simulated)        │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Price Feed   │  │Risk Manager  │  │   Live Execution     │  │
│  │ (Jupiter/CG) │  │ (Stops/Sizes)│  │   (Jupiter API)      │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
        ┌──────────┐   ┌──────────┐   ┌──────────┐
        │ Jupiter  │   │CoinGecko │   │  SQLite  │
        │ Price API│   │  API     │   │ Database │
        └──────────┘   └──────────┘   └──────────┘
```

## 📁 Repository Structure

```
solana-memecoin-bot/
├── src/
│   ├── strategies/          # Trading strategy implementations
│   │   ├── generator.ts     # Experiment generator
│   │   ├── signals.ts       # Signal generation (RSI, VWAP)
│   │   └── types.ts         # Strategy type definitions
│   ├── data/                # Data providers
│   │   ├── provider.ts      # Unified price provider (Jupiter/CoinGecko)
│   │   ├── jupiter-price.ts # Jupiter API client
│   │   ├── price-feed.ts    # Price feed orchestration
│   │   └── rate-limiter.ts  # API rate limiting
│   ├── execution/           # Trade execution
│   │   ├── paper.ts         # Paper trading simulation
│   │   └── live.ts          # Live trading (Jupiter swaps)
│   ├── research/            # Autonomous research
│   │   └── loop.ts          # Main research loop
│   ├── dashboard/           # Web dashboard
│   │   └── server.ts        # Express API + static files
│   ├── utils/               # Utilities
│   │   ├── database.ts      # SQLite operations
│   │   └── logger.ts        # Winston logging
│   └── index.ts             # Entry point
├── dashboard/               # Frontend HTML/CSS/JS
│   └── index.html           # Single-page dashboard
├── data/                    # SQLite database (created at runtime)
├── logs/                    # Runtime logs (created at runtime)
├── promoted-strategies/     # Winning strategies JSON
├── .env.example             # Environment template
├── docker-compose.yml       # Docker orchestration
├── Dockerfile               # Container definition
└── README.md                # This file
```

## 🔧 Configuration

### Environment Variables

Create `.env` file from `.env.example`:

```env
# === Trading Mode ===
# DRY_RUN=true: Paper trading (simulated, no real money)
# DRY_RUN=false: Live trading (real money at risk)
DRY_RUN=true

# === Initial Capital ===
INITIAL_CAPITAL_USD=1000
MAX_POSITION_SIZE_USD=200
MIN_TRADE_SIZE_USD=50

# === Token List ===
# Comma-separated list of tokens to trade
TOKENS=SOL,BONK,JUP,RAY,WIF,BOME,POPCAT,MEW,JTO,PYTH,RENDER,TNSR,W,HNT,FIDA

# === APIs (Optional - bot works without keys) ===
# CoinGecko API key for higher rate limits
COINGECKO_API_KEY=your_key_here

# Jupiter API (free, no key required)
JUPITER_API_KEY=optional_key_for_higher_limits

# === Wallet (For live trading only) ===
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
SOLANA_WSS_URL=wss://api.mainnet-beta.solana.com
SOLANA_WALLET_ADDRESS=your_wallet_address
SOLANA_PRIVATE_KEY=your_base58_private_key

# === Risk Management ===
MAX_DAILY_LOSS_PCT=5
MAX_POSITIONS=2
STOP_LOSS_PCT=2
TAKE_PROFIT_PCT=3

# === Research Parameters ===
EXPERIMENT_INTERVAL_HOURS=6
MIN_EXPERIMENTS_BEFORE_LIVE=10
MIN_WIN_RATE_PCT=55
MIN_SHARPE_RATIO=1.2

# === Strategy Parameters ===
INITIAL_PROFIT_THRESHOLD=0.02
INITIAL_HOLD_TIME_MINUTES=60
INITIAL_MOMENTUM_PERIOD=14

# === Database & Logging ===
DATABASE_PATH=./data/trades.db
LOG_LEVEL=info
```

## 🐳 Docker Deployment

### Option 1: Docker Compose (Recommended)

```bash
# Start everything
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down

# Rebuild after code changes
docker-compose up -d --build
```

### Option 2: Manual Build

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Start bot
npm start

# Or start in dev mode
npm run dev
```

## 🌐 Dashboard API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/health` | Health check |
| `GET /api/config` | Bot configuration |
| `GET /api/prices` | Current token prices |
| `GET /api/stats` | Performance statistics (Sharpe, drawdown, etc.) |
| `GET /api/pnl-history` | Daily PnL for chart |
| `GET /api/trades` | Recent trades with duration |
| `GET /api/positions` | Open positions |
| `GET /api/status` | Price feed health |
| `GET /api/experiment/current` | Active strategy experiment |
| `GET /api/experiments` | Experiment history |
| `GET /api/logs?filter=all` | Filtered logs (all/trade/error/warn/info) |
| `POST /api/config` | Update configuration |
| `POST /api/emergency-stop` | Emergency stop bot |

## 📈 Dashboard Features

### Price Ticker
- Real-time prices for all 15 tokens
- 24-hour percentage change indicator
- Color-coded (green = up, red = down)
- Horizontal scroll on mobile

### Performance Stats (8 Cards)
1. **Total PnL** - Realized profit/loss
2. **Win Rate** - Win/loss ratio
3. **Sharpe Ratio** - Risk-adjusted return
4. **Max Drawdown** - Peak-to-trough loss
5. **Open Positions** - Active trades
6. **Profit Factor** - Gross profit / loss
7. **Total Trades** - All-time trade count
8. **Avg Duration** - Average hold time

### PnL Chart
- Equity curve visualization
- Daily performance tracking
- Auto-updates every minute
- Starting capital reference line

### Trade Tables
- Entry/exit prices
- Trade duration (e.g., "12m", "1h 30m")
- Exit reason (take profit, stop loss, timeout)
- Color-coded rows (green = win, red = loss)

### Log Viewer
- Filter buttons: All / Trades / Errors / Warnings / Info
- Color-coded log lines
- Auto-scroll to newest
- Manual refresh button

## 🛡️ Security

- **Private keys:** Never stored in repository
- **Environment variables:** Loaded at runtime
- **Docker isolation:** Bot runs in container
- **Local-only dashboard:** No external exposure
- **Paper trading default:** No real money until explicitly enabled

## 🧪 Testing

```bash
# Paper trading (recommended first step)
DRY_RUN=true docker-compose up -d

# Monitor for 7+ days
# Check dashboard at http://localhost:3000

# Only then consider live trading
DRY_RUN=false docker-compose up -d
```

## 📊 Strategy Research

The bot automatically:
1. Generates new strategy experiments every 6 hours
2. Paper trades each strategy for minimum duration
3. Evaluates metrics (win rate, Sharpe, profit factor)
4. Promotes strategies exceeding thresholds to live trading
5. Archives results for analysis

Promoted strategies are saved to `promoted-strategies/*.json`.

## 🚨 Safety Features

1. **Daily Loss Limit:** Auto-stops after 5% daily loss
2. **Max Positions:** Never more than 2 concurrent trades
3. **Time Stops:** All positions auto-close after max hold time
4. **Emergency Stop:** One-click halt via dashboard or API
5. **Position Sizing:** Fixed 20% per trade (configurable)
6. **DRY_RUN default:** Must explicitly enable live trading

## 🔧 Troubleshooting

### Bot not trading?
```bash
# Check logs
docker-compose logs -f

# Verify price feed
curl http://localhost:3000/api/prices

# Check status
curl http://localhost:3000/api/status

# View database
sqlite3 data/trades.db "SELECT * FROM trades ORDER BY entry_time DESC LIMIT 10;"
```

### Price feed issues?
```bash
# Check rate limits
grep "rate limit" logs/runtime.log

# Verify Jupiter connectivity
curl https://lite-api.jup.ag/price/v3?ids=So11111111111111111111111111111111111111112
```

### Database errors?
```bash
# Reset database (WARNING: loses all history)
rm data/trades.db
docker-compose restart
```

## 📝 Development

```bash
# Local development
npm install
npm run dev

# Run tests
npm test

# Build for production
npm run build

# Lint code
npm run lint
```

## 📚 Documentation

- [STRATEGY_PAPER.md](./STRATEGY_PAPER.md) - Detailed strategy analysis
- [LIVE_TRADING_GUIDE.md](./LIVE_TRADING_GUIDE.md) - Production deployment
- [.env.example](./.env.example) - Configuration reference

## 🎯 Performance Targets

Based on backtesting and paper trading:

| Metric | Target | Notes |
|--------|--------|-------|
| Win Rate | >55% | Minimum for promotion |
| Sharpe Ratio | >1.2 | Risk-adjusted return |
| Profit Factor | >1.5 | Gross profit / loss |
| Max Drawdown | <10% | Peak-to-trough |
| Trades/Day | 5-15 | Depends on volatility |

## ⚠️ Disclaimer

**Trading cryptocurrency carries significant risk. You can lose your entire investment.**

- Test thoroughly on paper trading first (minimum 7 days)
- Start with small amounts you can afford to lose
- Past performance does not guarantee future results
- Meme coins are extremely volatile
- This is experimental software with no warranties

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📄 License

MIT License - See [LICENSE](./LICENSE)

## 🔗 Links

- [Jupiter Price API](https://station.jup.ag/docs/apis/price-api)
- [CoinGecko API](https://www.coingecko.com/en/api)
- [Solana Documentation](https://docs.solana.com/)

---

**Built with:** Node.js, TypeScript, Express, Chart.js, Docker, SQLite

**Version:** 2.0.0 | **Last Updated:** April 2026
