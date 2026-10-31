import type {
  CheckoutInput,
  CurrentHoldView,
  OrderView,
  PaymentSessionView,
  SeatHoldView,
  SeatView,
  VerifyPaymentInput,
} from '@festpass/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useEffectEvent, useState } from 'react';
import { ApiError, apiJson } from './api';
import { authApi, optionalUserKey } from './auth';

export const bookingKeys = {
  optionalUser: optionalUserKey,
  seats: (slug: string) => ['seats', slug] as const,
  hold: (eventId: string) => ['hold', eventId] as const,
  order: (orderId: string) => ['order', orderId] as const,
};

export const bookingApi = {
  seats: async (slug: string) =>
    (await apiJson<{ seats: SeatView[] }>(`/events/${encodeURIComponent(slug)}/seats`)).seats,
  currentHold: (eventId: string) => apiJson<CurrentHoldView>(`/events/${eventId}/hold`),
  hold: async (eventId: string, seatIds: string[]) =>
    (
      await apiJson<{ hold: SeatHoldView | null }>(`/events/${eventId}/hold`, {
        method: 'PUT',
        body: { seatIds },
      })
    ).hold,
  checkout: async (input: CheckoutInput) =>
    (await apiJson<{ order: OrderView }>('/orders', { method: 'POST', body: input })).order,
  order: async (orderId: string) =>
    (await apiJson<{ order: OrderView }>(`/orders/${orderId}`)).order,
  startPayment: async (orderId: string) =>
    (
      await apiJson<{ payment: PaymentSessionView }>(`/orders/${orderId}/payment`, {
        method: 'POST',
      })
    ).payment,
  verifyPayment: async (orderId: string, input: VerifyPaymentInput) =>
    (
      await apiJson<{ order: OrderView }>(`/orders/${orderId}/payment/verify`, {
        method: 'POST',
        body: input,
      })
    ).order,
  cancel: async (orderId: string) =>
    (await apiJson<{ order: OrderView }>(`/orders/${orderId}/cancel`, { method: 'POST' })).order,
};

export function useOptionalUser() {
  return useQuery({
    queryKey: bookingKeys.optionalUser,
    queryFn: async () => {
      try {
        return (await authApi.me()).user;
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    retry: false,
  });
}

export function useSecondsUntil(
  deadline: string | null | undefined,
  onExpire?: () => void,
): number | null {
  const [now, setNow] = useState(() => Date.now());
  const handleExpire = useEffectEvent(() => onExpire?.());

  useEffect(() => {
    if (!deadline) return;
    const end = new Date(deadline).getTime();
    const tick = () => {
      const current = Date.now();
      setNow(current);
      if (current >= end) {
        clearInterval(timer);
        handleExpire();
      }
    };
    const firstTick = setTimeout(tick, 0);
    const timer = setInterval(tick, 1000);
    return () => {
      clearTimeout(firstTick);
      clearInterval(timer);
    };
  }, [deadline]);

  if (!deadline) return null;
  return Math.max(0, Math.ceil((new Date(deadline).getTime() - now) / 1000));
}

export function formatCountdown(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}
