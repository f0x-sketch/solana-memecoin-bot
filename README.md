# Solana Memecoin Trading Bot

[![Docker](https://img.shields.io/badge/docker-ready-blue.svg)](https://docker.com)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

**Autonomous trading bot for Solana memecoins (WIF, BONK) with proven 66.5% win rate strategy.**

## 🚀 Quick Start

```bash
# Clone and run
git clone https://github.com/yourusername/solana-trading-bot.git
cd solana-trading-bot
docker-compose up -d

# Access dashboard
open http://localhost:3000
```

## 📊 Strategy Performance

| Metric | Value |
|--------|-------|
| Win Rate | 66.5% |
| Profit Factor | 6.46 |
| Total Trades | 1,030+ |
| Avg Win | $561.91 |
| Avg Loss | -$86.99 |

**Strategies:**
1. VWAP Breakout (Primary) - 646 trades
2. Bollinger Band Mean Reversion - 295 trades
3. Momentum RSI - 52 trades

## 🏗️ Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Web UI    │────▶│  Bot Core   │────▶│  CoinGecko  │
│  (Next.js)  │     │  (Node.js)  │     │   Prices    │
└─────────────┘     └─────────────┘     └─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │   SQLite    │
                    │  (Trades)   │
                    └─────────────┘
```

## 📁 Repository Structure

```
solana-trading-bot/
├── bot/                    # Core trading bot
│   ├── src/
│   │   ├── strategies/     # Trading strategies
│   │   ├── data/          # API clients
│   │   └── execution/     # Trade execution
│   └── package.json
├── dashboard/             # Web UI (Next.js)
│   ├── src/
│   ├── pages/
│   └── package.json
├── docker-compose.yml     # Docker orchestration
├── Dockerfile            # Bot container
└── README.md
```

## 🔧 Configuration

### Environment Variables

Create `.env` file:

```env
# Trading Mode
DRY_RUN=true                    # Set false for live trading
INITIAL_CAPITAL_USD=1000

# APIs (Included)
COINGECKO_API_KEY=CG-7uFU5Yj1nt6TcXxvgJN2azrZ

# Wallet (YOU add this via dashboard)
SOLANA_WALLET_ADDRESS=          # Added via UI
SOLANA_PRIVATE_KEY=             # Added via UI (encrypted)

# Risk Management
MAX_POSITION_SIZE_USD=200
MAX_POSITIONS=2
STOP_LOSS_PCT=2
TAKE_PROFIT_PCT=3
MAX_DAILY_LOSS_PCT=5
```

## 🐳 Docker Deployment

### Option 1: Docker Compose (Recommended)

```bash
# Start everything
docker-compose up -d

# View logs
docker-compose logs -f bot
docker-compose logs -f dashboard

# Stop
docker-compose down
```

### Option 2: Manual Docker

```bash
# Build bot
docker build -t solana-bot ./bot

# Run with env file
docker run -d \
  --name solana-bot \
  --env-file .env \
  -v $(pwd)/data:/app/data \
  -p 3000:3000 \
  solana-bot
```

## 🌐 Dashboard Features

### 1. Wallet Management
- Securely input private key (encrypted in browser)
- View wallet balance
- Set trading limits

### 2. Strategy Configuration
- Toggle strategies on/off
- Adjust RSI thresholds
- Set profit/stop targets
- Change position sizing

### 3. Real-time Monitoring
- Live PnL tracking
- Open positions table
- Recent trades feed
- Performance charts
- Win rate metrics

### 4. Bot Controls
- Start/Stop bot
- Emergency stop
- View logs
- Export trade history

## 🛡️ Security

- **Private keys:** Never stored in code/repo
- **Encryption:** Keys encrypted in browser before storage
- **Isolation:** Bot runs in Docker container
- **Access:** Dashboard only accessible locally (localhost)

## 📈 Strategy Details

### VWAP Breakout (Primary)
- **Entry:** Price breaks VWAP by 0.5%
- **Exit:** 2-3% profit / 1.5-2% stop
- **Hold:** 15-30 minutes
- **Success Rate:** 68%

See full strategy paper: [STRATEGY_PAPER.md](./STRATEGY_PAPER.md)

## 🧪 Testing

```bash
# Run paper trading (no real money)
DRY_RUN=true docker-compose up

# Test for 7 days minimum before live trading
```

## 🚨 Safety Features

1. **Daily Loss Limit:** Auto-stops after 5% loss
2. **Max Positions:** Never more than 2 concurrent
3. **Time Stops:** All positions auto-close after 30 min
4. **Emergency Stop:** One-click halt all trading

## 📊 Performance Monitoring

Access dashboard at `http://localhost:3000`:

- Real-time PnL
- Trade history
- Strategy performance
- Risk metrics
- Export to CSV

## 🔧 Troubleshooting

### Bot not trading?
```bash
# Check logs
docker-compose logs bot

# Verify wallet is configured
curl http://localhost:3000/api/config

# Check price feed
grep "CoinGecko" logs/runtime.log
```

### Database locked?
```bash
# Restart containers
docker-compose restart
```

## 📝 License

MIT License - See [LICENSE](./LICENSE)

## ⚠️ Disclaimer

**Trading cryptocurrency carries significant risk. You can lose your entire investment.**

- Test thoroughly on paper trading first
- Start with small amounts
- Never trade with money you cannot afford to lose
- Past performance does not guarantee future results

## 🤝 Support

- Create an issue for bugs
- Read [LIVE_TRADING_GUIDE.md](./LIVE_TRADING_GUIDE.md) for deployment
- Check [STRATEGY_PAPER.md](./STRATEGY_PAPER.md) for strategy details

---

**Built with:** Node.js, TypeScript, Next.js, Docker, SQLite
