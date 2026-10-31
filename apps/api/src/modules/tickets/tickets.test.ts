import { randomUUID } from 'node:crypto';
import { EventStatus, SeatingType } from '@festpass/db';
import type { OrderView } from '@festpass/shared';
import { pino } from 'pino';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import type { TicketDelivery } from '../../jobs/queues';
import { createTestContext, InMemoryEmailSender, testEnv, WEB_ORIGIN } from '../../test/context';
import { db, resetDatabase } from '../../test/database';
import { redis } from '../../test/redis';
import { SeatHoldStore } from '../holds/seat-hold.store';
import { OrdersRepository } from '../orders/orders.repository';
import { OrdersService } from '../orders/orders.service';
import { TicketCodes } from './ticket-codes';
import { TicketDocuments } from './ticket-documents';
import { renderTicketsPdf } from './ticket-pdf';

const HOUR = 60 * 60 * 1000;
const codes = new TicketCodes(testEnv.TICKET_SIGNING_SECRET);

class RecordingDelivery implements TicketDelivery {
  readonly orderIds: string[] = [];

  ticketsIssued(orderId: string) {
    this.orderIds.push(orderId);
    return Promise.resolve();
  }
}

let delivery: RecordingDelivery;
let ctx: ReturnType<typeof createTestContext>;

beforeEach(async () => {
  await resetDatabase();
  delivery = new RecordingDelivery();
  ctx = createTestContext({ ticketDelivery: delivery });
});

function pageCount(pdf: Buffer): number {
  return pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)?.length ?? 0;
}

async function freeOrder(priceInPaise = 0) {
  const startsAt = new Date(Date.now() + 7 * 24 * HOUR);
  const event = await db.event.create({
    data: {
      slug: `hack-${randomUUID()}`,
      title: 'HackRiverside',
      venue: 'Innovation Centre',
      startsAt,
      endsAt: new Date(startsAt.getTime() + 24 * HOUR),
      salesStartAt: new Date(Date.now() - HOUR),
      salesEndAt: startsAt,
      status: EventStatus.PUBLISHED,
      seatingType: SeatingType.GENERAL_ADMISSION,
      organization: { create: { name: 'Robotics Club', slug: `org-${randomUUID()}` } },
    },
  });
  const tier = await db.ticketTier.create({
    data: { eventId: event.id, name: 'Participant', priceInPaise, capacity: 50, maxPerOrder: 4 },
  });
  const agent = request.agent(ctx.app);
  const email = `${randomUUID()}@festpass.test`;
  await agent
    .post('/auth/sign-up')
    .send({ name: 'Arjun Menon', email, password: 'hack-riverside-2027' });
  const res = await agent.post('/orders').send({
    eventId: event.id,
    idempotencyKey: randomUUID(),
    items: [{ tierId: tier.id, quantity: 2 }],
  });
  return { agent, email, event, order: (res.body as { order: OrderView }).order };
}

describe('ticket PDF', () => {
  it('renders one page per ticket', async () => {
    const ticket = {
      code: codes.sign(randomUUID()),
      reference: 'ABC123',
      eventTitle: 'Pro Night',
      venue: 'Main Auditorium',
      when: 'Tue, 24 Nov · 7:00 PM',
      tierName: 'Gold',
      seatLabel: 'Centre · Row A · Seat 1',
      holderName: 'Riya Sharma',
    };

    const pdf = await renderTicketsPdf([ticket, { ...ticket, seatLabel: null }]);

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pageCount(pdf)).toBe(2);
  });
});

describe('issued tickets', () => {
  it('carry signed codes that verify to the ticket', async () => {
    const { order } = await freeOrder();

    expect(order.tickets).toHaveLength(2);
    for (const ticket of order.tickets) expect(codes.verify(ticket.code)).toBe(ticket.id);
  });

  it('are queued for email exactly once, when first issued', async () => {
    const { order } = await freeOrder();
    const orders = new OrdersService(
      new OrdersRepository(db),
      new SeatHoldStore(redis),
      codes,
      pino({ level: 'silent' }),
      { delivery },
    );

    await orders.confirm(order.id);

    expect(delivery.orderIds).toEqual([order.id]);
  });

  it('are not queued while the order is unpaid', async () => {
    await freeOrder(24_900);

    expect(delivery.orderIds).toEqual([]);
  });
});

describe('PDF download', () => {
  it('serves the paid order as a PDF to its owner only', async () => {
    const { agent, order } = await freeOrder();
    const stranger = request.agent(ctx.app);
    await stranger.post('/auth/sign-up').send({
      name: 'Someone Else',
      email: `${randomUUID()}@festpass.test`,
      password: 'someone-else-2027',
    });

    const res = await agent.get(`/orders/${order.id}/tickets.pdf`).buffer(true);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toContain('festpass-hack-');
    expect(pageCount(res.body as Buffer)).toBe(2);
    expect((await stranger.get(`/orders/${order.id}/tickets.pdf`)).status).toBe(404);
  });

  it('is not available before payment', async () => {
    const { agent, order } = await freeOrder(24_900);

    expect((await agent.get(`/orders/${order.id}/tickets.pdf`)).status).toBe(409);
  });
});

describe('ticket email', () => {
  it('sends the tickets as a PDF attachment to the buyer', async () => {
    const { email, order } = await freeOrder();
    const sender = new InMemoryEmailSender();

    const outcome = await new TicketDocuments(db, codes, WEB_ORIGIN).emailTickets(order.id, sender);

    expect(outcome).toBe('sent');
    const [message] = sender.sent;
    expect(message?.to).toBe(email);
    expect(message?.subject).toBe('Your 2 tickets for HackRiverside');
    expect(message?.text).toContain(`${WEB_ORIGIN}/orders/${order.id}`);
    expect(message?.attachments?.[0]?.filename).toMatch(/^festpass-hack-.+\.pdf$/);
    expect(pageCount(message?.attachments?.[0]?.content ?? Buffer.alloc(0))).toBe(2);
  });

  it('skips orders that are not paid', async () => {
    const { order } = await freeOrder(24_900);
    const sender = new InMemoryEmailSender();

    expect(await new TicketDocuments(db, codes, WEB_ORIGIN).emailTickets(order.id, sender)).toBe(
      'skipped',
    );
    expect(sender.sent).toEqual([]);
  });
});
