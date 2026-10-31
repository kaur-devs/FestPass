import { randomUUID } from 'node:crypto';
import { EventStatus, OrderStatus, SeatingType, TicketStatus } from '@festpass/db';
import {
  apiErrorResponseSchema,
  ErrorCode,
  type OrderView,
  type PaymentSessionView,
} from '@festpass/shared';
import { pino } from 'pino';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, testEnv } from '../../test/context';
import { db, resetDatabase } from '../../test/database';
import { redis } from '../../test/redis';
import { SeatHoldStore } from '../holds/seat-hold.store';
import { OrdersRepository } from '../orders/orders.repository';
import { OrdersService } from '../orders/orders.service';
import { TicketCodes } from '../tickets/ticket-codes';
import { PaymentsRepository } from './payments.repository';
import { PaymentsService } from './payments.service';
import {
  type CapturedPayment,
  hmacSha256Hex,
  type PaymentGateway,
  safeEqualHex,
} from './razorpay.gateway';

const KEY_SECRET = 'test-key-secret';
const WEBHOOK_SECRET = 'test-webhook-secret';
const HOUR = 60 * 60 * 1000;

class FakeGateway implements PaymentGateway {
  readonly keyId = 'rzp_test_fake';
  readonly createdOrders: { id: string; amountInPaise: number; receipt: string }[] = [];
  readonly captured = new Map<string, CapturedPayment>();
  readonly refunds: { paymentId: string; amountInPaise: number; receipt: string }[] = [];

  createOrder(input: { amountInPaise: number; receipt: string }) {
    const order = { id: `order_${randomUUID().slice(0, 14)}`, ...input };
    this.createdOrders.push(order);
    return Promise.resolve({ id: order.id });
  }

  findCapturedPayment(gatewayOrderId: string) {
    return Promise.resolve(this.captured.get(gatewayOrderId) ?? null);
  }

  findRefund(paymentId: string) {
    const index = this.refunds.findIndex((refund) => refund.paymentId === paymentId);
    return Promise.resolve(index === -1 ? null : { id: `rfnd_${index}` });
  }

  refund(paymentId: string, amountInPaise: number, receipt: string) {
    this.refunds.push({ paymentId, amountInPaise, receipt });
    return Promise.resolve({ id: `rfnd_${this.refunds.length - 1}` });
  }

  verifyCheckoutSignature(gatewayOrderId: string, paymentId: string, signature: string) {
    return safeEqualHex(hmacSha256Hex(KEY_SECRET, `${gatewayOrderId}|${paymentId}`), signature);
  }

  verifyWebhookSignature(rawBody: Buffer, signature: string) {
    return safeEqualHex(hmacSha256Hex(WEBHOOK_SECRET, rawBody), signature);
  }
}

let gateway: FakeGateway;
let ctx: ReturnType<typeof createTestContext>;
let payments: PaymentsService;
let orders: OrdersService;

beforeEach(async () => {
  await resetDatabase();
  gateway = new FakeGateway();
  ctx = createTestContext({ paymentGateway: gateway });
  const logger = pino({ level: 'silent' });
  orders = new OrdersService(
    new OrdersRepository(db),
    new SeatHoldStore(redis),
    new TicketCodes(testEnv.TICKET_SIGNING_SECRET),
    logger,
  );
  payments = new PaymentsService(new PaymentsRepository(db), orders, gateway, logger);
});

function body<T>(res: { body: unknown }): T {
  return res.body as T;
}

function errorOf(res: { body: unknown }) {
  return apiErrorResponseSchema.parse(res.body).error;
}

async function student() {
  const agent = request.agent(ctx.app);
  await agent.post('/auth/sign-up').send({
    name: 'Ananya Gupta',
    email: `${randomUUID()}@festpass.test`,
    password: 'freshers-night-2026',
  });
  return agent;
}

