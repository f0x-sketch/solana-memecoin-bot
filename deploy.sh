#!/bin/bash
# Solana Trading Bot - Deployment Script
# Run this on your VPS to deploy the bot

set -e

echo "🚀 Setting up Solana Trading Bot..."

# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install PM2 for process management
sudo npm install -g pm2

# Create bot directory
mkdir -p ~/solana-bot
cd ~/solana-bot

# Clone or copy the bot files
echo "📁 Please upload the bot files to ~/solana-bot"
echo "   (scp -r projects/autoresearch-solana user@your-vps:~/solana-bot/)"
echo ""
echo "Press Enter when files are uploaded..."
read

# Install dependencies
npm install

# Build the project
npm run build

echo ""
echo "✅ Bot files ready!"
echo ""
echo "Next steps:"
echo "1. Edit .env file with your settings"
echo "2. Set SOLANA_PRIVATE_KEY and SOLANA_WALLET_ADDRESS"
echo "3. Change DRY_RUN=false for live trading"
echo "4. Run: pm2 start dist/index.js --name solana-bot"
echo "5. Monitor: pm2 logs solana-bot"
