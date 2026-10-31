import type { Metadata } from 'next';
import { ManageEvent } from './manage-event';

export const metadata: Metadata = { title: 'Manage event' };

export default async function ManageEventPage({ params }: PageProps<'/organize/events/[eventId]'>) {
  const { eventId } = await params;
  return <ManageEvent eventId={eventId} />;
}
