import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';

const router = Router();

const CheckoutRequestSchema = z.object({
  customerId: z.string().uuid(),
  items: z.array(z.object({
    productId: z.string(),
    quantity: z.number().int().positive(),
    price: z.string(),
    currency: z.string().length(3),
    metadata: z.record(z.unknown()).optional(),
  })).min(1),
  shippingAddress: z.object({
    name: z.string(),
    line1: z.string(),
    line2: z.string().optional(),
    city: z.string(),
    state: z.string(),
    postalCode: z.string(),
    country: z.string().length(2),
  }).optional(),
  couponCode: z.string().optional(),
  idempotencyKey: z.string().uuid(),
});

const OrderSchema = z.object({
  orderId: z.string().uuid(),
  action: z.enum(['confirm', 'cancel', 'refund', 'status']),
  reason: z.string().optional(),
});

interface LineItem {
  productId: string;
  description: string;
  quantity: number;
  unitPrice: string;
  totalPrice: string;
  currency: string;
}

interface CheckoutResponse {
  checkoutId: string;
  status: string;
  lineItems: LineItem[];
  subtotal: string;
  tax: string;
  total: string;
  currency: string;
  paymentUrl: string;
  expiresAt: string;
}

interface OrderResponse {
  orderId: string;
  status: string;
  customerId: string;
  lineItems: LineItem[];
  total: string;
  currency: string;
  createdAt: string;
  updatedAt: string;
  invoiceUrl?: string;
  receiptUrl?: string;
}

interface EstimateResponse {
  subtotal: string;
  tax: string;
  taxRate: string;
  shipping: string;
  discount: string;
  total: string;
  currency: string;
  estimatedDays: number;
}

router.post('/checkout', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = CheckoutRequestSchema.parse(req.body);
    const checkoutId = randomUUID();

    const lineItems: LineItem[] = input.items.map((item) => ({
      productId: item.productId,
      description: `KYC Verification Credit - ${item.productId}`,
      quantity: item.quantity,
      unitPrice: item.price,
      totalPrice: (parseFloat(item.price) * item.quantity).toFixed(2),
      currency: item.currency,
    }));

    const subtotal = lineItems.reduce((acc, item) => acc + parseFloat(item.totalPrice), 0);
    const tax = subtotal * 0.0;
    const total = subtotal + tax;

    const response: CheckoutResponse = {
      checkoutId,
      status: 'pending_payment',
      lineItems,
      subtotal: subtotal.toFixed(2),
      tax: tax.toFixed(2),
      total: total.toFixed(2),
      currency: input.items[0].currency,
      paymentUrl: `https://checkout.kyc-vault.com/pay/${checkoutId}`,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    };

    res.status(201).json({ success: true, data: response });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, error: 'Validation failed', details: error.errors });
      return;
    }
    next(error);
  }
});

router.post('/order/:orderId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { orderId } = req.params;
    const input = OrderSchema.parse({ ...req.body, orderId });

    const response: OrderResponse = {
      orderId: input.orderId,
      status: input.action === 'confirm' ? 'confirmed' : input.action === 'cancel' ? 'cancelled' : 'pending',
      customerId: 'cust_' + randomUUID().substring(0, 8),
      lineItems: [],
      total: '0.00',
      currency: 'USD',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      invoiceUrl: input.action === 'confirm' ? `https://billing.kyc-vault.com/invoices/${orderId}` : undefined,
    };

    res.json({ success: true, data: response });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, error: 'Validation failed', details: error.errors });
      return;
    }
    next(error);
  }
});

router.post('/estimate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = z.object({
      items: z.array(z.object({
        productId: z.string(),
        quantity: z.number().int().positive(),
      })),
      postalCode: z.string().optional(),
      currency: z.string().length(3).default('USD'),
    }).parse(req.body);

    const subtotal = input.items.reduce((acc, item) => acc + (item.quantity * 0.50), 0);
    const response: EstimateResponse = {
      subtotal: subtotal.toFixed(2),
      tax: '0.00',
      taxRate: '0.000',
      shipping: '0.00',
      discount: '0.00',
      total: subtotal.toFixed(2),
      currency: input.currency,
      estimatedDays: 1,
    };

    res.json({ success: true, data: response });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, error: 'Validation failed', details: error.errors });
      return;
    }
    next(error);
  }
});

router.get('/order/:orderId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { orderId } = req.params;
    const response: OrderResponse = {
      orderId,
      status: 'confirmed',
      customerId: 'cust_example',
      lineItems: [],
      total: '0.00',
      currency: 'USD',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    res.json({ success: true, data: response });
  } catch (error) {
    next(error);
  }
});

router.get('/products', async (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: [
      { id: 'kyc-verification-credit', name: 'KYC Verification Credit', unitPrice: '0.50', currency: 'USD' },
      { id: 'kyc-enterprise-seat', name: 'Enterprise Seat', unitPrice: '99.00', currency: 'USD', period: 'monthly' },
      { id: 'kyc-api-access', name: 'API Access Package', unitPrice: '499.00', currency: 'USD', period: 'monthly' },
    ],
  });
});

export default router;
