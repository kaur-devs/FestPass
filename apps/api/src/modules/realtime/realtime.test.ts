import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { EventStatus, OrganizationRole, SeatingType } from '@festpass/db';
import {
  ErrorCode,
  type EventSalesStats,
  type OrderView,
  RealtimeMessage,
  type SeatsUpdatedMessage,
  type SubscribeAck,
  type SubscribeRequest,
  type TiersUpdatedMessage,
} from '@festpass/shared';
import { pino } from 'pino';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, getCookie, testEnv, WEB_ORIGIN } from '../../test/context';
import { db, resetDatabase } from '../../test/database';
import { redis } from '../../test/redis';
import { ACCESS_TOKEN_COOKIE } from '../auth/auth.cookies';
import { SeatHoldStore } from '../holds/seat-hold.store';
import { OrdersRepository } from '../orders/orders.repository';
import { OrdersService } from '../orders/orders.service';
import { TicketCodes } from '../tickets/ticket-codes';
import { createRealtimePublisher } from './create-publisher';
import { attachRealtime } from './socket-server';

const HOUR = 60 * 60 * 1000;
const logger = pino({ level: 'silent' });
const publisher = createRealtimePublisher(db, redis, logger);

let ctx: ReturnType<typeof createTestContext>;
let server: Server;
let realtime: ReturnType<typeof attachRealtime>;
let url: string;
const sockets: Socket[] = [];

beforeEach(async () => {
  await resetDatabase();
  ctx = createTestContext({ realtime: publisher });
  server = ctx.app.listen(0);
  realtime = attachRealtime(server, {
    webOrigin: WEB_ORIGIN,
    jwtSecret: testEnv.JWT_SECRET,
    db,
    redis,
    logger,
  });
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.disconnect();
  await realtime.close();
});

function connect(options: { accessToken?: string; origin?: string } = {}) {
  const socket = io(url, {
    transports: ['websocket'],
    forceNew: true,
    extraHeaders: {
      origin: options.origin ?? WEB_ORIGIN,
      ...(options.accessToken && { cookie: `${ACCESS_TOKEN_COOKIE}=${options.accessToken}` }),
    },
  });
  sockets.push(socket);
  return socket;
}

function subscribe(socket: Socket, subscription: SubscribeRequest): Promise<SubscribeAck> {
  return socket.timeout(3000).emitWithAck('subscribe', subscription) as Promise<SubscribeAck>;
}

