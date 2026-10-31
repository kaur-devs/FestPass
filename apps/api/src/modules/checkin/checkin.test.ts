import { randomUUID } from 'node:crypto';
import {
  EventStatus,
  OrderStatus,
  OrganizationRole,
  SeatingType,
  TicketStatus,
} from '@festpass/db';
import {
  type CheckInEvent,
  type CheckInManifest,
  ErrorCode,
  type EventSalesStats,
  ScanOutcome,
  type ScanResult,
  type VolunteerView,
} from '@festpass/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, testEnv } from '../../test/context';
import { db, resetDatabase } from '../../test/database';
import type { RealtimePublisher } from '../realtime/publisher';
import { TicketCodes } from '../tickets/ticket-codes';

const HOUR = 60 * 60 * 1000;
const codes = new TicketCodes(testEnv.TICKET_SIGNING_SECRET);

class RecordingPublisher implements RealtimePublisher {
  readonly checkIns: string[] = [];

  eventChanged() {
    return Promise.resolve();
  }

  checkInsChanged(eventId: string) {
    this.checkIns.push(eventId);
  }
}

let ctx: ReturnType<typeof createTestContext>;
let publisher: RecordingPublisher;

beforeEach(async () => {
  await resetDatabase();
  publisher = new RecordingPublisher();
  ctx = createTestContext({ realtime: publisher });
});

async function person(name: string) {
  const agent = request.agent(ctx.app);
  const email = `${randomUUID()}@festpass.test`;
  const res = await agent.post('/auth/sign-up').send({ name, email, password: 'pro-night-gate-1' });
  return { agent, email, userId: (res.body as { user: { id: string } }).user.id };
}

async function event(options: { endsInMs?: number; status?: EventStatus } = {}) {
  const endsAt = new Date(Date.now() + (options.endsInMs ?? 4 * HOUR));
  const organizer = await person('Riya Sharma');
  const created = await db.event.create({
    data: {
      slug: `pro-night-${randomUUID()}`,
      title: 'Pro Night',
      venue: 'Main Auditorium',
      startsAt: new Date(endsAt.getTime() - 3 * HOUR),
      endsAt,
      salesStartAt: new Date(endsAt.getTime() - 30 * 24 * HOUR),
      salesEndAt: new Date(endsAt.getTime() - 3 * HOUR),
      status: options.status ?? EventStatus.PUBLISHED,
      seatingType: SeatingType.GENERAL_ADMISSION,
      organization: {
        create: {
          name: 'Utsav Fest Committee',
          slug: `org-${randomUUID()}`,
          members: { create: { userId: organizer.userId, role: OrganizationRole.ORGANIZER } },
        },
      },
    },
  });
  const tier = await db.ticketTier.create({
    data: { eventId: created.id, name: 'Entry', priceInPaise: 9_900, capacity: 100 },
  });
  return { event: created, tier, organizer };
}

async function ticket(eventId: string, tierId: string, holderName = 'Ananya Gupta') {
  const holder = await person(holderName);
  const order = await db.order.create({
    data: {
      userId: holder.userId,
      eventId,
      status: OrderStatus.PAID,
      totalInPaise: 9_900,
      idempotencyKey: randomUUID(),
      expiresAt: new Date(Date.now() + HOUR),
      paidAt: new Date(),
      items: { create: { tierId, quantity: 1, unitPriceInPaise: 9_900 } },
    },
  });
  const issued = await db.ticket.create({
    data: { orderId: order.id, eventId, tierId, holderId: holder.userId },
  });
  return { ticket: issued, code: codes.sign(issued.id) };
}

async function volunteer(eventId: string, gate: string | null = 'Gate 1') {
  const scanner = await person('Kabir Singh');
  await db.eventVolunteer.create({ data: { eventId, userId: scanner.userId, gate } });
  return scanner;
}

function scan(
  agent: ReturnType<typeof request.agent>,
  eventId: string,
  scans: { code: string; scannedAt?: string }[],
  gate?: string,
) {
  return agent.post(`/check-in/events/${eventId}/scans`).send({ scans, gate });
}

function results(res: request.Response) {
  return (res.body as { results: ScanResult[] }).results;
}

