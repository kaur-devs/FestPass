import {
  EventStatus,
  OrderStatus,
  type Prisma,
  type PrismaClient,
  TicketStatus,
} from '@festpass/db';
import type { EventCursor } from '../../lib/cursor';
import type { PlacedSeat } from '@festpass/shared';

const withRelations = {
  organization: { select: { name: true, slug: true } },
  tiers: { orderBy: [{ sortOrder: 'asc' }, { priceInPaise: 'desc' }] },
} satisfies Prisma.EventInclude;

export class EventsRepository {
  constructor(private readonly db: PrismaClient) {}

  listUpcomingPublished(now: Date, limit: number, after?: EventCursor) {
    return this.db.event.findMany({
      where: {
        status: EventStatus.PUBLISHED,
        endsAt: { gt: now },
        ...(after && {
          OR: [
            { startsAt: { gt: new Date(after.startsAt) } },
            { startsAt: new Date(after.startsAt), id: { gt: after.id } },
          ],
        }),
      },
      include: withRelations,
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
      take: limit,
    });
  }

  findPublicBySlug(slug: string) {
    return this.db.event.findFirst({
      where: { slug, status: { in: [EventStatus.PUBLISHED, EventStatus.CANCELLED] } },
      include: withRelations,
    });
  }

  findById(id: string) {
    return this.db.event.findUnique({ where: { id }, include: withRelations });
  }

  listForOrganization(organizationId: string) {
    return this.db.event.findMany({
      where: { organizationId },
      include: withRelations,
      orderBy: [{ startsAt: 'desc' }, { id: 'asc' }],
    });
  }

  async seatsWithStatus(eventId: string) {
    const seats = await this.db.seat.findMany({
      where: { eventId },
      include: {
        tickets: { where: { status: TicketStatus.ACTIVE }, select: { id: true }, take: 1 },
      },
      orderBy: [{ y: 'asc' }, { x: 'asc' }],
    });
    return seats.map(({ tickets, ...seat }) => ({ ...seat, sold: tickets.length > 0 }));
  }

  async salesFigures(eventId: string, now: Date) {
    const [tiers, ticketsByTier, revenueByTier, checkoutsInProgress, recentOrders, checkedIn] =
      await Promise.all([
        this.db.ticketTier.findMany({
          where: { eventId },
          orderBy: [{ sortOrder: 'asc' }, { priceInPaise: 'desc' }],
        }),
        this.db.ticket.groupBy({
          by: ['tierId'],
          where: { eventId, status: TicketStatus.ACTIVE },
          _count: { _all: true },
        }),
        this.db.$queryRaw<{ tierId: string; revenue: number }[]>`
          SELECT i.tier_id AS "tierId", SUM(i.unit_price_in_paise * i.quantity)::int AS revenue
          FROM order_items i JOIN orders o ON o.id = i.order_id
          WHERE o.event_id = ${eventId}::uuid AND o.status = 'PAID'
          GROUP BY i.tier_id
        `,
        this.db.order.count({
          where: { eventId, status: OrderStatus.PENDING, expiresAt: { gt: now } },
        }),
        this.db.order.findMany({
          where: { eventId, status: OrderStatus.PAID },
          include: { user: { select: { name: true } }, _count: { select: { tickets: true } } },
          orderBy: { paidAt: 'desc' },
          take: 8,
        }),
        this.db.checkIn.count({ where: { eventId } }),
      ]);
    return { tiers, ticketsByTier, revenueByTier, checkoutsInProgress, recentOrders, checkedIn };
  }

  countActiveTickets(eventId: string) {
    return this.db.ticket.count({ where: { eventId, status: TicketStatus.ACTIVE } });
  }

  async hasSales(eventId: string) {
    const item = await this.db.orderItem.findFirst({
      where: { order: { eventId } },
      select: { id: true },
    });
    return item !== null;
  }

  async tierHasSales(tierId: string) {
    const item = await this.db.orderItem.findFirst({ where: { tierId }, select: { id: true } });
    return item !== null;
  }

  createEvent(data: Prisma.EventUncheckedCreateInput) {
    return this.db.event.create({ data, include: withRelations });
  }

  updateEvent(id: string, data: Prisma.EventUncheckedUpdateInput) {
    return this.db.event.update({ where: { id }, data, include: withRelations });
  }

  findTier(eventId: string, tierId: string) {
    return this.db.ticketTier.findFirst({ where: { id: tierId, eventId } });
  }

  createTier(data: Prisma.TicketTierUncheckedCreateInput) {
    return this.db.ticketTier.create({ data });
  }

  updateTier(id: string, data: Prisma.TicketTierUncheckedUpdateInput) {
    return this.db.ticketTier.update({ where: { id }, data });
  }

  async deleteTier(id: string) {
    await this.db.ticketTier.delete({ where: { id } });
  }

  countSeatsForTier(tierId: string) {
    return this.db.seat.count({ where: { tierId } });
  }

  async replaceSeats(eventId: string, seats: readonly PlacedSeat[]) {
    const seatsPerTier = new Map<string, number>();
    for (const seat of seats)
      seatsPerTier.set(seat.tierId, (seatsPerTier.get(seat.tierId) ?? 0) + 1);

    await this.db.$transaction(async (tx) => {
      await tx.seat.deleteMany({ where: { eventId } });
      await tx.seat.createMany({ data: seats.map((seat) => ({ ...seat, eventId })) });
      await tx.ticketTier.updateMany({ where: { eventId }, data: { capacity: null } });
      for (const [tierId, count] of seatsPerTier) {
        await tx.ticketTier.update({ where: { id: tierId }, data: { capacity: count } });
      }
    });
  }
}
