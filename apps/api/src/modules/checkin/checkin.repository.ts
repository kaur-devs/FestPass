import {
  EventStatus,
  getConstraintViolation,
  type Prisma,
  type PrismaClient,
  TicketStatus,
} from '@festpass/db';
import { MANAGING_ROLES } from '../auth/authorization';

const ticketDetails = {
  holder: { select: { name: true } },
  tier: { select: { name: true } },
  seat: { select: { section: true, row: true, number: true } },
  checkIn: { include: { scannedBy: { select: { name: true } } } },
} satisfies Prisma.TicketInclude;

export type TicketWithCheckIn = Prisma.TicketGetPayload<{ include: typeof ticketDetails }>;

export interface NewCheckIn {
  ticketId: string;
  eventId: string;
  scannedById: string;
  gate: string | null;
  deviceScannedAt: Date | null;
}

export class CheckInRepository {
  constructor(private readonly db: PrismaClient) {}

  scannableEvents(userId: string, endedAfter: Date) {
    return this.db.event.findMany({
      where: {
        status: EventStatus.PUBLISHED,
        endsAt: { gt: endedAfter },
        OR: [
          { volunteers: { some: { userId } } },
          { organization: { members: { some: { userId, role: { in: [...MANAGING_ROLES] } } } } },
        ],
      },
      include: { volunteers: { where: { userId }, select: { gate: true } } },
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
    });
  }

  findEvent(eventId: string, userId: string) {
    return this.db.event.findUnique({
      where: { id: eventId },
      include: { volunteers: { where: { userId }, select: { gate: true } } },
    });
  }

  activeTickets(eventId: string) {
    return this.db.ticket.findMany({
      where: { eventId, status: TicketStatus.ACTIVE },
      include: ticketDetails,
      orderBy: { id: 'asc' },
    });
  }

  findTicket(ticketId: string) {
    return this.db.ticket.findUnique({ where: { id: ticketId }, include: ticketDetails });
  }

  async admit(checkIn: NewCheckIn): Promise<boolean> {
    try {
      return await this.db.$transaction(async (tx) => {
        const [ticket] = await tx.$queryRaw<{ status: TicketStatus }[]>`
          SELECT status FROM tickets
          WHERE id = ${checkIn.ticketId}::uuid AND event_id = ${checkIn.eventId}::uuid
          FOR SHARE
        `;
        if (ticket?.status !== TicketStatus.ACTIVE) return false;
        await tx.checkIn.create({ data: checkIn });
        return true;
      });
    } catch (error) {
      if (getConstraintViolation(error)?.constraint === 'check_ins_ticket_id_key') return false;
      throw error;
    }
  }

  volunteers(eventId: string) {
    return this.db.eventVolunteer.findMany({
      where: { eventId },
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async checkInsByScanner(eventId: string): Promise<Map<string, number>> {
    const rows = await this.db.checkIn.groupBy({
      by: ['scannedById'],
      where: { eventId },
      _count: { _all: true },
    });
    return new Map(rows.map((row) => [row.scannedById, row._count._all]));
  }

  findUserByEmail(email: string) {
    return this.db.user.findUnique({ where: { email }, select: { id: true } });
  }

  upsertVolunteer(eventId: string, userId: string, gate: string | null) {
    return this.db.eventVolunteer.upsert({
      where: { eventId_userId: { eventId, userId } },
      create: { eventId, userId, gate },
      update: { gate },
      include: { user: { select: { name: true, email: true } } },
    });
  }

  removeVolunteer(eventId: string, userId: string) {
    return this.db.eventVolunteer.deleteMany({ where: { eventId, userId } });
  }
}
