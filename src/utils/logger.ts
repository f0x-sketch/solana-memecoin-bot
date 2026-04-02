import winston from 'winston';
import path from 'path';
import fs from 'fs';

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Safe stringify to handle circular references
function safeStringify(obj: any): string {
  try {
    return JSON.stringify(obj);
  } catch (e) {
    return '[Circular or invalid JSON]';
  }
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'autoresearch-solana' },
  transports: [
    // Console output
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple(),
        winston.format.printf(({ level, message, timestamp, ...metadata }) => {
          let msg = `${timestamp} [${level}]: ${message}`;
          if (Object.keys(metadata).length > 0) {
            const metaStr = safeStringify(metadata);
            if (metaStr !== '{}') {
              msg += ` ${metaStr}`;
            }
          }
          return msg;
        })
      ),
    }),
    // File output
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
    }),
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
    }),
    // Research-specific logs
    new winston.transports.File({
      filename: path.join(logsDir, 'experiments.log'),
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
    }),
  ],
});

export function createLogger(module: string) {
  return logger.child({ module });
}

export default logger;
