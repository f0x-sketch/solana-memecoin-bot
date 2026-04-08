import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import { createLogger } from '../utils/logger';
import { getDb } from '../utils/database';

const logger = createLogger('Dashboard');
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../../dashboard')));

// Health check endpoint
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Get bot configuration
app.get('/api/config', (req: Request, res: Response) => {
  res.json({
    dryRun: process.env.DRY_RUN !== 'false',
    initialCapital: parseFloat(process.env.INITIAL_CAPITAL_USD || '1000'),
    maxPositionSize: parseFloat(process.env.MAX_POSITION_SIZE_USD || '200'),
    maxPositions: parseInt(process.env.MAX_POSITIONS || '2'),
    stopLoss: parseFloat(process.env.STOP_LOSS_PCT || '2'),
    takeProfit: parseFloat(process.env.TAKE_PROFIT_PCT || '3'),
    tokens: (process.env.TOKENS || 'SOL,BONK,JUP,RAY').split(',').map(t => t.trim()),
    walletConfigured: !!process.env.SOLANA_WALLET_ADDRESS,
    mode: process.env.MODE || 'research',
  });
});

// Update configuration (wallet, etc.)
app.post('/api/config', async (req: Request, res: Response) => {
  const { walletAddress, privateKey } = req.body;
  
  try {
    // Update environment variables
    if (walletAddress) {
      process.env.SOLANA_WALLET_ADDRESS = walletAddress;
    }
    if (privateKey) {
      // In production, this should be encrypted
      process.env.SOLANA_PRIVATE_KEY = privateKey;
    }
    
    logger.info('Configuration updated via dashboard');
    res.json({ success: true, message: 'Configuration updated' });
  } catch (error) {
    logger.error('Failed to update config:', error);
    res.status(500).json({ success: false, error: 'Failed to update configuration' });
  }
});

// Get trade statistics
app.get('/api/stats', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    
    const stats = await new Promise((resolve, reject) => {
      db.all(`
        SELECT 
          COUNT(*) as total_trades,
          SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) as closed_trades,
          SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as open_trades,
          SUM(CASE WHEN status = 'closed' AND pnl_usd > 0 THEN 1 ELSE 0 END) as wins,
          SUM(CASE WHEN status = 'closed' AND pnl_usd <= 0 THEN 1 ELSE 0 END) as losses,
          SUM(CASE WHEN status = 'closed' THEN pnl_usd ELSE 0 END) as total_pnl,
          AVG(CASE WHEN status = 'closed' AND pnl_usd > 0 THEN pnl_usd END) as avg_win,
          AVG(CASE WHEN status = 'closed' AND pnl_usd <= 0 THEN pnl_usd END) as avg_loss
        FROM trades
      `, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows[0]);
      });
    });
    
    res.json(stats);
  } catch (error) {
    logger.error('Failed to get stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// Get recent trades
app.get('/api/trades', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const db = getDb();
    
    const trades = await new Promise((resolve, reject) => {
      db.all(`
        SELECT * FROM trades 
        ORDER BY entry_time DESC 
        LIMIT ?
      `, [limit], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    res.json(trades);
  } catch (error) {
    logger.error('Failed to get trades:', error);
    res.status(500).json({ error: 'Failed to fetch trades' });
  }
});

// Get open positions
app.get('/api/positions', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    
    const positions = await new Promise((resolve, reject) => {
      db.all(`
        SELECT * FROM trades 
        WHERE status = 'open'
        ORDER BY entry_time DESC
      `, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    res.json(positions);
  } catch (error) {
    logger.error('Failed to get positions:', error);
    res.status(500).json({ error: 'Failed to fetch positions' });
  }
});

// Get current active experiment
app.get('/api/experiment/current', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    
    const experiment = await new Promise((resolve, reject) => {
      db.get(`
        SELECT * FROM experiments 
        WHERE status = 'active' OR status = 'running' OR end_time IS NULL
        ORDER BY start_time DESC 
        LIMIT 1
      `, [], (err, row) => {
        if (err) reject(err);
        else resolve(row || null);
      });
    });
    
    res.json(experiment || { status: 'no_active_experiment' });
  } catch (error) {
    logger.error('Failed to get current experiment:', error);
    res.status(500).json({ error: 'Failed to fetch current experiment' });
  }
});

// Get experiments
app.get('/api/experiments', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    
    const experiments = await new Promise((resolve, reject) => {
      db.all(`
        SELECT * FROM experiments 
        ORDER BY start_time DESC 
        LIMIT 20
      `, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    res.json(experiments);
  } catch (error) {
    logger.error('Failed to get experiments:', error);
    res.status(500).json({ error: 'Failed to fetch experiments' });
  }
});

// Get logs
app.get('/api/logs', (req: Request, res: Response) => {
  const lines = parseInt(req.query.lines as string) || 100;
  
  try {
    const { execSync } = require('child_process');
    const logs = execSync(`tail -n ${lines} logs/runtime.log`, { encoding: 'utf8' });
    res.json({ logs: logs.split('\n') });
  } catch (error) {
    res.status(500).json({ error: 'Failed to read logs' });
  }
});

// Emergency stop
app.post('/api/emergency-stop', (req: Request, res: Response) => {
  logger.warn('EMERGENCY STOP triggered via dashboard');
  // Create stop file
  require('fs').writeFileSync('STOP', '');
  res.json({ success: true, message: 'Emergency stop triggered' });
});

// Serve dashboard UI
app.get('*', (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, '../../dashboard/index.html'));
});

export function startDashboard(port: number = 3000): void {
  app.listen(port, () => {
    logger.info(`Dashboard running on http://localhost:${port}`);
  });
}

export default app;