describe('scanning tickets', () => {
  it('admits a valid ticket once and reports who scanned it the second time', async () => {
    const { event: fest, tier } = await event();
    const { code } = await ticket(fest.id, tier.id);
    const gate = await volunteer(fest.id);

    const first = await scan(gate.agent, fest.id, [{ code }]);
    const second = await scan(gate.agent, fest.id, [{ code }]);

    expect(first.status).toBe(200);
    expect(results(first)[0]).toMatchObject({
      outcome: ScanOutcome.Admitted,
      ticket: { holderName: 'Ananya Gupta', tierName: 'Entry', seatLabel: null },
      checkIn: { gate: 'Gate 1', scannedBy: 'Kabir Singh' },
    });
    expect(results(second)[0]).toMatchObject({
      outcome: ScanOutcome.AlreadyCheckedIn,
      checkIn: { at: results(first)[0]?.checkIn?.at, gate: 'Gate 1', scannedBy: 'Kabir Singh' },
    });
    expect(await db.checkIn.count()).toBe(1);
    expect(publisher.checkIns).toEqual([fest.id]);
  });

  it('rejects forged, tampered and malformed codes', async () => {
    const { event: fest, tier } = await event();
    const { ticket: issued } = await ticket(fest.id, tier.id);
    const gate = await volunteer(fest.id);
    const forged = new TicketCodes('another-secret-that-is-32-characters-long').sign(issued.id);
    const tampered = codes.sign(issued.id).replace(issued.id, randomUUID());

    const res = await scan(gate.agent, fest.id, [
      { code: forged },
      { code: tampered },
      { code: 'https://example.com' },
    ]);

    expect(results(res).map((result) => result.outcome)).toEqual([
      ScanOutcome.InvalidCode,
      ScanOutcome.InvalidCode,
      ScanOutcome.InvalidCode,
    ]);
    expect(await db.checkIn.count()).toBe(0);
  });

  it('refuses tickets for another event without revealing who holds them', async () => {
    const { event: fest } = await event();
    const other = await event();
    const { code } = await ticket(other.event.id, other.tier.id);
    const gate = await volunteer(fest.id);

    const res = await scan(gate.agent, fest.id, [{ code }]);

    expect(results(res)[0]).toEqual({
      outcome: ScanOutcome.WrongEvent,
      ticket: null,
      checkIn: null,
    });
  });

  it('refuses cancelled tickets', async () => {
    const { event: fest, tier } = await event();
    const { ticket: issued, code } = await ticket(fest.id, tier.id);
    await db.ticket.update({
      where: { id: issued.id },
      data: { status: TicketStatus.CANCELLED, cancelledAt: new Date() },
    });
    const gate = await volunteer(fest.id);

    const res = await scan(gate.agent, fest.id, [{ code }]);

    expect(results(res)[0]?.outcome).toBe(ScanOutcome.TicketCancelled);
    expect(await db.checkIn.count()).toBe(0);
  });

  it('admits a ticket exactly once when two gates scan it at the same moment', async () => {
    const { event: fest, tier } = await event();
    const { code } = await ticket(fest.id, tier.id);
    const gates = await Promise.all([
      volunteer(fest.id, 'Gate 1'),
      volunteer(fest.id, 'Gate 2'),
      volunteer(fest.id, 'Gate 3'),
    ]);

    const responses = await Promise.all(gates.map((gate) => scan(gate.agent, fest.id, [{ code }])));

    const outcomes = responses.map((res) => results(res)[0]?.outcome);
    expect(outcomes.filter((outcome) => outcome === ScanOutcome.Admitted)).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome === ScanOutcome.AlreadyCheckedIn)).toHaveLength(2);
    expect(await db.checkIn.count()).toBe(1);
  });

  it('syncs offline scans in order and keeps the time each was scanned', async () => {
    const { event: fest, tier } = await event();
    const first = await ticket(fest.id, tier.id, 'Ananya Gupta');
    const second = await ticket(fest.id, tier.id, 'Rohan Iyer');
    const gate = await volunteer(fest.id, null);
    const scannedAt = new Date(Date.now() - 20 * 60 * 1000).toISOString();

    const res = await scan(
      gate.agent,
      fest.id,
      [
        { code: first.code, scannedAt },
        { code: second.code, scannedAt },
        { code: first.code, scannedAt: new Date().toISOString() },
      ],
      'North gate',
    );

    expect(results(res).map((result) => result.outcome)).toEqual([
      ScanOutcome.Admitted,
      ScanOutcome.Admitted,
      ScanOutcome.AlreadyCheckedIn,
    ]);
    const stored = await db.checkIn.findUniqueOrThrow({ where: { ticketId: first.ticket.id } });
    expect(stored.deviceScannedAt?.toISOString()).toBe(scannedAt);
    expect(stored.gate).toBe('North gate');
  });

  it('treats a resent offline batch as already admitted rather than a duplicate', async () => {
    const { event: fest, tier } = await event();
    const { code } = await ticket(fest.id, tier.id);
    const gate = await volunteer(fest.id);
    const other = await volunteer(fest.id, 'Gate 2');
    const scannedAt = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    await scan(gate.agent, fest.id, [{ code, scannedAt }]);
    const resent = await scan(gate.agent, fest.id, [{ code, scannedAt }]);
    const elsewhere = await scan(other.agent, fest.id, [{ code, scannedAt }]);

    expect(results(resent)[0]?.outcome).toBe(ScanOutcome.Admitted);
    expect(results(elsewhere)[0]?.outcome).toBe(ScanOutcome.AlreadyCheckedIn);
    expect(await db.checkIn.count()).toBe(1);
  });

  it('lets organizers scan and refuses everyone else', async () => {
    const { event: fest, tier, organizer } = await event();
    const { code } = await ticket(fest.id, tier.id);
    const stranger = await person('Sana Khan');

    const refused = await scan(stranger.agent, fest.id, [{ code }]);
    const anonymous = await request(ctx.app)
      .post(`/check-in/events/${fest.id}/scans`)
      .send({ scans: [{ code }] });
    const allowed = await scan(organizer.agent, fest.id, [{ code }]);

    expect(refused.status).toBe(403);
    expect(anonymous.status).toBe(401);
    expect(results(allowed)[0]?.outcome).toBe(ScanOutcome.Admitted);
  });

  it('checks in a ticket picked from the guest list when the QR code cannot be scanned', async () => {
    const { event: fest, tier } = await event();
    const { ticket: issued } = await ticket(fest.id, tier.id);
    const gate = await volunteer(fest.id);

    const res = await gate.agent
      .post(`/check-in/events/${fest.id}/scans`)
      .send({ scans: [{ ticketId: issued.id }] });
    const both = await gate.agent
      .post(`/check-in/events/${fest.id}/scans`)
      .send({ scans: [{ ticketId: issued.id, code: codes.sign(issued.id) }] });

    expect(results(res)[0]?.outcome).toBe(ScanOutcome.Admitted);
    expect(both.status).toBe(422);
  });

  it('refuses check-in for cancelled events', async () => {
    const { event: fest, tier } = await event({ status: EventStatus.CANCELLED });
    const { code } = await ticket(fest.id, tier.id);
    const gate = await volunteer(fest.id);

    const res = await scan(gate.agent, fest.id, [{ code }]);

    expect(res.status).toBe(409);
    expect((res.body as { error: { code: string } }).error.code).toBe(ErrorCode.EventCancelled);
  });

  it('validates the batch', async () => {
    const { event: fest } = await event();
    const gate = await volunteer(fest.id);

    const empty = await scan(gate.agent, fest.id, []);
    const tooMany = await scan(
      gate.agent,
      fest.id,
      Array.from({ length: 201 }, () => ({ code: 'FP1.x.y' })),
    );

    expect(empty.status).toBe(422);
    expect(tooMany.status).toBe(422);
  });
});

