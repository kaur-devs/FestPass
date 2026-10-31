import { SeatingType } from '@festpass/db';
import type { EventDetail, EventSummary, Page, SeatView } from '@festpass/shared';
import { decodeEventCursor, encodeEventCursor } from '../../lib/cursor';
import { NotFoundError } from '../../lib/errors';
import { toEventDetail, toEventSummary } from './events.mapper';
import type { SeatHoldStore } from '../holds/seat-hold.store';
import type { EventsRepository } from './events.repository';

export class EventCatalogService {
  constructor(
    private readonly events: EventsRepository,
    private readonly holds: SeatHoldStore,
  ) {}

  async listUpcoming(options: {
    limit: number;
    cursor?: string | undefined;
  }): Promise<Page<EventSummary>> {
    const after = options.cursor ? decodeEventCursor(options.cursor) : undefined;
    const rows = await this.events.listUpcomingPublished(new Date(), options.limit + 1, after);

    const page = rows.slice(0, options.limit);
    const last = page.at(-1);
    return {
      items: page.map(toEventSummary),
      nextCursor:
        rows.length > options.limit && last
          ? encodeEventCursor({ startsAt: last.startsAt.toISOString(), id: last.id })
          : null,
    };
  }

  async getBySlug(slug: string): Promise<EventDetail> {
    const event = await this.events.findPublicBySlug(slug);
    if (!event) throw new NotFoundError('This event does not exist or is not published yet.');
    return toEventDetail(event);
  }

  async getSeats(slug: string): Promise<SeatView[]> {
    const event = await this.events.findPublicBySlug(slug);
    if (!event) throw new NotFoundError('This event does not exist or is not published yet.');
    if (event.seatingType !== SeatingType.RESERVED) return [];
    return this.seatViews(event.id);
  }

  async seatViews(eventId: string): Promise<SeatView[]> {
    const [seats, held] = await Promise.all([
      this.events.seatsWithStatus(eventId),
      this.holds.heldSeatIds(eventId),
    ]);
    return seats.map((seat) => ({
      id: seat.id,
      section: seat.section,
      row: seat.row,
      number: seat.number,
      x: seat.x,
      y: seat.y,
      tierId: seat.tierId,
      isAccessible: seat.isAccessible,
      status: seat.sold ? 'SOLD' : held.has(seat.id) ? 'HELD' : 'AVAILABLE',
    }));
  }
}
