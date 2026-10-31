import express, { type RequestHandler, Router } from 'express';
import type { RateLimiterFactory } from '../../middleware/rate-limit';
import type { PaymentsController } from './payments.controller';

export function createWebhookRouter(controller: PaymentsController): Router {
  const router = Router();
  router.post(
    '/webhooks/razorpay',
    express.raw({ type: 'application/json', limit: '1mb' }),
    controller.webhook,
  );
  return router;
}

export function createPaymentsRouter(
  controller: PaymentsController,
  authenticate: RequestHandler,
  rateLimiter: RateLimiterFactory,
): Router {
  const router = Router();
  const paymentLimiter = rateLimiter('payments', { windowMs: 60 * 1000, limit: 20 });

  router.post('/orders/:orderId/payment', authenticate, paymentLimiter, controller.start);
  router.post('/orders/:orderId/payment/verify', authenticate, paymentLimiter, controller.verify);

  return router;
}
