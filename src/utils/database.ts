import sqlite3 from 'sqlite3';
import { createLogger } from './logger';
import path from 'path';
import fs from 'fs';

const logger = createLogger('Database');

let db: sqlite3.Database | null = null;

export async function initializeDatabase(): Promise<sqlite3.Database> {
  const dbPath = process.env.DATABASE_PATH || './data/trades.db';
  
  // Ensure data directory exists
  const dataDir = path.dirname(dbPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        logger.error('Failed to open database:', err);
        reject(err);
      } else {
        logger.info(`Database initialized at ${dbPath}`);
        createTables().then(() => resolve(db!)).catch(reject);
      }
    });
  });
}

async function createTables(): Promise<void> {
  if (!db) return;

  const run = (sql: string) => new Promise<void>((resolve, reject) => {
    db!.run(sql, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });

  // Trades table
  await run(`
    CREATE TABLE IF NOT EXISTS trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      experiment_id TEXT NOT NULL,
      strategy_name TEXT NOT NULL,
      strategy_version TEXT NOT NULL,
      token TEXT NOT NULL,
      side TEXT NOT NULL,
      entry_price REAL NOT NULL,
      exit_price REAL,
      size_usd REAL NOT NULL,
      pnl_usd REAL,
      pnl_pct REAL,
      entry_time DATETIME DEFAULT CURRENT_TIMESTAMP,
      exit_time DATETIME,
      status TEXT DEFAULT 'open',
      exit_reason TEXT,
      params TEXT,
      is_paper BOOLEAN DEFAULT 1,
      tx_signature TEXT
    )
  `);

  // Experiments table
  await run(`
    CREATE TABLE IF NOT EXISTS experiments (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      hypothesis TEXT,
      params TEXT NOT NULL,
      start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
      end_time DATETIME,
      status TEXT DEFAULT 'running',
      trades_count INTEGER DEFAULT 0,
      win_rate REAL,
      sharpe_ratio REAL,
      profit_factor REAL,
      total_pnl_usd REAL,
      max_drawdown_pct REAL,
      is_promoted BOOLEAN DEFAULT 0
    )
  `);

  // Strategy performance table
  await run(`
    CREATE TABLE IF NOT EXISTS strategy_performance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      strategy_name TEXT NOT NULL,
      strategy_version TEXT NOT NULL,
      date DATE NOT NULL,
      trades_count INTEGER DEFAULT 0,
      wins INTEGER DEFAULT 0,
      losses INTEGER DEFAULT 0,
      pnl_usd REAL DEFAULT 0,
      avg_trade_duration_minutes REAL,
      UNIQUE(strategy_name, strategy_version, date)
    )
  `);

  // Price data cache
  await run(`
    CREATE TABLE IF NOT EXISTS price_cache (
      token TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      price REAL NOT NULL,
      volume_24h REAL,
      PRIMARY KEY (token, timestamp)
    )
  `);

  logger.info('Database tables created');
}

export function getDb(): sqlite3.Database {
  if (!db) {
    throw new Error('Database not initialized');
  }
  return db;
}

export async function closeDatabase(): Promise<void> {
  if (db) {
    return new Promise((resolve, reject) => {
      db!.close((err) => {
        if (err) reject(err);
        else {
          db = null;
          logger.info('Database closed');
          resolve();
        }
      });
    });
  }
}

// Trade operations
export async function insertTrade(trade: any): Promise<number> {
  return new Promise((resolve, reject) => {
    const sql = `INSERT INTO trades (
      experiment_id, strategy_name, strategy_version, token, side,
      entry_price, size_usd, entry_time, status, params, is_paper
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    const params = [
      trade.experimentId,
      trade.strategyName,
      trade.strategyVersion,
      trade.token,
      trade.side,
      trade.entryPrice,
      trade.sizeUsd,
      trade.entryTime.toISOString(),
      trade.status,
      JSON.stringify(trade.params),
      trade.isPaper ? 1 : 0,
    ];

    db!.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this.lastID!);
    });
  });
}

export async function updateTrade(tradeId: number, updates: any): Promise<void> {
  return new Promise((resolve, reject) => {
    const fields = Object.keys(updates).join(' = ?, ') + ' = ?';
    const values = Object.values(updates);
    
    const sql = `UPDATE trades SET ${fields} WHERE id = ?`;
    
    db!.run(sql, [...values, tradeId], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

export async function getOpenTrades(experimentId?: string): Promise<any[]> {
  return new Promise((resolve, reject) => {
    let sql = `SELECT * FROM trades WHERE status = 'open'`;
    const params: any[] = [];
    
    if (experimentId) {
      sql += ` AND experiment_id = ?`;
      params.push(experimentId);
    }
    
    db!.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

// Experiment operations
export async function insertExperiment(experiment: any): Promise<void> {
  return new Promise((resolve, reject) => {
    const sql = `INSERT INTO experiments (id, name, description, hypothesis, params)
     VALUES (?, ?, ?, ?, ?)`;
    
    db!.run(sql, [
      experiment.id,
      experiment.name,
      experiment.description,
      experiment.hypothesis,
      JSON.stringify(experiment.params),
    ], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

export async function updateExperiment(experimentId: string, updates: any): Promise<void> {
  return new Promise((resolve, reject) => {
    const fields = Object.keys(updates).join(' = ?, ') + ' = ?';
    const values = Object.values(updates);
    
    const sql = `UPDATE experiments SET ${fields} WHERE id = ?`;
    
    db!.run(sql, [...values, experimentId], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

export async function getActiveExperiments(): Promise<any[]> {
  return new Promise((resolve, reject) => {
    db!.all(`SELECT * FROM experiments WHERE status = 'running'`, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

export async function getBestStrategies(limit: number = 5): Promise<any[]> {
  return new Promise((resolve, reject) => {
    db!.all(`
      SELECT 
        strategy_name,
        strategy_version,
        COUNT(*) as trades,
        SUM(CASE WHEN pnl_usd > 0 THEN 1 ELSE 0 END) as wins,
        AVG(pnl_pct) as avg_return,
        SUM(pnl_usd) as total_pnl
      FROM trades
      WHERE is_paper = 0
      GROUP BY strategy_name, strategy_version
      HAVING COUNT(*) >= 10
      ORDER BY total_pnl DESC
      LIMIT ?
    `, [limit], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}
