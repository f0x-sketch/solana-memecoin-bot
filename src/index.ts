import dotenv from 'dotenv';
dotenv.config();

import { Connection, Keypair } from '@solana/web3.js';
import { createLogger } from './utils/logger';
import { initializeDatabase, closeDatabase } from './utils/database';
import { startDashboard } from './dashboard/server';
import { ResearchLoop } from './research/loop';

const logger = createLogger('Main');

/**
 * Autoresearch Solana - Main Entry Point
 * 
 * Features:
 * - Autonomous strategy research and optimization
 * - Paper trading mode (safe testing)
 * - Live trading (requires configuration)
 * - Web dashboard for monitoring (http://localhost:3000)
 *
 * Usage:
 *   npm run paper    # Run paper trading only
 *   npm run research # Run autonomous research loop
 *   npm run live     # Run live trading (requires DRY_RUN=false)
 *   docker-compose up -d  # Run with Docker
 */

async function main() {
  logger.info('═══════════════════════════════════════════════════');
  logger.info('  🤖 AUTORESEARCH SOLANA');
  logger.info('  Autonomous Trading Strategy Optimization');
  logger.info('═══════════════════════════════════════════════════\n');

  const mode = process.env.MODE || 'research';
  const dryRun = process.env.DRY_RUN !== 'false';
  const dashboardPort = parseInt(process.env.DASHBOARD_PORT || '3000');

  logger.info(`Mode: ${mode.toUpperCase()}`);
  logger.info(`Dry Run: ${dryRun ? 'YES (paper trading)' : 'NO (LIVE MONEY)'}`);
  logger.info(`Dashboard: http://localhost:${dashboardPort}\n`);

  // Initialize database
  await initializeDatabase();

  // Start web dashboard
  startDashboard(dashboardPort);

  switch (mode) {
    case 'research':
      await runResearchMode();
      break;
    case 'paper':
      await runPaperMode();
      break;
    case 'live':
      await runLiveMode();
      break;
    default:
      logger.error(`Unknown mode: ${mode}`);
      logger.info('Use: MODE=research|paper|live');
      process.exit(1);
  }
}

/**
 * Run autonomous research loop
 */
async function runResearchMode(): Promise<void> {
  logger.info('\n🧠 Starting Autonomous Research Loop...\n');

  const loop = new ResearchLoop({
    experimentDurationHours: parseInt(process.env.EXPERIMENT_DURATION_HOURS || '6'),
    minWinRatePct: parseFloat(process.env.MIN_WIN_RATE_PCT || '55'),
    minSharpeRatio: parseFloat(process.env.MIN_SHARPE_RATIO || '1.2'),
  });

  await loop.start();

  // Keep process alive
  setInterval(() => {}, 1000);

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    logger.info('\n\n👋 Shutting down research loop...');
    loop.stop();
    await closeDatabase();
    process.exit(0);
  });

  // Keep running indefinitely
  await new Promise(() => {});
}

/**
 * Run single paper trading session
 */
async function runPaperMode(): Promise<void> {
  logger.info('\n📊 Starting Paper Trading Session...\n');

  // Import and run research loop with shorter duration
  const { ResearchLoop } = await import('./research/loop');

  const loop = new ResearchLoop({
    experimentDurationHours: 1, // Just 1 hour for paper mode
    minWinRatePct: 0, // No promotion criteria in paper mode
    minSharpeRatio: 0,
  });

  await loop.start();

  // Keep process alive
  setInterval(() => {}, 1000);

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    logger.info('\n\n👋 Shutting down paper trading...');
    loop.stop();
    await closeDatabase();
    process.exit(0);
  });

  // Keep running indefinitely
  await new Promise(() => {});
}

/**
 * Run live trading with best strategy
 */
async function runLiveMode(): Promise<void> {
  if (process.env.DRY_RUN !== 'false') {
    logger.warn('\n⚠️  DRY_RUN is true! Switching to paper mode.');
    return runPaperMode();
  }

  logger.info('\n🔴 Starting LIVE TRADING...\n');
  logger.warn('⚠️  REAL MONEY IS AT RISK!\n');

  // Validate credentials
  const privateKey = process.env.SOLANA_PRIVATE_KEY;
  const rpcUrl = process.env.SOLANA_RPC_URL;

  if (!privateKey || !rpcUrl) {
    logger.error('Missing required environment variables:');
    if (!privateKey) logger.error('  - SOLANA_PRIVATE_KEY');
    if (!rpcUrl) logger.error('  - SOLANA_RPC_URL');
    process.exit(1);
  }

  try {
    // Initialize Solana connection
    const connection = new Connection(rpcUrl, 'confirmed');
    const wallet = Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(privateKey))
    );

    logger.info(`Wallet: ${wallet.publicKey.toString()}`);

    // Check balance
    const balance = await connection.getBalance(wallet.publicKey);
    logger.info(`SOL Balance: ${balance / 1e9} SOL`);

    // TODO: Load best strategy and run live trading
    logger.info('Live trading implementation pending...');
    logger.info('For now, run research mode to find profitable strategies.');

  } catch (error) {
    logger.error('Failed to initialize live trading:', error);
    process.exit(1);
  }
}

// Run main
main().catch(async (error) => {
  logger.error('Fatal error:', error);
  await closeDatabase();
  process.exit(1);
});
