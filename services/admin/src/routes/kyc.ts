import { Router } from 'express';

const router = Router();

const workflows = new Map<string, any>();

router.post('/workflows', (req, res) => {
  const { subjectDid, tier, platformId } = req.body;
  if (!subjectDid || !tier || !platformId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const id = `wf-${crypto.randomUUID()}`;
  const workflow = {
    id,
    subjectDid,
    tier,
    platformId,
    state: 'Initiated',
    createdAt: new Date().toISOString(),
    documents: [],
    reviews: [],
  };

  workflows.set(id, workflow);
  res.status(201).json(workflow);
});

router.get('/workflows/:id', (req, res) => {
  const workflow = workflows.get(req.params.id);
  if (!workflow) {
    return res.status(404).json({ error: 'Workflow not found' });
  }
  res.json(workflow);
});

router.post('/workflows/:id/transition', (req, res) => {
  const workflow = workflows.get(req.params.id);
  if (!workflow) {
    return res.status(404).json({ error: 'Workflow not found' });
  }

  const { newState, actor, detail } = req.body;
  workflow.state = newState;
  workflow.updatedAt = new Date().toISOString();

  if (!workflow.history) workflow.history = [];
  workflow.history.push({
    eventType: `state_change:${newState}`,
    timestamp: new Date().toISOString(),
    actor,
    detail,
  });

  res.json(workflow);
});

router.get('/workflows', (_req, res) => {
  res.json(Array.from(workflows.values()));
});

export default router;
