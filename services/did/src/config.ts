export interface ApiConfig {
  port: number;
  host: string;
  nodeEnv: string;
  logLevel: string;
  corsOrigins: string[];
  jwtSecret: string;
  jwtExpiresIn: string;
  rateLimitWindowMs: number;
  rateLimitMax: number;
  dbUrl: string;
  dbPoolMin: number;
  dbPoolMax: number;
  redisUrl?: string;
  ollamaHost: string;
  webhookMaxRetries: number;
  webhookBaseDelayMs: number;
  webhookMaxDelayMs: number;
  auditLogRetentionDays: number;
  encryptionKey: string;
}

function envInt(key: string, fallback: number): number {
  const v = process.env[key];
  if (v === undefined || v === '') return fallback;
  const n = parseInt(v, 10);
  return isNaN(n) ? fallback : n;
}

function envList(key: string, fallback: string[]): string[] {
  const v = process.env[key];
  if (!v) return fallback;
  return v.split(',').map((s) => s.trim()).filter(Boolean);
}

export function loadConfig(): ApiConfig {
  return {
    port: envInt('API_PORT', 3000),
    host: process.env.API_HOST || '0.0.0.0',
    nodeEnv: process.env.NODE_ENV || 'development',
    logLevel: process.env.LOG_LEVEL || 'info',
    corsOrigins: envList('CORS_ORIGINS', ['*']),
    jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1h',
    rateLimitWindowMs: envInt('RATE_LIMIT_WINDOW_MS', 60000),
    rateLimitMax: envInt('RATE_LIMIT_MAX', 100),
    dbUrl: process.env.DATABASE_URL || 'postgresql://localhost:5432/kyc_vault',
    dbPoolMin: envInt('DB_POOL_MIN', 5),
    dbPoolMax: envInt('DB_POOL_MAX', 20),
    redisUrl: process.env.REDIS_URL || undefined,
    ollamaHost: process.env.OLLAMA_HOST || 'http://localhost:11434',
    webhookMaxRetries: envInt('WEBHOOK_MAX_RETRIES', 5),
    webhookBaseDelayMs: envInt('WEBHOOK_BASE_DELAY_MS', 1000),
    webhookMaxDelayMs: envInt('WEBHOOK_MAX_DELAY_MS', 60000),
    auditLogRetentionDays: envInt('AUDIT_LOG_RETENTION_DAYS', 365),
    encryptionKey: process.env.ENCRYPTION_KEY || '00000000000000000000000000000000',
  };
}

let cachedConfig: ApiConfig | null = null;

export function getConfig(): ApiConfig {
  if (!cachedConfig) {
    cachedConfig = loadConfig();
  }
  return cachedConfig;
}

export function resetConfig(): void {
  cachedConfig = null;
}
