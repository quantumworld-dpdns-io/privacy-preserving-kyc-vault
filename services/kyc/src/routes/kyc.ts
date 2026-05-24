import { Router } from 'express';
import * as db from '../utils/db.js';
import { randomUUID } from 'node:crypto';

const router = Router();

router.post('/workflows', async (req, res) => {
  const { subjectDid, tier, platformId, schemaId } = req.body;
  if (!subjectDid || !tier || !platformId || !schemaId) {
    return res.status(400).json({ error: 'Missing required fields: subjectDid, tier, platformId, schemaId' });
  }

  try {
    const { rows } = await db.query(
      'INSERT INTO kyc_workflows (user_did, tier, platform_id, schema_id, status) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [subjectDid, tier, platformId, schemaId, 'initiated']
    );
    
    const workflow = rows[0];
    
    await db.query(
      'INSERT INTO kyc_workflow_events (workflow_id, event_type, actor_did, payload) VALUES ($1, $2, $3, $4)',
      [workflow.id, 'created', subjectDid, JSON.stringify({ detail: 'KYC workflow initiated' })]
    );

    res.status(201).json(workflow);
  } catch (err) {
    res.status(500).json({ error: 'WorkflowCreationFailed', message: (err as Error).message });
  }
});

router.get('/workflows/:id', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM kyc_workflows WHERE id = $1', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Workflow not found' });
    }
    
    const workflow = rows[0];
    const { rows: events } = await db.query(
      'SELECT * FROM kyc_workflow_events WHERE workflow_id = $1 ORDER BY created_at ASC',
      [workflow.id]
    );
    
    workflow.history = events;
    res.json(workflow);
  } catch (err) {
    res.status(500).json({ error: 'QueryFailed', message: (err as Error).message });
  }
});

router.post('/workflows/:id/transition', async (req, res) => {
  const { newState, actor, detail } = req.body;
  
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    
    const { rows } = await client.query('SELECT status FROM kyc_workflows WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Workflow not found' });
    }

    await client.query(
      'UPDATE kyc_workflows SET status = $1, updated_at = NOW() WHERE id = $2',
      [newState, req.params.id]
    );

    await client.query(
      'INSERT INTO kyc_workflow_events (workflow_id, event_type, actor_did, payload) VALUES ($1, $2, $3, $4)',
      [req.params.id, newState, actor, JSON.stringify({ detail })]
    );

    await client.query('COMMIT');
    
    const { rows: updated } = await client.query('SELECT * FROM kyc_workflows WHERE id = $1', [req.params.id]);
    res.json(updated[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'TransitionFailed', message: (err as Error).message });
  } finally {
    client.release();
  }
});

router.get('/workflows', async (_req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM kyc_workflows ORDER BY created_at DESC LIMIT 100');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'QueryFailed', message: (err as Error).message });
  }
});

export default router;
