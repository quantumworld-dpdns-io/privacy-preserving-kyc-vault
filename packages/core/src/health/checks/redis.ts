import type { HealthCheckResult } from '../health_checks.js';

export interface RedisHealthConfig {
  ping: () => Promise<boolean>;
  name?: string;
  timeout?: number;
}

export function createRedisHealthCheck(config: RedisHealthConfig) {
  const name = config.name ?? 'redis';
  return {
    name,
    timeout: config.timeout ?? 5000,
    async check(): Promise<HealthCheckResult> {
      const start = Date.now();
      try {
        const result = await config.ping();
        if (result) {
          return {
            name,
            status: 'healthy',
            message: 'Redis is responsive',
            duration: Date.now() - start,
            timestamp: start,
          };
        }
        return {
          name,
          status: 'degraded',
          message: 'Redis ping returned false',
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
