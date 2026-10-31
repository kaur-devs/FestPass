import type {
  CreateEventInput,
  EventSummary,
  ManagedEvent,
  SeatMapInput,
  TierInput,
  TierView,
  UpdateEventInput,
} from '@festpass/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { refreshPublicEvents } from './revalidate';
import { apiCommand, apiJson } from './api';

export const manageKeys = {
  organizationEvents: (organizationId: string) =>
    ['manage', 'organizations', organizationId, 'events'] as const,
  event: (eventId: string) => ['manage', 'events', eventId] as const,
};

export const manageApi = {
  listEvents: async (organizationId: string) =>
    (await apiJson<{ events: EventSummary[] }>(`/manage/organizations/${organizationId}/events`))
      .events,
  createEvent: async (organizationId: string, input: CreateEventInput) =>
    (
      await apiJson<{ event: ManagedEvent }>(`/manage/organizations/${organizationId}/events`, {
        method: 'POST',
        body: input,
      })
    ).event,
  getEvent: async (eventId: string) =>
    (await apiJson<{ event: ManagedEvent }>(`/manage/events/${eventId}`)).event,
  updateEvent: async (eventId: string, input: UpdateEventInput) =>
    (
      await apiJson<{ event: ManagedEvent }>(`/manage/events/${eventId}`, {
        method: 'PATCH',
        body: input,
      })
    ).event,
  publish: async (eventId: string) =>
    (
      await apiJson<{ event: ManagedEvent }>(`/manage/events/${eventId}/publish`, {
        method: 'POST',
      })
    ).event,
  cancel: async (eventId: string) =>
    (await apiJson<{ event: ManagedEvent }>(`/manage/events/${eventId}/cancel`, { method: 'POST' }))
      .event,
  addTier: async (eventId: string, input: TierInput) =>
    (
      await apiJson<{ tier: TierView }>(`/manage/events/${eventId}/tiers`, {
        method: 'POST',
        body: input,
      })
    ).tier,
  updateTier: async (eventId: string, tierId: string, input: TierInput) =>
    (
      await apiJson<{ tier: TierView }>(`/manage/events/${eventId}/tiers/${tierId}`, {
        method: 'PATCH',
        body: input,
      })
    ).tier,
  deleteTier: (eventId: string, tierId: string) =>
    apiCommand(`/manage/events/${eventId}/tiers/${tierId}`, { method: 'DELETE' }),
  replaceSeatMap: async (eventId: string, input: SeatMapInput) =>
    (
      await apiJson<{ event: ManagedEvent }>(`/manage/events/${eventId}/seat-map`, {
        method: 'PUT',
        body: input,
      })
    ).event,
};

export function useOrganizationEvents(organizationId: string) {
  return useQuery({
    queryKey: manageKeys.organizationEvents(organizationId),
    queryFn: () => manageApi.listEvents(organizationId),
  });
}

export function useManagedEvent(eventId: string) {
  return useQuery({
    queryKey: manageKeys.event(eventId),
    queryFn: () => manageApi.getEvent(eventId),
  });
}

export function useEventMutation<Variables>(
  eventId: string,
  mutationFn: (variables: Variables) => Promise<unknown>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async (result) => {
      if (result && typeof result === 'object' && 'organizationId' in result) {
        queryClient.setQueryData(manageKeys.event(eventId), result);
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['manage'] }),
        refreshPublicEvents(),
      ]);
    },
  });
}

export function rupeesToPaise(rupees: string): number {
  return Math.round(Number(rupees) * 100);
}

export function paiseToRupees(paise: number): string {
  return paise % 100 === 0 ? String(paise / 100) : (paise / 100).toFixed(2);
}