describe('offline manifest', () => {
  it('lists active tickets with their check-in state', async () => {
    const { event: fest, tier } = await event();
    const admitted = await ticket(fest.id, tier.id, 'Ananya Gupta');
    const waiting = await ticket(fest.id, tier.id, 'Rohan Iyer');
    const cancelled = await ticket(fest.id, tier.id, 'Sana Khan');
    await db.ticket.update({
      where: { id: cancelled.ticket.id },
      data: { status: TicketStatus.CANCELLED, cancelledAt: new Date() },
    });
    const gate = await volunteer(fest.id);
    await scan(gate.agent, fest.id, [{ code: admitted.code }]);

    const res = await gate.agent.get(`/check-in/events/${fest.id}/manifest`);
    const { manifest } = res.body as { manifest: CheckInManifest };

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(manifest.event).toMatchObject({ id: fest.id, title: 'Pro Night', gate: 'Gate 1' });
    expect(manifest.tickets).toHaveLength(2);
    const byId = new Map(manifest.tickets.map((entry) => [entry.id, entry]));
    expect(byId.get(admitted.ticket.id)?.checkedInAt).not.toBeNull();
    expect(byId.get(waiting.ticket.id)).toMatchObject({
      holderName: 'Rohan Iyer',
      checkedInAt: null,
    });
  });

  it('is only available to the event team', async () => {
    const { event: fest } = await event();
    const stranger = await person('Sana Khan');

    const res = await stranger.agent.get(`/check-in/events/${fest.id}/manifest`);

    expect(res.status).toBe(403);
  });
});

