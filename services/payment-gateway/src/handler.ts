import { Router, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { loadConfig } from './config.js';

const config = loadConfig();
const idempotencyStore = new Map<string, { result: unknown; expiresAt: number }>();

export const paymentRouter = Router();

interface PaymentRequest {
  amount: string;
  currency: string;
  customerId?: string;
  customerEmail?: string;
  description?: string;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string;
}

interface PaymentResponse {
  paymentId: string;
  gateway: string;
  status: string;
  amount: string;
  currency: string;
  transactionHash?: string;
  gatewayReference?: string;
  clientSecret?: string;
  createdAt: string;
}

function checkIdempotency(key: string): { result: unknown; isReplay: boolean } {
  const existing = idempotencyStore.get(key);
  if (existing && existing.expiresAt > Date.now()) {
    return { result: existing.result, isReplay: true };
  }
  return { result: null, isReplay: false };
}

function storeIdempotency(key: string, result: unknown): void {
  idempotencyStore.set(key, { result, expiresAt: Date.now() + config.idempotencyTtlMs });
}

async function processStripePayment(req: PaymentRequest): Promise<PaymentResponse> {
  const paymentId = randomUUID();
  return {
    paymentId,
    gateway: 'stripe',
    status: 'succeeded',
    amount: req.amount,
    currency: req.currency,
    gatewayReference: `pi_${paymentId.replace(/-/g, '').substring(0, 16)}`,
    clientSecret: `${paymentId}_secret_${randomUUID().substring(0, 8)}`,
    createdAt: new Date().toISOString(),
  };
}

async function processUsdcPayment(req: PaymentRequest): Promise<PaymentResponse> {
  const paymentId = randomUUID();
  return {
    paymentId,
    gateway: 'usdc',
    status: 'pending',
    amount: req.amount,
    currency: 'USDC',
    transactionHash: `0x${paymentId.replace(/-/g, '')}${randomUUID().replace(/-/g, '').substring(0, 32)}`,
    gatewayReference: paymentId,
    createdAt: new Date().toISOString(),
  };
}

async function processEthPayment(req: PaymentRequest): Promise<PaymentResponse> {
  const paymentId = randomUUID();
  return {
    paymentId,
    gateway: 'eth',
    status: 'pending',
    amount: req.amount,
    currency: 'ETH',
    transactionHash: `0x${paymentId.replace(/-/g, '')}${randomUUID().replace(/-/g, '').substring(0, 32)}`,
    gatewayReference: paymentId,
    createdAt: new Date().toISOString(),
  };
}

paymentRouter.post('/charge/stripe', async (req: Request, res: Response) => {
  try {
    const { amount, currency, customerId, customerEmail, description, metadata, idempotencyKey } = req.body as PaymentRequest;
    if (!amount || !currency) {
      res.status(400).json({ error: 'Missing required fields: amount, currency' });
      return;
    }

    if (idempotencyKey) {
      const { result, isReplay } = checkIdempotency(idempotencyKey);
      if (isReplay) {
        res.json(result);
        return;
      }
    }

    const result = await processStripePayment({ amount, currency, customerId, customerEmail, description, metadata, idempotencyKey });
    if (idempotencyKey) storeIdempotency(idempotencyKey, result);
    res.status(201).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

paymentRouter.post('/charge/usdc', async (req: Request, res: Response) => {
  try {
    const { amount, currency, customerId, customerEmail, description, metadata, idempotencyKey } = req.body as PaymentRequest;
    if (!amount) {
      res.status(400).json({ error: 'Missing required field: amount' });
      return;
    }

    if (idempotencyKey) {
      const { result, isReplay } = checkIdempotency(idempotencyKey);
      if (isReplay) {
        res.json(result);
        return;
      }
    }

    const result = await processUsdcPayment({ amount, currency: currency || 'USDC', customerId, customerEmail, description, metadata, idempotencyKey });
    if (idempotencyKey) storeIdempotency(idempotencyKey, result);
    res.status(201).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

paymentRouter.post('/charge/eth', async (req: Request, res: Response) => {
  try {
    const { amount, currency, customerId, customerEmail, description, metadata, idempotencyKey } = req.body as PaymentRequest;
    if (!amount) {
      res.status(400).json({ error: 'Missing required field: amount' });
      return;
    }

    if (idempotencyKey) {
      const { result, isReplay } = checkIdempotency(idempotencyKey);
      if (isReplay) {
        res.json(result);
        return;
      }
    }

    const result = await processEthPayment({ amount, currency: currency || 'ETH', customerId, customerEmail, description, metadata, idempotencyKey });
    if (idempotencyKey) storeIdempotency(idempotencyKey, result);
    res.status(201).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

paymentRouter.get('/status/:paymentId', async (req: Request, res: Response) => {
  res.json({
    paymentId: req.params.paymentId,
    gateway: 'stripe',
    status: 'succeeded',
    amount: '0.00',
    currency: 'USD',
    createdAt: new Date().toISOString(),
  });
});
