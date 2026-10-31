'use client';

import { formatEventDate, type ManagedEvent } from '@festpass/shared';
import Link from 'next/link';
import { type ReactNode, useState } from 'react';
import { StatusBadge } from '@/components/status-badge';
import { Alert } from '@/components/ui/alert';
import { Button, buttonClasses } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import { errorMessage } from '@/lib/forms';
import { manageApi, useEventMutation, useManagedEvent } from '@/lib/manage';
import { EventDetailsForm } from '../../event-details-form';
import { SalesPanel } from './sales-panel';
import { SeatMapEditor } from './seat-map-editor';
import { TierEditor } from './tier-editor';

function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-card border border-line bg-surface p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">{title}</h2>
        {description && <p className="text-sm text-ink-muted">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function PublishChecklist({ event }: { event: ManagedEvent }) {
  const publish = useEventMutation(event.id, () => manageApi.publish(event.id));
  const issues =
    publish.error instanceof ApiError && Array.isArray(publish.error.details)
      ? (publish.error.details as string[])
      : event.publishIssues;

  return (
    <Panel
      title="Publish"
      description="Published events appear in the public listing and can be shared."
    >
      {issues.length > 0 ? (
        <ul className="flex flex-col gap-2 text-sm">
          {issues.map((issue) => (
            <li key={issue} className="flex gap-2">
              <span aria-hidden className="text-danger">
                ●
              </span>
              {issue}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-success">Everything is in place.</p>
      )}
      {publish.isError && !(publish.error instanceof ApiError) && (
        <Alert tone="danger">{errorMessage(publish.error)}</Alert>
      )}
      <Button
        className="self-start"
        disabled={issues.length > 0}
        pending={publish.isPending}
        onClick={() => {
          publish.mutate(undefined);
        }}
      >
        Publish event
      </Button>
    </Panel>
  );
}

function CancelEvent({ event }: { event: ManagedEvent }) {
  const [confirming, setConfirming] = useState(false);
  const cancel = useEventMutation(event.id, () => manageApi.cancel(event.id));

  return (
    <Panel
      title="Cancel event"
      description="Removes the event from listings and stops editing. The event page stays up with a cancellation notice."
    >
      {cancel.isError && <Alert tone="danger">{errorMessage(cancel.error)}</Alert>}
      {confirming ? (
        <div className="flex flex-col gap-3 md:flex-row">
          <Button
            variant="danger"
            pending={cancel.isPending}
            onClick={() => {
              cancel.mutate(undefined);
            }}
          >
            Yes, cancel {event.title}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setConfirming(false);
            }}
          >
            Keep event
          </Button>
        </div>
      ) : (
        <Button
          variant="danger"
          className="self-start"
          onClick={() => {
            setConfirming(true);
          }}
        >
          Cancel event
        </Button>
      )}
    </Panel>
  );
}

function EventDetailsPanel({ event }: { event: ManagedEvent }) {
  const save = useEventMutation(event.id, (input: Parameters<typeof manageApi.updateEvent>[1]) =>
    manageApi.updateEvent(event.id, input),
  );
  return (
    <Panel title="Details">
      <EventDetailsForm
        key={event.id}
        mode="edit"
        event={event}
        onSubmit={async (input) => {
          await save.mutateAsync(input);
        }}
      />
    </Panel>
  );
}

export function ManageEvent({ eventId }: { eventId: string }) {
  const { data: event, isPending, error } = useManagedEvent(eventId);

  if (isPending) return <div aria-busy className="h-64 animate-pulse rounded-card bg-line" />;
  if (error) {
    return (
      <div className="flex flex-col items-start gap-4">
        <Alert tone="danger">{errorMessage(error)}</Alert>
        <Link href="/organize" className={buttonClasses('secondary')}>
          Back to your events
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/organize" className="text-sm text-accent-text underline">
          Back to your events
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{event.title}</h1>
          <StatusBadge status={event.status} />
        </div>
        <p className="text-sm text-ink-muted">
          {formatEventDate(event.startsAt, event.timezone)} · {event.venue} · {event.ticketsSold}{' '}
          tickets sold
        </p>
        {event.status !== 'DRAFT' && (
          <Link href={`/events/${event.slug}`} className="text-sm text-accent-text underline">
            View public page
          </Link>
        )}
      </div>

      {event.status === 'DRAFT' ? (
        <PublishChecklist event={event} />
      ) : (
        <SalesPanel eventId={event.id} />
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <EventDetailsPanel event={event} />
        <Panel
          title="Ticket tiers"
          description={
            event.seatingType === 'RESERVED'
              ? 'Each tier is a price level. Capacity comes from the seats assigned in the seat map.'
              : 'Each tier is a price level with its own number of tickets.'
          }
        >
          <TierEditor event={event} />
        </Panel>
      </div>

      {event.seatingType === 'RESERVED' && (
        <Panel
          title="Seat map"
          description="Sections sit side by side facing the stage. Rows are numbered from the left."
        >
          <SeatMapEditor event={event} />
        </Panel>
      )}

      {event.status !== 'CANCELLED' && <CancelEvent event={event} />}
    </div>
  );
}
