import { getConstraintViolation, SeatingType, type TicketTier } from '@festpass/db';
import {
  CHECKOUT_MINUTES,
  type CheckoutData,
  ErrorCode,
  MAX_TICKETS_PER_ORDER,
  type OrderView,
} from '@festpass/shared';
import type { Logger } from 'pino';
import type { TicketDelivery } from '../../jobs/queues';
import { ConflictError, NotFoundError, ValidationError } from '../../lib/errors';
import { checkoutInProgress } from '../holds/holds.service';
import { type RealtimePublisher, silentPublisher } from '../realtime/publisher';
import type { SeatHoldStore } from '../holds/seat-hold.store';
import type { TicketCodes } from '../tickets/ticket-codes';
import { toOrderView } from './orders.mapper';
import type {
  NewOrderItem,
  OrdersRepository,
  OrderWithDetails,
  Payment,
} from './orders.repository';
import { assertOnSale } from './sales-window';

const CHECKOUT_TTL_MS = CHECKOUT_MINUTES * 60 * 1000;
const LOST_RACE_CONSTRAINTS = new Set(['tickets_active_seat_key', 'ticket_tiers_capacity_check']);

export interface OrdersServiceOptions {
  delivery?: TicketDelivery | undefined;
  publisher?: RealtimePublisher | undefined;
}

function seatIdsOf(order: Pick<OrderWithDetails, 'items'>): string[] {
  return order.items.flatMap((item) => (item.seatId ? [item.seatId] : []));
}

export class OrdersService {
  private readonly delivery: TicketDelivery | undefined;
  private readonly publisher: RealtimePublisher;

  constructor(
    private readonly orders: OrdersRepository,
    private readonly holds: SeatHoldStore,
    private readonly codes: TicketCodes,
    private readonly logger: Logger,
    options: OrdersServiceOptions = {},
  ) {
    this.delivery = options.delivery;
    this.publisher = options.publisher ?? silentPublisher;
  }

  async checkout(userId: string, input: CheckoutData): Promise<OrderView> {
    const existing = await this.orders.findByIdempotencyKey(userId, input.idempotencyKey);
    if (existing) return toOrderView(this.codes, existing);

    const event = await this.orders.findEventForSale(input.eventId);
    assertOnSale(event);
    const expiresAt = new Date(Date.now() + CHECKOUT_TTL_MS);

    const items =
      event.seatingType === SeatingType.RESERVED
        ? await this.itemsFromHold(userId, event.id, event.tiers, input.idempotencyKey, expiresAt)
        : this.itemsFromQuantities(event.tiers, input.items ?? []);

    let orderId: string;
    try {
      const order = await this.orders.createOrder({
        userId,
        eventId: event.id,
        idempotencyKey: input.idempotencyKey,
        expiresAt,
        items,
      });
      orderId = order.id;
      if (order.totalInPaise > 0) {
        await this.publisher.eventChanged(event.id, seatIdsOf(order));
        return toOrderView(this.codes, order);
      }
    } catch (error) {
      const constraint = getConstraintViolation(error)?.constraint;
      if (constraint === 'orders_user_id_idempotency_key_key') {
        const raced = await this.orders.findByIdempotencyKey(userId, input.idempotencyKey);
        if (raced) return toOrderView(this.codes, raced);
      }
      await this.holds.release(event.id, userId);
      await this.publisher.eventChanged(
        event.id,
        items.flatMap((item) => (item.seatId ? [item.seatId] : [])),
      );
      if (constraint === 'ticket_tiers_capacity_check') {
        throw new ConflictError('Not enough tickets are left in this tier.', ErrorCode.TierSoldOut);
      }
      throw error;
    }

    return this.confirm(orderId);
  }

  async confirm(orderId: string, payment?: Payment): Promise<OrderView> {
    try {
      const outcome = await this.orders.issueTickets(orderId, payment);
      if (outcome === 'issued') await this.deliverTickets(orderId);
      if (outcome === 'not-payable' && payment) {
        this.logger.error({ orderId }, 'Payment received for an order that cannot be fulfilled');
      }
    } catch (error) {
      const constraint = getConstraintViolation(error)?.constraint;
      if (!constraint || !LOST_RACE_CONSTRAINTS.has(constraint)) throw error;
      this.logger.warn(
        { orderId, constraint },
        'Order lost its seats or capacity before confirmation',
      );
      await this.orders.markUnfulfillable(orderId, payment);
    }

    return this.settled(orderId);
  }

  async rejectPayment(orderId: string, payment: Payment): Promise<OrderView> {
    await this.orders.markUnfulfillable(orderId, payment);
    return this.settled(orderId);
  }

