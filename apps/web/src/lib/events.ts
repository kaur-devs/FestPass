import { type EventSummary, formatEventDate } from '@festpass/shared';

export type SalesState = 'cancelled' | 'upcoming' | 'on-sale' | 'sold-out' | 'closed';

export function salesState(event: EventSummary, now = new Date()): SalesState {
  if (event.status === 'CANCELLED') return 'cancelled';
  if (new Date(event.salesEndAt) <= now) return 'closed';
  if (event.soldOut) return 'sold-out';
  if (new Date(event.salesStartAt) > now) return 'upcoming';
  return 'on-sale';
}

export function salesLabel(event: EventSummary, now = new Date()): string {
  switch (salesState(event, now)) {
    case 'cancelled':
      return 'Cancelled';
    case 'closed':
      return 'Sales closed';
    case 'sold-out':
      return 'Sold out';
    case 'upcoming':
      return `On sale ${formatEventDate(event.salesStartAt, event.timezone)}`;
    case 'on-sale':
      return 'On sale now';
  }
}

export function availabilityLabel(available: number, capacity: number | null): string {
  if (capacity === null || available === 0) return 'Sold out';
  if (available <= Math.max(5, Math.ceil(capacity * 0.1))) return `${available} left`;
  return 'Available';
}
