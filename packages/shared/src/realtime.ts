import { z } from 'zod';
import type { SeatStatus } from './events';

export const RealtimeMessage = {
  SeatsUpdated: 'seats.updated',
  TiersUpdated: 'tiers.updated',
  SalesUpdated: 'sales.updated',
} as const;

export const subscribeRequestSchema = z.object({
  channel: z.enum(['event', 'manage']),
  eventId: z.uuid(),
});

export type SubscribeRequest = z.input<typeof subscribeRequestSchema>;

export type SubscribeAck = { ok: true } | { ok: false; code: string; message: string };

export interface SeatStatusUpdate {
  id: string;
  status: SeatStatus;
  heldUntil: string | null;
}

export interface SeatsUpdatedMessage {
  eventId: string;
  seats: SeatStatusUpdate[];
}

export interface TiersUpdatedMessage {
  eventId: string;
  tiers: { id: string; available: number }[];
}

export interface SalesUpdatedMessage {
  eventId: string;
}

export interface EventSalesStats {
  eventId: string;
  ticketsSold: number;
  revenueInPaise: number;
  checkoutsInProgress: number;
  tiers: {
    id: string;
    name: string;
    sold: number;
    capacity: number | null;
    revenueInPaise: number;
  }[];
  recentOrders: {
    id: string;
    buyerName: string;
    ticketCount: number;
    totalInPaise: number;
    paidAt: string;
  }[];
}
