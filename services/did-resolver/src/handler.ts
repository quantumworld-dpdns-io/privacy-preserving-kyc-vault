import { Router, Request, Response } from 'express';
import { DIDResolver, DIDError, parseDID, DIDMethod } from '@kyc-vault/did';
import { loadConfig } from './config.js';

const config = loadConfig();
const resolver = new DIDResolver(config.cache.ttlMs);

export const didRouter = Router();

didRouter.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'did-resolver' });
});

didRouter.get('/resolve/:did', async (req: Request, res: Response) => {
  try {
    const did = req.params.did.startsWith('did:') ? req.params.did : `did:${req.params.did}`;
    const document = await resolver.resolve(did);
    res.json({ did, document: document.toJSON(), resolvedAt: new Date().toISOString() });
  } catch (err) {
    if (err instanceof DIDError) {
      res.status(400).json({ error: err.message, code: err.code });
    } else {
      res.status(500).json({ error: 'Internal resolution error' });
    }
  }
});

didRouter.get('/dids/:method/:id', async (req: Request, res: Response) => {
  try {
    const did = `did:${req.params.method}:${req.params.id}`;
    const parsed = parseDID(did);
    const document = await resolver.resolve(did);
    res.json({ did, method: parsed.method, document: document.toJSON() });
  } catch (err) {
    if (err instanceof DIDError) {
      res.status(400).json({ error: err.message, code: err.code });
    } else {
      res.status(500).json({ error: 'Internal resolution error' });
    }
  }
});

didRouter.get('/methods', (_req: Request, res: Response) => {
  const methods = config.methodRegistry.map((entry) => ({
    method: entry.method,
    local: entry.local,
  }));
  res.json({ methods });
});

didRouter.get('/methods/:method', (req: Request, res: Response) => {
  const method = req.params.method as DIDMethod;
  const entry = config.methodRegistry.find((m) => m.method === method);
  if (!entry) {
    res.status(404).json({ error: `Unsupported DID method: ${method}` });
    return;
  }
  res.json({ method: entry.method, local: entry.local, resolverUrl: entry.resolverUrl });
});

didRouter.post('/cache/clear', (_req: Request, res: Response) => {
  resolver.clearCache();
  res.json({ status: 'cache cleared' });
});

didRouter.post('/cache/invalidate', (req: Request, res: Response) => {
  const { did } = req.body;
  if (!did || typeof did !== 'string') {
    res.status(400).json({ error: 'Missing required field: did' });
    return;
  }
  resolver.invalidateCache(did);
  res.json({ status: 'cache invalidated', did });
});
