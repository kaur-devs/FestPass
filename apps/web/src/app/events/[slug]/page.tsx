import {
  type EventDetail,
  formatEventDate,
  formatPrice,
  type SeatView,
  type TierView,
} from '@festpass/shared';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { Alert } from '@/components/ui/alert';
import { availabilityLabel, salesLabel, salesState } from '@/lib/events';
import { fetchPublic, PUBLIC_EVENTS_TAG } from '@/lib/server-api';
import { GeneralBooking } from './general-booking';
import { ReservedBooking } from './reserved-booking';

export const dynamic = 'force-dynamic';

const loadEvent = cache(async (slug: string) => {
  const result = await fetchPublic<{ event: EventDetail }>(`/events/${encodeURIComponent(slug)}`, {
    revalidateSeconds: 30,
    tags: [PUBLIC_EVENTS_TAG],
  });
  return result?.event ?? null;
});

export async function generateMetadata({ params }: PageProps<'/events/[slug]'>): Promise<Metadata> {
  const event = await loadEvent((await params).slug);
  if (!event) return { title: 'Event not found' };
  const description =
    `${formatEventDate(event.startsAt, event.timezone)} at ${event.venue}. ${event.description}`.slice(
      0,
      160,
    );
  return {
    title: event.title,
    description,
    openGraph: { title: event.title, description, type: 'website' },
  };
}

function TierRow({ tier, showAvailability }: { tier: TierView; showAvailability: boolean }) {
  const label = availabilityLabel(tier.available, tier.capacity);
  return (
    <li className="flex items-start justify-between gap-4 py-3">
      <div className="flex flex-col gap-0.5">
        <span className="font-medium">{tier.name}</span>
        {tier.description && <span className="text-sm text-ink-muted">{tier.description}</span>}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <span className="font-semibold">{formatPrice(tier.priceInPaise)}</span>
        {showAvailability && (
          <span className={`text-sm ${label === 'Sold out' ? 'text-danger' : 'text-ink-muted'}`}>
            {label}
          </span>
        )}
      </div>
    </li>
  );
}

export default async function EventPage({ params }: PageProps<'/events/[slug]'>) {
  const { slug } = await params;
  const event = await loadEvent(slug);
  if (!event) notFound();

  const seats =
    event.seatingType === 'RESERVED'
      ? ((await fetchPublic<{ seats: SeatView[] }>(`/events/${encodeURIComponent(slug)}/seats`))
          ?.seats ?? [])
      : [];
  const state = salesState(event);

  return (
    <article className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <p className="font-mono text-sm text-ink-muted">
          {formatEventDate(event.startsAt, event.timezone)} · {event.venue}
        </p>
        <h1 className="font-display text-display-md font-extrabold uppercase md:text-display-lg">
          {event.title}
        </h1>
        <p className="text-sm text-ink-muted">Presented by {event.organization.name}</p>
      </header>

      {state === 'cancelled' && (
        <Alert tone="danger">This event has been cancelled. Ticket holders will be refunded.</Alert>
      )}

      <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-8">
          {event.description && (
            <section className="flex flex-col gap-2">
              <h2 className="text-lg font-semibold">About</h2>
              <p className="max-w-prose whitespace-pre-line text-ink-muted">{event.description}</p>
            </section>
          )}
        </div>

        <aside className="flex flex-col gap-4 self-start rounded-card border border-line bg-surface p-6">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold">Tickets</h2>
            <span className={`text-sm ${state === 'on-sale' ? 'text-success' : 'text-ink-muted'}`}>
              {salesLabel(event)}
            </span>
          </div>
          {event.tiers.length === 0 ? (
            <p className="text-sm text-ink-muted">Ticket prices have not been announced yet.</p>
          ) : event.seatingType === 'GENERAL_ADMISSION' && state === 'on-sale' ? (
            <GeneralBooking event={event} />
          ) : (
            <ul className="divide-y divide-line">
              {event.tiers.map((tier) => (
                <TierRow key={tier.id} tier={tier} showAvailability={state !== 'cancelled'} />
              ))}
            </ul>
          )}
          <p className="text-sm text-ink-muted">
            Sales close {formatEventDate(event.salesEndAt, event.timezone)}.
          </p>
        </aside>
      </div>

      {seats.length > 0 && (
        <section className="flex min-w-0 flex-col gap-3">
          <h2 className="text-lg font-semibold">
            {state === 'on-sale' ? 'Choose your seats' : 'Seating'}
          </h2>
          <ReservedBooking event={event} initialSeats={seats} onSale={state === 'on-sale'} />
        </section>
      )}
    </article>
  );
}
