import { verifyPaymentSchema } from '@festpass/shared';
import type { RequestHandler } from 'express';
import { parseBody, parseIdParam } from '../../lib/validation';
import { getAuth } from '../../middleware/require-auth';
import type { PaymentsService } from './payments.service';

export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  start: RequestHandler = async (req, res) => {
    const session = await this.payments.startPayment(
      getAuth(req).userId,
      parseIdParam(req, 'orderId'),
    );
    res.json({ payment: session });
  };

  verify: RequestHandler = async (req, res) => {
    const order = await this.payments.verifyCheckout(
      getAuth(req).userId,
      parseIdParam(req, 'orderId'),
      parseBody(verifyPaymentSchema, req),
    );
    res.json({ order });
  };

  webhook: RequestHandler = async (req, res) => {
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const outcome = await this.payments.handleWebhook(
      body,
      req.get('x-razorpay-signature'),
      req.get('x-razorpay-event-id'),
    );
    req.log.info({ outcome }, 'Razorpay webhook handled');
    res.json({ status: outcome });
  };
}
