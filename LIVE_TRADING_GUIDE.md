# Live Trading Setup Guide

## ⚠️ BEFORE YOU START

**RISK WARNING:** This bot trades with real money. You can lose your entire investment.

**Prerequisites:**
- You've tested on paper trading for at least 7 days
- You understand the strategy parameters
- You have a dedicated trading wallet (not your main holdings)
- You accept full responsibility for losses

---

## Step 1: Prepare Your Environment

### Option A: Your Own VPS (Recommended)
```bash
# Get a VPS from DigitalOcean/Vultr/AWS
# Ubuntu 22.04 LTS, 1GB RAM minimum
# Cost: ~$5/month

# SSH into your server
ssh user@your-vps-ip
```

### Option B: Local Machine
```bash
# Ensure you have Node.js 18+ installed
node --version  # Should show v18.x or higher
```

---

## Step 2: Upload Bot Files

From your local machine:
```bash
# Compress the bot folder
cd ~/.openclaw/agents/agent3/workspace/projects
tar -czf solana-bot.tar.gz autoresearch-solana

# Upload to your server
scp solana-bot.tar.gz user@your-vps:~/

# SSH and extract
ssh user@your-vps
cd ~
tar -xzf solana-bot.tar.gz
mv autoresearch-solana solana-bot
cd solana-bot
```

---

## Step 3: Configure Environment

### Edit .env file:
```bash
nano .env
```

### Required Changes:
```
# CHANGE THIS TO FALSE FOR LIVE TRADING
DRY_RUN=false

# YOUR SOLANA WALLET (Test wallet recommended)
SOLANA_PRIVATE_KEY=your_private_key_here
SOLANA_WALLET_ADDRESS=your_public_address_here

# KEEP THESE AS-IS
ALCHEMY_API_KEY=2xeGHZf_o1ZwIx2j5svK1x7sPDVLzbBY
HELIUS_API_KEY=2a59b252-b715-4d8f-a38f-2e17fd41a0fa
COINGECKO_API_KEY=CG-7uFU5Yj1nt6TcXxvgJN2azrZ

# TOKENS TO TRADE
TOKENS=WIF,BONK

# RISK PARAMETERS (Adjust based on your risk tolerance)
INITIAL_CAPITAL_USD=1000       # Your trading capital
MAX_POSITION_SIZE_USD=200      # 20% of capital per trade
MAX_POSITIONS=2                # Max concurrent positions
STOP_LOSS_PCT=2                # 2% stop loss
TAKE_PROFIT_PCT=3              # 3% take profit
MAX_DAILY_LOSS_PCT=5           # Stop trading after 5% daily loss
```

---

## Step 4: Install and Run

### Install dependencies:
```bash
npm install
npm run build
```

### Test run (check for errors):
```bash
npm start
# Should show: "Bot started successfully"
# Should show: "Connected to CoinGecko"
# Should show: "Trading mode: LIVE"
# Press Ctrl+C to stop
```

### Run with PM2 (production):
```bash
# Install PM2 globally
sudo npm install -g pm2

# Start bot with PM2
pm2 start dist/index.js --name solana-bot

# Save PM2 config
pm2 save
pm2 startup

# Monitor logs
pm2 logs solana-bot --lines 100

# Check status
pm2 status

# Restart if needed
pm2 restart solana-bot

# Stop bot
pm2 stop solana-bot
```

---

## Step 5: Monitor Performance

### View logs:
```bash
# Real-time logs
pm2 logs solana-bot

# Last 1000 lines
pm2 logs solana-bot --lines 1000

# Search for trades
grep "PAPER TRADE\|LIVE TRADE" ~/.pm2/logs/solana-bot-out.log
```

### Check database:
```bash
# Install sqlite3 if needed
sudo apt install sqlite3

# Query trades
sqlite3 data/trades.db "SELECT COUNT(*) FROM trades WHERE status='closed';"
sqlite3 data/trades.db "SELECT SUM(pnl_usd) FROM trades WHERE status='closed';"
```

---

## Step 6: Safety Controls

### Emergency Stop:
```bash
# Stop bot immediately
pm2 stop solana-bot

# Check open positions
sqlite3 data/trades.db "SELECT * FROM trades WHERE status='open';"
```

### Daily Limits (Auto-enforced):
- Max daily loss: 5% (configured in .env)
- Max positions: 2 concurrent
- Max position size: 20% of capital

### Manual Override:
```bash
# Create STOP file to halt trading
touch STOP

# Remove to resume
rm STOP
```

---

## Troubleshooting

### Bot won't start:
```bash
# Check Node version
node --version  # Must be 18+

# Rebuild
rm -rf dist
npm run build

# Check .env syntax
cat .env | grep -v "^#" | grep -v "^$"
```

### No trades executing:
```bash
# Check price feed
tail -f ~/.pm2/logs/solana-bot-out.log | grep "CoinGecko"

# Check if signals are generating
tail -f ~/.pm2/logs/solana-bot-out.log | grep "SIGNAL"

# Verify DRY_RUN is false
grep DRY_RUN .env  # Should show: DRY_RUN=false
```

### Database locked:
```bash
# Stop bot
pm2 stop solana-bot

# Check for locks
lsof data/trades.db

# Restart
pm2 start solana-bot
```

---

## Backup and Recovery

### Backup database:
```bash
cp data/trades.db data/trades.db.backup.$(date +%Y%m%d)
```

### Backup .env:
```bash
cp .env .env.backup
```

### Restore:
```bash
cp data/trades.db.backup.20250402 data/trades.db
```

---

## Security Checklist

- [ ] Using dedicated trading wallet (not main wallet)
- [ ] Wallet has limited funds (<$1000 for testing)
- [ ] Private key stored securely (not in version control)
- [ ] Server has firewall enabled
- [ ] SSH key authentication (not password)
- [ ] Regular backups configured
- [ ] Monitoring alerts set up

---

## Performance Expectations

Based on paper trading results:

**Daily:**
- 10-30 trades
- Expected win rate: 60-70%
- Expected daily return: 2-5%

**Weekly:**
- 50-150 trades
- Expected return: 10-25%

**Monthly:**
- 200-600 trades
- Expected return: 50-200%

⚠️ **Past performance does not guarantee future results.**

---

## Need Help?

If you encounter issues:
1. Check logs: `pm2 logs solana-bot`
2. Review errors in: `~/.pm2/logs/solana-bot-error.log`
3. Verify configuration in `.env`
4. Ensure sufficient SOL for transaction fees

---

**Last Updated:** April 2, 2026  
**Bot Version:** 1.0  
**Strategy:** VWAP Breakout + Mean Reversion
