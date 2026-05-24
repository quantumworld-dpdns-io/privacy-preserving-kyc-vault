import { Request, Response, NextFunction } from 'express';
import * as crypto from 'node:crypto';

export interface CacheConfig {
  ttlSeconds?: number;
  cacheMethods?: string[];
  varyByHeaders?: string[];
  excludePaths?: string[];
  maxEntries?: number;
}

interface CacheEntry {
  body: string;
  statusCode: number;
  headers: Record<string, string | string[]>;
  etag: string;
  createdAt: number;
  ttlMs: number;
}

const responseCache = new Map<string, CacheEntry>();

function generateETag(body: string): string {
  const hash = crypto.createHash('sha256').update(body).digest('base64url');
  return `"${hash.slice(0, 27)}"`;
}

function makeCacheKey(req: Request, config: CacheConfig): string {
  const parts = [`${req.method}:${req.originalUrl ?? req.url}`];
  for (const header of config.varyByHeaders ?? ['Accept']) {
    const val = req.headers[header.toLowerCase()];
    if (val) parts.push(`${header}=${val}`);
  }
  return parts.join('|');
}

function isCacheable(req: Request, config: CacheConfig): boolean {
  if (config.excludePaths?.some((p) => req.path.startsWith(p))) return false;
  const methods = config.cacheMethods ?? ['GET', 'HEAD'];
  if (!methods.includes(req.method)) return false;
  const auth = req.headers.authorization;
  if (auth && !req.headers['vary']) return false;
  return true;
}

function shouldBypassCache(req: Request): boolean {
  const cc = req.headers['cache-control'];
  if (!cc) return false;
  return cc.includes('no-cache') || cc.includes('no-store') || cc.includes('max-age=0');
}

function setCacheHeaders(res: Response, entry: CacheEntry, config: CacheConfig): void {
  res.setHeader('ETag', entry.etag);
  res.setHeader('Cache-Control', `public, max-age=${config.ttlSeconds ?? 60}`);
  res.setHeader('Vary', (config.varyByHeaders ?? ['Accept']).join(', '));
}

export function createCacheMiddleware(config: CacheConfig = {}) {
  const ttlMs = (config.ttlSeconds ?? 60) * 1000;
  const maxEntries = config.maxEntries ?? 500;

  function evictIfNeeded(): void {
    if (responseCache.size <= maxEntries) return;
    const entries = [...responseCache.entries()];
    entries.sort((a, b) => a[1].createdAt - b[1].createdAt);
    const toDelete = entries.slice(0, entries.length - maxEntries);
    for (const [key] of toDelete) {
      responseCache.delete(key);
    }
  }

  function pruneExpired(): void {
    const now = Date.now();
    for (const [key, entry] of responseCache) {
      if (now - entry.createdAt > entry.ttlMs) {
        responseCache.delete(key);
      }
    }
  }

  setInterval(pruneExpired, 60_000).unref();

  return (req: Request, res: Response, next: NextFunction): void => {
    if (!isCacheable(req, config)) {
      next();
      return;
    }

    const cacheKey = makeCacheKey(req, config);
    const cached = responseCache.get(cacheKey);

    if (cached && !shouldBypassCache(req)) {
      const now = Date.now();
      if (now - cached.createdAt > cached.ttlMs) {
        responseCache.delete(cacheKey);
      } else {
        const ifNoneMatch = req.headers['if-none-match'];
        if (ifNoneMatch === cached.etag) {
          res.status(304).end();
          return;
        }

        for (const [key, value] of Object.entries(cached.headers)) {
          res.setHeader(key, value as string);
        }
        setCacheHeaders(res, cached, config);
        res.status(cached.statusCode).send(cached.body);
        return;
      }
    }

    const originalSend = res.send.bind(res);
    const originalJson = res.json.bind(res);

    res.send = function (this, body?: any): any {
      if (typeof body === 'string' || body instanceof Buffer) {
        const strBody = typeof body === 'string' ? body : body.toString('utf-8');
        const etag = generateETag(strBody);
        const entry: CacheEntry = {
          body: strBody,
          statusCode: res.statusCode,
          headers: res.getHeaders() as Record<string, string | string[]>,
          etag,
          createdAt: Date.now(),
          ttlMs,
        };
        responseCache.set(cacheKey, entry);
        evictIfNeeded();
        setCacheHeaders(res, entry, config);
      }
      return originalSend(body);
    } as typeof res.send;

    res.json = function (this, body?: any): any {
      const strBody = JSON.stringify(body);
      const etag = generateETag(strBody);
      const entry: CacheEntry = {
        body: strBody,
        statusCode: res.statusCode,
        headers: { ...res.getHeaders() as Record<string, string | string[]>, 'Content-Type': 'application/json' },
        etag,
        createdAt: Date.now(),
        ttlMs,
      };
      responseCache.set(cacheKey, entry);
      evictIfNeeded();
      setCacheHeaders(res, entry, config);
      res.setHeader('Content-Type', 'application/json');
      return originalSend(strBody);
    };

    next();
  };
}

export function invalidateCache(pattern?: string): void {
  if (!pattern) {
    responseCache.clear();
    return;
  }
  for (const [key] of responseCache) {
    if (key.includes(pattern)) {
      responseCache.delete(key);
    }
  }
}
