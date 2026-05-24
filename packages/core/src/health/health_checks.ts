export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface HealthCheckResult {
  name: string;
  status: HealthStatus;
  message?: string;
  duration: number;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface HealthCheck {
  name: string;
  check(): Promise<HealthCheckResult>;
  timeout?: number;
}

export class HealthCheckRegistry {
  private checks = new Map<string, HealthCheck>();
  private results = new Map<string, HealthCheckResult>();
  private running = false;

  register(check: HealthCheck): void {
    this.checks.set(check.name, check);
  }

  unregister(name: string): boolean {
    this.checks.delete(name);
    this.results.delete(name);
    return true;
  }

  getCheck(name: string): HealthCheck | undefined {
    return this.checks.get(name);
  }

  listChecks(): string[] {
    return Array.from(this.checks.keys());
  }

  async runAll(options?: { timeout?: number; concurrency?: number }): Promise<Map<string, HealthCheckResult>> {
    this.running = true;
    const results = new Map<string, HealthCheckResult>();
    const entries = Array.from(this.checks.entries());

    const concurrency = options?.concurrency ?? 10;
    for (let i = 0; i < entries.length; i += concurrency) {
      const batch = entries.slice(i, i + concurrency);
      const batchResults = await Promise.allSettled(
        batch.map(async ([name, check]) => {
          const result = await this.runCheck(name, check, options?.timeout);
          return { name, result };
        }),
      );
      for (const settled of batchResults) {
        if (settled.status === 'fulfilled') {
          results.set(settled.value.name, settled.value.result);
        }
      }
    }

    this.results = results;
    this.running = false;
    return results;
  }

  async runCheck(name: string, check?: HealthCheck, timeout?: number): Promise<HealthCheckResult> {
    const c = check ?? this.checks.get(name);
    if (!c) {
      return {
        name,
        status: 'unhealthy',
        message: 'Check not found',
        duration: 0,
        timestamp: Date.now(),
      };
    }

    const start = Date.now();
    const effectiveTimeout = timeout ?? c.timeout ?? 30000;

    try {
      const result = await Promise.race([
        c.check(),
        new Promise<HealthCheckResult>((_, reject) =>
          setTimeout(() => reject(new Error('Health check timed out')), effectiveTimeout),
        ),
      ]);
      result.duration = Date.now() - start;
      result.timestamp = start;
      return result;
    } catch (err) {
      return {
        name: c.name,
        status: 'unhealthy',
        message: (err as Error).message,
        duration: Date.now() - start,
        timestamp: start,
      };
    }
  }

  getResults(): Map<string, HealthCheckResult> {
    return new Map(this.results);
  }

  getAggregateStatus(): HealthStatus {
    let hasDegraded = false;
    for (const result of this.results.values()) {
      if (result.status === 'unhealthy') return 'unhealthy';
      if (result.status === 'degraded') hasDegraded = true;
    }
    return hasDegraded ? 'degraded' : 'healthy';
  }

  toJSON(): { status: HealthStatus; checks: HealthCheckResult[] } {
    return {
      status: this.getAggregateStatus(),
      checks: Array.from(this.results.values()),
    };
  }

  clear(): void {
    this.checks.clear();
    this.results.clear();
  }

  get isRunning(): boolean {
    return this.running;
  }
}

const globalRegistry = new HealthCheckRegistry();
export function getGlobalHealthRegistry(): HealthCheckRegistry {
  return globalRegistry;
}

export function createHealthRegistry(): HealthCheckRegistry {
  return new HealthCheckRegistry();
}
