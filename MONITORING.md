# Bot Monitoring Schedule

## Hourly Checklist

- [ ] Check bot is running (`ps aux | grep autoresearch`)
- [ ] Check prices are flowing (CoinGecko)
- [ ] Check for trades in logs
- [ ] Check experiment rotation
- [ ] Restart if needed

## Current Configuration

**Data Sources:**
- Primary: CoinGecko (API key configured)
- Backup: None (Birdeye disabled due to errors)

**Tokens:**
- WIF: $0.179
- BONK: $0.000006

**Strategy Rotation:**
1. momentum_rsi
2. aggressive_rsi  
3. vwap_breakout
4. bb_squeeze

**Alerts:**
- If no prices for >5 minutes → Restart
- If >10 errors in 10 minutes → Check API keys
- If no trades in 3 hours → Review strategy parameters

## Last Updated
- 2026-03-30 07:55 UTC
- Bot PID: 344813
- Status: RUNNING
