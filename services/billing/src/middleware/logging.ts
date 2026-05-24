import { Request, Response, NextFunction } from 'express';
import * as crypto from 'node:crypto';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  requestId: string;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  ip: string;
  userAgent: string;
  referer?: string;
  userId?: string;
  error?: string;
}

export interface Logger {
  log(entry: LogEntry): void;
  child(extra: Record<string, unknown>): Logger;
}

export type LoggingConfig = {
  level?: LogLevel;
  stream?: { write: (line: string) => void };
  omitPaths?: string[];
};

const DEFAULT_OMIT = ['/health', '/ready'];

class ConsoleLogger implements Logger {
  private extra: Record<string, unknown>;
  private level: LogLevel;
  private stream: { write: (line: string) => void };

  private readonly LEVELS: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };

  constructor(config: LoggingConfig = {}) {
    this.extra = {};
    this.level = config.level ?? 'info';
    this.stream = config.stream ?? process.stdout;
  }

  log(entry: LogEntry): void {
    if (this.LEVELS[entry.level] < this.LEVELS[this.level]) return;
    const line = JSON.stringify({ ...entry, ...this.extra }) + '\n';
    this.stream.write(line);
  }

  child(extra: Record<string, unknown>): Logger {
    const child = new ConsoleLogger({ level: this.level, stream: this.stream });
    child.extra = { ...this.extra, ...extra };
    return child;
  }
}

let globalLogger: Logger = new ConsoleLogger();

export function setLogger(logger: Logger): void {
  globalLogger = logger;
}

export function getLogger(): Logger {
  return globalLogger;
}

export function createLoggingMiddleware(config: LoggingConfig = {}) {
  const logger = new ConsoleLogger(config);
  const omitPaths = [...DEFAULT_OMIT, ...(config.omitPaths ?? [])];

  return (req: Request, res: Response, next: NextFunction): void => {
    const requestId = crypto.randomUUID();
    req.headers['x-request-id'] = requestId;

    const start = Date.now();

    res.on('finish', () => {
      if (omitPaths.some((p) => req.path.startsWith(p))) return;

      const durationMs = Date.now() - start;
      const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level: res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
        requestId,
        method: req.method,
        path: req.originalUrl ?? req.url,
        statusCode: res.statusCode,
        durationMs,
        ip: req.ip ?? req.socket.remoteAddress ?? '',
        userAgent: req.headers['user-agent'] ?? '',
        referer: req.headers['referer'],
      };

      logger.log(entry);
    });

    next();
  };
}
