import { type EventSummary, formatEventDate, formatPrice } from '@festpass/shared';
import Link from 'next/link';
import { salesLabel, salesState } from '@/lib/events';

function DateStub({ startsAt, timezone }: { startsAt: string; timezone: string }) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: timezone, day: 'numeric', month: 'short' })
      .formatToParts(new Date(startsAt))
      .map(({ type, value }) => [type, value]),
  );
  return (
    <div className="flex w-20 shrink-0 flex-col items-center justify-center border-r border-dashed border-line py-4">
      <span className="font-mono text-xs text-ink-muted uppercase">{parts.month}</span>
      <span className="font-display text-display-md font-extrabold">{parts.day}</span>
    </div>
  );
}

export function EventCard({ event }: { event: EventSummary }) {
  const state = salesState(event);
  const muted = state === 'cancelled' || state === 'closed' || state === 'sold-out';

  return (
    <li>
      <Link
        href={`/events/${event.slug}`}
        className="flex overflow-hidden rounded-card border border-line bg-surface transition-colors duration-150 ease-out hover:border-ink"
      >
        <DateStub startsAt={event.startsAt} timezone={event.timezone} />
        <div className="flex min-w-0 flex-1 flex-col gap-1 p-4">
          <h2 className="truncate font-display text-2xl font-bold uppercase">{event.title}</h2>
          <p className="text-sm text-ink-muted">
            {formatEventDate(event.startsAt, event.timezone)} · {event.venue}
          </p>
          <p className="text-sm text-ink-muted">{event.organization.name}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            {event.priceFrom !== null && (
              <span className="font-semibold">
                {event.priceFrom === 0 ? 'Free' : `From ${formatPrice(event.priceFrom)}`}
              </span>
            )}
            <span className={muted ? 'text-danger' : 'text-success'}>{salesLabel(event)}</span>
          </div>
        </div>
      </Link>
    </li>
  );
}