async function pendingOrder(capacity = 10) {
  const startsAt = new Date(Date.now() + 7 * 24 * HOUR);
  const event = await db.event.create({
    data: {
      slug: `bands-${randomUUID()}`,
      title: 'Battle of the Bands',
      venue: 'Open Air Theatre',
      startsAt,
      endsAt: new Date(startsAt.getTime() + 3 * HOUR),
      salesStartAt: new Date(Date.now() - HOUR),
      salesEndAt: startsAt,
      status: EventStatus.PUBLISHED,
      seatingType: SeatingType.GENERAL_ADMISSION,
      organization: { create: { name: 'Utsav Fest Committee', slug: `org-${randomUUID()}` } },
    },
  });
  const tier = await db.ticketTier.create({
    data: { eventId: event.id, name: 'Regular', priceInPaise: 24_900, capacity, maxPerOrder: 4 },
  });
  const agent = await student();
  const res = await agent.post('/orders').send({
    eventId: event.id,
    idempotencyKey: randomUUID(),
    items: [{ tierId: tier.id, quantity: 2 }],
  });
  return { agent, event, tier, order: body<{ order: OrderView }>(res).order };
}

async function startPayment(agent: ReturnType<typeof request.agent>, orderId: string) {
  const res = await agent.post(`/orders/${orderId}/payment`);
  expect(res.status).toBe(200);
  return body<{ payment: PaymentSessionView }>(res).payment;
}

function checkoutSignature(razorpayOrderId: string, paymentId: string) {
  return hmacSha256Hex(KEY_SECRET, `${razorpayOrderId}|${paymentId}`);
}

function capturedWebhook(razorpayOrderId: string, paymentId: string, amount: number) {
  return JSON.stringify({
    entity: 'event',
    event: 'payment.captured',
    payload: {
      payment: {
        entity: {
          id: paymentId,
          order_id: razorpayOrderId,
          amount,
          currency: 'INR',
          status: 'captured',
        },
      },
    },
  });
}

function sendWebhook(raw: string, options: { eventId?: string; signature?: string } = {}) {
  return request(ctx.app)
    .post('/webhooks/razorpay')
    .set('Content-Type', 'application/json')
    .set('X-Razorpay-Signature', options.signature ?? hmacSha256Hex(WEBHOOK_SECRET, raw))
    .set('X-Razorpay-Event-Id', options.eventId ?? randomUUID())
    .send(raw);
}

async function ticketCount(orderId: string) {
  return db.ticket.count({ where: { orderId, status: TicketStatus.ACTIVE } });
}

describe('starting a payment', () => {
  it('creates one Razorpay order for the exact total and reuses it', async () => {
    const { agent, order } = await pendingOrder();

    const first = await startPayment(agent, order.id);
    const second = await startPayment(agent, order.id);

    expect(first).toMatchObject({ keyId: 'rzp_test_fake', amountInPaise: 49_800, currency: 'INR' });
    expect(second.razorpayOrderId).toBe(first.razorpayOrderId);
    expect(gateway.createdOrders).toEqual([
      {
        id: first.razorpayOrderId,
        amountInPaise: 49_800,
        receipt: order.id,
        notes: expect.any(Object) as unknown,
      },
    ]);
  });

  it('is only possible for your own unpaid, unexpired order', async () => {
    const { agent, order } = await pendingOrder();
    const stranger = await student();

    expect((await stranger.post(`/orders/${order.id}/payment`)).status).toBe(404);

    await agent.post(`/orders/${order.id}/cancel`);
    const cancelled = await agent.post(`/orders/${order.id}/payment`);
    expect(cancelled.status).toBe(409);
    expect(errorOf(cancelled).code).toBe(ErrorCode.OrderNotPayable);
  });

  it('reports payments as unavailable when Razorpay is not configured', async () => {
    const { order } = await pendingOrder();
    const noPayments = createTestContext();
    const agent = request.agent(noPayments.app);
    const owner = await db.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { user: true },
    });
    await agent
      .post('/auth/sign-in')
      .send({ email: owner.user.email, password: 'freshers-night-2026' });

    const res = await agent.post(`/orders/${order.id}/payment`);

    expect(res.status).toBe(503);
    expect(errorOf(res).code).toBe(ErrorCode.PaymentsUnavailable);
  });
});

