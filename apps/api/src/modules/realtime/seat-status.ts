import { type PrismaClient, TicketStatus } from '@festpass/db';
import type { SeatStatusUpdate, SeatView } from '@festpass/shared';
import type { SeatHoldStore } from '../holds/seat-hold.store';

export class SeatStatusReader {
  constructor(
    private readonly db: PrismaClient,
    private readonly holds: SeatHoldStore,
  ) {}

  async all(eventId: string): Promise<SeatView[]> {
    const [seats, held] = await Promise.all([
      this.db.seat.findMany({
        where: { eventId },
        include: {
          tickets: { where: { status: TicketStatus.ACTIVE }, select: { id: true }, take: 1 },
        },
        orderBy: [{ y: 'asc' }, { x: 'asc' }],
      }),
      this.holds.heldSeats(eventId),
    ]);

    return seats.map(({ tickets, ...seat }) => {
      const sold = tickets.length > 0;
      const heldUntil = sold ? undefined : held.get(seat.id);
      return {
        id: seat.id,
        section: seat.section,
        row: seat.row,
        number: seat.number,
        x: seat.x,
        y: seat.y,
        tierId: seat.tierId,
        isAccessible: seat.isAccessible,
        status: sold ? 'SOLD' : heldUntil ? 'HELD' : 'AVAILABLE',
        heldUntil: heldUntil?.toISOString() ?? null,
      };
    });
  }

  async statuses(eventId: string, seatIds: readonly string[]): Promise<SeatStatusUpdate[]> {
    const unique = [...new Set(seatIds)];
    if (unique.length === 0) return [];

    const [soldTickets, held] = await Promise.all([
      this.db.ticket.findMany({
        where: { eventId, seatId: { in: unique }, status: TicketStatus.ACTIVE },
        select: { seatId: true },
      }),
      this.holds.heldUntil(eventId, unique),
    ]);
    const sold = new Set(soldTickets.map((ticket) => ticket.seatId));

    return unique.map((id) => {
      if (sold.has(id)) return { id, status: 'SOLD', heldUntil: null };
      const until = held.get(id);
      return until
        ? { id, status: 'HELD', heldUntil: until.toISOString() }
        : { id, status: 'AVAILABLE', heldUntil: null };
    });
  }
}
