import { Router } from 'express';
import { DIDResolver, DIDDocument } from '@kyc-vault/did';
import * as db from '../utils/db.js';
import { validateSchema, JSONSchema } from '@privacy-preserving-kyc-vault/core';

const router = Router();
const resolver = new DIDResolver();

const DID_REGISTRATION_SCHEMA: JSONSchema = {
  type: 'object',
  required: ['did', 'document'],
  properties: {
    did: { type: 'string', pattern: '^did:[a-z0-9]+:[a-zA-Z0-9._%-]+(:[a-zA-Z0-9._%-]+)*$' },
    document: {
      type: 'object',
      required: ['id', 'verificationMethod'],
      properties: {
        id: { type: 'string' },
        verificationMethod: { type: 'array', minItems: 1 },
      },
    },
  },
};

router.get('/resolve/:did', async (req, res) => {
  try {
    // Check local registry first
    const { rows } = await db.query(
      'SELECT document_json FROM did_registry WHERE did = $1 AND status = $2',
      [req.params.did, 'active']
    );

    if (rows.length > 0) {
      return res.json(rows[0].document_json);
    }

    // Fallback to external resolution
    const doc = await resolver.resolve(req.params.did);
    res.json(doc);
  } catch (err) {
    res.status(400).json({
      error: 'ResolutionFailed',
      message: (err as Error).message,
    });
  }
});

router.post('/register', async (req, res) => {
  const validation = validateSchema(req.body, DID_REGISTRATION_SCHEMA);
  if (!validation.valid) {
    return res.status(400).json({
      error: 'ValidationError',
      message: 'Schema validation failed',
      details: validation.errors,
    });
  }

  const { did, document } = req.body as { did: string; document: DIDDocument };

  const parts = did.split(':');
  const method = parts[1];
  const methodSpecificId = parts.slice(2).join(':');

  try {
    await db.query(
      'INSERT INTO did_registry (did, document_json, method, method_specific_id) VALUES ($1, $2, $3, $4)',
      [did, JSON.stringify(document), method, methodSpecificId]
    );
    res.status(201).json({ did, status: 'active' });
  } catch (err) {
    res.status(500).json({
      error: 'RegistrationFailed',
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
    dids.map(async (did) => {
      const { rows } = await db.query(
        'SELECT document_json FROM did_registry WHERE did = $1 AND status = $2',
        [did, 'active']
      );
      if (rows.length > 0) {
        return { did, doc: rows[0].document_json };
      }
      return {
        did,
        doc: await resolver.resolve(did),
      };
    }),
  );

  res.json({
    results: results.map((r) =>
      r.status === 'fulfilled' ? r.value : { error: (r.reason as Error).message }
    ),
  });
});

router.delete('/:did', async (req, res) => {
  try {
    const result = await db.query(
      'UPDATE did_registry SET status = $1, updated_at = NOW() WHERE did = $2',
      ['deactivated', req.params.did]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'NotFound', message: 'DID not found in registry' });
    }

    res.status(204).send();
  } catch (err) {
    res.status(500).json({
      error: 'DeactivationFailed',
      message: (err as Error).message,
    });
  }
});

export default router;
