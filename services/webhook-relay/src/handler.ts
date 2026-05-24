import { Router, Request, Response } from 'express';
import { relay } from './relay.js';

export const webhookRouter = Router();

webhookRouter.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'webhook-relay' });
});

webhookRouter.post('/subscriptions', (req: Request, res: Response) => {
  try {
    const { url, events, secret } = req.body as {
      url: string;
      events: string[];
      secret: string;
    };
    if (!url || !events || !Array.isArray(events) || events.length === 0) {
      res.status(400).json({ error: 'Missing required fields: url, events (non-empty array)' });
      return;
    }
    const subscription = relay.registerSubscription(url, events, secret || '');
    res.status(201).json({ subscription });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

webhookRouter.get('/subscriptions', (_req: Request, res: Response) => {
  const subscriptions = relay.listSubscriptions();
  res.json({ count: subscriptions.length, subscriptions });
});

webhookRouter.get('/subscriptions/:id', (req: Request, res: Response) => {
  const subscription = relay.getSubscription(req.params.id);
  if (!subscription) {
    res.status(404).json({ error: `Subscription ${req.params.id} not found` });
    return;
  }
  res.json({ subscription });
});

webhookRouter.patch('/subscriptions/:id', (req: Request, res: Response) => {
  try {
    const updates = req.body as {
      url?: string;
      events?: string[];
      secret?: string;
      active?: boolean;
    };
    const subscription = relay.updateSubscription(req.params.id, updates);
    res.json({ subscription });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(404).json({ error: message });
  }
});

webhookRouter.delete('/subscriptions/:id', (req: Request, res: Response) => {
  relay.removeSubscription(req.params.id);
  res.json({ status: 'deleted', id: req.params.id });
});

webhookRouter.post('/emit', async (req: Request, res: Response) => {
  try {
    const { type, payload } = req.body as { type: string; payload: unknown };
    if (!type || payload === undefined) {
      res.status(400).json({ error: 'Missing required fields: type, payload' });
      return;
    }
    const eventId = await relay.emitEvent(type, payload);
    res.status(201).json({ eventId, status: 'queued' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

webhookRouter.get('/deliveries/:eventId', (req: Request, res: Response) => {
  const report = relay.getDeliveryReport(req.params.eventId);
  if (!report) {
    res.status(404).json({ error: `Event ${req.params.eventId} not found` });
    return;
  }
  res.json({ report });
});

webhookRouter.get('/stats', (_req: Request, res: Response) => {
  const stats = relay.getQueueStats();
  res.json(stats);
});
