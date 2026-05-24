import type { MetricEntry, HistogramValue, SummaryValue, MetricLabel } from './metrics_collector.js';

export function formatPrometheus(metrics: MetricEntry[], globalLabels?: Record<string, string>): string {
  const lines: string[] = [];

  for (const metric of metrics) {
    const labels = formatLabels(metric.labels, globalLabels);
    const metricName = sanitizeName(metric.name);

    switch (metric.type) {
      case 'counter':
        lines.push(`# HELP ${metricName} ${metric.help}`);
        lines.push(`# TYPE ${metricName} counter`);
        lines.push(`${metricName}${labels} ${metric.value}${metric.timestamp ? ` ${metric.timestamp}` : ''}`);
        break;

      case 'gauge':
        lines.push(`# HELP ${metricName} ${metric.help}`);
        lines.push(`# TYPE ${metricName} gauge`);
        lines.push(`${metricName}${labels} ${metric.value}${metric.timestamp ? ` ${metric.timestamp}` : ''}`);
        break;

      case 'histogram': {
        const h = metric as HistogramValue;
        lines.push(`# HELP ${metricName} ${h.help}`);
        lines.push(`# TYPE ${metricName} histogram`);
        for (const [bucket, count] of Object.entries(h.buckets)) {
          const bucketLabels = formatLabels(h.labels, globalLabels, { le: bucket });
          lines.push(`${metricName}_bucket${bucketLabels} ${count}`);
        }
        const infLabels = formatLabels(h.labels, globalLabels, { le: '+Inf' });
        lines.push(`${metricName}_bucket${infLabels} ${h.count}`);
        const sumLabels = formatLabels(h.labels, globalLabels);
        lines.push(`${metricName}_sum${sumLabels} ${h.sum}`);
        lines.push(`${metricName}_count${sumLabels} ${h.count}`);
        break;
      }

      case 'summary': {
        const s = metric as SummaryValue;
        lines.push(`# HELP ${metricName} ${s.help}`);
        lines.push(`# TYPE ${metricName} summary`);
        for (const [quantile, value] of Object.entries(s.quantiles)) {
          const qLabels = formatLabels(s.labels, globalLabels, { quantile });
          lines.push(`${metricName}${qLabels} ${value}`);
        }
        const sumLabels = formatLabels(s.labels, globalLabels);
        lines.push(`${metricName}_sum${sumLabels} ${s.sum}`);
        lines.push(`${metricName}_count${sumLabels} ${s.count}`);
        break;
      }

      case 'timing':
        lines.push(`# HELP ${metricName} ${metric.help}`);
        lines.push(`# TYPE ${metricName} gauge`);
        lines.push(`${metricName}_milliseconds${labels} ${metric.value}`);
        break;
    }
  }

  return lines.join('\n') + '\n';
}

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_:]/g, '_');
}

function formatLabels(
  labels: MetricLabel[],
  globalLabels?: Record<string, string>,
  extra?: Record<string, string>,
): string {
  const allLabels: Record<string, string> = {};

  if (globalLabels) {
    Object.assign(allLabels, globalLabels);
  }

  for (const label of labels) {
    allLabels[label.name] = label.value;
  }

  if (extra) {
    Object.assign(allLabels, extra);
  }

  const keys = Object.keys(allLabels);
  if (keys.length === 0) return '';

  const parts = keys
    .sort()
    .map((k) => `${sanitizeName(k)}="${escapeLabelValue(allLabels[k]!)}"`);
  return `{${parts.join(',')}}`;
}

function escapeLabelValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

export function prometheusContentType(): string {
  return 'text/plain; version=0.0.4; charset=utf-8';
}

export function formatPrometheusPushgateway(
  job: string,
  metrics: MetricEntry[],
  instance?: string,
  groupingKey?: Record<string, string>,
): string {
  const globalLabels: Record<string, string> = { job };
  if (instance) globalLabels.instance = instance;
  if (groupingKey) Object.assign(globalLabels, groupingKey);
  return formatPrometheus(metrics, globalLabels);
}
