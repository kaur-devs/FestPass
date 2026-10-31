import { randomUUID } from 'node:crypto';
import { EventStatus, OrderStatus, OrganizationRole, SeatingType } from '@festpass/db';
import {
  apiErrorResponseSchema,
  type CreateEventInput,
  ErrorCode,
  type EventDetail,
  type EventSummary,
  type ManagedEvent,
  type Page,
  type SeatMapInput,
  type SeatView,
  type TierView,
} from '@festpass/shared';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext } from '../../test/context';
import { db, resetDatabase } from '../../test/database';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

let ctx: ReturnType<typeof createTestContext>;

beforeEach(async () => {
  await resetDatabase();
  ctx = createTestContext();
});

afterAll(() => db.$disconnect());

function body<T>(res: { body: unknown }): T {
  return res.body as T;
}

function errorOf(res: { body: unknown }) {
  return apiErrorResponseSchema.parse(res.body).error;
}

async function signedInAgent(email = `${randomUUID()}@festpass.test`) {
  const agent = request.agent(ctx.app);
  const res = await agent
    .post('/auth/sign-up')
    .send({ name: 'Riya Sharma', email, password: 'utsav-pro-night-2027' });
  return { agent, userId: body<{ user: { id: string } }>(res).user.id };
}

async function organizer() {
  const { agent, userId } = await signedInAgent();
  const organization = await db.organization.create({
    data: {
      name: 'Utsav Fest Committee',
      slug: `utsav-${randomUUID()}`,
      members: { create: { userId, role: OrganizationRole.OWNER } },
    },
  });
  return { agent, userId, organizationId: organization.id };
}

function schedule(daysFromNow = 30) {
  const startsAt = new Date(Date.now() + daysFromNow * DAY);
  return {
    startsAt: startsAt.toISOString(),
    endsAt: new Date(startsAt.getTime() + 3 * HOUR).toISOString(),
    salesStartAt: new Date(Date.now() - HOUR).toISOString(),
    salesEndAt: new Date(startsAt.getTime() - HOUR).toISOString(),
  };
}

function eventInput(overrides: Partial<CreateEventInput> = {}): CreateEventInput {
  return {
    title: 'Utsav 2027: Pro Night',
    description: 'Closing night with a headline act.',
    venue: 'Main Auditorium',
    timezone: 'Asia/Kolkata',
    seatingType: 'RESERVED',
    ...schedule(),
    ...overrides,
  };
}

async function createEvent(
  agent: ReturnType<typeof request.agent>,
  organizationId: string,
  input = eventInput(),
) {
  const res = await agent.post(`/manage/organizations/${organizationId}/events`).send(input);
  expect(res.status).toBe(201);
  return body<{ event: ManagedEvent }>(res).event;
}

async function addTier(
  agent: ReturnType<typeof request.agent>,
  eventId: string,
  tier: { name: string; priceInPaise: number; capacity?: number },
) {
  const res = await agent.post(`/manage/events/${eventId}/tiers`).send(tier);
  expect(res.status).toBe(201);
  return body<{ tier: TierView }>(res).tier;
}

function auditorium(goldId: string, silverId: string): SeatMapInput {
  return {
    sections: [
      {
        name: 'Centre',
        rows: [
          { label: 'A', seatCount: 6, tierId: goldId, accessibleSeats: [1] },
          { label: 'B', seatCount: 8, tierId: silverId },
        ],
      },
    ],
  };
}

async function sellSeat(eventId: string, tierId: string, seatId: string) {
  const buyer = await db.user.create({
    data: { email: `${randomUUID()}@festpass.test`, name: 'Buyer' },
  });
  const order = await db.order.create({
    data: {
      userId: buyer.id,
      eventId,
      status: OrderStatus.PAID,
      totalInPaise: 79_900,
      idempotencyKey: randomUUID(),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      paidAt: new Date(),
      items: { create: { tierId, seatId, unitPriceInPaise: 79_900 } },
    },
  });
  await db.ticket.create({
    data: { orderId: order.id, eventId, tierId, seatId, holderId: buyer.id },
  });
  await db.ticketTier.update({ where: { id: tierId }, data: { soldCount: { increment: 1 } } });
}

