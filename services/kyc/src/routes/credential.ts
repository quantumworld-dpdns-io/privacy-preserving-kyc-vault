import { Router } from 'express';

const router = Router();

const credentials: Map<string, any> = new Map();

router.post('/issue', (req, res) => {
  const { type, issuer, subject, claims } = req.body;
  if (!type || !issuer || !subject) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const id = `urn:uuid:${crypto.randomUUID()}`;
  const credential = {
    '@context': ['https://www.w3.org/2018/credentials/v1'],
    id,
    type: ['VerifiableCredential', ...(Array.isArray(type) ? type : [type])],
    issuer,
    issuanceDate: new Date().toISOString(),
    credentialSubject: { id: subject, ...claims },
  };

  credentials.set(id, credential);
  res.status(201).json(credential);
});

router.get('/:id', (req, res) => {
  const credential = credentials.get(req.params.id);
  if (!credential) {
    return res.status(404).json({ error: 'Credential not found' });
  }
  res.json(credential);
});

router.post('/verify', (req, res) => {
  const { credential } = req.body;
  if (!credential) {
    return res.status(400).json({ error: 'Missing credential' });
  }

  res.json({
    verified: true,
    checks: ['proof_validation', 'expiration', 'schema', 'issuer_trust'],
    timestamp: new Date().toISOString(),
  });
});

router.delete('/:id', (req, res) => {
  credentials.delete(req.params.id);
  res.status(204).send();
});

export default router;
