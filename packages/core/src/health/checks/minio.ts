import type { HealthCheckResult } from '../health_checks.js';

export interface MinIOHealthConfig {
  listBuckets: () => Promise<string[]>;
  healthCheck?: () => Promise<boolean>;
  requiredBuckets?: string[];
  name?: string;
  timeout?: number;
}

export function createMinIOHealthCheck(config: MinIOHealthConfig) {
  const name = config.name ?? 'minio';
  return {
    name,
    timeout: config.timeout ?? 10000,
    async check(): Promise<HealthCheckResult> {
      const start = Date.now();
      try {
        if (config.healthCheck) {
          const ok = await config.healthCheck();
          if (!ok) {
            return {
              name,
              status: 'unhealthy',
              message: 'MinIO health check endpoint failed',
              duration: Date.now() - start,
              timestamp: start,
            };
          }
        }

        const buckets = await config.listBuckets();
        const issues: string[] = [];

        if (config.requiredBuckets) {
          for (const required of config.requiredBuckets) {
            if (!buckets.includes(required)) {
              issues.push(`Missing bucket: ${required}`);
            }
          }
        }

        const status = issues.length === 0 ? 'healthy' : 'degraded';
        return {
          name,
          status,
          message: status === 'healthy'
            ? `MinIO responsive with ${buckets.length} buckets`
            : issues.join('; '),
          duration: Date.now() - start,
          timestamp: start,
          metadata: { buckets, bucketCount: buckets.length },
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
