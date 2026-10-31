import type { EventSummary, Page } from '@festpass/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { buttonClasses } from '@/components/ui/button';
import { fetchPublic, PUBLIC_EVENTS_TAG } from '@/lib/server-api';
import { EventCard } from './event-card';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Upcoming events',
  description:
    'Concerts, competitions and nights out at college fests. Book your seat on FestPass.',
};

export default async function EventsPage({ searchParams }: PageProps<'/events'>) {
  const { cursor } = await searchParams;
  const query = typeof cursor === 'string' ? `?cursor=${encodeURIComponent(cursor)}` : '';
  const page = await fetchPublic<Page<EventSummary>>(`/events${query}`, {
    revalidateSeconds: 30,
    tags: [PUBLIC_EVENTS_TAG],
  });
  const events = page?.items ?? [];

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Upcoming events</h1>
        <p className="text-sm text-ink-muted">Soonest first. Prices include all fees.</p>
      </div>

      {events.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-card border border-line bg-surface p-6">
          <p className="font-medium">No events are on sale right now.</p>
          <p className="text-sm text-ink-muted">
            Organizers publish new events through the fest season. Check back soon.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-4">
          {events.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </ul>
      )}

      {page?.nextCursor && (
        <Link
          href={`/events?cursor=${encodeURIComponent(page.nextCursor)}`}
          className={buttonClasses('secondary', 'self-start')}
        >
          Show more events
        </Link>
      )}
    </>
  );
}
