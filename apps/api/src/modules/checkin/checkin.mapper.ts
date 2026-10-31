import type { Event } from '@festpass/db';
import {
  type CheckInEvent,
  type CheckInRecord,
  type ManifestTicket,
  ticketReference,
} from '@festpass/shared';
import { seatLabel } from '../orders/orders.mapper';
import type { TicketWithCheckIn } from './checkin.repository';

export function toCheckInEvent(
  event: Event & { volunteers: { gate: string | null }[] },
): CheckInEvent {
  return {
    id: event.id,
    title: event.title,
    venue: event.venue,
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt.toISOString(),
    timezone: event.timezone,
    gate: event.volunteers[0]?.gate ?? null,
  };
}

export function toManifestTicket(ticket: TicketWithCheckIn): ManifestTicket {
  return {
    id: ticket.id,
    reference: ticketReference(ticket.id),
    holderName: ticket.holder.name,
    tierName: ticket.tier.name,
    seatLabel: seatLabel(ticket.seat),
    checkedInAt: ticket.checkIn?.createdAt.toISOString() ?? null,
  };
}

export function toCheckInRecord(ticket: TicketWithCheckIn): CheckInRecord | null {
  const { checkIn } = ticket;
  return checkIn
    ? { at: checkIn.createdAt.toISOString(), gate: checkIn.gate, scannedBy: checkIn.scannedBy.name }
    : null;
}
