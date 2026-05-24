export interface CacheEntry<T> {
  value: T;
  expiresAt: number | null;
  createdAt: number;
  lastAccessedAt: number;
  accessCount: number;
}

export interface CacheStats {
  size: number;
  hitCount: number;
  missCount: number;
  evictionCount: number;
  memoryUsageBytes: number;
}

export interface TierStats {
  memory: CacheStats;
  redis: CacheStats | null;
  disk: CacheStats | null;
}

export interface CacheOptions {
  ttlMs?: number;
  namespace?: string;
}

export class MemoryTier {
  private store = new Map<string, CacheEntry<unknown>>();
  private hitCount = 0;
  private missCount = 0;
  private evictionCount = 0;

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) {
      this.missCount++;
      return undefined;
    }
    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      this.evictionCount++;
      this.missCount++;
      return undefined;
    }
    entry.lastAccessedAt = Date.now();
    entry.accessCount++;
    this.hitCount++;
    return entry.value as T;
  }

  set<T>(key: string, value: T, options?: CacheOptions): void {
    const entry: CacheEntry<T> = {
      value,
      expiresAt: options?.ttlMs ? Date.now() + options.ttlMs : null,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
      accessCount: 0,
    };
    this.store.set(key, entry as CacheEntry<unknown>);
  }

  delete(key: string): boolean {
    return this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  has(key: string): boolean {
    return this.store.has(key);
  }

  stats(): CacheStats {
    return {
      size: this.store.size,
      hitCount: this.hitCount,
      missCount: this.missCount,
      evictionCount: this.evictionCount,
      memoryUsageBytes: this.estimateMemoryUsage(),
    };
  }

  private estimateMemoryUsage(): number {
    let total = 0;
    for (const [key, entry] of this.store) {
      total += key.length * 2;
      total += JSON.stringify(entry.value).length * 2;
      total += 64;
    }
    return total;
  }
}

export interface RedisAdapter {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlMs?: number): Promise<void>;
  del(key: string): Promise<boolean>;
  flush(): Promise<void>;
}

export class RedisTier {
  constructor(private adapter: RedisAdapter) {}

  private hitCount = 0;
  private missCount = 0;
  private evictionCount = 0;

  async get<T>(key: string): Promise<T | undefined> {
    const raw = await this.adapter.get(key);
    if (raw === null) {
      this.missCount++;
      return undefined;
    }
    this.hitCount++;
    return JSON.parse(raw) as T;
  }

  async set<T>(key: string, value: T, options?: CacheOptions): Promise<void> {
    const raw = JSON.stringify(value);
    await this.adapter.set(key, raw, options?.ttlMs);
  }

  async delete(key: string): Promise<boolean> {
    const result = await this.adapter.del(key);
    if (result) this.evictionCount++;
    return result;
  }

  async clear(): Promise<void> {
    await this.adapter.flush();
  }

  stats(): CacheStats {
    return {
      size: 0,
      hitCount: this.hitCount,
      missCount: this.missCount,
      evictionCount: this.evictionCount,
      memoryUsageBytes: 0,
    };
  }
}

export interface DiskAdapter {
  read(key: string): Promise<Buffer | null>;
  write(key: string, data: Buffer, ttlMs?: number): Promise<void>;
  remove(key: string): Promise<boolean>;
  clear(): Promise<void>;
}

export class DiskTier {
  constructor(private adapter: DiskAdapter) {}

  private hitCount = 0;
  private missCount = 0;
  private evictionCount = 0;

  async get<T>(key: string): Promise<T | undefined> {
    const raw = await this.adapter.read(key);
    if (raw === null) {
      this.missCount++;
      return undefined;
    }
    this.hitCount++;
    return JSON.parse(raw.toString('utf-8')) as T;
  }

  async set<T>(key: string, value: T, options?: CacheOptions): Promise<void> {
    const raw = Buffer.from(JSON.stringify(value), 'utf-8');
    await this.adapter.write(key, raw, options?.ttlMs);
  }

  async delete(key: string): Promise<boolean> {
    const result = await this.adapter.remove(key);
    if (result) this.evictionCount++;
    return result;
  }

  async clear(): Promise<void> {
    await this.adapter.clear();
  }

  stats(): CacheStats {
    return {
      size: 0,
      hitCount: this.hitCount,
      missCount: this.missCount,
      evictionCount: this.evictionCount,
      memoryUsageBytes: 0,
    };
  }
}

export class CacheManager {
  constructor(
    readonly memory: MemoryTier,
    readonly redis: RedisTier | null = null,
    readonly disk: DiskTier | null = null,
    private readThrough: boolean = true,
  ) {}

  async get<T>(key: string): Promise<T | undefined> {
    const memResult = this.memory.get<T>(key);
    if (memResult !== undefined) return memResult;

    if (this.redis) {
      const redisResult = await this.redis.get<T>(key);
      if (redisResult !== undefined) {
        this.memory.set(key, redisResult);
        return redisResult;
      }
    }

    if (this.disk) {
      const diskResult = await this.disk.get<T>(key);
      if (diskResult !== undefined) {
        this.memory.set(key, diskResult);
        if (this.redis) await this.redis.set(key, diskResult);
        return diskResult;
      }
    }

    return undefined;
  }

  async set<T>(key: string, value: T, options?: CacheOptions): Promise<void> {
    this.memory.set(key, value, options);
    if (this.redis) {
      await this.redis.set(key, value, options).catch(() => {});
    }
    if (this.disk) {
      await this.disk.set(key, value, options).catch(() => {});
    }
  }

  async delete(key: string): Promise<void> {
    this.memory.delete(key);
    if (this.redis) await this.redis.delete(key).catch(() => {});
    if (this.disk) await this.disk.delete(key).catch(() => {});
  }

  async clear(): Promise<void> {
    this.memory.clear();
    if (this.redis) await this.redis.clear().catch(() => {});
    if (this.disk) await this.disk.clear().catch(() => {});
  }

  stats(): TierStats {
    return {
      memory: this.memory.stats(),
      redis: this.redis?.stats() ?? null,
      disk: this.disk?.stats() ?? null,
    };
  }
}

export function createCacheManager(
  redisAdapter?: RedisAdapter,
  diskAdapter?: DiskAdapter,
  readThrough = true,
): CacheManager {
  const memory = new MemoryTier();
  const redis = redisAdapter ? new RedisTier(redisAdapter) : null;
  const disk = diskAdapter ? new DiskTier(diskAdapter) : null;
  return new CacheManager(memory, redis, disk, readThrough);
}
