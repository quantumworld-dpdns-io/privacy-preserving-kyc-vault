import { Router, Request, Response } from 'express';
import { orchestrator, type WorkflowStatus, type WorkflowEvent } from './orchestrator.js';
import { type KycTier } from './config.js';

export const kycRouter = Router();

kycRouter.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'kyc-orchestrator' });
});

kycRouter.get('/workflows', (_req: Request, res: Response) => {
  const status = _req.query.status as WorkflowStatus | undefined;
  const workflows = orchestrator.listWorkflows(status);
  res.json({ count: workflows.length, workflows });
});

kycRouter.post('/workflows', (req: Request, res: Response) => {
  try {
    const { userId, tier } = req.body as { userId: string; tier: KycTier };
    if (!userId || !tier) {
      res.status(400).json({ error: 'Missing required fields: userId, tier' });
      return;
    }
    const workflow = orchestrator.createWorkflow(userId, tier);
    res.status(201).json({ workflow });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(400).json({ error: message });
  }
});

kycRouter.get('/workflows/:id', (req: Request, res: Response) => {
  try {
    const workflow = orchestrator.getWorkflow(req.params.id);
    res.json({ workflow });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(404).json({ error: message });
  }
});

kycRouter.post('/workflows/:id/transition', (req: Request, res: Response) => {
  try {
    const { event } = req.body as { event: WorkflowEvent };
    if (!event) {
      res.status(400).json({ error: 'Missing required field: event' });
      return;
    }
    const workflow = orchestrator.transitionWorkflow(req.params.id, event);
    res.json({ workflow });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(400).json({ error: message });
  }
});

kycRouter.get('/users/:userId/workflows', (req: Request, res: Response) => {
  try {
    const workflows = orchestrator.getUserWorkflows(req.params.userId);
    res.json({ count: workflows.length, workflows });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

kycRouter.patch('/workflows/:id/steps/:stepId', (req: Request, res: Response) => {
  try {
    const { status, result, error } = req.body;
    const workflow = orchestrator.updateStep(req.params.id, req.params.stepId, {
      status,
      result,
      error,
    });
    res.json({ workflow });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(400).json({ error: message });
  }
});

kycRouter.post('/workflows/check-expired', (_req: Request, res: Response) => {
  const expired = orchestrator.checkExpired();
  res.json({ expired, count: expired.length });
});

kycRouter.patch('/workflows/:id/metadata', (req: Request, res: Response) => {
  try {
    const { metadata } = req.body;
    if (!metadata) {
      res.status(400).json({ error: 'Missing required field: metadata' });
      return;
    }
    const workflow = orchestrator.updateMetadata(req.params.id, metadata);
    res.json({ workflow });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(400).json({ error: message });
  }
});
