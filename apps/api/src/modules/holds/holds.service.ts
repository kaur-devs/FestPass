import { SeatingType } from '@festpass/db';
import {
  type CurrentHoldView,
  ErrorCode,
  SEAT_HOLD_MINUTES,
  type SeatHoldView,
} from '@festpass/shared';
import { ConflictError } from '../../lib/errors';
import type { OrdersRepository } from '../orders/orders.repository';
import { assertOnSale } from '../orders/sales-window';
import { type RealtimePublisher, silentPublisher } from '../realtime/publisher';
import type { SeatHoldStore } from './seat-hold.store';

const HOLD_TTL_MS = SEAT_HOLD_MINUTES * 60 * 1000;

export class HoldsService {
  constructor(
    private readonly orders: OrdersRepository,
    private readonly store: SeatHoldStore,
    private readonly publisher: RealtimePublisher = silentPublisher,
  ) {}

  async hold(
    userId: string,
    eventId: string,
    seatIds: readonly string[],
  ): Promise<SeatHoldView | null> {
    const event = await this.orders.findEventForSale(eventId);
    assertOnSale(event);
    if (event.seatingType !== SeatingType.RESERVED) {
      throw new ConflictError('This event has no seat map.', ErrorCode.SeatingTypeMismatch);
    }

    if (seatIds.length > 0) {
      const seats = await this.orders.findSeats(eventId, seatIds);
      const found = new Set(seats.map((seat) => seat.id));
      const unavailable = [
        ...seatIds.filter((id) => !found.has(id)),
        ...seats.filter((seat) => seat.sold).map((seat) => seat.id),
      ];
      if (unavailable.length > 0) throw this.unavailable(unavailable);

      const tiers = new Map(event.tiers.map((tier) => [tier.id, tier]));
      const perTier = new Map<string, number>();
      for (const seat of seats) perTier.set(seat.tierId, (perTier.get(seat.tierId) ?? 0) + 1);
      for (const [tierId, count] of perTier) {
        const tier = tiers.get(tierId);
        if (tier && count > tier.maxPerOrder) {
          throw new ConflictError(
            `You can choose up to ${tier.maxPerOrder} ${tier.name} seats per order.`,
            ErrorCode.OrderLimitExceeded,
          );
        }
      }
    }

    const previous = await this.store.current(eventId, userId);
    const result = await this.store.hold(eventId, userId, seatIds, HOLD_TTL_MS);
    if (result.status === 'conflict') throw this.unavailable(result.seatIds);
    if (result.status === 'checkout-in-progress') throw checkoutInProgress();
    await this.publisher.eventChanged(eventId, [...(previous?.seatIds ?? []), ...seatIds]);
    if (seatIds.length === 0) return null;
    return { seatIds: [...seatIds].sort(), expiresAt: result.expiresAt.toISOString() };
  }

  async current(userId: string, eventId: string): Promise<CurrentHoldView> {
    const [hold, checkoutId] = await Promise.all([
      this.store.current(eventId, userId),
      this.store.checkoutId(eventId, userId),
    ]);
    const pendingOrder = checkoutId
      ? await this.orders.findByIdempotencyKey(userId, checkoutId)
      : null;
    return {
      hold: hold && { seatIds: hold.seatIds, expiresAt: hold.expiresAt.toISOString() },
      pendingOrderId: pendingOrder?.status === 'PENDING' ? pendingOrder.id : null,
    };
  }

  private unavailable(seatIds: readonly string[]) {
    return new ConflictError(
      seatIds.length === 1
        ? 'Someone else just took this seat. Pick another one.'
        : 'Some of these seats were just taken. Pick other seats.',
      ErrorCode.SeatsUnavailable,
      { seatIds },
    );
  }
}

export function checkoutInProgress() {
  return new ConflictError(
    'You already have a checkout open for this event. Finish or cancel it first.',
    ErrorCode.CheckoutInProgress,
  );
}
