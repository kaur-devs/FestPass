import { EventStatus, getConstraintViolation, SeatingType } from '@festpass/db';
import {
  type CreateEventData,
  ErrorCode,
  type EventSummary,
  type ManagedEvent,
  type SeatMapData,
  type TierData,
  type TierView,
  type UpdateEventData,
} from '@festpass/shared';
import { slugify, withSuffix } from '../../lib/slug';
import { ConflictError, NotFoundError, ValidationError } from '../../lib/errors';
import type { AuthorizationService } from '../auth/authorization';
import {
  type EventWithRelations,
  toEventDetail,
  toEventSummary,
  toTierView,
} from './events.mapper';
import type { EventsRepository } from './events.repository';
import { describeSeatMap, layoutSeatMap } from '@festpass/shared';

const MAX_SLUG_ATTEMPTS = 20;

export function publishIssues(
  event: EventWithRelations,
  seatCount: number,
  now = new Date(),
): string[] {
  const issues: string[] = [];
  if (event.status === EventStatus.CANCELLED) issues.push('Cancelled events cannot be published.');
  if (event.salesEndAt <= now)
    issues.push('Ticket sales close in the past. Move the closing date.');
  if (event.tiers.length === 0) issues.push('Add at least one ticket tier.');

  if (event.seatingType === SeatingType.RESERVED) {
    if (seatCount === 0) issues.push('Build the seat map.');
    for (const tier of event.tiers) {
      if (seatCount > 0 && tier.capacity === null) {
        issues.push(`Assign seats to "${tier.name}" or delete it.`);
      }
    }
  } else {
    for (const tier of event.tiers) {
      if (tier.capacity === null) issues.push(`Set how many "${tier.name}" tickets are available.`);
    }
  }
  return issues;
}

export class EventManagementService {
  constructor(
    private readonly events: EventsRepository,
    private readonly authorization: AuthorizationService,
  ) {}

  async listForOrganization(userId: string, organizationId: string): Promise<EventSummary[]> {
    await this.authorization.requireOrganizationRole(userId, organizationId);
    const events = await this.events.listForOrganization(organizationId);
    return events.map(toEventSummary);
  }