describe('check-in event list', () => {
  it('shows volunteers and organizers the events they can scan for', async () => {
    const current = await event();
    const ended = await event({ endsInMs: -24 * HOUR });
    const draft = await event({ status: EventStatus.DRAFT });
    const gate = await volunteer(current.event.id, 'Gate 2');
    await db.eventVolunteer.createMany({
      data: [
        { eventId: ended.event.id, userId: gate.userId },
        { eventId: draft.event.id, userId: gate.userId },
      ],
    });
    const stranger = await person('Sana Khan');

    const forVolunteer = await gate.agent.get('/check-in/events');
    const forOrganizer = await current.organizer.agent.get('/check-in/events');
    const forStranger = await stranger.agent.get('/check-in/events');

    const events = (res: request.Response) => (res.body as { events: CheckInEvent[] }).events;
    expect(events(forVolunteer)).toEqual([
      expect.objectContaining({ id: current.event.id, gate: 'Gate 2' }),
    ]);
    expect(events(forOrganizer)).toEqual([
      expect.objectContaining({ id: current.event.id, gate: null }),
    ]);
    expect(events(forStranger)).toEqual([]);
  });
});

describe('managing volunteers', () => {
  it('adds a volunteer by email, who can then scan until removed', async () => {
    const { event: fest, tier, organizer } = await event();
    const { code } = await ticket(fest.id, tier.id);
    const helper = await person('Meera Nair');

    const added = await organizer.agent
      .post(`/manage/events/${fest.id}/volunteers`)
      .send({ email: helper.email.toUpperCase(), gate: 'Gate 2' });
    const listed = await organizer.agent.get(`/manage/events/${fest.id}/volunteers`);
    const scanned = await scan(helper.agent, fest.id, [{ code }]);
    const removed = await organizer.agent.delete(
      `/manage/events/${fest.id}/volunteers/${helper.userId}`,
    );
    const afterRemoval = await helper.agent.get(`/check-in/events/${fest.id}/manifest`);

    expect(added.status).toBe(201);
    expect((added.body as { volunteer: VolunteerView }).volunteer).toEqual({
      userId: helper.userId,
      name: 'Meera Nair',
      email: helper.email,
      gate: 'Gate 2',
      checkIns: 0,
    });
    expect(results(scanned)[0]?.checkIn?.gate).toBe('Gate 2');
    expect((listed.body as { volunteers: VolunteerView[] }).volunteers).toHaveLength(1);
    expect(removed.status).toBe(204);
    expect(afterRemoval.status).toBe(403);
  });

  it('updates the gate when a volunteer is added again', async () => {
    const { event: fest, organizer } = await event();
    const helper = await person('Meera Nair');

    await organizer.agent
      .post(`/manage/events/${fest.id}/volunteers`)
      .send({ email: helper.email, gate: 'Gate 1' });
    await organizer.agent
      .post(`/manage/events/${fest.id}/volunteers`)
      .send({ email: helper.email, gate: 'Gate 3' });

    const volunteers = await db.eventVolunteer.findMany({ where: { eventId: fest.id } });
    expect(volunteers).toEqual([expect.objectContaining({ gate: 'Gate 3' })]);
  });

  it('explains when nobody has signed up with the email', async () => {
    const { event: fest, organizer } = await event();

    const res = await organizer.agent
      .post(`/manage/events/${fest.id}/volunteers`)
      .send({ email: 'nobody@festpass.test' });

    expect(res.status).toBe(404);
    expect((res.body as { error: { message: string } }).error.message).toMatch(/sign up/);
  });

  it('only lets organizers manage volunteers', async () => {
    const { event: fest } = await event();
    const gate = await volunteer(fest.id);

    const res = await gate.agent
      .post(`/manage/events/${fest.id}/volunteers`)
      .send({ email: gate.email });

    expect(res.status).toBe(403);
  });

  it('counts check-ins in the sales figures and per volunteer', async () => {
    const { event: fest, tier, organizer } = await event();
    const first = await ticket(fest.id, tier.id);
    await ticket(fest.id, tier.id);
    const gate = await volunteer(fest.id);
    await scan(gate.agent, fest.id, [{ code: first.code }]);

    const stats = await organizer.agent.get(`/manage/events/${fest.id}/stats`);
    const volunteers = await organizer.agent.get(`/manage/events/${fest.id}/volunteers`);

    expect((stats.body as { stats: EventSalesStats }).stats).toMatchObject({
      ticketsSold: 2,
      ticketsCheckedIn: 1,
    });
    expect((volunteers.body as { volunteers: VolunteerView[] }).volunteers).toEqual([
      expect.objectContaining({ userId: gate.userId, checkIns: 1 }),
    ]);
  });
});
