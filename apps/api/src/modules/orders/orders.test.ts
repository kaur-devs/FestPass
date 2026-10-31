import { randomUUID } from 'node:crypto';
import { EventStatus, OrderStatus, SeatingType, TicketStatus } from '@festpass/db';
import {
  apiErrorResponseSchema,
  type CurrentHoldView,
  ErrorCode,
  type OrderView,
  type SeatHoldView,
  type SeatView,
} from '@festpass/shared';
import { pino } from 'pino';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, testEnv } from '../../test/context';
import { db, resetDatabase } from '../../test/database';
import { redis } from '../../test/redis';
import { SeatHoldStore } from '../holds/seat-hold.store';
import { OrdersRepository } from './orders.repository';
import { OrdersService } from './orders.service';
import { TicketCodes } from '../tickets/ticket-codes';

const HOUR = 60 * 60 * 1000;

let ctx: ReturnType<typeof createTestContext>;
const orders = new OrdersService(
  new OrdersRepository(db),
  new SeatHoldStore(redis),
  new TicketCodes(testEnv.TICKET_SIGNING_SECRET),
  pino({ level: 'silent' }),
);

beforeEach(async () => {
  await resetDatabase();
  ctx = createTestContext();
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

async function createEvent(seatingType: SeatingType, options: { salesClosed?: boolean } = {}) {
  const startsAt = new Date(Date.now() + 7 * 24 * HOUR);
  return db.event.create({
    data: {
      slug: `event-${randomUUID()}`,
      title: 'Pro Night',
      venue: 'Main Auditorium',
      startsAt,
      endsAt: new Date(startsAt.getTime() + 3 * HOUR),
      salesStartAt: new Date(Date.now() - 2 * HOUR),
      salesEndAt: options.salesClosed ? new Date(Date.now() - HOUR) : startsAt,
      status: EventStatus.PUBLISHED,
      seatingType,
      organization: { create: { name: 'Utsav Fest Committee', slug: `org-${randomUUID()}` } },
    },
  });
}

async function reservedEvent(options: { salesClosed?: boolean; maxPerOrder?: number } = {}) {
  const event = await createEvent(SeatingType.RESERVED, options);
  const tier = await db.ticketTier.create({
    data: {
      eventId: event.id,
      name: 'Gold',
      priceInPaise: 49_900,
      capacity: 6,
      maxPerOrder: options.maxPerOrder ?? 4,
    },
  });
  await db.seat.createMany({
    data: Array.from({ length: 6 }, (_, i) => ({
      eventId: event.id,
      tierId: tier.id,
      section: 'Centre',
      row: 'A',
      number: i + 1,
      x: i,
      y: 0,
    })),
  });
  const seats = await db.seat.findMany({
    where: { eventId: event.id },
    orderBy: { number: 'asc' },
  });
  return { event, tier, seats };
}

async function generalEvent(capacity: number, priceInPaise = 14_900) {
  const event = await createEvent(SeatingType.GENERAL_ADMISSION);
  const tier = await db.ticketTier.create({
    data: { eventId: event.id, name: 'Entry', priceInPaise, capacity, maxPerOrder: 4 },
  });
  return { event, tier };
}

async function seatStatuses(slug: string) {
  const { seats } = body<{ seats: SeatView[] }>(
    await request(ctx.app).get(`/events/${slug}/seats`),
  );
  return Object.fromEntries(seats.map((seat) => [seat.number, seat.status]));
}

async function soldCount(tierId: string) {
  return (await db.ticketTier.findUniqueOrThrow({ where: { id: tierId } })).soldCount;
}

function checkout(agent: ReturnType<typeof request.agent>, eventId: string, extra: object = {}) {
  return agent.post('/orders').send({ eventId, idempotencyKey: randomUUID(), ...extra });
}

describe('holding seats', () => {
  it('holds seats and shows them as held on the public map', async () => {
    const { event, seats } = await reservedEvent();
    const ananya = await student();

    const res = await ananya
      .put(`/events/${event.id}/hold`)
      .send({ seatIds: [seats[0]?.id, seats[1]?.id] });

    expect(res.status).toBe(200);
    expect(body<{ hold: SeatHoldView }>(res).hold.seatIds).toHaveLength(2);
    expect(await seatStatuses(event.slug)).toMatchObject({ 1: 'HELD', 2: 'HELD', 3: 'AVAILABLE' });

    const current = body<CurrentHoldView>(await ananya.get(`/events/${event.id}/hold`));
    expect(current.hold?.seatIds.sort()).toEqual([seats[0]?.id, seats[1]?.id].sort());
    expect(current.pendingOrderId).toBeNull();
  });

  it('refuses a seat someone else is holding', async () => {
    const { event, seats } = await reservedEvent();
    const [ananya, rohan] = [await student(), await student()];
    await ananya.put(`/events/${event.id}/hold`).send({ seatIds: [seats[0]?.id] });

    const res = await rohan
      .put(`/events/${event.id}/hold`)
      .send({ seatIds: [seats[0]?.id, seats[1]?.id] });

    expect(res.status).toBe(409);
    expect(errorOf(res)).toMatchObject({
      code: ErrorCode.SeatsUnavailable,
      details: { seatIds: [seats[0]?.id] },
    });
  });

  it('enforces the per-order limit of the tier', async () => {
    const { event, seats } = await reservedEvent({ maxPerOrder: 2 });
    const ananya = await student();

    const res = await ananya
      .put(`/events/${event.id}/hold`)
      .send({ seatIds: seats.slice(0, 3).map((seat) => seat.id) });

    expect(res.status).toBe(409);
    expect(errorOf(res).code).toBe(ErrorCode.OrderLimitExceeded);
  });

  it('refuses holds once sales have closed', async () => {
    const { event, seats } = await reservedEvent({ salesClosed: true });
    const ananya = await student();

    const res = await ananya.put(`/events/${event.id}/hold`).send({ seatIds: [seats[0]?.id] });

    expect(res.status).toBe(409);
    expect(errorOf(res).code).toBe(ErrorCode.SalesClosed);
  });

  it('requires signing in', async () => {
    const { event, seats } = await reservedEvent();

    const res = await request(ctx.app)
      .put(`/events/${event.id}/hold`)
      .send({ seatIds: [seats[0]?.id] });

    expect(res.status).toBe(401);
  });
});

describe('reserved checkout', () => {
  async function heldCheckout() {
    const setup = await reservedEvent();
    const ananya = await student();
    await ananya
      .put(`/events/${setup.event.id}/hold`)
      .send({ seatIds: [setup.seats[0]?.id, setup.seats[1]?.id] });
    const res = await checkout(ananya, setup.event.id);
    expect(res.status).toBe(201);
    return { ...setup, ananya, order: body<{ order: OrderView }>(res).order };
  }

  it('turns the hold into a pending order and reserves capacity', async () => {
    const { tier, order, event } = await heldCheckout();

    expect(order).toMatchObject({ status: 'PENDING', totalInPaise: 99_800, tickets: [] });
    expect(order.items.map((item) => item.seatLabel)).toEqual([
      'Centre · Row A · Seat 1',
      'Centre · Row A · Seat 2',
    ]);
    expect(await soldCount(tier.id)).toBe(2);
    expect(await seatStatuses(event.slug)).toMatchObject({ 1: 'HELD', 2: 'HELD' });
  });

  it('keeps the selection locked while checkout is open', async () => {
    const { ananya, event, seats, order } = await heldCheckout();
    expect(body<CurrentHoldView>(await ananya.get(`/events/${event.id}/hold`)).pendingOrderId).toBe(
      order.id,
    );

    const res = await ananya.put(`/events/${event.id}/hold`).send({ seatIds: [seats[3]?.id] });

    expect(res.status).toBe(409);
    expect(errorOf(res).code).toBe(ErrorCode.CheckoutInProgress);
  });

  it('returns the same order when the request is retried', async () => {
    const { event, seats } = await reservedEvent();
    const ananya = await student();
    await ananya.put(`/events/${event.id}/hold`).send({ seatIds: [seats[0]?.id] });
    const idempotencyKey = randomUUID();

    const first = await ananya.post('/orders').send({ eventId: event.id, idempotencyKey });
    const retry = await ananya.post('/orders').send({ eventId: event.id, idempotencyKey });
    const second = await checkout(ananya, event.id);

    expect(body<{ order: OrderView }>(retry).order.id).toBe(
      body<{ order: OrderView }>(first).order.id,
    );
    expect(second.status).toBe(409);
    expect(errorOf(second).code).toBe(ErrorCode.CheckoutInProgress);
    expect(await db.order.count()).toBe(1);
  });

  it('asks to choose again when there is no hold', async () => {
    const { event } = await reservedEvent();
    const ananya = await student();

    const res = await checkout(ananya, event.id);

    expect(res.status).toBe(409);
    expect(errorOf(res).code).toBe(ErrorCode.HoldExpired);
  });

  it('issues tickets on confirmation and marks the seats sold', async () => {
    const { order, event, tier } = await heldCheckout();

    const paid = await orders.confirm(order.id, { razorpayPaymentId: 'pay_test_1' });

    expect(paid.status).toBe('PAID');
    expect(paid.tickets.map((ticket) => ticket.seatLabel)).toEqual([
      'Centre · Row A · Seat 1',
      'Centre · Row A · Seat 2',
    ]);
    expect(await seatStatuses(event.slug)).toMatchObject({ 1: 'SOLD', 2: 'SOLD', 3: 'AVAILABLE' });
    expect(await soldCount(tier.id)).toBe(2);
  });

  it('treats a repeated confirmation as a no-op', async () => {
    const { order } = await heldCheckout();
    await orders.confirm(order.id, { razorpayPaymentId: 'pay_test_1' });

    const again = await orders.confirm(order.id, { razorpayPaymentId: 'pay_test_1' });

    expect(again.tickets).toHaveLength(2);
    expect(await db.ticket.count()).toBe(2);
  });

  it('refunds a late payment when the seat was resold meanwhile, without double-booking', async () => {
    const { order, ananya, event, seats, tier } = await heldCheckout();
    await ananya.post(`/orders/${order.id}/cancel`);

    const rohan = await student();
    await rohan.put(`/events/${event.id}/hold`).send({ seatIds: [seats[0]?.id] });
    const rohanOrder = body<{ order: OrderView }>(await checkout(rohan, event.id)).order;
    await orders.confirm(rohanOrder.id, { razorpayPaymentId: 'pay_rohan' });

    const late = await orders.confirm(order.id, { razorpayPaymentId: 'pay_ananya_late' });

    expect(late.status).toBe('REFUND_PENDING');
    expect(late.tickets).toHaveLength(0);
    expect(
      await db.ticket.count({ where: { seatId: seats[0]?.id, status: TicketStatus.ACTIVE } }),
    ).toBe(1);
    expect(await soldCount(tier.id)).toBe(1);
  });

  it('releases seats and capacity when the student cancels', async () => {
    const { order, ananya, event, tier } = await heldCheckout();

    const res = await ananya.post(`/orders/${order.id}/cancel`);

    expect(body<{ order: OrderView }>(res).order.status).toBe('EXPIRED');
    expect(await soldCount(tier.id)).toBe(0);
    expect(await seatStatuses(event.slug)).toMatchObject({ 1: 'AVAILABLE', 2: 'AVAILABLE' });
  });

  it('expires abandoned checkouts and returns their capacity', async () => {
    const { order, tier } = await heldCheckout();
    await db.order.update({
      where: { id: order.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    expect(await orders.expireDue()).toBe(1);

    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
      OrderStatus.EXPIRED,
    );
    expect(await soldCount(tier.id)).toBe(0);
    expect(await orders.expireDue()).toBe(0);
  });

  it('hides orders from other users', async () => {
    const { order } = await heldCheckout();
    const rohan = await student();

    expect((await rohan.get(`/orders/${order.id}`)).status).toBe(404);
    expect((await rohan.post(`/orders/${order.id}/cancel`)).status).toBe(404);
  });
});

describe('general admission checkout', () => {
  it('reserves the requested quantity', async () => {
    const { event, tier } = await generalEvent(10);
    const ananya = await student();

    const res = await checkout(ananya, event.id, { items: [{ tierId: tier.id, quantity: 3 }] });

    expect(body<{ order: OrderView }>(res).order).toMatchObject({
      status: 'PENDING',
      totalInPaise: 44_700,
    });
    expect(await soldCount(tier.id)).toBe(3);
  });

  it('refuses more tickets than are left', async () => {
    const { event, tier } = await generalEvent(2);
    const ananya = await student();

    const res = await checkout(ananya, event.id, { items: [{ tierId: tier.id, quantity: 3 }] });

    expect(res.status).toBe(409);
    expect(errorOf(res).code).toBe(ErrorCode.TierSoldOut);
    expect(await soldCount(tier.id)).toBe(0);
  });

  it('enforces the per-order limit', async () => {
    const { event, tier } = await generalEvent(50);
    const ananya = await student();

    const res = await checkout(ananya, event.id, { items: [{ tierId: tier.id, quantity: 5 }] });

    expect(res.status).toBe(409);
    expect(errorOf(res).code).toBe(ErrorCode.OrderLimitExceeded);
  });

  it('never oversells when many students buy the last tickets at once', async () => {
    const { event, tier } = await generalEvent(5);
    const students = await Promise.all(Array.from({ length: 10 }, () => student()));

    const results = await Promise.all(
      students.map((agent) =>
        checkout(agent, event.id, { items: [{ tierId: tier.id, quantity: 1 }] }),
      ),
    );

    expect(results.filter((res) => res.status === 201)).toHaveLength(5);
    expect(results.filter((res) => res.status === 409)).toHaveLength(5);
    expect(await soldCount(tier.id)).toBe(5);
  });

  it('completes free orders immediately with tickets', async () => {
    const { event, tier } = await generalEvent(150, 0);
    const ananya = await student();

    const res = await checkout(ananya, event.id, { items: [{ tierId: tier.id, quantity: 1 }] });

    const order = body<{ order: OrderView }>(res).order;
    expect(order.status).toBe('PAID');
    expect(order.tickets).toHaveLength(1);
  });
});
