import type { HealthCheckResult } from '../health_checks.js';

export interface WeaviateHealthConfig {
  isReady: () => Promise<boolean>;
  isLive: () => Promise<boolean>;
  name?: string;
  timeout?: number;
}

export function createWeaviateHealthCheck(config: WeaviateHealthConfig) {
  const name = config.name ?? 'weaviate';
  return {
    name,
    timeout: config.timeout ?? 10000,
    async check(): Promise<HealthCheckResult> {
      const start = Date.now();
      try {
        const [ready, live] = await Promise.all([config.isReady(), config.isLive()]);
        const status = ready && live ? 'healthy' : ready ? 'degraded' : 'unhealthy';
        return {
          name,
          status,
          message: status === 'healthy'
            ? 'Weaviate is ready and live'
            : `Weaviate ready=${ready}, live=${live}`,
          duration: Date.now() - start,
          timestamp: start,
        };
      } catch (err) {
        return {
          name,
          status: 'unhealthy',
          message: (err as Error).message,
          duration: Date.now() - start,
          timestamp: start,
        };
      }
    },
  };
}
