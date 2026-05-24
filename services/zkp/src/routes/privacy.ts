import { Router } from 'express';
import { z } from 'zod';
import {
  CreateConsentSchema,
  RevokeConsentSchema,
  CreateDeletionRequestSchema,
  DataExportRequestSchema,
} from '../validators/privacy_schemas.js';
import { requirePermission } from '../middleware/auth.js';

const router = Router();

const consentStore = new Map<string, any>();
const deletionStore = new Map<string, any>();
const exportStore = new Map<string, any>();

router.post('/consent', async (req, res) => {
  try {
    const body = CreateConsentSchema.parse(req.body);
    const id = `consent-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const record = {
      id,
      userId: body.userId,
      purpose: body.purpose,
      scope: body.scope,
      granted: true,
      timestamp: new Date().toISOString(),
      expiresAt: body.expiresAt ?? null,
    };
    consentStore.set(id, record);
    res.status(201).json(record);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        error: 'ValidationError',
        details: err.errors,
      });
    }
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/consent/:userId', async (req, res) => {
  const records = Array.from(consentStore.values()).filter(
    (r) => r.userId === req.params.userId,
  );
  res.json({ data: records, total: records.length });
});

router.post('/consent/revoke', async (req, res) => {
  try {
    const body = RevokeConsentSchema.parse(req.body);
    const record = consentStore.get(body.consentId);
    if (!record) {
      return res.status(404).json({ error: 'Consent not found' });
    }
    record.granted = false;
    record.revokedAt = new Date().toISOString();
    consentStore.set(body.consentId, record);
    res.json(record);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        error: 'ValidationError',
        details: err.errors,
      });
    }
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/deletion/request', async (req, res) => {
  try {
    const body = CreateDeletionRequestSchema.parse(req.body);
    const id = `deletion-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const request = {
      id,
      userId: body.userId,
      scope: body.scope,
      status: 'pending',
      requestedAt: new Date().toISOString(),
    };
    deletionStore.set(id, request);
    res.status(201).json(request);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        error: 'ValidationError',
        details: err.errors,
      });
    }
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/deletion/status/:requestId', async (req, res) => {
  const request = deletionStore.get(req.params.requestId);
  if (!request) {
    return res.status(404).json({ error: 'Deletion request not found' });
  }
  res.json(request);
});

router.post('/deletion/verify/:requestId', async (req, res) => {
  const request = deletionStore.get(req.params.requestId);
  if (!request) {
    return res.status(404).json({ error: 'Deletion request not found' });
  }
  request.status = 'verified';
  request.verifiedAt = new Date().toISOString();
  deletionStore.set(req.params.requestId, request);
  res.json({ verified: true, request });
});

router.post('/export', async (req, res) => {
  try {
    const body = DataExportRequestSchema.parse(req.body);
    const id = `export-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const exportRecord = {
      id,
      userId: body.userId,
      categories: body.categories,
      format: body.format ?? 'json',
      createdAt: new Date().toISOString(),
      data: body.data ?? {},
    };
    exportStore.set(id, exportRecord);

    let result: string | Buffer;
    let contentType: string;
    switch (body.format) {
      case 'csv':
        result = toCsv(exportRecord.data);
        contentType = 'text/csv';
        break;
      case 'cbor':
        result = Buffer.from(JSON.stringify(exportRecord.data), 'utf-8');
        contentType = 'application/cbor';
        break;
      default:
        result = JSON.stringify(exportRecord.data, null, 2);
        contentType = 'application/json';
    }

    res.status(201).json({
      exportId: id,
      format: body.format ?? 'json',
      contentType,
      size: Buffer.byteLength(result, 'utf-8'),
      data: result,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        error: 'ValidationError',
        details: err.errors,
      });
    }
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/export/:userId', async (req, res) => {
  const exports = Array.from(exportStore.values()).filter(
    (e) => e.userId === req.params.userId,
  );
  res.json({ data: exports, total: exports.length });
});

router.delete('/export/:exportId', requirePermission('delete', 'privacy:data'), async (req, res) => {
  const removed = exportStore.delete(req.params.exportId);
  if (!removed) {
    return res.status(404).json({ error: 'Export not found' });
  }
  res.status(204).send();
});

function toCsv(data: Record<string, any>): string {
  const rows: string[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'object' && item !== null) {
          rows.push(Object.values(item).join(','));
        } else {
          rows.push(`${key},${item}`);
        }
      }
    } else {
      rows.push(`${key},${value}`);
    }
  }
  return rows.join('\n');
}

export default router;
