import type { HealthCheckResult } from '../health_checks.js';

export interface DatabaseHealthConfig {
  query: () => Promise<unknown>;
  name?: string;
  timeout?: number;
}

export function createDatabaseHealthCheck(config: DatabaseHealthConfig) {
  const name = config.name ?? 'database';
  return {
    name,
    timeout: config.timeout ?? 10000,
    async check(): Promise<HealthCheckResult> {
      const start = Date.now();
      try {
        await config.query();
        return {
          name,
          status: 'healthy',
          message: 'Database is responsive',
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