describe('creating events', () => {
  it('creates a draft with a link derived from the title', async () => {
    const { agent, organizationId } = await organizer();
    const event = await createEvent(agent, organizationId);

    expect(event).toMatchObject({
      status: 'DRAFT',
      slug: 'utsav-2027-pro-night',
      organizationId,
      tiers: [],
      seatCount: 0,
      seatMap: null,
    });
    expect(event.publishIssues).toEqual(['Add at least one ticket tier.', 'Build the seat map.']);
  });

  it('numbers the link when the title is already taken', async () => {
    const { agent, organizationId } = await organizer();
    await createEvent(agent, organizationId);

    expect((await createEvent(agent, organizationId)).slug).toBe('utsav-2027-pro-night-2');
  });

  it('checks the schedule makes sense', async () => {
    const { agent, organizationId } = await organizer();
    const { startsAt } = schedule();

    const res = await agent
      .post(`/manage/organizations/${organizationId}/events`)
      .send(eventInput({ endsAt: startsAt, timezone: 'Mars/Olympus_Mons' }));

    expect(res.status).toBe(422);
    expect(errorOf(res).details).toMatchObject({
      fieldErrors: {
        endsAt: ['End after the event starts.'],
        timezone: ['Choose a valid time zone.'],
      },
    });
  });

  it('is limited to members of the organization', async () => {
    const { organizationId } = await organizer();
    const { agent: outsider } = await signedInAgent();

    const forbidden = await outsider
      .post(`/manage/organizations/${organizationId}/events`)
      .send(eventInput());
    const anonymous = await request(ctx.app)
      .post(`/manage/organizations/${organizationId}/events`)
      .send(eventInput());

    expect(forbidden.status).toBe(403);
    expect(anonymous.status).toBe(401);
  });

  it('answers 404, not 500, for malformed ids', async () => {
    const { agent } = await organizer();

    expect((await agent.get('/manage/events/not-a-uuid')).status).toBe(404);
  });
});

describe('general admission', () => {
  it('requires a capacity for every tier', async () => {
    const { agent, organizationId } = await organizer();
    const event = await createEvent(
      agent,
      organizationId,
      eventInput({ seatingType: 'GENERAL_ADMISSION' }),
    );

    const res = await agent
      .post(`/manage/events/${event.id}/tiers`)
      .send({ name: 'Regular', priceInPaise: 24_900 });

    expect(res.status).toBe(422);
    expect(errorOf(res).details).toMatchObject({
      fieldErrors: { capacity: expect.any(Array) as unknown },
    });
  });

  it('publishes once it has a tier, and appears in the public listing', async () => {
    const { agent, organizationId } = await organizer();
    const event = await createEvent(
      agent,
      organizationId,
      eventInput({ title: 'Battle of the Bands', seatingType: 'GENERAL_ADMISSION' }),
    );
    await addTier(agent, event.id, { name: 'Early bird', priceInPaise: 14_900, capacity: 200 });

    expect((await request(ctx.app).get(`/events/${event.slug}`)).status).toBe(404);

    const published = await agent.post(`/manage/events/${event.id}/publish`);
    expect(published.status).toBe(200);

    const detail = body<{ event: EventDetail }>(
      await request(ctx.app).get(`/events/${event.slug}`),
    ).event;
    expect(detail).toMatchObject({ status: 'PUBLISHED', priceFrom: 14_900, soldOut: false });
    expect(detail.tiers[0]).toMatchObject({ name: 'Early bird', capacity: 200, available: 200 });

    const list = body<Page<EventSummary>>(await request(ctx.app).get('/events'));
    expect(list.items.map((item) => item.slug)).toEqual([event.slug]);
  });

  it('refuses a capacity below tickets already sold', async () => {
    const { agent, organizationId } = await organizer();
    const event = await createEvent(
      agent,
      organizationId,
      eventInput({ seatingType: 'GENERAL_ADMISSION' }),
    );
    const tier = await addTier(agent, event.id, {
      name: 'Regular',
      priceInPaise: 24_900,
      capacity: 10,
    });
    await db.ticketTier.update({ where: { id: tier.id }, data: { soldCount: 8 } });

    const res = await agent
      .patch(`/manage/events/${event.id}/tiers/${tier.id}`)
      .send({ name: 'Regular', priceInPaise: 24_900, capacity: 5 });

    expect(res.status).toBe(409);
    expect(errorOf(res).code).toBe(ErrorCode.CapacityBelowSold);
  });

  it('rejects duplicate tier names', async () => {
    const { agent, organizationId } = await organizer();
    const event = await createEvent(
      agent,
      organizationId,
      eventInput({ seatingType: 'GENERAL_ADMISSION' }),
    );
    await addTier(agent, event.id, { name: 'Regular', priceInPaise: 24_900, capacity: 10 });

    const res = await agent
      .post(`/manage/events/${event.id}/tiers`)
      .send({ name: 'Regular', priceInPaise: 19_900, capacity: 10 });

    expect(res.status).toBe(409);
    expect(errorOf(res).code).toBe(ErrorCode.TierNameTaken);
  });
});

