import { randomUUID } from 'node:crypto';
import { EventStatus, OrderStatus, SeatingType } from '../generated/prisma/client';
import { db } from './database';

const HOUR = 60 * 60 * 1000;

export async function createUser(overrides: { email?: string } = {}) {
  return db.user.create({
    data: { email: overrides.email ?? `${randomUUID()}@festpass.test`, name: 'Test User' },
  });
}

export async function createEvent(seatingType: SeatingType = SeatingType.RESERVED) {
  const slug = `event-${randomUUID()}`;
  const startsAt = new Date(Date.now() + 48 * HOUR);
  return db.event.create({
    data: {
      slug,
      title: 'Test Event',
      venue: 'Main Auditorium',
      startsAt,
      endsAt: new Date(startsAt.getTime() + 3 * HOUR),
      salesStartAt: new Date(Date.now() - HOUR),
      salesEndAt: startsAt,
      status: EventStatus.PUBLISHED,
      seatingType,
      organization: { create: { name: 'Test Org', slug: `org-${randomUUID()}` } },
    },
  });
}

export async function createTier(eventId: string, overrides: { capacity?: number } = {}) {
  return db.ticketTier.create({
    data: {
      eventId,
      name: `Tier ${randomUUID()}`,
      priceInPaise: 49_900,
      capacity: overrides.capacity ?? null,
    },
  });
}

export async function createSeat(eventId: string, tierId: string, number = 1) {
  return db.seat.create({
    data: { eventId, tierId, section: 'Centre', row: 'A', number, x: number, y: 0 },
  });
}

export async function createPaidOrder(userId: string, eventId: string) {
  return db.order.create({
    data: {
      userId,
      eventId,
      status: OrderStatus.PAID,
      totalInPaise: 49_900,
      idempotencyKey: randomUUID(),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      paidAt: new Date(),
    },
  });
}

export async function createReservedBooking() {
  const user = await createUser();
  const event = await createEvent();
  const tier = await createTier(event.id);
  const seat = await createSeat(event.id, tier.id);
  const order = await createPaidOrder(user.id, event.id);
  return { user, event, tier, seat, order };
}
