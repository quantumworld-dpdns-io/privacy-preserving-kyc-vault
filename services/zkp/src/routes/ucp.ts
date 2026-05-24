import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { UcpService } from '../services/ucp_service.js';
import {
  CheckoutOptionSchema,
  AddToCartSchema,
  CompleteOrderSchema,
  EstimateSchema,
  OrderActionSchema,
} from '../validators/ucp_schemas.js';

const router = Router();
const ucp = new UcpService();

router.post('/checkout/options', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = CheckoutOptionSchema.parse(req.body);
    const options = await ucp.getCheckoutOptions(input);
    res.status(200).json({ success: true, data: options });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, error: 'Validation failed', details: error.errors });
      return;
    }
    next(error);
  }
});

router.post('/cart/add', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = AddToCartSchema.parse(req.body);
    const cart = await ucp.addToCart(input);
    res.status(200).json({ success: true, data: cart });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, error: 'Validation failed', details: error.errors });
      return;
    }
    next(error);
  }
});

router.get('/cart/:sessionId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { sessionId } = req.params;
    const cart = await ucp.getCart(sessionId);
    if (!cart) {
      res.status(404).json({ success: false, error: 'Cart not found' });
      return;
    }
    res.json({ success: true, data: cart });
  } catch (error) {
    next(error);
  }
});

router.post('/order/complete', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = CompleteOrderSchema.parse(req.body);
    const order = await ucp.completeOrder(input);
    res.status(201).json({ success: true, data: order });
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
    const input = EstimateSchema.parse(req.body);
    const estimate = await ucp.estimate(input);
    res.json({ success: true, data: estimate });
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
    const input = OrderActionSchema.parse({ ...req.body, orderId });
    const result = await ucp.manageOrder(input);
    res.json({ success: true, data: result });
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
    const order = await ucp.getOrder(orderId);
    if (!order) {
      res.status(404).json({ success: false, error: 'Order not found' });
      return;
    }
    res.json({ success: true, data: order });
  } catch (error) {
    next(error);
  }
});

export default router;
