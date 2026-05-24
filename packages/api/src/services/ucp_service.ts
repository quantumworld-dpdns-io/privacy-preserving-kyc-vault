import { randomUUID } from 'node:crypto';
import type {
  CheckoutOptionInput,
  AddToCartInput,
  CompleteOrderInput,
  EstimateInput,
  OrderActionInput,
} from '../validators/ucp_schemas.js';

interface LineItem {
  productId: string;
  description: string;
  quantity: number;
  unitPrice: string;
  totalPrice: string;
  currency: string;
}

interface Cart {
  sessionId: string;
  customerId?: string;
  items: LineItem[];
  subtotal: string;
  currency: string;
  updatedAt: string;
}

interface CheckoutOptions {
  checkoutId: string;
  status: string;
  lineItems: LineItem[];
  subtotal: string;
  tax: string;
  total: string;
  currency: string;
  availableGateways: string[];
  expiresAt: string;
}

interface Order {
  orderId: string;
  status: string;
  customerId: string;
  lineItems: LineItem[];
  total: string;
  currency: string;
  paymentGateway: string;
  paymentStatus: string;
  createdAt: string;
  updatedAt: string;
  invoiceUrl?: string;
  receiptUrl?: string;
}

interface Estimate {
  subtotal: string;
  tax: string;
  taxRate: string;
  discount: string;
  total: string;
  currency: string;
  estimatedDays: number;
}

const PRODUCT_CATALOG: Record<string, { name: string; unitPrice: string }> = {
  'kyc-verification-credit': { name: 'KYC Verification Credit', unitPrice: '0.50' },
  'kyc-enterprise-seat': { name: 'Enterprise Seat', unitPrice: '99.00' },
  'kyc-api-access': { name: 'API Access Package', unitPrice: '499.00' },
  'zkp-proof-credit': { name: 'ZKP Proof Credit', unitPrice: '0.10' },
  'ai-screening-credit': { name: 'AI Screening Credit', unitPrice: '0.05' },
};

export class UcpService {
  private carts = new Map<string, Cart>();
  private orders = new Map<string, Order>();

  async getCheckoutOptions(input: CheckoutOptionInput): Promise<CheckoutOptions> {
    const checkoutId = randomUUID();
    const lineItems: LineItem[] = input.items.map((item) => {
      const product = PRODUCT_CATALOG[item.productId] ?? { name: item.productId, unitPrice: item.unitPrice };
      return {
        productId: item.productId,
        description: product.name,
        quantity: item.quantity,
        unitPrice: product.unitPrice,
        totalPrice: (parseFloat(product.unitPrice) * item.quantity).toFixed(2),
        currency: item.currency || 'USD',
      };
    });

    const subtotal = lineItems.reduce((acc, item) => acc + parseFloat(item.totalPrice), 0);
    const tax = subtotal * 0.0;
    const total = subtotal + tax;

    return {
      checkoutId,
      status: 'pending_payment',
      lineItems,
      subtotal: subtotal.toFixed(2),
      tax: tax.toFixed(2),
      total: total.toFixed(2),
      currency: input.currency || 'USD',
      availableGateways: ['stripe', 'paddle', 'usdc'],
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    };
  }

  async addToCart(input: AddToCartInput): Promise<Cart> {
    const product = PRODUCT_CATALOG[input.item.productId] ?? {
      name: input.item.name || input.item.productId,
      unitPrice: input.item.unitPrice,
    };

    const lineItem: LineItem = {
      productId: input.item.productId,
      description: product.name,
      quantity: input.item.quantity,
      unitPrice: product.unitPrice,
      totalPrice: (parseFloat(product.unitPrice) * input.item.quantity).toFixed(2),
      currency: input.item.currency || 'USD',
    };

    const existing = this.carts.get(input.sessionId);
    let items: LineItem[];
    if (existing) {
      const idx = existing.items.findIndex((i) => i.productId === input.item.productId);
      if (idx >= 0) {
        items = existing.items.slice();
        items[idx] = {
          ...items[idx],
          quantity: items[idx].quantity + input.item.quantity,
          totalPrice: (parseFloat(items[idx].unitPrice) * (items[idx].quantity + input.item.quantity)).toFixed(2),
        };
      } else {
        items = [...existing.items, lineItem];
      }
    } else {
      items = [lineItem];
    }

    const subtotal = items.reduce((acc, i) => acc + parseFloat(i.totalPrice), 0);
    const cart: Cart = {
      sessionId: input.sessionId,
      customerId: input.customerId,
      items,
      subtotal: subtotal.toFixed(2),
      currency: input.item.currency || 'USD',
      updatedAt: new Date().toISOString(),
    };

    this.carts.set(input.sessionId, cart);
    return cart;
  }

  async getCart(sessionId: string): Promise<Cart | undefined> {
    return this.carts.get(sessionId);
  }

  async completeOrder(input: CompleteOrderInput): Promise<Order> {
    const orderId = randomUUID();
    const customerId = input.billingAddress.email ? `cust_${randomUUID().substring(0, 8)}` : 'cust_anonymous';

    const order: Order = {
      orderId,
      status: 'pending',
      customerId,
      lineItems: [],
      total: '0.00',
      currency: 'USD',
      paymentGateway: input.paymentGateway,
      paymentStatus: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      invoiceUrl: `https://billing.kyc-vault.com/invoices/${orderId}`,
      receiptUrl: `https://billing.kyc-vault.com/receipts/${orderId}`,
    };

    this.orders.set(orderId, order);
    return order;
  }

  async estimate(input: EstimateInput): Promise<Estimate> {
    const subtotal = input.items.reduce((acc, item) => {
      const product = PRODUCT_CATALOG[item.productId];
      const price = product ? parseFloat(product.unitPrice) : 0.50;
      return acc + price * item.quantity;
    }, 0);

    let taxRate = '0.000';
    if (input.country === 'DE' || input.country === 'FR' || input.country === 'GB') {
      taxRate = '0.190';
    } else if (input.country === 'JP') {
      taxRate = '0.100';
    } else if (input.country === 'AU') {
      taxRate = '0.100';
    } else if (input.country === 'IN') {
      taxRate = '0.180';
    }

    const tax = subtotal * parseFloat(taxRate);
    const discount = input.couponCode ? subtotal * 0.1 : 0;

    return {
      subtotal: subtotal.toFixed(2),
      tax: tax.toFixed(2),
      taxRate,
      discount: discount.toFixed(2),
      total: (subtotal + tax - discount).toFixed(2),
      currency: input.currency || 'USD',
      estimatedDays: 1,
    };
  }

  async manageOrder(input: OrderActionInput): Promise<Order> {
    const existing = this.orders.get(input.orderId) || {
      orderId: input.orderId,
      status: 'pending',
      customerId: 'cust_' + randomUUID().substring(0, 8),
      lineItems: [],
      total: '0.00',
      currency: 'USD',
      paymentGateway: 'stripe',
      paymentStatus: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const statusMap: Record<string, string> = {
      confirm: 'confirmed',
      cancel: 'cancelled',
      refund: 'refunded',
      status: existing.status,
    };

    const order: Order = {
      ...existing,
      status: statusMap[input.action] || existing.status,
      updatedAt: new Date().toISOString(),
    };

    this.orders.set(input.orderId, order);
    return order;
  }

  async getOrder(orderId: string): Promise<Order | undefined> {
    return this.orders.get(orderId);
  }
}
