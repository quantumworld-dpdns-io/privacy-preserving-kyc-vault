import type {
  BillingInvoiceCreatedEvent,
  BillingPaymentProcessedEvent,
} from '../event_types.js';
import type { EventHandler } from '../event_bus.js';

export type BillingEvent = BillingInvoiceCreatedEvent | BillingPaymentProcessedEvent;

const billingHandlers: Record<string, EventHandler<BillingEvent>> = {
  'billing:invoice:created': async (event: BillingInvoiceCreatedEvent) => {
    const { invoiceId, tenantId, amount, currency, plan } = event.payload;
    console.log(`[BillingHandler] Invoice ${invoiceId} created for ${tenantId}: ${amount} ${currency} (${plan})`);
  },
  'billing:payment:processed': async (event: BillingPaymentProcessedEvent) => {
    const { invoiceId, transactionId, amount, currency, status, paymentMethod } = event.payload;
    if (status === 'failed') {
      console.error(`[BillingHandler] Payment failed for invoice ${invoiceId}: ${amount} ${currency} via ${paymentMethod} (txn: ${transactionId})`);
    } else {
      console.log(`[BillingHandler] Payment ${status} for invoice ${invoiceId}: ${amount} ${currency} via ${paymentMethod} (txn: ${transactionId})`);
    }
  },
};

export function getBillingHandler(type: string): EventHandler<BillingEvent> | undefined {
  return billingHandlers[type];
}

export function getBillingHandlerTypes(): string[] {
  return Object.keys(billingHandlers);
}

export const handleBillingEvent: EventHandler<BillingEvent> = async (event) => {
  const handler = billingHandlers[event.type];
  if (handler) {
    await handler(event);
  }
};
