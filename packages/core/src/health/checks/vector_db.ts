import type { HealthCheckResult } from '../health_checks.js';

export interface VectorDBHealthConfig {
  ping: () => Promise<boolean>;
  name?: string;
  timeout?: number;
}

export function createVectorDBHealthCheck(config: VectorDBHealthConfig) {
  const name = config.name ?? 'vector_db';
  return {
    name,
    timeout: config.timeout ?? 10000,
    async check(): Promise<HealthCheckResult> {
      const start = Date.now();
      try {
        const result = await config.ping();
        if (result) {
          return {
            name,
            status: 'healthy',
            message: 'Vector database is responsive',
            duration: Date.now() - start,
            timestamp: start,
          };
        }
        return {
          name,
          status: 'degraded',
          message: 'Vector database ping returned false',
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
