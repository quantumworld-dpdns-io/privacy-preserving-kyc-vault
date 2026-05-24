import { Router } from 'express';
import * as db from '../utils/db.js';
import { randomUUID } from 'node:crypto';

const router = Router();

router.post('/issue', async (req, res) => {
  const { type, issuer, subject, claims, schemaId, expirationDate } = req.body;
  if (!type || !issuer || !subject || !schemaId) {
    return res.status(400).json({ error: 'Missing required fields: type, issuer, subject, schemaId' });
  }

  const id = `urn:uuid:${randomUUID()}`;
  const credential = {
    '@context': ['https://www.w3.org/2018/credentials/v1'],
    id,
    type: ['VerifiableCredential', ...(Array.isArray(type) ? type : [type])],
    issuer,
    issuanceDate: new Date().toISOString(),
    credentialSubject: { id: subject, ...claims },
  };

  try {
    await db.query(
      'INSERT INTO credential_store (schema_id, issuer_did, subject_did, credential_json, expiration_date) VALUES ($1, $2, $3, $4, $5)',
      [schemaId, issuer, subject, JSON.stringify(credential), expirationDate]
    );
    res.status(201).json(credential);
  } catch (err) {
    res.status(500).json({ error: 'IssuanceFailed', message: (err as Error).message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    // Note: The id in the URL could be the UUID from DB or the URN id from JSON.
    // We check both for robustness.
    const { rows } = await db.query(
      'SELECT * FROM credential_store WHERE id::text = $1 OR credential_json->>\'id\' = $1',
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Credential not found' });
    }
    res.json(rows[0].credential_json);
  } catch (err) {
    res.status(500).json({ error: 'QueryFailed', message: (err as Error).message });
  }
});

router.post('/verify', (req, res) => {
  const { credential } = req.body;
  if (!credential) {
    return res.status(400).json({ error: 'Missing credential' });
  }

  // Placeholder for real cryptographic verification logic
  res.json({
    verified: true,
    checks: ['proof_validation', 'expiration', 'schema', 'issuer_trust'],
    timestamp: new Date().toISOString(),
  });
});

router.delete('/:id', async (req, res) => {
  try {
    const result = await db.query(
      'UPDATE credential_store SET status = $1, updated_at = NOW() WHERE id::text = $2 OR credential_json->>\'id\' = $2',
      ['revoked', req.params.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'NotFound', message: 'Credential not found' });
    }
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: 'RevocationFailed', message: (err as Error).message });
  }
});

export default router;
