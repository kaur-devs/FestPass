import type { PrismaClient } from '@festpass/db';
import {
  RealtimeMessage,
  type SalesUpdatedMessage,
  type SeatsUpdatedMessage,
  type TiersUpdatedMessage,
} from '@festpass/shared';
import type { Emitter } from '@socket.io/redis-emitter';
import type { Logger } from 'pino';
import type { SeatStatusReader } from './seat-status';

export function eventRoom(eventId: string) {
  return `event:${eventId}`;
}

export function manageRoom(eventId: string) {
  return `manage:${eventId}`;
}

export interface RealtimePublisher {
  eventChanged(eventId: string, seatIds?: readonly string[]): Promise<void>;
  checkInsChanged(eventId: string): void;
}

export const silentPublisher: RealtimePublisher = {
  eventChanged: () => Promise.resolve(),
  checkInsChanged: () => undefined,
};

export class EmitterPublisher implements RealtimePublisher {
  constructor(
    private readonly emitter: Emitter,
    private readonly seats: SeatStatusReader,
    private readonly db: PrismaClient,
    private readonly logger: Logger,
  ) {}

  async eventChanged(eventId: string, seatIds: readonly string[] = []): Promise<void> {
    try {
      const [seats, tiers] = await Promise.all([
        this.seats.statuses(eventId, seatIds),
        this.db.ticketTier.findMany({
          where: { eventId },
          select: { id: true, capacity: true, soldCount: true },
        }),
      ]);

      const room = this.emitter.to(eventRoom(eventId));
      if (seats.length > 0) {
        room.emit(RealtimeMessage.SeatsUpdated, { eventId, seats } satisfies SeatsUpdatedMessage);
      }
      room.emit(RealtimeMessage.TiersUpdated, {
        eventId,
        tiers: tiers.map((tier) => ({
          id: tier.id,
          available: tier.capacity === null ? 0 : Math.max(tier.capacity - tier.soldCount, 0),
        })),
      } satisfies TiersUpdatedMessage);
      this.notifyManagers(eventId);
    } catch (error) {
      this.logger.error({ err: error, eventId }, 'Failed to publish realtime update');
    }
  }

  checkInsChanged(eventId: string): void {
    this.notifyManagers(eventId);
  }

  private notifyManagers(eventId: string): void {
    try {
      this.emitter
        .to(manageRoom(eventId))
        .emit(RealtimeMessage.SalesUpdated, { eventId } satisfies SalesUpdatedMessage);
    } catch (error) {
      this.logger.error({ err: error, eventId }, 'Failed to publish realtime update');
    }
  }
}
