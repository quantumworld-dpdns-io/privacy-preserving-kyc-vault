import { Request, Response, NextFunction } from 'express';

export interface BillingContext {
  customerId: string;
  meterName: string;
  quantity: number;
  usageId: string;
}

declare global {
  namespace Express {
    interface Request {
      billingContext?: BillingContext;
    }
  }
}

export interface BillingMiddlewareOptions {
  meterName?: string;
  defaultQuantity?: number;
  extractCustomerId?: (req: Request) => string | undefined;
}

export function createBillingMiddleware(
  recordUsage: (ctx: BillingContext) => Promise<void>,
  options: BillingMiddlewareOptions = {},
) {
  const {
    meterName = 'api_calls',
    defaultQuantity = 1,
    extractCustomerId = (req) => (req as any).user?.id || req.headers['x-customer-id'] as string | undefined,
  } = options;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const customerId = extractCustomerId(req);
    if (!customerId) {
      next();
      return;
    }

    const ctx: BillingContext = {
      customerId,
      meterName,
      quantity: defaultQuantity,
      usageId: `${customerId}_${meterName}_${Date.now()}`,
    };

    req.billingContext = ctx;

    const originalJson = res.json.bind(res);
    res.json = function (body: unknown) {
      recordUsage(ctx).catch((err) => {
        console.error('Failed to record usage:', err);
      });
      return originalJson(body);
    };

    next();
  };
}