describe('confirming from the browser', () => {
  it('issues tickets when the checkout signature is valid', async () => {
    const { agent, order } = await pendingOrder();
    const session = await startPayment(agent, order.id);

    const res = await agent.post(`/orders/${order.id}/payment/verify`).send({
      razorpayOrderId: session.razorpayOrderId,
      razorpayPaymentId: 'pay_browser_1',
      razorpaySignature: checkoutSignature(session.razorpayOrderId, 'pay_browser_1'),
    });

    expect(res.status).toBe(200);
    expect(body<{ order: OrderView }>(res).order).toMatchObject({ status: 'PAID' });
    expect(await ticketCount(order.id)).toBe(2);
  });

  it('rejects a forged signature and leaves the order unpaid', async () => {
    const { agent, order } = await pendingOrder();
    const session = await startPayment(agent, order.id);

    const res = await agent.post(`/orders/${order.id}/payment/verify`).send({
      razorpayOrderId: session.razorpayOrderId,
      razorpayPaymentId: 'pay_forged',
      razorpaySignature: hmacSha256Hex('guessed-secret', `${session.razorpayOrderId}|pay_forged`),
    });

    expect(res.status).toBe(400);
    expect(errorOf(res).code).toBe(ErrorCode.PaymentVerificationFailed);
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
      OrderStatus.PENDING,
    );
  });

  it('rejects a valid signature for a different Razorpay order', async () => {
    const { agent, order } = await pendingOrder();
    await startPayment(agent, order.id);

    const res = await agent.post(`/orders/${order.id}/payment/verify`).send({
      razorpayOrderId: 'order_someone_else',
      razorpayPaymentId: 'pay_1',
      razorpaySignature: checkoutSignature('order_someone_else', 'pay_1'),
    });

    expect(res.status).toBe(400);
  });
});

describe('webhooks', () => {
  it('confirms the order on payment.captured', async () => {
    const { agent, order } = await pendingOrder();
    const session = await startPayment(agent, order.id);

    const res = await sendWebhook(capturedWebhook(session.razorpayOrderId, 'pay_hook_1', 49_800));

    expect(res.body).toEqual({ status: 'processed' });
    expect(await ticketCount(order.id)).toBe(2);
  });

  it('processes a redelivered event only once', async () => {
    const { agent, order } = await pendingOrder();
    const session = await startPayment(agent, order.id);
    const raw = capturedWebhook(session.razorpayOrderId, 'pay_hook_1', 49_800);

    await sendWebhook(raw, { eventId: 'evt_1' });
    const again = await sendWebhook(raw, { eventId: 'evt_1' });

    expect(again.body).toEqual({ status: 'duplicate' });
    expect(await ticketCount(order.id)).toBe(2);
  });

  it('is harmless when the browser already confirmed the payment', async () => {
    const { agent, order } = await pendingOrder();
    const session = await startPayment(agent, order.id);
    await agent.post(`/orders/${order.id}/payment/verify`).send({
      razorpayOrderId: session.razorpayOrderId,
      razorpayPaymentId: 'pay_1',
      razorpaySignature: checkoutSignature(session.razorpayOrderId, 'pay_1'),
    });

    await sendWebhook(capturedWebhook(session.razorpayOrderId, 'pay_1', 49_800));

    expect(await ticketCount(order.id)).toBe(2);
    expect(gateway.refunds).toEqual([]);
  });

  it('rejects an unsigned or tampered webhook', async () => {
    const { agent, order } = await pendingOrder();
    const session = await startPayment(agent, order.id);
    const raw = capturedWebhook(session.razorpayOrderId, 'pay_1', 49_800);

    const tampered = await sendWebhook(raw.replace('49800', '100'), {
      signature: hmacSha256Hex(WEBHOOK_SECRET, raw),
    });

    expect(tampered.status).toBe(400);
    expect(errorOf(tampered).code).toBe(ErrorCode.InvalidWebhook);
    expect(await ticketCount(order.id)).toBe(0);
  });

  it('refunds instead of ticketing when the amount does not match', async () => {
    const { agent, order } = await pendingOrder();
    const session = await startPayment(agent, order.id);

    await sendWebhook(capturedWebhook(session.razorpayOrderId, 'pay_short', 100));

    const stored = await db.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { event: true },
    });
    expect(stored.status).toBe(OrderStatus.REFUND_PENDING);
    expect(await ticketCount(order.id)).toBe(0);
  });

  it('refunds a second payment for an order that is already paid', async () => {
    const { agent, order } = await pendingOrder();
    const session = await startPayment(agent, order.id);
    await sendWebhook(capturedWebhook(session.razorpayOrderId, 'pay_first', 49_800));

    await sendWebhook(capturedWebhook(session.razorpayOrderId, 'pay_second', 49_800));

    expect(await ticketCount(order.id)).toBe(2);
    expect(gateway.refunds).toEqual([
      { paymentId: 'pay_second', amountInPaise: 49_800, receipt: `dup-${order.id}` },
    ]);
  });

  it('ignores events for orders it does not know', async () => {
    const res = await sendWebhook(capturedWebhook('order_unknown', 'pay_1', 100));

    expect(res.body).toEqual({ status: 'ignored' });
  });
});

