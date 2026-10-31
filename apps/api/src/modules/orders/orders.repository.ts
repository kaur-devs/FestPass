import { OrderStatus, type Prisma, type PrismaClient, TicketStatus } from '@festpass/db';

type Transaction = Prisma.TransactionClient;

export interface NewOrderItem {
  tierId: string;
  seatId: string | null;
  quantity: number;
  unitPriceInPaise: number;
}

export interface NewOrder {
  userId: string;
  eventId: string;
  idempotencyKey: string;
  expiresAt: Date;
  items: NewOrderItem[];
}

export interface Payment {
  razorpayPaymentId: string;
}

export type IssueOutcome = 'issued' | 'already-paid' | 'not-payable';

export interface ExpiredOrder {
  id: string;
  userId: string;
  eventId: string;
}

const orderViewInclude = {
  event: {
    select: { id: true, slug: true, title: true, venue: true, startsAt: true, timezone: true },
  },
  items: { include: { tier: { select: { name: true } }, seat: true }, orderBy: { id: 'asc' } },
  tickets: { include: { tier: { select: { name: true } }, seat: true }, orderBy: { id: 'asc' } },
} satisfies Prisma.OrderInclude;

export type OrderWithDetails = Prisma.OrderGetPayload<{ include: typeof orderViewInclude }>;

export class OrdersRepository {
  constructor(private readonly db: PrismaClient) {}

  findEventForSale(eventId: string) {
    return this.db.event.findUnique({ where: { id: eventId }, include: { tiers: true } });
  }

  async findSeats(eventId: string, seatIds: readonly string[]) {
    const seats = await this.db.seat.findMany({
      where: { eventId, id: { in: [...seatIds] } },
      include: {
        tickets: { where: { status: TicketStatus.ACTIVE }, select: { id: true }, take: 1 },
      },
    });
    return seats.map(({ tickets, ...seat }) => ({ ...seat, sold: tickets.length > 0 }));
  }

  findOrder(orderId: string) {
    return this.db.order.findUnique({ where: { id: orderId }, include: orderViewInclude });
  }

  findByIdempotencyKey(userId: string, idempotencyKey: string) {
    return this.db.order.findUnique({
      where: { userId_idempotencyKey: { userId, idempotencyKey } },
      include: orderViewInclude,
    });
  }

  expireDue(now: Date, eventId?: string): Promise<ExpiredOrder[]> {
    return this.expireDueWith(this.db, now, eventId);
  }

  createOrder(order: NewOrder) {
    return this.db.$transaction(async (tx) => {
      await this.expireDueWith(tx, new Date(), order.eventId);
      await this.adjustSoldCounts(tx, order.items, 1);

      const totalInPaise = order.items.reduce(
        (sum, item) => sum + item.unitPriceInPaise * item.quantity,
        0,
      );
      return tx.order.create({
        data: {
          userId: order.userId,
          eventId: order.eventId,
          idempotencyKey: order.idempotencyKey,
          expiresAt: order.expiresAt,
          totalInPaise,
          items: { create: order.items },
        },
        include: orderViewInclude,
      });
    });
  }

  issueTickets(orderId: string, payment?: Payment): Promise<IssueOutcome> {
    return this.db.$transaction(async (tx) => {
      const order = await this.lockOrder(tx, orderId);
      if (!order) return 'not-payable';
      if (order.status === OrderStatus.PAID) return 'already-paid';
      if (order.status !== OrderStatus.PENDING && order.status !== OrderStatus.EXPIRED) {
        return 'not-payable';
      }

      const items = await tx.orderItem.findMany({ where: { orderId } });
      if (order.status === OrderStatus.EXPIRED) await this.adjustSoldCounts(tx, items, 1);

      await tx.ticket.createMany({
        data: items.flatMap((item) =>
          Array.from({ length: item.quantity }, () => ({
            orderId,
            eventId: order.event_id,
            tierId: item.tierId,
            seatId: item.seatId,
            holderId: order.user_id,
          })),
        ),
      });
      await tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.PAID,
          paidAt: new Date(),
          ...(payment && { razorpayPaymentId: payment.razorpayPaymentId }),
        },
      });
      return 'issued';
    });
  }

  markUnfulfillable(orderId: string, payment?: Payment) {
    return this.db.$transaction(async (tx) => {
      const order = await this.lockOrder(tx, orderId);
      if (!order) return;
      if (order.status === OrderStatus.PENDING) {
        await this.adjustSoldCounts(tx, await tx.orderItem.findMany({ where: { orderId } }), -1);
      }
      await tx.order.update({
        where: { id: orderId },
        data: payment
          ? {
              status: OrderStatus.REFUND_PENDING,
              paidAt: new Date(),
              razorpayPaymentId: payment.razorpayPaymentId,
            }
          : { status: OrderStatus.FAILED },
      });
    });
  }

  cancel(orderId: string, userId: string): Promise<boolean> {
    return this.db.$transaction(async (tx) => {
      const { count } = await tx.order.updateMany({
        where: { id: orderId, userId, status: OrderStatus.PENDING },
        data: { status: OrderStatus.EXPIRED },
      });
      if (count === 0) return false;
      await this.adjustSoldCounts(tx, await tx.orderItem.findMany({ where: { orderId } }), -1);
      return true;
    });
  }

  private async lockOrder(tx: Transaction, orderId: string) {
    const [order] = await tx.$queryRaw<
      { status: OrderStatus; user_id: string; event_id: string }[]
    >`
      SELECT status, user_id, event_id FROM orders WHERE id = ${orderId}::uuid FOR UPDATE
    `;
    return order;
  }

  private async adjustSoldCounts(
    tx: Transaction,
    items: readonly Pick<NewOrderItem, 'tierId' | 'quantity'>[],
    direction: 1 | -1,
  ) {
    const perTier = new Map<string, number>();
    for (const item of items)
      perTier.set(item.tierId, (perTier.get(item.tierId) ?? 0) + item.quantity);

    for (const [tierId, quantity] of [...perTier].sort(([a], [b]) => a.localeCompare(b))) {
      await tx.ticketTier.update({
        where: { id: tierId },
        data: { soldCount: { increment: direction * quantity } },
      });
    }
  }

  private expireDueWith(
    client: Transaction | PrismaClient,
    now: Date,
    eventId?: string,
  ): Promise<ExpiredOrder[]> {
    return client.$queryRaw<ExpiredOrder[]>`
      WITH expired AS (
        UPDATE orders
        SET status = 'EXPIRED', updated_at = now()
        WHERE status = 'PENDING'
          AND expires_at <= ${now}
          AND (${eventId ?? null}::uuid IS NULL OR event_id = ${eventId ?? null}::uuid)
        RETURNING id, user_id, event_id
      ),
      released AS (
        UPDATE ticket_tiers AS tier
        SET sold_count = tier.sold_count - totals.quantity, updated_at = now()
        FROM (
          SELECT tier_id, SUM(quantity)::int AS quantity
          FROM order_items
          WHERE order_id IN (SELECT id FROM expired)
          GROUP BY tier_id
        ) AS totals
        WHERE tier.id = totals.tier_id
        RETURNING tier.id
      )
      SELECT id, user_id AS "userId", event_id AS "eventId" FROM expired
    `;
  }
}
