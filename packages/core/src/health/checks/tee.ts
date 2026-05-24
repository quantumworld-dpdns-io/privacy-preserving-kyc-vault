import type { HealthCheckResult } from '../health_checks.js';

export interface TEEHealthConfig {
  getAttestation: () => Promise<{ verified: boolean; tcbStatus: string }>;
  name?: string;
  timeout?: number;
}

export function createTEEHealthCheck(config: TEEHealthConfig) {
  const name = config.name ?? 'tee';
  return {
    name,
    timeout: config.timeout ?? 15000,
    async check(): Promise<HealthCheckResult> {
      const start = Date.now();
      try {
        const attestation = await config.getAttestation();
        const status = attestation.verified
          ? (attestation.tcbStatus === 'UpToDate' ? 'healthy' : 'degraded')
          : 'unhealthy';
        return {
          name,
          status,
          message: `TEE attestation: verified=${attestation.verified}, tcb=${attestation.tcbStatus}`,
          duration: Date.now() - start,
          timestamp: start,
          metadata: { ...attestation },
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
