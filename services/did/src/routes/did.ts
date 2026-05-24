import { Router } from 'express';
import { DIDResolver, DIDDocument } from '@kyc-vault/did';

const router = Router();
const resolver = new DIDResolver();

router.get('/resolve/:did', async (req, res) => {
  try {
    const doc = await resolver.resolve(req.params.did);
    res.json(doc);
  } catch (err) {
    res.status(400).json({
      error: 'ResolutionFailed',
      message: (err as Error).message,
    });
  }
});

router.post('/resolve/batch', async (req, res) => {
  const { dids } = req.body as { dids: string[] };
  if (!Array.isArray(dids)) {
    return res.status(400).json({ error: 'InvalidRequest', message: 'dids must be an array' });
  }

  const results = await Promise.allSettled(
    dids.map(async (did) => ({
      did,
      doc: await resolver.resolve(did),
    })),
  );

  res.json({
    results: results.map((r) =>
      r.status === 'fulfilled' ? r.value : { error: (r.reason as Error).message }
    ),
  });
});

export default router;