describe('reserved seating', () => {
  async function reservedEvent() {
    const owner = await organizer();
    const event = await createEvent(owner.agent, owner.organizationId);
    const gold = await addTier(owner.agent, event.id, { name: 'Gold', priceInPaise: 79_900 });
    const silver = await addTier(owner.agent, event.id, { name: 'Silver', priceInPaise: 49_900 });
    return { ...owner, event, gold, silver };
  }

  it('lists what is missing before publishing', async () => {
    const { agent, event } = await reservedEvent();

    const res = await agent.post(`/manage/events/${event.id}/publish`);

    expect(res.status).toBe(409);
    expect(errorOf(res)).toMatchObject({
      code: ErrorCode.EventNotReady,
      details: ['Build the seat map.'],
    });
  });

  it('builds seats from the layout and sets tier capacity to the seat count', async () => {
    const { agent, event, gold, silver } = await reservedEvent();
    const map = auditorium(gold.id, silver.id);

    const res = await agent.put(`/manage/events/${event.id}/seat-map`).send(map);

    expect(res.status).toBe(200);
    const updated = body<{ event: ManagedEvent }>(res).event;
    expect(updated.seatCount).toBe(14);
    expect(updated.tiers.map((tier) => [tier.name, tier.capacity])).toEqual([
      ['Gold', 6],
      ['Silver', 8],
    ]);
    expect(updated.seatMap).toEqual({
      sections: [
        {
          name: 'Centre',
          rows: [
            { label: 'A', seatCount: 6, tierId: gold.id, accessibleSeats: [1] },
            { label: 'B', seatCount: 8, tierId: silver.id, accessibleSeats: [] },
          ],
        },
      ],
    });
    expect(updated.publishIssues).toEqual([]);
  });

  it('only accepts tiers from the same event', async () => {
    const { agent, event, gold } = await reservedEvent();

    const res = await agent
      .put(`/manage/events/${event.id}/seat-map`)
      .send(auditorium(gold.id, randomUUID()));

    expect(res.status).toBe(422);
    expect(errorOf(res).details).toMatchObject({
      fieldErrors: { 'sections.0.rows.1.tierId': ['Choose a tier from this event.'] },
    });
  });

  it('shows sold seats on the public seat map and locks the layout after a sale', async () => {
    const { agent, event, gold, silver } = await reservedEvent();
    await agent.put(`/manage/events/${event.id}/seat-map`).send(auditorium(gold.id, silver.id));
    await agent.post(`/manage/events/${event.id}/publish`);
    const seat = await db.seat.findFirstOrThrow({
      where: { eventId: event.id, row: 'A', number: 3 },
    });
    await sellSeat(event.id, gold.id, seat.id);

    const seats = body<{ seats: SeatView[] }>(
      await request(ctx.app).get(`/events/${event.slug}/seats`),
    ).seats;
    expect(seats).toHaveLength(14);
    expect(seats.filter((s) => s.status === 'SOLD').map((s) => `${s.row}${s.number}`)).toEqual([
      'A3',
    ]);
    expect(seats.find((s) => s.row === 'A' && s.number === 1)?.isAccessible).toBe(true);

    const detail = body<{ event: EventDetail }>(
      await request(ctx.app).get(`/events/${event.slug}`),
    ).event;
    expect(detail.tiers.find((t) => t.id === gold.id)?.available).toBe(5);

    const relayout = await agent
      .put(`/manage/events/${event.id}/seat-map`)
      .send(auditorium(gold.id, silver.id));
    expect(relayout.status).toBe(409);
    expect(errorOf(relayout).code).toBe(ErrorCode.SeatMapLocked);

    const deleteTier = await agent.delete(`/manage/events/${event.id}/tiers/${gold.id}`);
    expect(deleteTier.status).toBe(409);
    expect(errorOf(deleteTier).code).toBe(ErrorCode.TierHasSales);
  });

  it('asks to remove a tier from the seat map before deleting it', async () => {
    const { agent, event, gold, silver } = await reservedEvent();
    await agent.put(`/manage/events/${event.id}/seat-map`).send(auditorium(gold.id, silver.id));

    const res = await agent.delete(`/manage/events/${event.id}/tiers/${silver.id}`);

    expect(res.status).toBe(409);
    expect(errorOf(res).code).toBe(ErrorCode.TierInSeatMap);
  });

  it('refuses a seat map for general admission events', async () => {
    const { agent, organizationId } = await organizer();
    const event = await createEvent(
      agent,
      organizationId,
      eventInput({ seatingType: 'GENERAL_ADMISSION' }),
    );
    const tier = await addTier(agent, event.id, { name: 'Entry', priceInPaise: 0, capacity: 50 });

    const res = await agent
      .put(`/manage/events/${event.id}/seat-map`)
      .send(auditorium(tier.id, tier.id));

    expect(res.status).toBe(409);
    expect(errorOf(res).code).toBe(ErrorCode.SeatingTypeMismatch);
  });
});

