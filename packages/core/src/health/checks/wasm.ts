import type { HealthCheckResult } from '../health_checks.js';

export interface WasmHealthConfig {
  instantiate: (module: ArrayBuffer) => Promise<{ instance: any }>;
  moduleExists: (name: string) => Promise<boolean>;
  requiredModules?: string[];
  name?: string;
  timeout?: number;
}

export function createWasmHealthCheck(config: WasmHealthConfig) {
  const name = config.name ?? 'wasm_runtime';
  return {
    name,
    timeout: config.timeout ?? 10000,
    async check(): Promise<HealthCheckResult> {
      const start = Date.now();
      try {
        const issues: string[] = [];

        if (config.requiredModules) {
          for (const module of config.requiredModules) {
            try {
              const exists = await config.moduleExists(module);
              if (!exists) {
                issues.push(`Missing module: ${module}`);
              }
            } catch {
              issues.push(`Failed to check module: ${module}`);
            }
          }
        }

        const status = issues.length === 0 ? 'healthy' : 'degraded';
        return {
          name,
          status,
          message: status === 'healthy'
            ? 'Wasm runtime is operational'
            : issues.join('; '),
          duration: Date.now() - start,
          timestamp: start,
          metadata: {
            requiredModules: config.requiredModules,
            issues: issues.length > 0 ? issues : undefined,
          },
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
