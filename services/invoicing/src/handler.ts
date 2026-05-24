import { Router, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { generateInvoicePdf } from './generator.js';

export const invoiceRouter = Router();

interface InvoiceRequest {
  customerId: string;
  customerName: string;
  customerEmail: string;
  billingAddress: {
    line1: string;
    line2?: string;
    city: string;
    state?: string;
    postalCode?: string;
    country: string;
  };
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: string;
    total: string;
  }>;
  subtotal: string;
  tax: string;
  taxRate: string;
  total: string;
  currency: string;
  dueDate?: string;
  metadata?: Record<string, unknown>;
}

interface InvoiceResponse {
  invoiceId: string;
  status: string;
  customerId: string;
  total: string;
  currency: string;
  pdfUrl?: string;
  createdAt: string;
  dueDate: string;
}

const invoices = new Map<string, InvoiceResponse & { pdfBase64?: string }>();

invoiceRouter.post('/create', async (req: Request, res: Response) => {
  try {
    const input = req.body as InvoiceRequest;
    if (!input.customerId || !input.items?.length || !input.total) {
      res.status(400).json({ error: 'Missing required fields: customerId, items, total' });
      return;
    }

    const invoiceId = `INV-${randomUUID().substring(0, 8).toUpperCase()}`;
    const createdAt = new Date().toISOString();
    const dueDate = input.dueDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const pdfBase64 = await generateInvoicePdf({
      invoiceId,
      customerName: input.customerName,
      customerEmail: input.customerEmail,
      billingAddress: input.billingAddress,
      items: input.items,
      subtotal: input.subtotal,
      tax: input.tax,
      taxRate: input.taxRate,
      total: input.total,
      currency: input.currency,
      createdAt,
      dueDate,
    });

    const invoice: InvoiceResponse & { pdfBase64?: string } = {
      invoiceId,
      status: 'pending',
      customerId: input.customerId,
      total: input.total,
      currency: input.currency || 'USD',
      pdfUrl: `https://billing.kyc-vault.com/invoices/${invoiceId}.pdf`,
      createdAt,
      dueDate,
      pdfBase64,
    };

    invoices.set(invoiceId, invoice);
    res.status(201).json({
      invoiceId: invoice.invoiceId,
      status: invoice.status,
      customerId: invoice.customerId,
      total: invoice.total,
      currency: invoice.currency,
      pdfUrl: invoice.pdfUrl,
      createdAt: invoice.createdAt,
      dueDate: invoice.dueDate,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

invoiceRouter.get('/:invoiceId', async (req: Request, res: Response) => {
  const invoice = invoices.get(req.params.invoiceId);
  if (!invoice) {
    res.status(404).json({ error: 'Invoice not found' });
    return;
  }
  res.json(invoice);
});

invoiceRouter.get('/:invoiceId/pdf', async (req: Request, res: Response) => {
  const invoice = invoices.get(req.params.invoiceId);
  if (!invoice || !invoice.pdfBase64) {
    res.status(404).json({ error: 'Invoice PDF not found' });
    return;
  }
  res.json({ pdfBase64: invoice.pdfBase64 });
});

invoiceRouter.patch('/:invoiceId/status', async (req: Request, res: Response) => {
  const invoice = invoices.get(req.params.invoiceId);
  if (!invoice) {
    res.status(404).json({ error: 'Invoice not found' });
    return;
  }
  const { status } = req.body as { status: string };
  invoice.status = status;
  invoices.set(req.params.invoiceId, invoice);
  res.json(invoice);
});

invoiceRouter.get('/', async (_req: Request, res: Response) => {
  res.json(Array.from(invoices.values()).map(({ pdfBase64, ...rest }) => rest));
});
