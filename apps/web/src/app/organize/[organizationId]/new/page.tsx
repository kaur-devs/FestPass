import type { Metadata } from 'next';
import Link from 'next/link';
import { NewEventForm } from './new-event-form';

export const metadata: Metadata = { title: 'New event' };

export default async function NewEventPage({
  params,
}: PageProps<'/organize/[organizationId]/new'>) {
  const { organizationId } = await params;

  return (
    <>
      <div className="flex flex-col gap-1">
        <Link href="/organize" className="text-sm text-accent-text underline">
          Back to your events
        </Link>
        <h1 className="text-2xl font-semibold">New event</h1>
        <p className="text-sm text-ink-muted">
          Starts as a draft. Add tiers and seats, then publish when it is ready.
        </p>
      </div>
      <div className="max-w-2xl rounded-card border border-line bg-surface p-6">
        <NewEventForm organizationId={organizationId} />
      </div>
    </>
  );
}
