import type { MetricEntry } from './metrics_collector.js';

export interface DogStatsDConfig {
  host: string;
  port: number;
  prefix?: string;
  tags?: Record<string, string>;
  sampleRate?: number;
  bufferSize?: number;
  flushIntervalMs?: number;
}

export function formatDogStatsDMetric(metric: MetricEntry, globalTags?: Record<string, string>): string {
  const tagPairs = [...(globalTags ? Object.entries(globalTags).map(([k, v]) => `${k}:${v}`) : [])];

  for (const label of metric.labels) {
    tagPairs.push(`${label.name}:${label.value}`);
  }

  const tags = tagPairs.length > 0 ? `|#${tagPairs.join(',')}` : '';
  const sample = metric.type === 'histogram' || metric.type === 'timing' ? '|@1' : '';
  const name = metric.name;

  switch (metric.type) {
    case 'counter':
      return `${name}:${metric.value}|c${tags}`;
    case 'gauge':
      return `${name}:${metric.value}|g${tags}`;
    case 'histogram':
      return `${name}:${metric.value}|h${sample}${tags}`;
    case 'summary':
      return `${name}:${metric.value}|h${tags}`;
    case 'timing':
      return `${name}:${metric.value}|ms${tags}`;
    default:
      return `${name}:${metric.value}|g${tags}`;
  }
}

export function formatDogStatsDBatch(metrics: MetricEntry[], globalTags?: Record<string, string>): string {
  return metrics.map((m) => formatDogStatsDMetric(m, globalTags)).join('\n');
}

export class DogStatsDExporter {
  private socket?: any;
  private buffer: string[] = [];
  private interval?: ReturnType<typeof setInterval>;

  constructor(private config: DogStatsDConfig) {
    this.buffer = [];
  }

  private getSocket(): any {
    if (this.socket) return this.socket;
    const dgram = require('node:dgram');
    this.socket = dgram.createSocket('udp4');
    this.socket.unref();
    return this.socket;
  }

  push(metrics: MetricEntry[]): void {
    for (const metric of metrics) {
      this.buffer.push(formatDogStatsDMetric(metric, this.config.tags));
    }
    if (this.buffer.length >= (this.config.bufferSize ?? 100)) {
      this.flush();
    }
  }

  pushFormatted(line: string): void {
    this.buffer.push(line);
    if (this.buffer.length >= (this.config.bufferSize ?? 100)) {
      this.flush();
    }
  }

  start(): void {
    if (this.interval) return;
    this.interval = setInterval(() => {
      this.flush();
    }, this.config.flushIntervalMs ?? 10000);
    this.interval.unref();
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
    this.flush();
  }

  flush(): void {
    if (this.buffer.length === 0) return;
    const lines = this.buffer.splice(0);
    const message = lines.join('\n');
    try {
      const sock = this.getSocket();
      const buf = Buffer.from(message, 'utf-8');
      sock.send(buf, 0, buf.length, this.config.port, this.config.host);
    } catch {
      this.buffer.unshift(...lines);
    }
  }

  gauge(name: string, value: number, tags?: Record<string, string>): void {
    this.pushFormatted(this.buildMetric(name, value, 'g', tags));
  }

  counter(name: string, value: number, tags?: Record<string, string>): void {
    this.pushFormatted(this.buildMetric(name, value, 'c', tags));
  }

  histogram(name: string, value: number, tags?: Record<string, string>): void {
    this.pushFormatted(this.buildMetric(name, value, 'h', tags));
  }

  timing(name: string, value: number, tags?: Record<string, string>): void {
    this.pushFormatted(this.buildMetric(name, value, 'ms', tags));
  }

  private buildMetric(name: string, value: number, type: string, tags?: Record<string, string>): string {
    const allTags = { ...this.config.tags, ...tags };
    const tagStr = Object.keys(allTags).length > 0
      ? `|#${Object.entries(allTags).map(([k, v]) => `${k}:${v}`).join(',')}`
      : '';
    return `${name}:${value}|${type}${tagStr}`;
  }
}

export function createDogStatsDExporter(config: DogStatsDConfig): DogStatsDExporter {
  return new DogStatsDExporter(config);
}
