import { randomUUID } from 'node:crypto';
import { BillingTier, UsageRecord, Invoice, InvoiceLineItem } from '../types/index.js';

const RATES: Record<string, string> = {
  api_calls: '0.0001',
  verifications: '0.50',
  ai_inferences: '0.05',
  storage_bytes: '0.000001',
  compute_seconds: '0.0001',
  zkp_proofs: '0.10',
};

const TIERS: BillingTier[] = [
  { id: 'free', name: 'Free', monthlyPrice: '0', verifications: 100, apiCallsPerMonth: 1000, storageGb: 1, features: ['basic_kyc', 'email_support'] },
  { id: 'starter', name: 'Starter', monthlyPrice: '99', verifications: 1000, apiCallsPerMonth: 50000, storageGb: 10, features: ['basic_kyc', 'enhanced_kyc', 'email_support'] },
  { id: 'professional', name: 'Professional', monthlyPrice: '499', verifications: 10000, apiCallsPerMonth: 500000, storageGb: 100, features: ['basic_kyc', 'enhanced_kyc', 'enterprise_kyc', 'ai_verification', 'priority_support'] },
  { id: 'enterprise', name: 'Enterprise', monthlyPrice: 'custom', verifications: -1, apiCallsPerMonth: -1, storageGb: -1, features: ['all_features', 'dedicated_support', 'custom_sla', 'on_premise'] },
];

export interface MeterUsageInput {
  customerId: string;
  meterName: string;
  quantity: number;
  idempotencyKey: string;
}

export interface CreateInvoiceInput {
  customerId: string;
  periodStart: string;
  periodEnd: string;
  items: InvoiceLineItem[];
}

export interface CreditInput {
  customerId: string;
  amount: string;
  currency: string;
  reason: string;
  idempotencyKey: string;
}

export class BillingService {
  private usageStore = new Map<string, UsageRecord[]>();
  private invoiceStore = new Map<string, Invoice[]>();
  private creditStore = new Map<string, { available: number; pending: number; used: number }>();

  async recordUsage(input: MeterUsageInput): Promise<UsageRecord> {
    const unitPrice = RATES[input.meterName] || '0.00';
    const billedAmount = (parseFloat(unitPrice) * input.quantity).toFixed(6);

    const record: UsageRecord = {
      recordId: randomUUID(),
      customerId: input.customerId,
      meterName: input.meterName,
      quantity: input.quantity,
      timestamp: new Date().toISOString(),
      billedAmount,
    };

    const records = this.usageStore.get(input.customerId) || [];
    records.push(record);
    this.usageStore.set(input.customerId, records);

    return record;
  }

  async getUsage(customerId: string, startDate?: string, endDate?: string, meterName?: string): Promise<UsageRecord[]> {
    let records = this.usageStore.get(customerId) || [];

    if (startDate) {
      records = records.filter((r) => r.timestamp >= startDate);
    }
    if (endDate) {
      records = records.filter((r) => r.timestamp <= endDate);
    }
    if (meterName) {
      records = records.filter((r) => r.meterName === meterName);
    }

    return records;
  }

  async createInvoice(input: CreateInvoiceInput): Promise<Invoice> {
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

    const invoices = this.invoiceStore.get(input.customerId) || [];
    invoices.push(invoice);
    this.invoiceStore.set(input.customerId, invoices);

    return invoice;
  }

  async getInvoices(customerId: string): Promise<Invoice[]> {
    return this.invoiceStore.get(customerId) || [];
  }

  async addCredits(input: CreditInput): Promise<{ creditId: string; status: string }> {
    const balances = this.creditStore.get(input.customerId) || { available: 0, pending: 0, used: 0 };
    balances.available += parseFloat(input.amount);
    this.creditStore.set(input.customerId, balances);

    return {
      creditId: `CR-${randomUUID().substring(0, 8).toUpperCase()}`,
      status: 'applied',
    };
  }

  async getCreditBalance(customerId: string): Promise<{ availableCredits: string; pendingCredits: string; totalCreditsUsed: string; currency: string }> {
    const balances = this.creditStore.get(customerId) || { available: 0, pending: 0, used: 0 };

    return {
      availableCredits: balances.available.toFixed(2),
      pendingCredits: balances.pending.toFixed(2),
      totalCreditsUsed: balances.used.toFixed(2),
      currency: 'USD',
    };
  }

  async getTiers(): Promise<BillingTier[]> {
    return TIERS;
  }

  async getTier(id: string): Promise<BillingTier | undefined> {
    return TIERS.find((t) => t.id === id);
  }
}
