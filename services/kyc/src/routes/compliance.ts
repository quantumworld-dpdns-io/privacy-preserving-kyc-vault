import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AuditService } from '../services/audit_service.js';

const router = Router();
const auditService = new AuditService();

const AuditQuerySchema = z.object({
  action: z.string().optional(),
  severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  actorId: z.string().optional(),
  resourceType: z.string().optional(),
  resourceId: z.string().optional(),
  success: z.coerce.boolean().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const ReportSchema = z.object({
  reportType: z.enum(['access_logs', 'verification_summary', 'user_activity', 'system_changes', 'compliance_summary']),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  format: z.enum(['json', 'csv']).default('json'),
  filters: z.record(z.unknown()).optional(),
});

const DataExportSchema = z.object({
  resourceType: z.enum(['audit_logs', 'kyc_workflows', 'credentials', 'users']),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  format: z.enum(['json', 'csv']).default('json'),
  reason: z.string().min(1).max(500),
  requestor: z.string().min(1),
});

router.get('/audit-logs', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = AuditQuerySchema.parse(req.query);
    const result = await auditService.query(query);
    res.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, error: 'Validation failed', details: error.errors });
      return;
    }
    next(error);
  }
});

router.get('/audit-logs/:auditId', async (req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      auditId: req.params.auditId,
      message: 'Audit log detail endpoint',
    },
  });
});

router.post('/audit-logs/verify-chain', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const integrity = await auditService.verifyChainIntegrity();
    res.json({ success: true, data: integrity });
  } catch (error) {
    next(error);
  }
});

router.post('/reports', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = ReportSchema.parse(req.body);
    const reportId = `rpt-${crypto.randomUUID().substring(0, 8)}`;

    const report = {
      reportId,
      reportType: input.reportType,
      generatedAt: new Date().toISOString(),
      period: { start: input.startDate, end: input.endDate },
      generatedBy: 'system',
      summary: {
        totalEvents: 1247,
        totalUsers: 89,
        totalCredentials: 342,
        totalVerifications: 567,
      },
      status: 'completed',
      downloadUrl: `https://compliance.kyc-vault.com/reports/${reportId}.${input.format}`,
      format: input.format,
    };

    res.status(201).json({ success: true, data: report });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, error: 'Validation failed', details: error.errors });
      return;
    }
    next(error);
  }
});

router.get('/reports/:reportId', async (req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      reportId: req.params.reportId,
      status: 'completed',
      createdAt: new Date().toISOString(),
      downloadUrl: `https://compliance.kyc-vault.com/reports/${req.params.reportId}.json`,
    },
  });
});

router.post('/data-export', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = DataExportSchema.parse(req.body);
    const exportId = `exp-${crypto.randomUUID().substring(0, 8)}`;

    const exportRecord = {
      exportId,
      resourceType: input.resourceType,
      requestedAt: new Date().toISOString(),
      status: 'processing',
      estimatedSize: '2.4 MB',
      retentionDays: 30,
      reason: input.reason,
      requestor: input.requestor,
      downloadUrl: `https://compliance.kyc-vault.com/exports/${exportId}.${input.format}`,
    };

    res.status(201).json({ success: true, data: exportRecord });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, error: 'Validation failed', details: error.errors });
      return;
    }
    next(error);
  }
});

router.get('/exports/:exportId', async (req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      exportId: req.params.exportId,
      status: 'completed',
      createdAt: new Date().toISOString(),
      downloadUrl: `https://compliance.kyc-vault.com/exports/${req.params.exportId}.json`,
    },
  });
});

export default router;
