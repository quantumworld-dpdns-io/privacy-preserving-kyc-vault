import { Router, Request, Response } from 'express';
import { prover } from './prover.js';
import { verifier } from './verifier.js';
import { loadConfig } from './config.js';

const config = loadConfig();

export const zkpRouter = Router();

zkpRouter.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'zkp-engine' });
});

zkpRouter.get('/circuits', (_req: Request, res: Response) => {
  const circuits = prover.listCircuits();
  res.json({ count: circuits.length, circuits });
});

zkpRouter.get('/circuits/:circuitId', (req: Request, res: Response) => {
  const circuit = prover.getCircuit(req.params.circuitId);
  if (!circuit) {
    res.status(404).json({ error: `Circuit ${req.params.circuitId} not found` });
    return;
  }
  res.json({ circuit });
});

zkpRouter.post('/prove', async (req: Request, res: Response) => {
  try {
    const { circuitId, publicInputs, privateInputs } = req.body;
    if (!circuitId || !publicInputs || !privateInputs) {
      res.status(400).json({ error: 'Missing required fields: circuitId, publicInputs, privateInputs' });
      return;
    }
    const result = await prover.generateProof({ circuitId, publicInputs, privateInputs });
    res.status(201).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(400).json({ error: message });
  }
});

zkpRouter.post('/prove/batch', async (req: Request, res: Response) => {
  try {
    const { requests } = req.body;
    if (!requests || !Array.isArray(requests)) {
      res.status(400).json({ error: 'Missing required field: requests (array)' });
      return;
    }
    const results = await prover.generateProofBatch(requests);
    res.status(201).json({ count: results.length, results });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(400).json({ error: message });
  }
});

zkpRouter.post('/verify', async (req: Request, res: Response) => {
  try {
    const { circuitId, proof, publicInputs } = req.body;
    if (!circuitId || !proof) {
      res.status(400).json({ error: 'Missing required fields: circuitId, proof' });
      return;
    }
    const result = await verifier.verifyProof({ circuitId, proof, publicInputs: publicInputs || [] });
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(400).json({ error: message });
  }
});

zkpRouter.post('/verify/batch', async (req: Request, res: Response) => {
  try {
    const { requests } = req.body;
    if (!requests || !Array.isArray(requests)) {
      res.status(400).json({ error: 'Missing required field: requests (array)' });
      return;
    }
    const results = await verifier.verifyBatch(requests);
    res.json({ count: results.length, results });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(400).json({ error: message });
  }
});
