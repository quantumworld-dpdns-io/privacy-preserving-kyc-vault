import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth.js';

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  burstSize?: number;
  identifier?: (req: Request) => string;
}

interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

interface SlidingWindowEntry {
  timestamp: number;
}

const tokenBuckets = new Map<string, TokenBucket>();
const slidingWindows = new Map<string, SlidingWindowEntry[]>();

const DEFAULT_IDENTIFIER = (req: Request): string => {
  const user = (req as AuthenticatedRequest).user;
  if (user) return user.id;
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
};

function refillBucket(
  bucket: TokenBucket,
  config: RateLimitConfig,
  now: number,
): void {
  const elapsed = now - bucket.lastRefill;
  const refillTokens = (elapsed / config.windowMs) * config.maxRequests;
  bucket.tokens = Math.min(
    config.burstSize ?? config.maxRequests,
    bucket.tokens + refillTokens,
  );
  bucket.lastRefill = now;
}

export function tokenBucket(config: RateLimitConfig) {
  const identifier = config.identifier ?? DEFAULT_IDENTIFIER;

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = `tb:${identifier(req)}`;
    const now = Date.now();
    let bucket = tokenBuckets.get(key);

    if (!bucket) {
      bucket = {
        tokens: config.burstSize ?? config.maxRequests,
        lastRefill: now,
      };
      tokenBuckets.set(key, bucket);
    }

    refillBucket(bucket, config, now);

    if (bucket.tokens < 1) {
      const retryAfter = Math.ceil(
        (config.windowMs * (1 - bucket.tokens)) / config.maxRequests / 1000,
      );
      res.setHeader('Retry-After', String(retryAfter));
      res.status(429).json({
        type: 'about:blank',
        title: 'Too Many Requests',
        status: 429,
        detail: `Rate limit exceeded. Retry after ${retryAfter} seconds`,
      });
      return;
    }

    bucket.tokens -= 1;
    res.setHeader('X-RateLimit-Limit', String(config.maxRequests));
    res.setHeader('X-RateLimit-Remaining', String(Math.floor(bucket.tokens)));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil((now + config.windowMs) / 1000)));
    next();
  };
}

export function slidingWindow(config: RateLimitConfig) {
  const identifier = config.identifier ?? DEFAULT_IDENTIFIER;

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = `sw:${identifier(req)}`;
    const now = Date.now();
    const windowStart = now - config.windowMs;

    let entries = slidingWindows.get(key);
    if (!entries) {
      entries = [];
      slidingWindows.set(key, entries);
    }

    const filtered = entries.filter((e) => e.timestamp > windowStart);
    slidingWindows.set(key, filtered);

    if (filtered.length >= config.maxRequests) {
      const oldest = filtered[0]!;
      const retryAfter = Math.ceil(
        (oldest.timestamp + config.windowMs - now) / 1000,
      );
      res.setHeader('Retry-After', String(retryAfter));
      res.status(429).json({
        type: 'about:blank',
        title: 'Too Many Requests',
        status: 429,
        detail: `Rate limit exceeded. Retry after ${retryAfter} seconds`,
      });
      return;
    }

    filtered.push({ timestamp: now });
    res.setHeader('X-RateLimit-Limit', String(config.maxRequests));
    res.setHeader('X-RateLimit-Remaining', String(config.maxRequests - filtered.length));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil((now + config.windowMs) / 1000)));
    next();
  };
}

export function clearRateLimitStores(): void {
  tokenBuckets.clear();
  slidingWindows.clear();
}
