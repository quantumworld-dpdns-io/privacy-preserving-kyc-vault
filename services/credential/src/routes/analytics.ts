import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AnalyticsDataPoint } from '../types/index.js';

const router = Router();

const KPIQuerySchema = z.object({
  metric: z.string().min(1),
  from: z.string().datetime(),
  to: z.string().datetime(),
  granularity: z.enum(['hour', 'day', 'week', 'month']).default('day'),
  dimension: z.string().optional(),
  filters: z.record(z.string()).optional(),
});

const DashboardSchema = z.object({
  dashboardId: z.string().optional(),
  name: z.string().min(1),
  widgets: z.array(z.object({
    title: z.string(),
    metric: z.string(),
    visualization: z.enum(['line', 'bar', 'pie', 'table', 'number']),
    dimensions: z.array(z.string()).optional(),
    filters: z.record(z.string()).optional(),
  })).min(1).max(20),
});

function generateTimeSeries(from: string, to: string, granularity: string, baseValue: number): AnalyticsDataPoint[] {
  const points: AnalyticsDataPoint[] = [];
  const start = new Date(from).getTime();
  const end = new Date(to).getTime();
  const intervals: Record<string, number> = {
    hour: 3600000,
    day: 86400000,
    week: 604800000,
    month: 2592000000,
  };
  const interval = intervals[granularity] || 86400000;

  for (let t = start; t <= end; t += interval) {
    points.push({
      timestamp: new Date(t).toISOString(),
      value: Math.round((baseValue + Math.random() * baseValue * 0.5) * 100) / 100,
    });
  }

  return points;
}

router.get('/kpi', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = KPIQuerySchema.parse(req.query);
    const baseValues: Record<string, number> = {
      total_verifications: 15000,
      active_users: 1250,
      verifications_per_day: 500,
      average_processing_time: 45,
      approval_rate: 87.5,
      rejection_rate: 8.3,
      escalation_rate: 4.2,
      total_credentials_issued: 34200,
      total_credentials_revoked: 890,
      api_latency_p99: 320,
      api_latency_p95: 180,
      api_latency_p50: 45,
      error_rate: 0.02,
    };

    const baseValue = baseValues[query.metric] || 100;
    const data = generateTimeSeries(query.from, query.to, query.granularity, baseValue);

    const summary = {
      metric: query.metric,
      total: data.reduce((acc, p) => acc + p.value, 0),
      average: data.reduce((acc, p) => acc + p.value, 0) / data.length,
      min: Math.min(...data.map((p) => p.value)),
      max: Math.max(...data.map((p) => p.value)),
      dataPoints: data.length,
    };

    res.json({ success: true, data, summary, query });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, error: 'Validation failed', details: error.errors });
      return;
    }
    next(error);
  }
});

router.get('/trends', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = KPIQuerySchema.parse(req.query);
    const data = generateTimeSeries(query.from, query.to, query.granularity, 500);

    const trend = {
      direction: data.length > 1 ? (data[data.length - 1].value > data[0].value ? 'up' : 'down') : 'stable',
      percentChange: data.length > 1 ? (((data[data.length - 1].value - data[0].value) / data[0].value) * 100).toFixed(2) : '0.00',
      seasonality: 'weekly',
      forecast: generateTimeSeries(query.to, new Date(new Date(query.to).getTime() + 7 * 86400000).toISOString(), 'day', 500),
    };

    res.json({ success: true, data, trend, query });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, error: 'Validation failed', details: error.errors });
      return;
    }
    next(error);
  }
});

const dashboards = new Map<string, z.infer<typeof DashboardSchema>>();

router.post('/dashboards', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = DashboardSchema.parse(req.body);
    const id = input.dashboardId || `dash-${crypto.randomUUID().substring(0, 8)}`;
    const dashboard = { ...input, dashboardId: id, createdAt: new Date().toISOString() };
    dashboards.set(id, dashboard);
    res.status(201).json({ success: true, data: dashboard });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, error: 'Validation failed', details: error.errors });
      return;
    }
    next(error);
  }
});

router.get('/dashboards', async (_req: Request, res: Response) => {
  res.json({ success: true, data: Array.from(dashboards.values()) });
});

router.get('/dashboards/:id', async (req: Request, res: Response) => {
  const dashboard = dashboards.get(req.params.id);
  if (!dashboard) {
    res.status(404).json({ success: false, error: 'Dashboard not found' });
    return;
  }
  res.json({ success: true, data: dashboard });
});

router.put('/dashboards/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = dashboards.get(req.params.id);
    if (!existing) {
      res.status(404).json({ success: false, error: 'Dashboard not found' });
      return;
    }
    const updated = { ...existing, ...req.body, dashboardId: req.params.id, updatedAt: new Date().toISOString() };
    dashboards.set(req.params.id, updated);
    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
});

router.delete('/dashboards/:id', async (req: Request, res: Response) => {
  if (!dashboards.has(req.params.id)) {
    res.status(404).json({ success: false, error: 'Dashboard not found' });
    return;
  }
  dashboards.delete(req.params.id);
  res.status(204).send();
});

export default router;
