'use client';

import { type CheckInEvent, formatEventDate } from '@festpass/shared';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { Alert } from '@/components/ui/alert';
import { apiJson } from '@/lib/api';
import { checkInKeys, storedEvents } from '@/lib/checkin';
import { errorMessage } from '@/lib/forms';

async function loadEvents(): Promise<{ events: CheckInEvent[]; offline: boolean }> {
  try {
    const { events } = await apiJson<{ events: CheckInEvent[] }>('/check-in/events');
    return { events, offline: false };
  } catch (error) {
    if (navigator.onLine) throw error;
    return { events: await storedEvents(), offline: true };
  }
}

export function CheckInEvents() {
  const { data, isPending, error } = useQuery({
    queryKey: checkInKeys.events,
    queryFn: loadEvents,
  });

  return (
    <div className="min-h-dvh">
      <header className="border-b border-line">
        <div className="mx-auto flex h-16 max-w-content items-center justify-between px-4 md:px-6">
          <Link href="/" className="font-display text-2xl font-extrabold uppercase">
            FestPass
          </Link>
          <span className="text-sm font-medium text-ink-muted">Gate</span>
        </div>
      </header>
      <main className="mx-auto flex max-w-content flex-col gap-6 px-4 py-8 md:px-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">Check-in</h1>
          <p className="text-ink-muted">Choose the event you are scanning tickets for.</p>
        </div>

        {isPending && <div aria-busy className="h-32 animate-pulse rounded-card bg-line" />}
        {error && <Alert tone="danger">{errorMessage(error)}</Alert>}
        {data?.offline && (
          <Alert tone="danger">
            You are offline. Showing events whose guest list is saved on this phone.
          </Alert>
        )}
        {data?.events.length === 0 && (
          <p className="rounded-card border border-line bg-surface p-6 text-ink-muted">
            You are not on the check-in team for any upcoming event. Ask the organizer to add you
            with the email you use on FestPass.
          </p>
        )}
        {data && data.events.length > 0 && (
          <ul className="flex flex-col gap-3">
            {data.events.map((event) => (
              <li key={event.id}>
                <Link
                  href={`/check-in/${event.id}`}
                  className="flex items-center justify-between gap-4 rounded-card border border-line bg-surface p-4 hover:border-ink"
                >
                  <span className="flex flex-col gap-1">
                    <span className="font-semibold">{event.title}</span>
                    <span className="text-sm text-ink-muted">
                      {formatEventDate(event.startsAt, event.timezone)} · {event.venue}
                    </span>
                    {event.gate && <span className="text-sm font-medium">{event.gate}</span>}
                  </span>
                  <ChevronRight aria-hidden className="size-5 shrink-0" strokeWidth={1.5} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
