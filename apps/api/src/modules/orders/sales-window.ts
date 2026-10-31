import { type Event, EventStatus } from '@festpass/db';
import { ErrorCode } from '@festpass/shared';
import { ConflictError, NotFoundError } from '../../lib/errors';

export function assertOnSale(event: Event | null, now = new Date()): asserts event is Event {
  if (!event || event.status === EventStatus.DRAFT) {
    throw new NotFoundError('This event does not exist or is not published yet.');
  }
  if (event.status === EventStatus.CANCELLED) {
    throw new ConflictError('This event has been cancelled.', ErrorCode.SalesClosed);
  }
  if (now < event.salesStartAt) {
    throw new ConflictError('Tickets are not on sale yet.', ErrorCode.SalesClosed);
  }
  if (now >= event.salesEndAt) {
    throw new ConflictError('Ticket sales have closed for this event.', ErrorCode.SalesClosed);
  }
}
