import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import { createLogger } from '../utils/logger';
import { getDb } from '../utils/database';

const logger = createLogger('Dashboard');
const app = express();

// Store last price update timestamp for status
let lastPriceUpdate = Date.now();

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

// Get current prices
app.get('/api/prices', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    
    // Get latest prices from cache
    const prices = await new Promise((resolve, reject) => {
      db.all(`
        SELECT token, price, timestamp,
               (price - LAG(price) OVER (PARTITION BY token ORDER BY timestamp DESC)) / LAG(price) OVER (PARTITION BY token ORDER BY timestamp DESC) * 100 as change_24h
        FROM price_cache 
        WHERE timestamp > (strftime('%s', 'now') - 86400)
        GROUP BY token
        HAVING timestamp = MAX(timestamp)
        ORDER BY timestamp DESC
      `, [], (err, rows) => {
        if (err) {
          // Fallback to simple query if window function not supported
          db.all(`
            SELECT token, price, timestamp
            FROM price_cache 
            WHERE timestamp > (strftime('%s', 'now') - 3600)
            GROUP BY token
            HAVING timestamp = MAX(timestamp)
          `, [], (err2, rows2) => {
            if (err2) reject(err2);
            else resolve(rows2);
          });
        } else {
          resolve(rows);
        }
      });
    });
    
    lastPriceUpdate = Date.now();
    res.json(prices || []);
  } catch (error) {
    logger.error('Failed to get prices:', error);
    res.json([]);
  }
});