  async cancel(userId: string, orderId: string): Promise<OrderView> {
    const order = await this.requireOrder(orderId, userId);
    if (!(await this.orders.cancel(orderId, userId))) {
      throw new ConflictError(
        'Only an unpaid checkout can be cancelled.',
        ErrorCode.OrderNotCancellable,
      );
    }
    await this.holds.release(order.eventId, userId);
    await this.publisher.eventChanged(order.eventId, seatIdsOf(order));
    return toOrderView(this.codes, await this.requireOrder(orderId));
  }

  async get(userId: string, orderId: string): Promise<OrderView> {
    return toOrderView(this.codes, await this.requireOrder(orderId, userId));
  }

  async expireDue(now = new Date()): Promise<number> {
    const expired = await this.orders.expireDue(now);
    await Promise.all(expired.map((order) => this.holds.release(order.eventId, order.userId)));
    const seatsByOrder = await this.orders.seatIdsByOrder(expired.map((order) => order.id));
    const seatsByEvent = new Map<string, string[]>();
    for (const order of expired) {
      const seats = seatsByEvent.get(order.eventId) ?? [];
      seats.push(...(seatsByOrder.get(order.id) ?? []));
      seatsByEvent.set(order.eventId, seats);
    }
    await Promise.all(
      [...seatsByEvent].map(([eventId, seatIds]) => this.publisher.eventChanged(eventId, seatIds)),
    );
    if (expired.length > 0) this.logger.info({ count: expired.length }, 'Expired unpaid checkouts');
    return expired.length;
  }

  private async settled(orderId: string): Promise<OrderView> {
    const order = await this.requireOrder(orderId);
    await this.holds.release(order.eventId, order.userId);
    await this.publisher.eventChanged(order.eventId, seatIdsOf(order));
    return toOrderView(this.codes, order);
  }

  private async deliverTickets(orderId: string) {
    try {
      await this.delivery?.ticketsIssued(orderId);
    } catch (error) {
      this.logger.error({ err: error, orderId }, 'Could not queue ticket email');
    }
  }

  private async itemsFromHold(
    userId: string,
    eventId: string,
    tiers: readonly TicketTier[],
    checkoutId: string,
    expiresAt: Date,
  ): Promise<NewOrderItem[]> {
    const claim = await this.holds.claimForCheckout(eventId, userId, checkoutId, expiresAt);
    if (claim.status === 'checkout-in-progress') throw checkoutInProgress();
    if (claim.status === 'expired') {
      throw new ConflictError(
        'Your seat selection expired. Choose your seats again.',
        ErrorCode.HoldExpired,
      );
    }

    const seats = await this.orders.findSeats(eventId, claim.seatIds);
    const sold = seats.filter((seat) => seat.sold).map((seat) => seat.id);
    if (sold.length > 0 || seats.length !== claim.seatIds.length) {
      await this.holds.release(eventId, userId);
      throw new ConflictError(
        'Some of your seats were just sold. Choose again.',
        ErrorCode.SeatsUnavailable,
        {
          seatIds: sold,
        },
      );
    }

    const prices = new Map(tiers.map((tier) => [tier.id, tier.priceInPaise]));
    return seats.map((seat) => ({
      tierId: seat.tierId,
      seatId: seat.id,
      quantity: 1,
      unitPriceInPaise: prices.get(seat.tierId) ?? 0,
    }));
  }

  private itemsFromQuantities(
    tiers: readonly TicketTier[],
    requested: NonNullable<CheckoutData['items']>,
  ): NewOrderItem[] {
    if (requested.length === 0) {
      throw new ValidationError({ formErrors: ['Choose at least one ticket.'], fieldErrors: {} });
    }

    const byId = new Map(tiers.map((tier) => [tier.id, tier]));
    const quantities = new Map<string, number>();
    for (const item of requested) {
      if (!byId.has(item.tierId)) throw new NotFoundError('This ticket tier does not exist.');
      quantities.set(item.tierId, (quantities.get(item.tierId) ?? 0) + item.quantity);
    }

    let total = 0;
    const items: NewOrderItem[] = [];
    for (const [tierId, quantity] of quantities) {
      const tier = byId.get(tierId);
      if (!tier) continue;
      if (quantity > tier.maxPerOrder) {
        throw new ConflictError(
          `You can buy up to ${tier.maxPerOrder} ${tier.name} tickets per order.`,
          ErrorCode.OrderLimitExceeded,
        );
      }
      total += quantity;
      items.push({ tierId, seatId: null, quantity, unitPriceInPaise: tier.priceInPaise });
    }
    if (total > MAX_TICKETS_PER_ORDER) {
      throw new ConflictError(
        `You can buy up to ${MAX_TICKETS_PER_ORDER} tickets per order.`,
        ErrorCode.OrderLimitExceeded,
      );
    }
    return items;
  }

  private async requireOrder(orderId: string, userId?: string) {
    const order = await this.orders.findOrder(orderId);
    if (!order || (userId !== undefined && order.userId !== userId)) {
      throw new NotFoundError('This order does not exist.');
    }
    return order;
  }
}
