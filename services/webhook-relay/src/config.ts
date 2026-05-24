export type RetryStrategy = 'exponential_backoff' | 'linear' | 'fixed';

export interface RetryPolicy {
  strategy: RetryStrategy;
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  timeoutMs: number;
}

export interface WebhookRelayConfig {
  port: number;
  host: string;
  retryPolicy: RetryPolicy;
  maxConcurrentDeliveries: number;
  deliveryQueueSize: number;
  cleanupIntervalMs: number;
  maxEventAgeMs: number;
  healthCheckEndpoint: string;
  secretHeader: string;
  signatureHeader: string;
}

export function loadConfig(): WebhookRelayConfig {
  const env = process.env;

  return {
    port: parseInt(env.WEBHOOK_RELAY_PORT || '3050', 10),
    host: env.WEBHOOK_RELAY_HOST || '0.0.0.0',
    retryPolicy: {
      strategy: (env.WEBHOOK_RETRY_STRATEGY as RetryStrategy) || 'exponential_backoff',
      maxRetries: parseInt(env.WEBHOOK_MAX_RETRIES || '5', 10),
      baseDelayMs: parseInt(env.WEBHOOK_BASE_DELAY_MS || '1000', 10),
      maxDelayMs: parseInt(env.WEBHOOK_MAX_DELAY_MS || '60000', 10),
      timeoutMs: parseInt(env.WEBHOOK_TIMEOUT_MS || '10000', 10),
    },
    maxConcurrentDeliveries: parseInt(env.WEBHOOK_MAX_CONCURRENT || '10', 10),
    deliveryQueueSize: parseInt(env.WEBHOOK_QUEUE_SIZE || '1000', 10),
    cleanupIntervalMs: parseInt(env.WEBHOOK_CLEANUP_INTERVAL_MS || '300000', 10),
    maxEventAgeMs: parseInt(env.WEBHOOK_MAX_EVENT_AGE_MS || '86400000', 10),
    healthCheckEndpoint: env.WEBHOOK_HEALTH_CHECK_ENDPOINT || '/health',
    secretHeader: env.WEBHOOK_SECRET_HEADER || 'X-Webhook-Secret',
    signatureHeader: env.WEBHOOK_SIGNATURE_HEADER || 'X-Webhook-Signature',
  };
}
