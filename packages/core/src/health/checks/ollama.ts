import type { HealthCheckResult } from '../health_checks.js';

export interface OllamaHealthConfig {
  ping: () => Promise<boolean>;
  listModels?: () => Promise<string[]>;
  requiredModels?: string[];
  name?: string;
  timeout?: number;
}

export function createOllamaHealthCheck(config: OllamaHealthConfig) {
  const name = config.name ?? 'ollama';
  return {
    name,
    timeout: config.timeout ?? 15000,
    async check(): Promise<HealthCheckResult> {
      const start = Date.now();
      try {
        const alive = await config.ping();
        if (!alive) {
          return {
            name,
            status: 'unhealthy',
            message: 'Ollama ping failed',
            duration: Date.now() - start,
            timestamp: start,
          };
        }

        const issues: string[] = [];
        let models: string[] = [];

        if (config.listModels) {
          try {
            models = await config.listModels();
            if (config.requiredModels) {
              for (const required of config.requiredModels) {
                if (!models.includes(required)) {
                  issues.push(`Missing model: ${required}`);
                }
              }
            }
          } catch {
            issues.push('Failed to list models');
          }
        }

        const status = issues.length === 0 ? 'healthy' : 'degraded';
        return {
          name,
          status,
          message: status === 'healthy'
            ? `Ollama responsive with ${models.length} models`
            : issues.join('; '),
          duration: Date.now() - start,
          timestamp: start,
          metadata: models.length > 0 ? { models, modelCount: models.length } : undefined,
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
