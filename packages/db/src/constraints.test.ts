import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { type ConstraintViolationKind, getConstraintViolation } from './errors';
import { SeatingType, TicketStatus } from './generated/prisma/client';
import { db, truncateAll } from './test/database';
import {
  createEvent,
  createPaidOrder,
  createReservedBooking,
  createSeat,
  createTier,
  createUser,
} from './test/factories';

async function expectViolation(
  operation: Promise<unknown>,
  kind: ConstraintViolationKind,
  constraint: string,
) {
  const error: unknown = await operation.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(getConstraintViolation(error)).toEqual({ kind, constraint });
}

beforeEach(truncateAll);
afterAll(() => db.$disconnect());

describe('tickets', () => {
  it('allows only one active ticket per seat', async () => {
    const { user, event, tier, seat, order } = await createReservedBooking();
    const ticket = {
      orderId: order.id,
      eventId: event.id,
      tierId: tier.id,
      seatId: seat.id,
      holderId: user.id,
    };
    await db.ticket.create({ data: ticket });

    await expectViolation(db.ticket.create({ data: ticket }), 'unique', 'tickets_active_seat_key');
  });

  it('frees the seat once its ticket is cancelled', async () => {
    const { user, event, tier, seat, order } = await createReservedBooking();
    const ticket = {
      orderId: order.id,
      eventId: event.id,
      tierId: tier.id,
      seatId: seat.id,
      holderId: user.id,
    };
    const first = await db.ticket.create({ data: ticket });
    await db.ticket.update({
      where: { id: first.id },
      data: { status: TicketStatus.CANCELLED, cancelledAt: new Date() },
    });

    await expect(db.ticket.create({ data: ticket })).resolves.toMatchObject({ seatId: seat.id });
  });

  it('records a cancellation time exactly when cancelled', async () => {
    const { user, event, tier, seat, order } = await createReservedBooking();
    const ticket = await db.ticket.create({
      data: {
        orderId: order.id,
        eventId: event.id,
        tierId: tier.id,
        seatId: seat.id,
        holderId: user.id,
      },
    });

    await expectViolation(
      db.ticket.update({ where: { id: ticket.id }, data: { status: TicketStatus.CANCELLED } }),
      'check',
      'tickets_cancellation_check',
    );
  });

  it('belongs to the same event as its order', async () => {
    const { user, tier, order } = await createReservedBooking();
    const otherEvent = await createEvent();

    await expectViolation(
      db.ticket.create({
        data: { orderId: order.id, eventId: otherEvent.id, tierId: tier.id, holderId: user.id },
      }),
      'foreign_key',
      'tickets_order_id_event_id_fkey',
    );
  });
});

describe('check-ins', () => {
  it('admits each ticket only once', async () => {
    const { user, event, tier, seat, order } = await createReservedBooking();
    const ticket = await db.ticket.create({
      data: {
        orderId: order.id,
        eventId: event.id,
        tierId: tier.id,
        seatId: seat.id,
        holderId: user.id,
      },
    });
    const checkIn = {
      ticketId: ticket.id,
      eventId: event.id,
      scannedById: user.id,
      gate: 'Gate 1',
    };
    await db.checkIn.create({ data: checkIn });

    await expectViolation(
      db.checkIn.create({ data: { ...checkIn, gate: 'Gate 2' } }),
      'unique',
      'check_ins_ticket_id_key',
    );
  });
});

describe('ticket tiers', () => {
  it('never records more sales than capacity', async () => {
    const event = await createEvent(SeatingType.GENERAL_ADMISSION);
    const tier = await createTier(event.id, { capacity: 2 });

    await expectViolation(
      db.ticketTier.update({ where: { id: tier.id }, data: { soldCount: { increment: 3 } } }),
      'check',
      'ticket_tiers_capacity_check',
    );
  });
});

describe('seats', () => {
  it('uses a tier from its own event', async () => {
    const event = await createEvent();
    const otherEvent = await createEvent();
    const foreignTier = await createTier(otherEvent.id);

    await expectViolation(
      createSeat(event.id, foreignTier.id),
      'foreign_key',
      'seats_tier_id_event_id_fkey',
    );
  });

  it('has a unique position in the venue', async () => {
    const event = await createEvent();
    const tier = await createTier(event.id);
    await createSeat(event.id, tier.id, 7);

    await expectViolation(
      createSeat(event.id, tier.id, 7),
      'unique',
      'seats_event_id_section_row_number_key',
    );
  });
});

describe('orders', () => {
  it('accepts each idempotency key once per user', async () => {
    const user = await createUser();
    const event = await createEvent();
    const order = await createPaidOrder(user.id, event.id);

    await expectViolation(
      db.order.create({
        data: {
          userId: user.id,
          eventId: event.id,
          totalInPaise: 0,
          idempotencyKey: order.idempotencyKey,
          expiresAt: new Date(),
        },
      }),
      'unique',
      'orders_user_id_idempotency_key_key',
    );
  });

  it('applies each payment to one order only', async () => {
    const user = await createUser();
    const event = await createEvent();
    const paymentId = `pay_${randomUUID()}`;
    const first = await createPaidOrder(user.id, event.id);
    const second = await createPaidOrder(user.id, event.id);
    await db.order.update({ where: { id: first.id }, data: { razorpayPaymentId: paymentId } });

    await expectViolation(
      db.order.update({ where: { id: second.id }, data: { razorpayPaymentId: paymentId } }),
      'unique',
      'orders_razorpay_payment_id_key',
    );
  });

  it('records a payment time exactly when paid', async () => {
    const user = await createUser();
    const event = await createEvent();
    const order = await createPaidOrder(user.id, event.id);

    await expectViolation(
      db.order.update({ where: { id: order.id }, data: { paidAt: null } }),
      'check',
      'orders_paid_at_check',
    );
  });
});

describe('users', () => {
  it('stores email addresses in lowercase', async () => {
    await expectViolation(
      createUser({ email: 'Riya@FestPass.test' }),
      'check',
      'users_email_lowercase_check',
    );
  });
});

describe('events', () => {
  it('ends after it starts', async () => {
    const event = await createEvent();

    await expectViolation(
      db.event.update({ where: { id: event.id }, data: { endsAt: event.startsAt } }),
      'check',
      'events_schedule_check',
    );
  });
});

describe('getConstraintViolation', () => {
  it('ignores errors that are not constraint violations', () => {
    expect(getConstraintViolation(new Error('network down'))).toBeUndefined();
  });
});