function next<T>(socket: Socket, message: string, matches: (payload: T) => boolean = () => true) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for ${message}`));
    }, 3000);
    const listener = (payload: T) => {
      if (!matches(payload)) return;
      clearTimeout(timer);
      socket.off(message, listener);
      resolve(payload);
    };
    socket.on(message, listener);
  });
}

async function student() {
  const agent = request.agent(ctx.app);
  const res = await agent.post('/auth/sign-up').send({
    name: 'Ananya Gupta',
    email: `${randomUUID()}@festpass.test`,
    password: 'freshers-night-2026',
  });
  const user = (res.body as { user: { id: string } }).user;
  return { agent, userId: user.id, accessToken: getCookie(res, ACCESS_TOKEN_COOKIE) ?? '' };
}

async function reservedEvent(priceInPaise = 49_900) {
  const startsAt = new Date(Date.now() + 7 * 24 * HOUR);
  const event = await db.event.create({
    data: {
      slug: `pro-night-${randomUUID()}`,
      title: 'Pro Night',
      venue: 'Main Auditorium',
      startsAt,
      endsAt: new Date(startsAt.getTime() + 3 * HOUR),
      salesStartAt: new Date(Date.now() - HOUR),
      salesEndAt: startsAt,
      status: EventStatus.PUBLISHED,
      seatingType: SeatingType.RESERVED,
      organization: { create: { name: 'Utsav Fest Committee', slug: `org-${randomUUID()}` } },
    },
  });
  const tier = await db.ticketTier.create({
    data: { eventId: event.id, name: 'Gold', priceInPaise, capacity: 4, maxPerOrder: 4 },
  });
  await db.seat.createMany({
    data: [1, 2, 3, 4].map((number) => ({
      eventId: event.id,
      tierId: tier.id,
      section: 'Centre',
      row: 'A',
      number,
      x: number,
      y: 0,
    })),
  });
  const seats = await db.seat.findMany({
    where: { eventId: event.id },
    orderBy: { number: 'asc' },
  });
  return { event, tier, seats };
}

async function viewer(eventId: string) {
  const socket = connect();
  expect(await subscribe(socket, { channel: 'event', eventId })).toEqual({ ok: true });
  return socket;
}

describe('live seat map', () => {
  it('shows a seat as held, with its expiry, the moment someone selects it', async () => {
    const { event, seats } = await reservedEvent();
    const watcher = await viewer(event.id);
    const buyer = await student();
    const seatId = seats[0]?.id ?? '';

    const update = next<SeatsUpdatedMessage>(watcher, RealtimeMessage.SeatsUpdated);
    await buyer.agent.put(`/events/${event.id}/hold`).send({ seatIds: [seatId] });

    const { seats: changed } = await update;
    expect(changed).toEqual([
      { id: seatId, status: 'HELD', heldUntil: expect.any(String) as unknown },
    ]);
    expect(new Date(changed[0]?.heldUntil ?? 0).getTime()).toBeGreaterThan(Date.now() + 4 * 60_000);
  });

  it('shows released seats as available again', async () => {
    const { event, seats } = await reservedEvent();
    const buyer = await student();
    await buyer.agent
      .put(`/events/${event.id}/hold`)
      .send({ seatIds: [seats[0]?.id, seats[1]?.id] });
    const watcher = await viewer(event.id);

    const update = next<SeatsUpdatedMessage>(watcher, RealtimeMessage.SeatsUpdated);
    await buyer.agent.put(`/events/${event.id}/hold`).send({ seatIds: [seats[1]?.id] });

    const statuses = Object.fromEntries((await update).seats.map((seat) => [seat.id, seat.status]));
    expect(statuses).toEqual({ [seats[0]?.id ?? '']: 'AVAILABLE', [seats[1]?.id ?? '']: 'HELD' });
  });

  it('shows purchased seats as sold and updates the tickets left', async () => {
    const { event, seats, tier } = await reservedEvent(0);
    const watcher = await viewer(event.id);
    const buyer = await student();
    await buyer.agent.put(`/events/${event.id}/hold`).send({ seatIds: [seats[2]?.id] });

    const sold = next<SeatsUpdatedMessage>(watcher, RealtimeMessage.SeatsUpdated, (message) =>
      message.seats.some((seat) => seat.status === 'SOLD'),
    );
    const tiers = next<TiersUpdatedMessage>(watcher, RealtimeMessage.TiersUpdated, (message) =>
      message.tiers.some((t) => t.id === tier.id && t.available === 3),
    );
    await buyer.agent.post('/orders').send({ eventId: event.id, idempotencyKey: randomUUID() });

    expect((await sold).seats).toEqual([{ id: seats[2]?.id, status: 'SOLD', heldUntil: null }]);
    await expect(tiers).resolves.toBeDefined();
  });

  it('frees seats when the worker expires an abandoned checkout', async () => {
    const { event, seats } = await reservedEvent();
    const buyer = await student();
    await buyer.agent.put(`/events/${event.id}/hold`).send({ seatIds: [seats[0]?.id] });
    const order = (
      (await buyer.agent.post('/orders').send({ eventId: event.id, idempotencyKey: randomUUID() }))
        .body as { order: OrderView }
    ).order;
    await db.order.update({
      where: { id: order.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const watcher = await viewer(event.id);
    const workerOrders = new OrdersService(
      new OrdersRepository(db),
      new SeatHoldStore(redis),
      new TicketCodes(testEnv.TICKET_SIGNING_SECRET),
      logger,
      { publisher },
    );

    const update = next<SeatsUpdatedMessage>(watcher, RealtimeMessage.SeatsUpdated);
    await workerOrders.expireDue();

    expect((await update).seats).toEqual([
      { id: seats[0]?.id, status: 'AVAILABLE', heldUntil: null },
    ]);
  });

  it('refuses connections from other websites', async () => {
    const socket = connect({ origin: 'https://evil.example' });

    await expect(
      new Promise((resolve, reject) => {
        socket.on('connect', () => {
          reject(new Error('connected'));
        });
        socket.on('connect_error', resolve);
      }),
    ).resolves.toBeDefined();
  });
});

describe('organizer sales channel', () => {
  async function organizerOf(eventId: string) {
    const organizer = await student();
    const event = await db.event.findUniqueOrThrow({ where: { id: eventId } });
    await db.organizationMember.create({
      data: {
        organizationId: event.organizationId,
        userId: organizer.userId,
        role: OrganizationRole.OWNER,
      },
    });
    return organizer;
  }

  it('requires sign-in and the organizer role', async () => {
    const { event } = await reservedEvent();
    const stranger = await student();

    const anonymous = await subscribe(connect(), { channel: 'manage', eventId: event.id });
    const notManager = await subscribe(connect({ accessToken: stranger.accessToken }), {
      channel: 'manage',
      eventId: event.id,
    });

    expect(anonymous).toMatchObject({ ok: false, code: ErrorCode.Unauthenticated });
    expect(notManager).toMatchObject({ ok: false, code: ErrorCode.Forbidden });
  });

  it('notifies organizers of sales and serves the figures', async () => {
    const { event, seats } = await reservedEvent(0);
    const organizer = await organizerOf(event.id);
    const socket = connect({ accessToken: organizer.accessToken });
    expect(await subscribe(socket, { channel: 'manage', eventId: event.id })).toEqual({ ok: true });
    const buyer = await student();
    await buyer.agent
      .put(`/events/${event.id}/hold`)
      .send({ seatIds: [seats[0]?.id, seats[1]?.id] });

    const notified = next(socket, RealtimeMessage.SalesUpdated);
    await buyer.agent.post('/orders').send({ eventId: event.id, idempotencyKey: randomUUID() });
    await notified;

    const res = await organizer.agent.get(`/manage/events/${event.id}/stats`);
    const stats = (res.body as { stats: EventSalesStats }).stats;
    expect(stats).toMatchObject({ ticketsSold: 2, revenueInPaise: 0, checkoutsInProgress: 0 });
    expect(stats.tiers[0]).toMatchObject({ name: 'Gold', sold: 2, capacity: 4 });
    expect(stats.recentOrders).toEqual([
      expect.objectContaining({ buyerName: 'Ananya Gupta', ticketCount: 2 }),
    ]);
    expect((await buyer.agent.get(`/manage/events/${event.id}/stats`)).status).toBe(403);
  });
});
