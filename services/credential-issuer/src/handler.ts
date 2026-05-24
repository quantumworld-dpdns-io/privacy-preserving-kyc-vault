import { Router, Request, Response } from 'express';
import { issuer, type IssueCredentialRequest } from './issuer.js';
import { loadConfig } from './config.js';

const config = loadConfig();

export const credentialRouter = Router();

credentialRouter.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'credential-issuer' });
});

credentialRouter.get('/schemas', (_req: Request, res: Response) => {
  res.json({ schemas: config.schemaRegistry });
});

credentialRouter.get('/schemas/:schemaId', (req: Request, res: Response) => {
  const schema = config.schemaRegistry.find((s) => s.id === req.params.schemaId);
  if (!schema) {
    res.status(404).json({ error: `Schema ${req.params.schemaId} not found` });
    return;
  }
  res.json({ schema });
});

credentialRouter.post('/issue', async (req: Request, res: Response) => {
  try {
    const request = req.body as IssueCredentialRequest;
    if (!request.schemaId || !request.subject || !request.issuerDid) {
      res.status(400).json({ error: 'Missing required fields: schemaId, subject, issuerDid' });
      return;
    }
    const credential = await issuer.issueCredential(request);
    res.status(201).json({ credential });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(400).json({ error: message });
  }
});

credentialRouter.post('/issue/batch', async (req: Request, res: Response) => {
  try {
    const { requests } = req.body as { requests: IssueCredentialRequest[] };
    if (!requests || !Array.isArray(requests)) {
      res.status(400).json({ error: 'Missing required field: requests (array)' });
      return;
    }
    const credentials = await issuer.issueBatch(requests);
    res.status(201).json({ count: credentials.length, credentials });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(400).json({ error: message });
  }
});

credentialRouter.post('/verify', async (req: Request, res: Response) => {
  try {
    const { credential } = req.body;
    if (!credential) {
      res.status(400).json({ error: 'Missing required field: credential' });
      return;
    }
    const result = await issuer.verifyCredential(credential);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

credentialRouter.get('/status/:credentialId', async (req: Request, res: Response) => {
  try {
    const status = await issuer.getCredentialStatus(req.params.credentialId);
    res.json({ credentialId: req.params.credentialId, status });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

credentialRouter.post('/revoke', async (req: Request, res: Response) => {
  try {
    const { credentialId } = req.body;
    if (!credentialId) {
      res.status(400).json({ error: 'Missing required field: credentialId' });
      return;
    }
    await issuer.revokeCredential(credentialId);
    res.json({ status: 'revoked', credentialId });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

credentialRouter.post('/suspend', async (req: Request, res: Response) => {
  try {
    const { credentialId } = req.body;
    if (!credentialId) {
      res.status(400).json({ error: 'Missing required field: credentialId' });
      return;
    }
    await issuer.suspendCredential(credentialId);
    res.json({ status: 'suspended', credentialId });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

credentialRouter.post('/unsuspend', async (req: Request, res: Response) => {
  try {
    const { credentialId } = req.body;
    if (!credentialId) {
      res.status(400).json({ error: 'Missing required field: credentialId' });
      return;
    }
    await issuer.unsuspendCredential(credentialId);
    res.json({ status: 'unsuspended', credentialId });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});
