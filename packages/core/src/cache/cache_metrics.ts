export interface MetricsSnapshot {
  timestamp: number;
  hits: number;
  misses: number;
  hitRate: number;
  size: number;
  evictions: number;
  avgAccessLatency: number;
  memoryBytes: number;
}

export class CacheMetrics {
  private hits = 0;
  private misses = 0;
  private evictions = 0;
  private totalLatency = 0;
  private accessCount = 0;
  private size = 0;
  private memoryBytes = 0;
  private readonly history: MetricsSnapshot[] = [];
  private readonly maxHistory: number;

  constructor(maxHistory = 1000) {
    this.maxHistory = maxHistory;
  }

  recordHit(latency: number): void {
    this.hits++;
    this.totalLatency += latency;
    this.accessCount++;
  }

  recordMiss(latency: number): void {
    this.misses++;
    this.totalLatency += latency;
    this.accessCount++;
  }

  recordEviction(): void {
    this.evictions++;
  }

  updateSize(size: number): void {
    this.size = size;
  }

  updateMemoryBytes(bytes: number): void {
    this.memoryBytes = bytes;
  }

  get hitRate(): number {
    const total = this.hits + this.misses;
    return total === 0 ? 0 : this.hits / total;
  }

  get avgLatency(): number {
    return this.accessCount === 0 ? 0 : this.totalLatency / this.accessCount;
  }

  get totalHits(): number {
    return this.hits;
  }

  get totalMisses(): number {
    return this.misses;
  }

  get totalEvictions(): number {
    return this.evictions;
  }

  snapshot(): MetricsSnapshot {
    return {
      timestamp: Date.now(),
      hits: this.hits,
      misses: this.misses,
      hitRate: this.hitRate,
      size: this.size,
      evictions: this.evictions,
      avgAccessLatency: this.avgLatency,
      memoryBytes: this.memoryBytes,
    };
  }

  recordSnapshot(): MetricsSnapshot {
    const snap = this.snapshot();
    this.history.push(snap);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
    return snap;
  }

  getHistory(): MetricsSnapshot[] {
    return [...this.history];
  }

  reset(): void {
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
    this.totalLatency = 0;
    this.accessCount = 0;
    this.size = 0;
    this.memoryBytes = 0;
  }

  clearHistory(): void {
    this.history.length = 0;
  }

  toJSON(): Record<string, unknown> {
    return {
      hits: this.hits,
      misses: this.misses,
      hitRate: this.hitRate,
      evictions: this.evictions,
      avgLatency: this.avgLatency,
      size: this.size,
      memoryBytes: this.memoryBytes,
    };
  }

  merge(other: CacheMetrics): void {
    this.hits += other.hits;
    this.misses += other.misses;
    this.evictions += other.evictions;
    this.totalLatency += other.totalLatency;
    this.accessCount += other.accessCount;
    this.size = Math.max(this.size, other.size);
    this.memoryBytes = Math.max(this.memoryBytes, other.memoryBytes);
  }
}

export function createCacheMetrics(maxHistory?: number): CacheMetrics {
  return new CacheMetrics(maxHistory);
}
