'use client';

import { type EventDetail, ErrorCode, formatPrice, type SeatView } from '@festpass/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState } from 'react';
import { SeatMap } from '@/components/seat-map/seat-map';
import { Alert } from '@/components/ui/alert';
import { Button, buttonClasses } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import { errorMessage } from '@/lib/forms';
import {
  bookingApi,
  bookingKeys,
  formatCountdown,
  useOptionalUser,
  useSecondsUntil,
} from '@/lib/orders';

const SEAT_REFRESH_MS = 15_000;

interface ReservedBookingProps {
  event: EventDetail;
  initialSeats: SeatView[];
  onSale: boolean;
}

export function ReservedBooking({ event, initialSeats, onSale }: ReservedBookingProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useOptionalUser();
  const signedIn = Boolean(user.data);
  const [localSelection, setLocalSelection] = useState<string[] | null>(null);
  const [notice, setNotice] = useState<string>();
  const checkoutKey = useRef<string | null>(null);

  const seats = useQuery({
    queryKey: bookingKeys.seats(event.slug),
    queryFn: () => bookingApi.seats(event.slug),
    initialData: initialSeats,
    refetchInterval: SEAT_REFRESH_MS,
  });
  const current = useQuery({
    queryKey: bookingKeys.hold(event.id),
    queryFn: () => bookingApi.currentHold(event.id),
    enabled: signedIn && onSale,
  });

  const hold = useMutation({
    mutationKey: bookingKeys.hold(event.id),
    scope: { id: `hold-${event.id}` },
    mutationFn: (seatIds: string[]) => bookingApi.hold(event.id, seatIds),
    onSuccess: (result) => {
      queryClient.setQueryData(bookingKeys.hold(event.id), {
        hold: result,
        pendingOrderId: current.data?.pendingOrderId ?? null,
      });
    },
    onError: (error) => {
      setNotice(errorMessage(error));
      if (error instanceof ApiError && error.code === ErrorCode.CheckoutInProgress) {
        void current.refetch();
      }
    },
    onSettled: () => {
      if (queryClient.isMutating({ mutationKey: bookingKeys.hold(event.id) }) <= 1) {
        setLocalSelection(null);
        void seats.refetch();
      }
    },
  });

  const checkout = useMutation({
    mutationFn: () => {
      checkoutKey.current ??= crypto.randomUUID();
      return bookingApi.checkout({ eventId: event.id, idempotencyKey: checkoutKey.current });
    },
    onSuccess: (order) => {
      router.push(`/orders/${order.id}`);
    },
    onError: (error) => {
      if (error instanceof ApiError) checkoutKey.current = null;
      setNotice(errorMessage(error));
      void current.refetch();
      void seats.refetch();
    },
  });

  const selectedIds = useMemo(
    () => new Set(localSelection ?? current.data?.hold?.seatIds ?? []),
    [localSelection, current.data],
  );
  const secondsLeft = useSecondsUntil(current.data?.hold?.expiresAt, () => {
    setNotice('Your seats were released because the hold expired. Choose them again.');
    void current.refetch();
    void seats.refetch();
  });

  const seatsById = new Map(seats.data.map((seat) => [seat.id, seat]));
  const tiersById = new Map(event.tiers.map((tier) => [tier.id, tier]));
  const chosen = [...selectedIds]
    .map((id) => seatsById.get(id))
    .filter((seat) => seat !== undefined)
    .sort((a, b) => a.y - b.y || a.x - b.x);
  const total = chosen.reduce(
    (sum, seat) => sum + (tiersById.get(seat.tierId)?.priceInPaise ?? 0),
    0,
  );
  const pendingOrderId = current.data?.pendingOrderId;

  const onSeatToggle = (seat: SeatView) => {
    if (!signedIn) {
      setNotice('sign-in');
      return;
    }
    const next = new Set(selectedIds);
    if (next.has(seat.id)) next.delete(seat.id);
    else next.add(seat.id);
    setNotice(undefined);
    setLocalSelection([...next]);
    hold.mutate([...next]);
  };

  return (
    <div className="flex flex-col gap-4">
      {pendingOrderId && (
        <Alert tone="success">
          You have a checkout in progress for this event.{' '}
          <Link href={`/orders/${pendingOrderId}`} className="font-semibold underline">
            Resume checkout
          </Link>
        </Alert>
      )}
      {notice === 'sign-in' ? (
        <Alert tone="danger">
          <Link
            href={`/sign-in?next=${encodeURIComponent(`/events/${event.slug}`)}`}
            className="font-semibold underline"
          >
            Sign in
          </Link>{' '}
          to choose seats. Your place on this page is kept.
        </Alert>
      ) : (
        notice && <Alert tone="danger">{notice}</Alert>
      )}

      <SeatMap
        seats={seats.data}
        tiers={event.tiers}
        selectedIds={selectedIds}
        {...(onSale && !pendingOrderId && { onSeatToggle })}
      />

      {onSale && chosen.length > 0 && (
        <section
          aria-label="Your seats"
          className="sticky bottom-4 flex flex-col gap-4 rounded-card border border-ink bg-surface p-4 shadow-popover md:flex-row md:items-center md:justify-between"
        >
          <div className="flex flex-col gap-1">
            <p className="font-semibold">
              {chosen.length} {chosen.length === 1 ? 'seat' : 'seats'} · {formatPrice(total)}
            </p>
            <p className="font-mono text-sm text-ink-muted">
              {chosen.map((seat) => `${seat.row}${seat.number}`).join(', ')}
            </p>
            {secondsLeft !== null && secondsLeft > 0 && (
              <p className="text-sm text-warning" aria-live="polite">
                Held for you for {formatCountdown(secondsLeft)}
              </p>
            )}
          </div>
          <Button
            pending={checkout.isPending}
            disabled={hold.isPending}
            onClick={() => {
              checkout.mutate();
            }}
          >
            Continue to checkout
          </Button>
        </section>
      )}

      {onSale && chosen.length === 0 && !pendingOrderId && (
        <p className="text-sm text-ink-muted">
          Choose up to 10 seats. They are held for you for 5 minutes while you check out.
        </p>
      )}
      {!onSale && (
        <Link href="/events" className={buttonClasses('secondary', 'self-start')}>
          See other events
        </Link>
      )}
    </div>
  );
}
