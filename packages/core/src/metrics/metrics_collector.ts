import * as crypto from 'node:crypto';

export type MetricType = 'counter' | 'gauge' | 'histogram' | 'summary' | 'timing';

export interface MetricLabel {
  name: string;
  value: string;
}

export interface MetricValue {
  type: MetricType;
  name: string;
  help: string;
  labels: MetricLabel[];
  value: number;
  timestamp?: number;
}

export interface HistogramValue extends MetricValue {
  type: 'histogram';
  buckets: Record<string, number>;
  sum: number;
  count: number;
}

export interface SummaryValue extends MetricValue {
  type: 'summary';
  quantiles: Record<string, number>;
  sum: number;
  count: number;
}

export interface TimingValue extends MetricValue {
  type: 'timing';
  duration: number;
  unit: 'ms' | 's' | 'us' | 'ns';
}

export type MetricEntry = MetricValue | HistogramValue | SummaryValue | TimingValue;

export class MetricsCollector {
  private metrics = new Map<string, MetricEntry>();
  private readonly prefix: string;
  private readonly defaultLabels: MetricLabel[];

  constructor(options?: { prefix?: string; defaultLabels?: Record<string, string> }) {
    this.prefix = options?.prefix ?? '';
    this.defaultLabels = options?.defaultLabels
      ? Object.entries(options.defaultLabels).map(([name, value]) => ({ name, value }))
      : [];
  }

  private buildName(name: string): string {
    return this.prefix ? `${this.prefix}_${name}` : name;
  }

  private labelsKey(name: string, labels: MetricLabel[]): string {
    const sorted = [...labels].sort((a, b) => a.name.localeCompare(b.name));
    return `${name}:${sorted.map((l) => `${l.name}=${l.value}`).join(',')}`;
  }

  counter(name: string, value: number, labels?: Record<string, string>): void {
    const fullName = this.buildName(name);
    const labelList = this.mergeLabels(labels);
    const key = this.labelsKey(fullName, labelList);
    const existing = this.metrics.get(key);
    if (existing && existing.type === 'counter') {
      (existing as MetricValue).value += value;
    } else {
      this.metrics.set(key, {
        type: 'counter',
        name: fullName,
        help: name,
        labels: labelList,
        value,
        timestamp: Date.now(),
      });
    }
  }

  gauge(name: string, value: number, labels?: Record<string, string>): void {
    const fullName = this.buildName(name);
    const labelList = this.mergeLabels(labels);
    const key = this.labelsKey(fullName, labelList);
    this.metrics.set(key, {
      type: 'gauge',
      name: fullName,
      help: name,
      labels: labelList,
      value,
      timestamp: Date.now(),
    });
  }

  histogram(
    name: string,
    value: number,
    labels?: Record<string, string>,
    buckets?: number[],
  ): void {
    const fullName = this.buildName(name);
    const labelList = this.mergeLabels(labels);
    const key = this.labelsKey(fullName, labelList);
    const defaultBuckets = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
    const useBuckets = buckets ?? defaultBuckets;

    const existing = this.metrics.get(key);
    if (existing && existing.type === 'histogram') {
      const h = existing as HistogramValue;
      h.sum += value;
      h.count++;
      for (const bucket of useBuckets) {
        const bKey = bucket.toString();
        h.buckets[bKey] = (h.buckets[bKey] ?? 0) + (value <= bucket ? 1 : 0);
      }
    } else {
      const bucketMap: Record<string, number> = {};
      for (const bucket of useBuckets) {
        bucketMap[bucket.toString()] = value <= bucket ? 1 : 0;
      }
      this.metrics.set(key, {
        type: 'histogram',
        name: fullName,
        help: name,
        labels: labelList,
        value,
        buckets: bucketMap,
        sum: value,
        count: 1,
        timestamp: Date.now(),
      });
    }
  }

  summary(
    name: string,
    value: number,
    labels?: Record<string, string>,
    quantiles?: number[],
  ): void {
    const fullName = this.buildName(name);
    const labelList = this.mergeLabels(labels);
    const key = this.labelsKey(fullName, labelList);
    const defaultQuantiles = [0.5, 0.9, 0.95, 0.99];
    const useQuantiles = quantiles ?? defaultQuantiles;
    const existing = this.metrics.get(key);

    if (existing && existing.type === 'summary') {
      const s = existing as SummaryValue;
      s.sum += value;
      s.count++;
    } else {
      const qMap: Record<string, number> = {};
      for (const q of useQuantiles) {
        qMap[q.toString()] = 0;
      }
      this.metrics.set(key, {
        type: 'summary',
        name: fullName,
        help: name,
        labels: labelList,
        value,
        quantiles: qMap,
        sum: value,
        count: 1,
        timestamp: Date.now(),
      });
    }
  }

  timing(
    name: string,
    duration: number,
    unit: 'ms' | 's' | 'us' | 'ns' = 'ms',
    labels?: Record<string, string>,
  ): void {
    const fullName = this.buildName(name);
    const labelList = this.mergeLabels(labels);
    const key = this.labelsKey(fullName, labelList);
    this.metrics.set(key, {
      type: 'timing',
      name: fullName,
      help: name,
      labels: labelList,
      value: duration,
      duration,
      unit,
      timestamp: Date.now(),
    });
  }

  remove(name: string, labels?: Record<string, string>): void {
    const fullName = this.buildName(name);
    const labelList = labels ? this.mergeLabels(labels) : [];
    const key = this.labelsKey(fullName, labelList);
    this.metrics.delete(key);
  }

  clear(): void {
    this.metrics.clear();
  }

  snapshot(): MetricEntry[] {
    return Array.from(this.metrics.values());
  }

  reset(name?: string, labels?: Record<string, string>): void {
    if (name) {
      const fullName = this.buildName(name);
      const labelList = labels ? this.mergeLabels(labels) : [];
      const key = this.labelsKey(fullName, labelList);
      this.metrics.delete(key);
    } else {
      this.clear();
    }
  }

  private mergeLabels(labels?: Record<string, string>): MetricLabel[] {
    const result = [...this.defaultLabels];
    if (labels) {
      for (const [name, value] of Object.entries(labels)) {
        const idx = result.findIndex((l) => l.name === name);
        if (idx >= 0) {
          result[idx] = { name, value };
        } else {
          result.push({ name, value });
        }
      }
    }
    return result;
  }

  toJSON(): Record<string, unknown> {
    return {
      metrics: this.snapshot(),
      count: this.metrics.size,
    };
  }

  static createCollectorId(): string {
    return crypto.randomUUID();
  }
}

export function createMetricsCollector(options?: { prefix?: string; defaultLabels?: Record<string, string> }): MetricsCollector {
  return new MetricsCollector(options);
}
