import { Request, Response, NextFunction } from 'express';

export interface CorsConfig {
  allowedOrigins: string[];
  allowedMethods?: string[];
  allowedHeaders?: string[];
  exposedHeaders?: string[];
  credentials?: boolean;
  maxAge?: number;
}

const DEFAULT_METHODS = ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'];
const DEFAULT_HEADERS = [
  'Content-Type',
  'Authorization',
  'X-Request-ID',
  'X-API-Key',
  'If-None-Match',
  'If-Modified-Since',
];
const DEFAULT_EXPOSED = [
  'X-Request-ID',
  'ETag',
  'X-RateLimit-Limit',
  'X-RateLimit-Remaining',
  'X-RateLimit-Reset',
];

export function createCorsMiddleware(config: CorsConfig) {
  const allowedOrigins = config.allowedOrigins;
  const allowedMethods = config.allowedMethods ?? DEFAULT_METHODS;
  const allowedHeaders = config.allowedHeaders ?? DEFAULT_HEADERS;
  const exposedHeaders = config.exposedHeaders ?? DEFAULT_EXPOSED;
  const credentials = config.credentials ?? true;
  const maxAge = config.maxAge ?? 86400;

  return (req: Request, res: Response, next: NextFunction): void => {
    const origin = req.headers.origin;

    if (!origin) {
      next();
      return;
    }

    const isAllowed = allowedOrigins.includes('*') || allowedOrigins.includes(origin);

    if (!isAllowed) {
      res.status(403).json({
        type: 'about:blank',
        title: 'Forbidden',
        status: 403,
        detail: `Origin "${origin}" not allowed by CORS policy`,
      });
      return;
    }

    res.setHeader('Access-Control-Allow-Origin', allowedOrigins.includes('*') ? '*' : origin);
    res.setHeader('Access-Control-Allow-Methods', allowedMethods.join(', '));
    res.setHeader('Access-Control-Allow-Headers', allowedHeaders.join(', '));
    res.setHeader('Access-Control-Expose-Headers', exposedHeaders.join(', '));
    res.setHeader('Access-Control-Max-Age', String(maxAge));

    if (credentials) {
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }

    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }

    next();
  };
}
