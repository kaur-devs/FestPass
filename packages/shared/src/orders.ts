import { z } from 'zod';

export const MAX_SEATS_PER_HOLD = 10;
export const MAX_TICKETS_PER_ORDER = 20;
export const SEAT_HOLD_MINUTES = 5;
export const CHECKOUT_MINUTES = 10;

export const holdSeatsSchema = z.object({
  seatIds: z
    .array(z.uuid())
    .max(MAX_SEATS_PER_HOLD, `Choose at most ${MAX_SEATS_PER_HOLD} seats at a time.`)
    .refine((ids) => new Set(ids).size === ids.length, 'Each seat can be chosen once.'),
});

export const checkoutSchema = z.object({
  eventId: z.uuid(),
  idempotencyKey: z.string().min(16).max(100),
  items: z
    .array(
      z.object({ tierId: z.uuid(), quantity: z.number().int().min(1).max(MAX_TICKETS_PER_ORDER) }),
    )
    .max(10)
    .optional(),
});

export type HoldSeatsInput = z.input<typeof holdSeatsSchema>;
export type CheckoutInput = z.input<typeof checkoutSchema>;
export type CheckoutData = z.output<typeof checkoutSchema>;

export type OrderStatus = 'PENDING' | 'PAID' | 'EXPIRED' | 'FAILED' | 'REFUND_PENDING' | 'REFUNDED';

export function ticketReference(ticketId: string): string {
  return ticketId.replace(/-/g, '').slice(-10).toUpperCase();
}

export interface SeatHoldView {
  seatIds: string[];
  expiresAt: string;
}

export interface CurrentHoldView {
  hold: SeatHoldView | null;
  pendingOrderId: string | null;
}

export interface OrderView {
  id: string;
  status: OrderStatus;
  totalInPaise: number;
  expiresAt: string;
  paidAt: string | null;
  createdAt: string;
  event: {
    id: string;
    slug: string;
    title: string;
    venue: string;
    startsAt: string;
    timezone: string;
  };
  items: {
    tierName: string;
    seatLabel: string | null;
    quantity: number;
    unitPriceInPaise: number;
  }[];
  tickets: {
    id: string;
    code: string;
    tierName: string;
    seatLabel: string | null;
  }[];
}
