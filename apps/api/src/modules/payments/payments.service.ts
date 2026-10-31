import { createHash } from 'node:crypto';
import { type Order, OrderStatus } from '@festpass/db';
import {
  ErrorCode,
  type OrderView,
  type PaymentSessionView,
  type VerifyPaymentInput,
} from '@festpass/shared';
import type { Logger } from 'pino';
import { z } from 'zod';
import { AppError, ConflictError, NotFoundError } from '../../lib/errors';
import type { OrdersService } from '../orders/orders.service';
import type { PaymentsRepository } from './payments.repository';
import type { PaymentGateway } from './razorpay.gateway';

const HANDLED_EVENTS = new Set(['payment.captured', 'order.paid']);

const webhookSchema = z.object({
  event: z.string(),
  payload: z.object({
    payment: z
      .object({
        entity: z.object({
          id: z.string(),
          order_id: z.string(),
          amount: z.number(),
          currency: z.string(),
          status: z.string(),
        }),
      })
      .optional(),
  }),
});

export type WebhookOutcome = 'processed' | 'duplicate' | 'ignored';

export class PaymentsService {
  constructor(
    private readonly payments: PaymentsRepository,
    private readonly orders: OrdersService,
    private readonly gateway: PaymentGateway | undefined,
    private readonly logger: Logger,
  ) {}

  async startPayment(userId: string, orderId: string): Promise<PaymentSessionView> {
    const order = await this.payments.findOrder(orderId);
    if (order?.userId !== userId) throw new NotFoundError('This order does not exist.');
    if (
      order.status !== OrderStatus.PENDING ||
      order.expiresAt <= new Date() ||
      order.totalInPaise === 0
    ) {
      throw new ConflictError('This order can no longer be paid for.', ErrorCode.OrderNotPayable);
    }
    const gateway = this.requireGateway();

    let razorpayOrderId = order.razorpayOrderId;
    if (!razorpayOrderId) {
      const created = await gateway.createOrder({
        amountInPaise: order.totalInPaise,
        receipt: order.id,
        notes: { orderId: order.id, eventId: order.eventId },
      });
      const attached = await this.payments.attachGatewayOrder(order.id, created.id);
      razorpayOrderId = attached
        ? created.id
        : ((await this.payments.findOrder(order.id))?.razorpayOrderId ?? created.id);
    }

    return {
      orderId: order.id,
      keyId: gateway.keyId,
      razorpayOrderId,
      amountInPaise: order.totalInPaise,
      currency: 'INR',
      description: order.event.title,
      prefill: { name: order.user.name, email: order.user.email },
    };
  }

  async verifyCheckout(
    userId: string,
    orderId: string,
    input: VerifyPaymentInput,
  ): Promise<OrderView> {
    const order = await this.payments.findOrder(orderId);
    if (order?.userId !== userId) throw new NotFoundError('This order does not exist.');
    const gateway = this.requireGateway();

    const valid =
      order.razorpayOrderId === input.razorpayOrderId &&
      gateway.verifyCheckoutSignature(
        input.razorpayOrderId,
        input.razorpayPaymentId,
        input.razorpaySignature,
      );
    if (!valid) {
      this.logger.warn({ orderId }, 'Rejected a payment confirmation with an invalid signature');
      throw new AppError(
        400,
        ErrorCode.PaymentVerificationFailed,
        'We could not verify this payment. If money was taken, it will be confirmed or refunded automatically.',
      );
    }

    return this.settle(order, {
      id: input.razorpayPaymentId,
      amountInPaise: order.totalInPaise,
      currency: 'INR',
    });
  }