describe('late payments and refunds', () => {
  it('refunds a payment that arrives after the last tickets were resold', async () => {
    const { agent, order, event, tier } = await pendingOrder(2);
    const session = await startPayment(agent, order.id);
    await agent.post(`/orders/${order.id}/cancel`);

    const rival = await student();
    await rival.post('/orders').send({
      eventId: event.id,
      idempotencyKey: randomUUID(),
      items: [{ tierId: tier.id, quantity: 2 }],
    });

    await sendWebhook(capturedWebhook(session.razorpayOrderId, 'pay_late', 49_800));
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
      OrderStatus.REFUND_PENDING,
    );

    expect(await payments.processRefunds()).toBe(1);
    const refunded = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(refunded).toMatchObject({ status: OrderStatus.REFUNDED, razorpayRefundId: 'rfnd_0' });
    expect(gateway.refunds).toEqual([
      { paymentId: 'pay_late', amountInPaise: 49_800, receipt: order.id },
    ]);

    expect(await payments.processRefunds()).toBe(0);
  });

  it('does not refund twice when a refund already exists at Razorpay', async () => {
    const { agent, order } = await pendingOrder();
    const session = await startPayment(agent, order.id);
    await sendWebhook(capturedWebhook(session.razorpayOrderId, 'pay_short', 100));
    gateway.refunds.push({ paymentId: 'pay_short', amountInPaise: 49_800, receipt: order.id });

    await payments.processRefunds();

    expect(gateway.refunds).toHaveLength(1);
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
      OrderStatus.REFUNDED,
    );
  });
});

describe('reconciliation', () => {
  it('confirms a paid order whose webhook never arrived instead of expiring it', async () => {
    const { agent, order } = await pendingOrder();
    const session = await startPayment(agent, order.id);
    gateway.captured.set(session.razorpayOrderId, {
      id: 'pay_quiet',
      amountInPaise: 49_800,
      currency: 'INR',
    });
    await db.order.update({
      where: { id: order.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    expect(await payments.reconcileDue()).toBe(1);
    expect(await orders.expireDue()).toBe(0);

    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
      OrderStatus.PAID,
    );
  });

  it('leaves unpaid orders for the expiry sweep', async () => {
    const { agent, order } = await pendingOrder();
    await startPayment(agent, order.id);
    await db.order.update({
      where: { id: order.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    expect(await payments.reconcileDue()).toBe(0);
    expect(await orders.expireDue()).toBe(1);
  });
});