  async create(
    userId: string,
    organizationId: string,
    data: CreateEventData,
  ): Promise<ManagedEvent> {
    await this.authorization.requireOrganizationRole(userId, organizationId);
    const baseSlug = slugify(data.title);

    for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt += 1) {
      try {
        const event = await this.events.createEvent({
          organizationId,
          slug: withSuffix(baseSlug, attempt),
          title: data.title,
          description: data.description,
          venue: data.venue,
          timezone: data.timezone,
          startsAt: new Date(data.startsAt),
          endsAt: new Date(data.endsAt),
          salesStartAt: new Date(data.salesStartAt),
          salesEndAt: new Date(data.salesEndAt),
          seatingType: data.seatingType,
        });
        return await this.toManagedEvent(event);
      } catch (error) {
        if (getConstraintViolation(error)?.constraint !== 'events_slug_key') throw error;
      }
    }
    throw new ConflictError(
      'Could not create a unique link for this event. Change the title.',
      ErrorCode.SlugTaken,
    );
  }

  async get(userId: string, eventId: string): Promise<ManagedEvent> {
    return this.toManagedEvent(await this.loadForManager(userId, eventId));
  }

  async update(userId: string, eventId: string, data: UpdateEventData): Promise<ManagedEvent> {
    const event = await this.loadForManager(userId, eventId);
    this.assertNotCancelled(event);

    if (data.slug !== undefined && data.slug !== event.slug && event.status !== EventStatus.DRAFT) {
      throw new ConflictError(
        'The event link cannot change after publishing, because people may have shared it.',
        ErrorCode.SlugTaken,
      );
    }

    try {
      const updated = await this.events.updateEvent(eventId, {
        title: data.title,
        description: data.description,
        venue: data.venue,
        timezone: data.timezone,
        startsAt: new Date(data.startsAt),
        endsAt: new Date(data.endsAt),
        salesStartAt: new Date(data.salesStartAt),
        salesEndAt: new Date(data.salesEndAt),
        ...(data.slug !== undefined && { slug: data.slug }),
      });
      return await this.toManagedEvent(updated);
    } catch (error) {
      if (getConstraintViolation(error)?.constraint === 'events_slug_key') {
        throw new ConflictError('Another event already uses this link.', ErrorCode.SlugTaken);
      }
      throw error;
    }
  }

  async publish(userId: string, eventId: string): Promise<ManagedEvent> {
    const event = await this.loadForManager(userId, eventId);
    if (event.status === EventStatus.PUBLISHED) return this.toManagedEvent(event);

    const seatCount = (await this.events.seatsWithStatus(eventId)).length;
    const issues = publishIssues(event, seatCount);
    if (issues.length > 0) {
      throw new ConflictError(
        'This event is not ready to publish.',
        ErrorCode.EventNotReady,
        issues,
      );
    }
    return this.toManagedEvent(
      await this.events.updateEvent(eventId, { status: EventStatus.PUBLISHED }),
    );
  }

  async cancel(userId: string, eventId: string): Promise<ManagedEvent> {
    const event = await this.loadForManager(userId, eventId);
    if (event.status === EventStatus.CANCELLED) return this.toManagedEvent(event);
    return this.toManagedEvent(
      await this.events.updateEvent(eventId, { status: EventStatus.CANCELLED }),
    );
  }

  async addTier(userId: string, eventId: string, data: TierData): Promise<TierView> {
    const event = await this.loadForManager(userId, eventId);
    this.assertNotCancelled(event);
    const capacity = this.capacityFor(event, data);

    try {
      const tier = await this.events.createTier({ eventId, ...data, capacity });
      return toTierView(tier);
    } catch (error) {
      throw this.tierError(error);
    }
  }

  async updateTier(
    userId: string,
    eventId: string,
    tierId: string,
    data: TierData,
  ): Promise<TierView> {
    const event = await this.loadForManager(userId, eventId);
    this.assertNotCancelled(event);
    const tier = await this.events.findTier(eventId, tierId);
    if (!tier) throw new NotFoundError('This ticket tier does not exist.');

    const capacity =
      event.seatingType === SeatingType.RESERVED ? tier.capacity : this.capacityFor(event, data);
    try {
      return toTierView(await this.events.updateTier(tierId, { ...data, capacity }));
    } catch (error) {
      throw this.tierError(error);
    }
  }

  async deleteTier(userId: string, eventId: string, tierId: string): Promise<void> {
    await this.loadForManager(userId, eventId);
    const tier = await this.events.findTier(eventId, tierId);
    if (!tier) throw new NotFoundError('This ticket tier does not exist.');

    if (tier.soldCount > 0 || (await this.events.tierHasSales(tierId))) {
      throw new ConflictError(
        'Tickets have been sold in this tier, so it cannot be deleted.',
        ErrorCode.TierHasSales,
      );
    }
    if ((await this.events.countSeatsForTier(tierId)) > 0) {
      throw new ConflictError(
        'Remove this tier from the seat map before deleting it.',
        ErrorCode.TierInSeatMap,
      );
    }
    await this.events.deleteTier(tierId);
  }

  async replaceSeatMap(userId: string, eventId: string, map: SeatMapData): Promise<ManagedEvent> {
    const event = await this.loadForManager(userId, eventId);
    this.assertNotCancelled(event);
    if (event.seatingType !== SeatingType.RESERVED) {
      throw new ConflictError(
        'This event uses general admission, so it has no seat map.',
        ErrorCode.SeatingTypeMismatch,
      );
    }
    if (await this.events.hasSales(eventId)) {
      throw new ConflictError(
        'Seats have already been booked, so the seat map can no longer change.',
        ErrorCode.SeatMapLocked,
      );
    }

    const tierIds = new Set(event.tiers.map((tier) => tier.id));
    const fieldErrors: Record<string, string[]> = {};
    map.sections.forEach((section, s) => {
      section.rows.forEach((row, r) => {
        if (!tierIds.has(row.tierId))
          fieldErrors[`sections.${s}.rows.${r}.tierId`] = ['Choose a tier from this event.'];
      });
    });
    if (Object.keys(fieldErrors).length > 0)
      throw new ValidationError({ formErrors: [], fieldErrors });

    await this.events.replaceSeats(eventId, layoutSeatMap(map));
    return this.get(userId, eventId);
  }

  private async loadForManager(userId: string, eventId: string): Promise<EventWithRelations> {
    const event = await this.events.findById(eventId);
    if (!event) throw new NotFoundError('This event does not exist.');
    await this.authorization.requireEventManager(userId, eventId);
    return event;
  }

  private async toManagedEvent(event: EventWithRelations): Promise<ManagedEvent> {
    const [seats, ticketsSold] = await Promise.all([
      this.events.seatsWithStatus(event.id),
      this.events.countActiveTickets(event.id),
    ]);
    return {
      ...toEventDetail(event),
      organizationId: event.organizationId,
      seatCount: seats.length,
      ticketsSold,
      seatMap: describeSeatMap(seats),
      publishIssues: event.status === EventStatus.DRAFT ? publishIssues(event, seats.length) : [],
    };
  }

  private assertNotCancelled(event: EventWithRelations) {
    if (event.status === EventStatus.CANCELLED) {
      throw new ConflictError(
        'This event has been cancelled and can no longer be edited.',
        ErrorCode.EventCancelled,
      );
    }
  }

  private capacityFor(event: EventWithRelations, data: TierData): number | null {
    if (event.seatingType === SeatingType.RESERVED) return null;
    if (data.capacity === null) {
      throw new ValidationError({
        formErrors: [],
        fieldErrors: { capacity: ['Set how many tickets are available.'] },
      });
    }
    return data.capacity;
  }

  private tierError(error: unknown): unknown {
    const violation = getConstraintViolation(error)?.constraint;
    if (violation === 'ticket_tiers_event_id_name_key') {
      return new ConflictError('Another tier already has this name.', ErrorCode.TierNameTaken);
    }
    if (violation === 'ticket_tiers_capacity_check') {
      return new ConflictError(
        'Capacity cannot be lower than the number of tickets already sold.',
        ErrorCode.CapacityBelowSold,
      );
    }
    return error;
  }
}
