'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { manageApi, manageKeys } from '@/lib/manage';
import { EventDetailsForm } from '../../event-details-form';

export function NewEventForm({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  return (
    <EventDetailsForm
      mode="create"
      onSubmit={async (input) => {
        const event = await manageApi.createEvent(organizationId, input);
        queryClient.setQueryData(manageKeys.event(event.id), event);
        await queryClient.invalidateQueries({
          queryKey: manageKeys.organizationEvents(organizationId),
        });
        router.push(`/organize/events/${event.id}`);
      }}
    />
  );
}
