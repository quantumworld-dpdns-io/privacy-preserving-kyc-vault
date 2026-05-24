export interface WarmupStrategy {
  name: string;
  shouldWarmup(key: string): boolean;
  priority(key: string): number;
}

export interface WarmupConfig {
  strategies: WarmupStrategy[];
  concurrency: number;
  batchSize: number;
  maxKeys: number;
  ttlMs?: number;
}

export class MostRecentlyUsedWarmup implements WarmupStrategy {
  readonly name = 'mru';

  constructor(private recentKeys: string[] = []) {}

  recordAccess(key: string): void {
    this.recentKeys = [key, ...this.recentKeys.filter((k) => k !== key)];
    if (this.recentKeys.length > 1000) {
      this.recentKeys.length = 1000;
    }
  }

  shouldWarmup(key: string): boolean {
    return this.recentKeys.includes(key);
  }

  priority(key: string): number {
    const idx = this.recentKeys.indexOf(key);
    return idx === -1 ? 0 : this.recentKeys.length - idx;
  }
}

export class HighFrequencyWarmup implements WarmupStrategy {
  readonly name = 'high_frequency';

  private accessCounts = new Map<string, number>();

  recordAccess(key: string): void {
    this.accessCounts.set(key, (this.accessCounts.get(key) ?? 0) + 1);
  }

  shouldWarmup(key: string): boolean {
    return (this.accessCounts.get(key) ?? 0) >= 10;
  }

  priority(key: string): number {
    return this.accessCounts.get(key) ?? 0;
  }

  reset(): void {
    this.accessCounts.clear();
  }
}

export class ScheduledWarmup implements WarmupStrategy {
  readonly name = 'scheduled';

  constructor(
    private scheduledKeys: Set<string>,
    private priorityMap: Map<string, number> = new Map(),
  ) {}

  shouldWarmup(key: string): boolean {
    return this.scheduledKeys.has(key);
  }

  priority(key: string): number {
    return this.priorityMap.get(key) ?? 1;
  }

  addKey(key: string, priority = 1): void {
    this.scheduledKeys.add(key);
    this.priorityMap.set(key, priority);
  }

  removeKey(key: string): void {
    this.scheduledKeys.delete(key);
    this.priorityMap.delete(key);
  }
}

export class PatternWarmup implements WarmupStrategy {
  readonly name = 'pattern';

  constructor(private patterns: RegExp[]) {}

  shouldWarmup(key: string): boolean {
    return this.patterns.some((p) => p.test(key));
  }

  priority(key: string): number {
    const matched = this.patterns.filter((p) => p.test(key));
    return matched.length;
  }

  addPattern(pattern: RegExp): void {
    this.patterns.push(pattern);
  }
}

export class CacheWarmup {
  constructor(
    private config: WarmupConfig,
    private loadFn: (keys: string[]) => Promise<void>,
  ) {}

  async warmup(availableKeys: string[]): Promise<number> {
    const candidates = availableKeys
      .filter((key) => this.config.strategies.some((s) => s.shouldWarmup(key)))
      .sort((a, b) => {
        const priorityB = Math.max(...this.config.strategies.map((s) => s.priority(b)));
        const priorityA = Math.max(...this.config.strategies.map((s) => s.priority(a)));
        return priorityB - priorityA;
      })
      .slice(0, this.config.maxKeys);

    let loaded = 0;
    for (let i = 0; i < candidates.length; i += this.config.batchSize) {
      const batch = candidates.slice(i, i + this.config.batchSize);
      await this.loadFn(batch);
      loaded += batch.length;
    }

    return loaded;
  }

  async warmupConcurrent(availableKeys: string[]): Promise<number> {
    const candidates = availableKeys
      .filter((key) => this.config.strategies.some((s) => s.shouldWarmup(key)))
      .sort((a, b) => {
        const priorityB = Math.max(...this.config.strategies.map((s) => s.priority(b)));
        const priorityA = Math.max(...this.config.strategies.map((s) => s.priority(a)));
        return priorityB - priorityA;
      })
      .slice(0, this.config.maxKeys);

    let loaded = 0;
    const batches: string[][] = [];
    for (let i = 0; i < candidates.length; i += this.config.batchSize) {
      batches.push(candidates.slice(i, i + this.config.batchSize));
    }

    for (let i = 0; i < batches.length; i += this.config.concurrency) {
      const concurrent = batches.slice(i, i + this.config.concurrency);
      await Promise.all(concurrent.map((batch) => this.loadFn(batch)));
      loaded += concurrent.reduce((a, b) => a + b.length, 0);
    }

    return loaded;
  }
}

export function createCacheWarmup(
  config: Partial<WarmupConfig> & { loadFn: (keys: string[]) => Promise<void> },
): CacheWarmup {
  const defaultConfig: WarmupConfig = {
    strategies: [new MostRecentlyUsedWarmup(), new HighFrequencyWarmup()],
    concurrency: 4,
    batchSize: 100,
    maxKeys: 10000,
    ttlMs: 300000,
  };
  return new CacheWarmup(
    { ...defaultConfig, ...config, strategies: config.strategies ?? defaultConfig.strategies },
    config.loadFn,
  );
}
