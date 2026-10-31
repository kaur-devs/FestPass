import type { Seat } from '@festpass/db';
import type { OrderView } from '@festpass/shared';
import type { TicketCodes } from '../tickets/ticket-codes';
import type { OrderWithDetails } from './orders.repository';

export function seatLabel(seat: Pick<Seat, 'section' | 'row' | 'number'> | null): string | null {
  return seat ? `${seat.section} · Row ${seat.row} · Seat ${seat.number}` : null;
}

export function toOrderView(codes: TicketCodes, order: OrderWithDetails): OrderView {
  return {
    id: order.id,
    status: order.status,
    totalInPaise: order.totalInPaise,
    expiresAt: order.expiresAt.toISOString(),
    paidAt: order.paidAt?.toISOString() ?? null,
    createdAt: order.createdAt.toISOString(),
    event: {
      id: order.event.id,
      slug: order.event.slug,
      title: order.event.title,
      venue: order.event.venue,
      startsAt: order.event.startsAt.toISOString(),
      timezone: order.event.timezone,
    },
    items: order.items.map((item) => ({
      tierName: item.tier.name,
      seatLabel: seatLabel(item.seat),
      quantity: item.quantity,
      unitPriceInPaise: item.unitPriceInPaise,
    })),
    tickets: order.tickets.map((ticket) => ({
      id: ticket.id,
      code: codes.sign(ticket.id),
      tierName: ticket.tier.name,
      seatLabel: seatLabel(ticket.seat),
    })),
  };
}
