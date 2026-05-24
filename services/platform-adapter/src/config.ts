import { PlatformConfig } from './interfaces.js';

export interface PlatformAdapterConfig {
  onlyfans: PlatformConfig;
  fansly: PlatformConfig;
  manyvids: PlatformConfig;
  loyalfans: PlatformConfig;
  justforfans: PlatformConfig;
  server: {
    port: number;
    host: string;
  };
  database: {
    host: string;
    port: number;
    name: string;
    user: string;
    password: string;
  };
  redis: {
    host: string;
    port: number;
    prefix: string;
  };
  sync: {
    intervalMinutes: number;
    batchSize: number;
    retryDelaySeconds: number;
    maxRetries: number;
  };
}

export function loadPlatformConfig(): PlatformAdapterConfig {
  const env = process.env;

  const defaultPlatformConfig: PlatformConfig = {
    baseUrl: '',
    apiVersion: 'v1',
    timeout: parseInt(env.PLATFORM_ADAPTER_TIMEOUT || '30000', 10),
    retryCount: parseInt(env.PLATFORM_ADAPTER_RETRY_COUNT || '3', 10),
    rateLimitPerSecond: parseInt(env.PLATFORM_ADAPTER_RATE_LIMIT || '10', 10),
    enabled: true,
    sandboxMode: env.NODE_ENV !== 'production',
  };

  return {
    onlyfans: {
      ...defaultPlatformConfig,
      baseUrl: env.ONLYFANS_API_URL || 'https://api.onlyfans.com',
      rateLimitPerSecond: 5,
    },
    fansly: {
      ...defaultPlatformConfig,
      baseUrl: env.FANSLY_API_URL || 'https://api.fansly.com',
      rateLimitPerSecond: 10,
    },
    manyvids: {
      ...defaultPlatformConfig,
      baseUrl: env.MANYVIDS_API_URL || 'https://api.manyvids.com',
      rateLimitPerSecond: 8,
    },
    loyalfans: {
      ...defaultPlatformConfig,
      baseUrl: env.LOYALFANS_API_URL || 'https://api.loyalfans.com',
      rateLimitPerSecond: 6,
    },
    justforfans: {
      ...defaultPlatformConfig,
      baseUrl: env.JUSTFORFANS_API_URL || 'https://api.justfor.fans',
      rateLimitPerSecond: 6,
    },
    server: {
      port: parseInt(env.PLATFORM_ADAPTER_PORT || '3050', 10),
      host: env.PLATFORM_ADAPTER_HOST || '0.0.0.0',
    },
    database: {
      host: env.PLATFORM_DB_HOST || 'localhost',
      port: parseInt(env.PLATFORM_DB_PORT || '5432', 10),
      name: env.PLATFORM_DB_NAME || 'platform_adapter',
      user: env.PLATFORM_DB_USER || 'platform',
      password: env.PLATFORM_DB_PASSWORD || '',
    },
    redis: {
      host: env.REDIS_HOST || 'localhost',
      port: parseInt(env.REDIS_PORT || '6379', 10),
      prefix: 'platform:',
    },
    sync: {
      intervalMinutes: parseInt(env.PLATFORM_SYNC_INTERVAL || '60', 10),
      batchSize: parseInt(env.PLATFORM_SYNC_BATCH_SIZE || '100', 10),
      retryDelaySeconds: parseInt(env.PLATFORM_SYNC_RETRY_DELAY || '30', 10),
      maxRetries: parseInt(env.PLATFORM_SYNC_MAX_RETRIES || '5', 10),
    },
  };
}
