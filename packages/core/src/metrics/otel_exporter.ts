import type { MetricEntry, HistogramValue, MetricLabel } from './metrics_collector.js';

export interface OTelExporterConfig {
  endpoint: string;
  serviceName: string;
  serviceNamespace?: string;
  serviceVersion?: string;
  headers?: Record<string, string>;
  exportIntervalMs?: number;
  timeoutMs?: number;
}

export interface OTelMetricPoint {
  name: string;
  description: string;
  unit: string;
  type: 'sum' | 'gauge' | 'histogram';
  value: number;
  attributes: Record<string, string>;
  timestamp: number;
  startTimestamp?: number;
}

export interface OTelHistogramPoint extends OTelMetricPoint {
  type: 'histogram';
  count: number;
  sum: number;
  bucketCounts: number[];
  explicitBounds: number[];
}

export interface OTelExportBatch {
  resourceMetrics: Array<{
    resource: {
      attributes: Record<string, string>;
    };
    scopeMetrics: Array<{
      scope: {
        name: string;
        version?: string;
      };
      metrics: Array<{
        name: string;
        description: string;
        unit: string;
        [key: string]: unknown;
      }>;
    }>;
  }>;
}

export function convertToOTelMetrics(
  metrics: MetricEntry[],
  config: OTelExporterConfig,
): OTelExportBatch {
  const points: OTelMetricPoint[] = [];

  for (const metric of metrics) {
    const attributes: Record<string, string> = {};
    for (const label of metric.labels) {
      attributes[label.name] = label.value;
    }

    const base = {
      name: metric.name,
      description: metric.help,
      unit: metric.type === 'timing' ? 'ms' : '1',
      attributes,
      timestamp: metric.timestamp ?? Date.now(),
    };

    switch (metric.type) {
      case 'counter':
        points.push({ ...base, type: 'sum', value: metric.value });
        break;
      case 'gauge':
        points.push({ ...base, type: 'gauge', value: metric.value });
        break;
      case 'histogram': {
        const h = metric as HistogramValue;
        const bounds = Object.keys(h.buckets)
          .map(Number)
          .sort((a, b) => a - b);
        const counts = bounds.map((b) => h.buckets[b.toString()] ?? 0);
        points.push({
          ...base,
          type: 'histogram',
          value: h.value,
          count: h.count,
          sum: h.sum,
          bucketCounts: counts,
          explicitBounds: bounds,
        } as OTelHistogramPoint);
        break;
      }
      case 'summary':
        points.push({ ...base, type: 'gauge', value: metric.value });
        break;
      case 'timing':
        points.push({ ...base, type: 'gauge', value: metric.value, unit: 'ms' });
        break;
    }
  }

  return {
    resourceMetrics: [
      {
        resource: {
          attributes: {
            'service.name': config.serviceName,
            ...(config.serviceNamespace ? { 'service.namespace': config.serviceNamespace } : {}),
            ...(config.serviceVersion ? { 'service.version': config.serviceVersion } : {}),
          },
        },
        scopeMetrics: [
          {
            scope: {
              name: '@kyc-vault/core',
              version: '0.1.0',
            },
            metrics: points.map((p) => {
              const base = {
                name: p.name,
                description: p.description,
                unit: p.unit,
              };
              if (p.type === 'histogram') {
                const hp = p as OTelHistogramPoint;
                return {
                  ...base,
                  histogram: {
                    dataPoints: [
                      {
                        attributes: p.attributes,
                        startTimeUnixNano: (p.startTimestamp ?? p.timestamp) * 1_000_000,
                        timeUnixNano: p.timestamp * 1_000_000,
                        count: hp.count,
                        sum: hp.sum,
                        bucketCounts: hp.bucketCounts,
                        explicitBounds: hp.explicitBounds,
                      },
                    ],
                  },
                };
              }
              return {
                ...base,
                [p.type === 'sum' ? 'sum' : 'gauge']: {
                  dataPoints: [
                    {
                      attributes: p.attributes,
                      startTimeUnixNano: (p.startTimestamp ?? p.timestamp) * 1_000_000,
                      timeUnixNano: p.timestamp * 1_000_000,
                      asDouble: p.value,
                    },
                  ],
                },
              };
            }),
          },
        ],
      },
    ],
  };
}

export async function exportOTelMetrics(
  metrics: MetricEntry[],
  config: OTelExporterConfig,
): Promise<Response> {
  const body = convertToOTelMetrics(metrics, config);
  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...config.headers,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(config.timeoutMs ?? 10000),
  });
  return response;
}

export class OTelExporter {
  private interval?: ReturnType<typeof setInterval>;
  private queue: MetricEntry[] = [];

  constructor(private config: OTelExporterConfig) {}

  push(metrics: MetricEntry[]): void {
    this.queue.push(...metrics);
  }

  start(): void {
    if (this.interval) return;
    this.interval = setInterval(() => {
      this.flush();
    }, this.config.exportIntervalMs ?? 60000);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
  }

  async flush(): Promise<void> {
    if (this.queue.length === 0) return;
    const batch = this.queue.splice(0);
    try {
      await exportOTelMetrics(batch, this.config);
    } catch {
      this.queue.unshift(...batch);
    }
  }
}

export function createOTelExporter(config: OTelExporterConfig): OTelExporter {
  return new OTelExporter(config);
}
