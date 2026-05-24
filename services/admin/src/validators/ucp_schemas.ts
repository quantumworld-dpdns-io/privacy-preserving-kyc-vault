import { z } from 'zod';

export const UcpCurrencySchema = z.string().length(3).default('USD');

export const UcpItemSchema = z.object({
  productId: z.string().min(1),
  name: z.string().min(1).optional(),
  quantity: z.number().int().positive(),
  unitPrice: z.string().regex(/^\d+(\.\d{1,6})?$/),
  currency: UcpCurrencySchema,
  metadata: z.record(z.unknown()).optional(),
});

export const CheckoutOptionSchema = z.object({
  customerId: z.string().uuid().optional(),
  items: z.array(UcpItemSchema).min(1),
  currency: UcpCurrencySchema,
  couponCode: z.string().optional(),
});

export const AddToCartSchema = z.object({
  sessionId: z.string().uuid(),
  customerId: z.string().uuid().optional(),
  item: UcpItemSchema,
});

export const CompleteOrderSchema = z.object({
  checkoutId: z.string().uuid(),
  paymentMethodId: z.string().min(1),
  paymentGateway: z.enum(['stripe', 'paddle', 'usdc', 'eth']),
  billingAddress: z.object({
    name: z.string().min(1),
    email: z.string().email(),
    line1: z.string().min(1),
    line2: z.string().optional(),
    city: z.string().min(1),
    state: z.string().optional(),
    postalCode: z.string().optional(),
    country: z.string().length(2),
  }),
  idempotencyKey: z.string().uuid(),
  metadata: z.record(z.unknown()).optional(),
});

export const EstimateSchema = z.object({
  items: z.array(z.object({
    productId: z.string().min(1),
    quantity: z.number().int().positive(),
  })).min(1),
  currency: UcpCurrencySchema,
  postalCode: z.string().optional(),
  country: z.string().length(2).optional(),
  couponCode: z.string().optional(),
});

export const OrderActionSchema = z.object({
  orderId: z.string().uuid(),
  action: z.enum(['confirm', 'cancel', 'refund', 'status']),
  reason: z.string().optional(),
});

export type CheckoutOptionInput = z.infer<typeof CheckoutOptionSchema>;
export type AddToCartInput = z.infer<typeof AddToCartSchema>;
export type CompleteOrderInput = z.infer<typeof CompleteOrderSchema>;
export type EstimateInput = z.infer<typeof EstimateSchema>;
export type OrderActionInput = z.infer<typeof OrderActionSchema>;
