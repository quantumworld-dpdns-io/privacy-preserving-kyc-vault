import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { WebhookService } from '../services/webhook_service.js';
import { NotificationEvent } from '../types/index.js';

const router = Router();
const webhookService = new WebhookService();

const CreateWebhookSchema = z.object({
  url: z.string().url(),
  events: z.array(z.string()).min(1),
  secret: z.string().min(16).optional(),
  retryPolicy: z.object({
    maxRetries: z.number().int().min(1).max(10).optional(),
    baseDelayMs: z.number().int().min(100).optional(),
    maxDelayMs: z.number().int().min(1000).optional(),
    backoffFactor: z.number().min(1).max(5).optional(),
  }).optional(),
});

const UpdateWebhookSchema = z.object({
  url: z.string().url().optional(),
  events: z.array(z.string()).optional(),
  secret: z.string().min(16).optional(),
  enabled: z.boolean().optional(),
  retryPolicy: z.object({
    maxRetries: z.number().int().min(1).max(10).optional(),
    baseDelayMs: z.number().int().min(100).optional(),
    maxDelayMs: z.number().int().min(1000).optional(),
    backoffFactor: z.number().min(1).max(5).optional(),
  }).optional(),
});

const EventSubscriptionSchema = z.object({
  eventType: z.string().min(1),
  channel: z.enum(['webhook', 'email', 'sms', 'push']),
  recipient: z.string().min(1),
  template: z.string().optional(),
  filters: z.record(z.unknown()).optional(),
});

router.post('/webhooks', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = CreateWebhookSchema.parse(req.body);
    const subscription = await webhookService.createSubscription(input.url, input.events, input.secret, input.retryPolicy);
    res.status(201).json({ success: true, data: subscription });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, error: 'Validation failed', details: error.errors });
      return;
    }
    next(error);
  }
});

router.get('/webhooks', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const subscriptions = await webhookService.listSubscriptions();
    res.json({ success: true, data: subscriptions });
  } catch (error) {
    next(error);
  }
});

router.get('/webhooks/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const subscription = await webhookService.getSubscription(req.params.id);
    res.json({ success: true, data: subscription });
  } catch (error) {
    const err = error as Error & { statusCode?: number };
    if (err.statusCode === 404) {
      res.status(404).json({ success: false, error: err.message });
      return;
    }
    next(error);
  }
});

router.put('/webhooks/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = UpdateWebhookSchema.parse(req.body);
    const subscription = await webhookService.updateSubscription(req.params.id, input);
    res.json({ success: true, data: subscription });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, error: 'Validation failed', details: error.errors });
      return;
    }
    const err = error as Error & { statusCode?: number };
    if (err.statusCode === 404) {
      res.status(404).json({ success: false, error: err.message });
      return;
    }
    next(error);
  }
});

router.delete('/webhooks/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await webhookService.deleteSubscription(req.params.id);
    res.status(204).send();
  } catch (error) {
    const err = error as Error & { statusCode?: number };
    if (err.statusCode === 404) {
      res.status(404).json({ success: false, error: err.message });
      return;
    }
    next(error);
  }
});

router.post('/webhooks/:id/test', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await webhookService.emitEvent('webhook.test', 'api', req.params.id, {
      test: true,
      timestamp: new Date().toISOString(),
      ...(req.body || {}),
    });
    res.json({ success: true, data: { message: 'Test event sent' } });
  } catch (error) {
    next(error);
  }
});

router.get('/events/:eventId/delivery', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const history = await webhookService.getDeliveryStatus(req.params.eventId);
    res.json({ success: true, data: history });
  } catch (error) {
    next(error);
  }
});

router.post('/subscriptions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = EventSubscriptionSchema.parse(req.body);
    const subscription = {
      id: crypto.randomUUID(),
      ...input,
      enabled: true,
      createdAt: new Date().toISOString(),
    };
    res.status(201).json({ success: true, data: subscription });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, error: 'Validation failed', details: error.errors });
      return;
    }
    next(error);
  }
});

const notifications = new Map<string, NotificationEvent>();

router.get('/notifications', async (req: Request, res: Response) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
  const data = Array.from(notifications.values()).slice(0, limit);
  res.json({ success: true, data, total: notifications.size });
});

router.get('/notifications/:id', async (req: Request, res: Response) => {
  const notification = notifications.get(req.params.id);
  if (!notification) {
    res.status(404).json({ success: false, error: 'Notification not found' });
    return;
  }
  res.json({ success: true, data: notification });
});

export default router;
