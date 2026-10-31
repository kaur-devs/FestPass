import { type RequestHandler, Router } from 'express';
import type { RateLimiterFactory } from '../../middleware/rate-limit';
import type { OrdersController } from './orders.controller';

export function createOrdersRouter(
  controller: OrdersController,
  authenticate: RequestHandler,
  rateLimiter: RateLimiterFactory,
): Router {
  const router = Router();
  const holdLimiter = rateLimiter('seat-holds', { windowMs: 60 * 1000, limit: 60 });
  const checkoutLimiter = rateLimiter('checkout', { windowMs: 60 * 1000, limit: 10 });

  router.get('/events/:eventId/hold', authenticate, controller.getHold);
  router.put('/events/:eventId/hold', authenticate, holdLimiter, controller.putHold);

  router.post('/orders', authenticate, checkoutLimiter, controller.checkout);
  router.get('/orders/:orderId', authenticate, controller.get);
  router.get('/orders/:orderId/tickets.pdf', authenticate, controller.ticketsPdf);
  router.post('/orders/:orderId/cancel', authenticate, controller.cancel);

  return router;
}
