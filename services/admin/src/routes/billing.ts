import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';

const router = Router();

const UsageRecordSchema = z.object({
  customerId: z.string().uuid(),
  meterName: z.enum([
    'api_calls', 'verifications', 'ai_inferences',
    'storage_bytes', 'compute_seconds', 'zkp_proofs',
  ]),
  quantity: z.number().positive(),
  timestamp: z.string().datetime().optional(),
  idempotencyKey: z.string().uuid(),
});

const InvoiceSchema = z.object({
  customerId: z.string().uuid(),
  periodStart: z.string(),
  periodEnd: z.string(),
  items: z.array(z.object({
    description: z.string(),
    quantity: z.number(),
    unitPrice: z.string(),
    total: z.string(),
  })),
});

const CreditSchema = z.object({
  customerId: z.string().uuid(),
  amount: z.string(),
  currency: z.string().length(3).default('USD'),
  reason: z.string().max(500),
  idempotencyKey: z.string().uuid(),
});

interface UsageRecord {
  recordId: string;
  customerId: string;
  meterName: string;
  quantity: number;
  timestamp: string;
  billedAmount: string;
}

interface Invoice {
  invoiceId: string;
  customerId: string;
  status: string;
  periodStart: string;
  periodEnd: string;
  lineItems: Array<{
    description: string;
    quantity: number;
    unitPrice: string;
    total: string;
  }>;
  subtotal: string;
  tax: string;
  total: string;
  currency: string;
  dueDate: string;
  pdfUrl?: string;
}

interface CreditBalance {
  customerId: string;
  availableCredits: string;
  pendingCredits: string;
  totalCreditsUsed: string;
  currency: string;
  lastUpdated: string;
}

router.post('/usage', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = UsageRecordSchema.parse(req.body);
    const recordId = randomUUID();

    const rates: Record<string, string> = {
      api_calls: '0.0001',
      verifications: '0.50',
      ai_inferences: '0.05',
      storage_bytes: '0.000001',
      compute_seconds: '0.0001',
      zkp_proofs: '0.10',
    };

    const unitPrice = rates[input.meterName] || '0.00';
    const billedAmount = (parseFloat(unitPrice) * input.quantity).toFixed(6);

    const record: UsageRecord = {
      recordId,
      customerId: input.customerId,
      meterName: input.meterName,
      quantity: input.quantity,
      timestamp: input.timestamp || new Date().toISOString(),
      billedAmount,
    };

    res.status(201).json({ success: true, data: record });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, error: 'Validation failed', details: error.errors });
      return;
    }
    next(error);
  }
});

router.get('/usage/:customerId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { customerId } = req.params;
    const { startDate, endDate, meterName } = req.query;

    const usage: UsageRecord[] = [
      {
        recordId: randomUUID(),
        customerId,
        meterName: (meterName as string) || 'api_calls',
        quantity: 1500,
        timestamp: new Date().toISOString(),
        billedAmount: '0.15',
      },
    ];

    res.json({ success: true, data: usage, params: { startDate, endDate, meterName } });
  } catch (error) {
    next(error);
  }
});

router.post('/invoices', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = InvoiceSchema.parse(req.body);
    const invoiceId = `INV-${randomUUID().substring(0, 8).toUpperCase()}`;

    const subtotal = input.items.reduce((acc, item) => acc + parseFloat(item.total), 0);
    const tax = subtotal * 0.0;
    const total = subtotal + tax;

    const invoice: Invoice = {
      invoiceId,
      customerId: input.customerId,
      status: 'pending',
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      lineItems: input.items,
      subtotal: subtotal.toFixed(2),
      tax: tax.toFixed(2),
      total: total.toFixed(2),
      currency: 'USD',
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      pdfUrl: `https://billing.kyc-vault.com/invoices/${invoiceId}.pdf`,
    };

    res.status(201).json({ success: true, data: invoice });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, error: 'Validation failed', details: error.errors });
      return;
    }
    next(error);
  }
});

router.get('/invoices/:customerId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { customerId } = req.params;
    const invoices: Invoice[] = [
      {
        invoiceId: 'INV-001',
        customerId,
        status: 'paid',
        periodStart: '2026-04-01T00:00:00Z',
        periodEnd: '2026-04-30T23:59:59Z',
        lineItems: [
          { description: 'KYC Verifications (500)', quantity: 500, unitPrice: '0.50', total: '250.00' },
          { description: 'API Access - Professional', quantity: 1, unitPrice: '499.00', total: '499.00' },
        ],
        subtotal: '749.00',
        tax: '0.00',
        total: '749.00',
        currency: 'USD',
        dueDate: '2026-05-15T00:00:00Z',
      },
    ];
    res.json({ success: true, data: invoices });
  } catch (error) {
    next(error);
  }
});

router.post('/credits', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = CreditSchema.parse(req.body);
    const creditId = `CR-${randomUUID().substring(0, 8).toUpperCase()}`;
    res.status(201).json({
      success: true,
      data: {
        creditId,
        customerId: input.customerId,
        amount: input.amount,
        currency: input.currency,
        reason: input.reason,
        status: 'applied',
        appliedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, error: 'Validation failed', details: error.errors });
      return;
    }
    next(error);
  }
});

router.get('/credits/:customerId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { customerId } = req.params;
    const balance: CreditBalance = {
      customerId,
      availableCredits: '250.00',
      pendingCredits: '50.00',
      totalCreditsUsed: '1200.00',
      currency: 'USD',
      lastUpdated: new Date().toISOString(),
    };
    res.json({ success: true, data: balance });
  } catch (error) {
    next(error);
  }
});

router.get('/tiers', async (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: [
      { id: 'free', name: 'Free', monthlyPrice: '0', verifications: 100, apiCallsPerMonth: 1000, storageGb: 1 },
      { id: 'starter', name: 'Starter', monthlyPrice: '99', verifications: 1000, apiCallsPerMonth: 50000, storageGb: 10 },
      { id: 'professional', name: 'Professional', monthlyPrice: '499', verifications: 10000, apiCallsPerMonth: 500000, storageGb: 100 },
      { id: 'enterprise', name: 'Enterprise', monthlyPrice: 'custom', verifications: -1, apiCallsPerMonth: -1, storageGb: -1 },
    ],
  });
});

export default router;
