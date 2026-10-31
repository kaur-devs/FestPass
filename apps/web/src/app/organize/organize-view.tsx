'use client';

import { type CurrentUser, formatEventDate } from '@festpass/shared';
import Link from 'next/link';
import { StatusBadge } from '@/components/status-badge';
import { Alert } from '@/components/ui/alert';
import { buttonClasses } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import { useCurrentUser } from '@/lib/auth';
import { errorMessage } from '@/lib/forms';
import { useOrganizationEvents } from '@/lib/manage';

type Organization = CurrentUser['organizations'][number];

function OrganizationEvents({ organization }: { organization: Organization }) {
  const { data: events, isPending, error } = useOrganizationEvents(organization.id);

  return (
    <section className="flex flex-col gap-4 rounded-card border border-line bg-surface p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h2 className="text-lg font-semibold">{organization.name}</h2>
        <Link href={`/organize/${organization.id}/new`} className={buttonClasses('primary')}>
          New event
        </Link>
      </div>

      {isPending && <div aria-busy className="h-24 animate-pulse rounded-control bg-line" />}
      {error && <Alert tone="danger">{errorMessage(error)}</Alert>}
      {events?.length === 0 && (
        <p className="text-sm text-ink-muted">No events yet. Create a draft to get started.</p>
      )}
      {events && events.length > 0 && (
        <ul className="divide-y divide-line">
          {events.map((event) => (
            <li key={event.id}>
              <Link
                href={`/organize/events/${event.id}`}
                className="flex flex-col gap-1 py-3 hover:text-accent-text md:flex-row md:items-center md:justify-between"
              >
                <span className="font-medium">{event.title}</span>
                <span className="flex items-center gap-3 text-sm text-ink-muted">
                  {formatEventDate(event.startsAt, event.timezone)}
                  <StatusBadge status={event.status} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function OrganizeView() {
  const { data: user, isPending, error } = useCurrentUser();

  const signedOut = error instanceof ApiError && error.status === 401;
  if (isPending || signedOut) {
    return <div aria-busy className="h-40 animate-pulse rounded-card bg-line" />;
  }
  if (error) return <Alert tone="danger">{errorMessage(error)}</Alert>;

  if (user.organizations.length === 0) {
    return (
      <div className="flex flex-col gap-2 rounded-card border border-line bg-surface p-6">
        <p className="font-medium">You are not on an organizing team yet.</p>
        <p className="text-sm text-ink-muted">
          Ask your club or fest committee owner to add you, then your events will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {user.organizations.map((organization) => (
        <OrganizationEvents key={organization.id} organization={organization} />
      ))}
    </div>
  );
}