  async handleWebhook(rawBody: Buffer, signature: string | undefined, eventId: string | undefined) {
    const gateway = this.requireGateway();
    if (!signature || !gateway.verifyWebhookSignature(rawBody, signature)) {
      throw new AppError(400, ErrorCode.InvalidWebhook, 'Invalid webhook signature.');
    }

    const id = eventId ?? createHash('sha256').update(rawBody).digest('hex');
    if (await this.payments.hasWebhookEvent(id)) return 'duplicate' satisfies WebhookOutcome;

    const parsed = webhookSchema.safeParse(parseJson(rawBody));
    if (!parsed.success)
      throw new AppError(400, ErrorCode.InvalidWebhook, 'Unrecognised webhook body.');

    const { event, payload } = parsed.data;
    const payment = payload.payment?.entity;
    let outcome: WebhookOutcome = 'ignored';

    if (HANDLED_EVENTS.has(event) && payment?.status === 'captured') {
      const order = await this.payments.findByGatewayOrderId(payment.order_id);
      if (order) {
        await this.settle(order, {
          id: payment.id,
          amountInPaise: payment.amount,
          currency: payment.currency,
        });
        outcome = 'processed';
      } else {
        this.logger.warn({ razorpayOrderId: payment.order_id }, 'Webhook for an unknown order');
      }
    }

    await this.payments.recordWebhookEvent(id, event);
    return outcome;
  }

  async reconcileDue(now = new Date()): Promise<number> {
    if (!this.gateway) return 0;
    let confirmed = 0;

    for (const order of await this.payments.dueForReconciliation(now)) {
      if (!order.razorpayOrderId) continue;
      try {
        const payment = await this.gateway.findCapturedPayment(order.razorpayOrderId);
        if (payment) {
          await this.settle(order, payment);
          confirmed += 1;
        }
      } catch (error) {
        this.logger.error({ err: error, orderId: order.id }, 'Payment reconciliation failed');
      }
    }
    if (confirmed > 0) this.logger.info({ confirmed }, 'Confirmed payments missed by webhooks');
    return confirmed;
  }

  async processRefunds(): Promise<number> {
    if (!this.gateway) return 0;
    let refunded = 0;

    for (const order of await this.payments.refundsDue()) {
      if (!order.razorpayPaymentId) continue;
      try {
        const refund =
          (await this.gateway.findRefund(order.razorpayPaymentId)) ??
          (await this.gateway.refund(order.razorpayPaymentId, order.totalInPaise, order.id));
        await this.payments.markRefunded(order.id, refund.id);
        refunded += 1;
      } catch (error) {
        this.logger.error({ err: error, orderId: order.id }, 'Refund failed; will retry');
      }
    }
    return refunded;
  }

  private async settle(
    order: Order,
    payment: { id: string; amountInPaise: number; currency: string },
  ): Promise<OrderView> {
    if (order.status === OrderStatus.PAID && order.razorpayPaymentId !== payment.id) {
      await this.refundDuplicatePayment(order, payment.id);
      return this.orders.confirm(order.id);
    }
    if (payment.amountInPaise !== order.totalInPaise || payment.currency !== 'INR') {
      this.logger.error(
        { orderId: order.id, expected: order.totalInPaise, received: payment.amountInPaise },
        'Payment amount does not match the order; refunding',
      );
      return this.orders.rejectPayment(order.id, { razorpayPaymentId: payment.id });
    }
    return this.orders.confirm(order.id, { razorpayPaymentId: payment.id });
  }

  private async refundDuplicatePayment(order: Order, paymentId: string) {
    const gateway = this.requireGateway();
    this.logger.warn(
      { orderId: order.id, paymentId },
      'Second payment for a paid order; refunding it',
    );
    const existing = await gateway.findRefund(paymentId);
    if (!existing) await gateway.refund(paymentId, order.totalInPaise, `dup-${order.id}`);
  }

  private requireGateway(): PaymentGateway {
    if (!this.gateway) {
      throw new AppError(503, ErrorCode.PaymentsUnavailable, 'Online payment is not set up yet.');
    }
    return this.gateway;
  }
}

function parseJson(body: Buffer): unknown {
  try {
    return JSON.parse(body.toString('utf8'));
  } catch {
    return undefined;
  }
}
