import type { Event, Organization, TicketTier } from '@festpass/db';
import type { EventDetail, EventSummary, TierView } from '@festpass/shared';

export type EventWithRelations = Event & {
  organization: Pick<Organization, 'name' | 'slug'>;
  tiers: TicketTier[];
};

export function toTierView(tier: TicketTier): TierView {
  return {
    id: tier.id,
    name: tier.name,
    description: tier.description,
    priceInPaise: tier.priceInPaise,
    capacity: tier.capacity,
    maxPerOrder: tier.maxPerOrder,
    sortOrder: tier.sortOrder,
    available: tier.capacity === null ? 0 : Math.max(tier.capacity - tier.soldCount, 0),
  };
}

export function toEventSummary(event: EventWithRelations): EventSummary {
  const tiers = event.tiers.map(toTierView);
  return {
    id: event.id,
    slug: event.slug,
    title: event.title,
    venue: event.venue,
    timezone: event.timezone,
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt.toISOString(),
    salesStartAt: event.salesStartAt.toISOString(),
    salesEndAt: event.salesEndAt.toISOString(),
    status: event.status,
    seatingType: event.seatingType,
    organization: { name: event.organization.name, slug: event.organization.slug },
    priceFrom: tiers.length > 0 ? Math.min(...tiers.map((tier) => tier.priceInPaise)) : null,
    soldOut: tiers.length > 0 && tiers.every((tier) => tier.available === 0),
  };
}

export function toEventDetail(event: EventWithRelations): EventDetail {
  return {
    ...toEventSummary(event),
    description: event.description,
    tiers: event.tiers.map(toTierView),
  };
}