describe('editing and cancelling', () => {
  it('lets the link change only while the event is a draft', async () => {
    const { agent, organizationId } = await organizer();
    const event = await createEvent(
      agent,
      organizationId,
      eventInput({ seatingType: 'GENERAL_ADMISSION' }),
    );
    const { seatingType: _seatingType, ...details } = eventInput();

    const renamed = await agent
      .patch(`/manage/events/${event.id}`)
      .send({ ...details, slug: 'pro-night' });
    expect(body<{ event: ManagedEvent }>(renamed).event.slug).toBe('pro-night');

    await addTier(agent, event.id, { name: 'Entry', priceInPaise: 0, capacity: 50 });
    await agent.post(`/manage/events/${event.id}/publish`);
    const blocked = await agent
      .patch(`/manage/events/${event.id}`)
      .send({ ...details, slug: 'another-link' });

    expect(blocked.status).toBe(409);
    expect(errorOf(blocked).code).toBe(ErrorCode.SlugTaken);
  });

  it('keeps a cancelled event visible by link but out of listings and read-only', async () => {
    const { agent, organizationId } = await organizer();
    const event = await createEvent(
      agent,
      organizationId,
      eventInput({ seatingType: 'GENERAL_ADMISSION' }),
    );
    await addTier(agent, event.id, { name: 'Entry', priceInPaise: 0, capacity: 50 });
    await agent.post(`/manage/events/${event.id}/publish`);

    expect((await agent.post(`/manage/events/${event.id}/cancel`)).status).toBe(200);

    const detail = body<{ event: EventDetail }>(
      await request(ctx.app).get(`/events/${event.slug}`),
    ).event;
    expect(detail.status).toBe('CANCELLED');
    expect(body<Page<EventSummary>>(await request(ctx.app).get('/events')).items).toEqual([]);

    const { seatingType: _seatingType, ...details } = eventInput();
    const edit = await agent.patch(`/manage/events/${event.id}`).send(details);
    expect(edit.status).toBe(409);
    expect(errorOf(edit).code).toBe(ErrorCode.EventCancelled);
  });
});

describe('public listing', () => {
  async function publishedEvent(organizationId: string, daysFromNow: number, title: string) {
    const startsAt = new Date(Date.now() + daysFromNow * DAY);
    return db.event.create({
      data: {
        organizationId,
        slug: `${title.toLowerCase().replace(/\s+/g, '-')}-${randomUUID().slice(0, 8)}`,
        title,
        venue: 'Open Air Theatre',
        startsAt,
        endsAt: new Date(startsAt.getTime() + 3 * HOUR),
        salesStartAt: new Date(startsAt.getTime() - 30 * DAY),
        salesEndAt: startsAt,
        status: EventStatus.PUBLISHED,
        seatingType: SeatingType.GENERAL_ADMISSION,
        tiers: { create: { name: 'Entry', priceInPaise: 9_900, capacity: 100 } },
      },
    });
  }

  it('pages through upcoming events, soonest first, with a cursor', async () => {
    const { organizationId } = await organizer();
    await publishedEvent(organizationId, 10, 'Hackathon');
    await publishedEvent(organizationId, 3, 'Freshers Night');
    await publishedEvent(organizationId, 20, 'Pro Night');
    await publishedEvent(organizationId, -5, 'Last Month');

    const first = body<Page<EventSummary>>(
      await request(ctx.app).get('/events').query({ limit: 2 }),
    );
    expect(first.items.map((e) => e.title)).toEqual(['Freshers Night', 'Hackathon']);
    expect(first.nextCursor).not.toBeNull();

    const second = body<Page<EventSummary>>(
      await request(ctx.app).get('/events').query({ limit: 2, cursor: first.nextCursor }),
    );
    expect(second.items.map((e) => e.title)).toEqual(['Pro Night']);
    expect(second.nextCursor).toBeNull();
  });

  it('rejects a tampered cursor', async () => {
    const res = await request(ctx.app).get('/events').query({ cursor: 'bm90LWEtY3Vyc29y' });

    expect(res.status).toBe(422);
  });
});