// Get enhanced stats with performance metrics
app.get('/api/stats', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    
    const stats = await new Promise<any>((resolve, reject) => {
      db.get(`
        SELECT 
          COUNT(*) as total_trades,
          SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) as closed_trades,
          SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as open_trades,
          SUM(CASE WHEN status = 'closed' AND pnl_usd > 0 THEN 1 ELSE 0 END) as wins,
          SUM(CASE WHEN status = 'closed' AND pnl_usd <= 0 THEN 1 ELSE 0 END) as losses,
          SUM(CASE WHEN status = 'closed' THEN pnl_usd ELSE 0 END) as total_pnl,
          AVG(CASE WHEN status = 'closed' AND pnl_usd > 0 THEN pnl_usd END) as avg_win,
          AVG(CASE WHEN status = 'closed' AND pnl_usd <= 0 THEN pnl_usd END) as avg_loss,
          MIN(CASE WHEN status = 'closed' THEN pnl_usd END) as worst_trade,
          MAX(CASE WHEN status = 'closed' THEN pnl_usd END) as best_trade,
          AVG(
            CASE 
              WHEN status = 'closed' AND exit_time IS NOT NULL AND entry_time IS NOT NULL 
              THEN (julianday(exit_time) - julianday(entry_time)) * 24 * 60
              ELSE NULL 
            END
          ) as avg_duration_minutes
        FROM trades
      `, [], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    }) || {};
    
    // Calculate additional metrics
    const winRate = (stats.closed_trades || 0) > 0 ? ((stats.wins || 0) / (stats.closed_trades || 1) * 100).toFixed(1) : 0;
    const profitFactor = (stats.losses || 0) > 0 
      ? (((stats.wins || 0) * (stats.avg_win || 0)) / Math.abs((stats.losses || 0) * (stats.avg_loss || 1))).toFixed(2)
      : (stats.wins || 0) > 0 ? '999' : '0';
    
    // Calculate max drawdown
    const drawdownData = await new Promise((resolve, reject) => {
      db.all(`
        SELECT exit_time, 
               SUM(pnl_usd) OVER (ORDER BY exit_time) as running_pnl
        FROM trades 
        WHERE status = 'closed' AND exit_time IS NOT NULL
        ORDER BY exit_time
      `, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
    
    let maxDrawdown = 0;
    let peak = 0;
    for (const row of (drawdownData as any[])) {
      const pnl = row.running_pnl || 0;
      if (pnl > peak) peak = pnl;
      const drawdown = peak - pnl;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }
    
    // Calculate Sharpe ratio (simplified - assuming risk-free rate = 0)
    const returns = await new Promise((resolve, reject) => {
      db.all(`
        SELECT pnl_pct 
        FROM trades 
        WHERE status = 'closed' AND pnl_pct IS NOT NULL
      `, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
    
    let sharpe = 0;
    if ((returns as any[]).length > 1) {
      const pnls = (returns as any[]).map(r => r.pnl_pct || 0);
      const avg = pnls.reduce((a, b) => a + b, 0) / pnls.length;
      const variance = pnls.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / pnls.length;
      const std = Math.sqrt(variance);
      sharpe = std > 0 ? (avg / std) * Math.sqrt(252) : 0; // Annualized
    }
    
    res.json({
      total_trades: stats.total_trades || 0,
      closed_trades: stats.closed_trades || 0,
      open_trades: stats.open_trades || 0,
      wins: stats.wins || 0,
      losses: stats.losses || 0,
      total_pnl: stats.total_pnl || 0,
      avg_win: stats.avg_win || 0,
      avg_loss: stats.avg_loss || 0,
      worst_trade: stats.worst_trade || 0,
      best_trade: stats.best_trade || 0,
      avg_duration_minutes: stats.avg_duration_minutes || 0,
      win_rate: winRate,
      profit_factor: profitFactor,
      max_drawdown: maxDrawdown.toFixed(2),
      sharpe_ratio: sharpe.toFixed(2),
    });
  } catch (error) {
    logger.error('Failed to get stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// Get PnL history for chart
app.get('/api/pnl-history', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    
    const history = await new Promise((resolve, reject) => {
      db.all(`
        SELECT 
          date(exit_time) as date,
          SUM(pnl_usd) as daily_pnl,
          COUNT(*) as trades
        FROM trades 
        WHERE status = 'closed' AND exit_time IS NOT NULL
        GROUP BY date(exit_time)
        ORDER BY date(exit_time)
      `, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
    
    // Calculate cumulative PnL
    let cumulative = 1000; // Starting capital
    const data = (history as any[]).map(row => {
      cumulative += row.daily_pnl || 0;
      return {
        date: row.date,
        daily_pnl: row.daily_pnl || 0,
        cumulative_pnl: cumulative,
        trades: row.trades || 0,
      };
    });
    
    res.json(data);
  } catch (error) {
    logger.error('Failed to get PnL history:', error);
    res.json([]);
  }
});

// Get recent trades with enhanced data
app.get('/api/trades', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const db = getDb();
    
    const trades = await new Promise((resolve, reject) => {
      db.all(`
        SELECT 
          *,
          CASE 
            WHEN exit_time IS NOT NULL AND entry_time IS NOT NULL 
            THEN ROUND((julianday(exit_time) - julianday(entry_time)) * 24 * 60, 1)
            ELSE NULL 
          END as duration_minutes
        FROM trades 
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
        SELECT 
          *,
          ROUND((julianday('now') - julianday(entry_time)) * 24 * 60, 1) as duration_minutes
        FROM trades 
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

// Get price feed status
app.get('/api/status', (req: Request, res: Response) => {
  const timeSinceLastUpdate = Date.now() - lastPriceUpdate;
  const isHealthy = timeSinceLastUpdate < 60000; // 1 minute threshold
  
  res.json({
    price_feed: {
      status: isHealthy ? 'healthy' : 'stale',
      last_update: lastPriceUpdate,
      seconds_ago: Math.floor(timeSinceLastUpdate / 1000),
      source: 'jupiter',
    },
    timestamp: Date.now(),
  });
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

// Get filtered logs
app.get('/api/logs', (req: Request, res: Response) => {
  const lines = parseInt(req.query.lines as string) || 100;
  const filter = (req.query.filter as string) || 'all';
  
  try {
    const { execSync } = require('child_process');
    let logs = execSync(`tail -n ${lines * 2} logs/runtime.log`, { encoding: 'utf8' });
    
    let logLines = logs.split('\n');
    
    // Apply filter
    if (filter !== 'all') {
      const filterMap: Record<string, string[]> = {
        'error': ['error', 'ERROR', 'failed', 'Failed'],
        'warn': ['warn', 'WARN', 'warning', 'Warning'],
        'trade': ['PAPER TRADE', 'LIVE TRADE', 'SIGNAL'],
        'info': ['info', 'INFO'],
      };
      
      const keywords = filterMap[filter] || [];
      logLines = logLines.filter((line: string) => 
        keywords.some(kw => line.includes(kw))
      );
    }
    
    // Limit results
    logLines = logLines.slice(-lines);
    
    res.json({ 
      logs: logLines,
      filter: filter,
      total: logLines.length,
    });
  } catch (error) {
    res.status(500).json({ 
      logs: ['No logs available'],
      filter: filter,
      error: 'Failed to read logs'
    });
  }
});

// Update configuration
app.post('/api/config', async (req: Request, res: Response) => {
  const { walletAddress, privateKey } = req.body;
  
  try {
    if (walletAddress) {
      process.env.SOLANA_WALLET_ADDRESS = walletAddress;
    }
    if (privateKey) {
      process.env.SOLANA_PRIVATE_KEY = privateKey;
    }
    
    logger.info('Configuration updated via dashboard');
    res.json({ success: true, message: 'Configuration updated' });
  } catch (error) {
    logger.error('Failed to update config:', error);
    res.status(500).json({ success: false, error: 'Failed to update configuration' });
  }
});

// Emergency stop
app.post('/api/emergency-stop', (req: Request, res: Response) => {
  logger.warn('EMERGENCY STOP triggered via dashboard');
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
