import { EventStatus, TicketStatus } from '@festpass/db';
import {
  type CheckInEvent,
  type CheckInManifest,
  ErrorCode,
  type ScanBatchData,
  ScanOutcome,
  type ScanResult,
} from '@festpass/shared';
import { ConflictError, NotFoundError } from '../../lib/errors';
import type { AuthorizationService } from '../auth/authorization';
import { type RealtimePublisher, silentPublisher } from '../realtime/publisher';
import type { TicketCodes } from '../tickets/ticket-codes';
import { toCheckInEvent, toCheckInRecord, toManifestTicket } from './checkin.mapper';
import type { CheckInRepository, TicketWithCheckIn } from './checkin.repository';

const LIST_EVENTS_ENDED_WITHIN_MS = 12 * 60 * 60 * 1000;

interface Scanner {
  userId: string;
  eventId: string;
  gate: string | null;
}

function admitted(ticket: TicketWithCheckIn): ScanResult {
  return {
    outcome: ScanOutcome.Admitted,
    ticket: toManifestTicket(ticket),
    checkIn: toCheckInRecord(ticket),
  };
}

function isRetry(ticket: TicketWithCheckIn, scanner: Scanner, deviceScannedAt: Date | null) {
  const { checkIn } = ticket;
  return (
    checkIn !== null &&
    deviceScannedAt !== null &&
    checkIn.scannedById === scanner.userId &&
    checkIn.deviceScannedAt?.getTime() === deviceScannedAt.getTime()
  );
}

export class CheckInService {
  constructor(
    private readonly checkIns: CheckInRepository,
    private readonly authorization: AuthorizationService,
    private readonly codes: TicketCodes,
    private readonly publisher: RealtimePublisher = silentPublisher,
  ) {}

  async listEvents(userId: string, now = new Date()): Promise<CheckInEvent[]> {
    const events = await this.checkIns.scannableEvents(
      userId,
      new Date(now.getTime() - LIST_EVENTS_ENDED_WITHIN_MS),
    );
    return events.map(toCheckInEvent);
  }

  async manifest(userId: string, eventId: string): Promise<CheckInManifest> {
    const event = await this.loadForScanner(userId, eventId);
    const tickets = await this.checkIns.activeTickets(eventId);
    return {
      event: toCheckInEvent(event),
      generatedAt: new Date().toISOString(),
      tickets: tickets.map(toManifestTicket),
    };
  }

  async scan(userId: string, eventId: string, batch: ScanBatchData): Promise<ScanResult[]> {
    const event = await this.loadForScanner(userId, eventId);
    const scanner = { userId, eventId, gate: batch.gate ?? event.volunteers[0]?.gate ?? null };

    const results: ScanResult[] = [];
    for (const scan of batch.scans) {
      const ticketId = scan.ticketId ?? (scan.code ? this.codes.verify(scan.code) : null);
      results.push(
        await this.scanOne(scanner, ticketId, scan.scannedAt ? new Date(scan.scannedAt) : null),
      );
    }

    if (results.some((result) => result.outcome === ScanOutcome.Admitted)) {
      this.publisher.checkInsChanged(eventId);
    }
    return results;
  }

  private async scanOne(
    scanner: Scanner,
    ticketId: string | null,
    deviceScannedAt: Date | null,
  ): Promise<ScanResult> {
    const ticket = ticketId ? await this.checkIns.findTicket(ticketId) : null;
    if (!ticketId || !ticket)
      return { outcome: ScanOutcome.InvalidCode, ticket: null, checkIn: null };
    if (isRetry(ticket, scanner, deviceScannedAt)) return admitted(ticket);

    const refused = this.refusal(scanner.eventId, ticket);
    if (refused) return refused;

    const created = await this.checkIns.admit({
      ticketId,
      eventId: scanner.eventId,
      scannedById: scanner.userId,
      gate: scanner.gate,
      deviceScannedAt,
    });
    const current = await this.checkIns.findTicket(ticketId);
    if (!current) throw new Error(`Ticket ${ticketId} disappeared during check-in`);

    if (created) return admitted(current);
    const raced = this.refusal(scanner.eventId, current);
    if (!raced) throw new Error(`Ticket ${ticketId} was neither admitted nor refused`);
    return raced;
  }

  private refusal(eventId: string, ticket: TicketWithCheckIn): ScanResult | null {
    if (ticket.eventId !== eventId) {
      return { outcome: ScanOutcome.WrongEvent, ticket: null, checkIn: null };
    }
    if (ticket.status !== TicketStatus.ACTIVE) {
      return {
        outcome: ScanOutcome.TicketCancelled,
        ticket: toManifestTicket(ticket),
        checkIn: null,
      };
    }
    if (ticket.checkIn) {
      return {
        outcome: ScanOutcome.AlreadyCheckedIn,
        ticket: toManifestTicket(ticket),
        checkIn: toCheckInRecord(ticket),
      };
    }
    return null;
  }

  private async loadForScanner(userId: string, eventId: string) {
    const event = await this.checkIns.findEvent(eventId, userId);
    if (!event) throw new NotFoundError('This event does not exist.');
    await this.authorization.requireEventScanner(userId, eventId);
    if (event.status === EventStatus.CANCELLED) {
      throw new ConflictError('This event has been cancelled.', ErrorCode.EventCancelled);
    }
    return event;
  }
}
