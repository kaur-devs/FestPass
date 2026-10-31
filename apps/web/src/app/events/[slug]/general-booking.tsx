'use client';

import {
  type EventDetail,
  formatPrice,
  MAX_TICKETS_PER_ORDER,
  RealtimeMessage,
} from '@festpass/shared';
import { useMutation } from '@tanstack/react-query';
import { Minus, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button, buttonClasses } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import { availabilityLabel } from '@/lib/events';
import { errorMessage } from '@/lib/forms';
import { bookingApi, useOptionalUser } from '@/lib/orders';
import { useEventUpdates } from '@/lib/realtime';

export function GeneralBooking({ event }: { event: EventDetail }) {
  const router = useRouter();
  const user = useOptionalUser();
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [available, setAvailable] = useState<Record<string, number>>(() =>
    Object.fromEntries(event.tiers.map((tier) => [tier.id, tier.available])),
  );
  const checkoutKey = useRef<string | null>(null);

  useEventUpdates(event.id, {
    [RealtimeMessage.TiersUpdated]: (message) => {
      setAvailable(Object.fromEntries(message.tiers.map((tier) => [tier.id, tier.available])));
    },
  });

  const totalTickets = Object.values(quantities).reduce((sum, quantity) => sum + quantity, 0);
  const total = event.tiers.reduce(
    (sum, tier) => sum + tier.priceInPaise * (quantities[tier.id] ?? 0),
    0,
  );

  const checkout = useMutation({
    mutationFn: () => {
      checkoutKey.current ??= crypto.randomUUID();
      return bookingApi.checkout({
        eventId: event.id,
        idempotencyKey: checkoutKey.current,
        items: Object.entries(quantities)
          .filter(([, quantity]) => quantity > 0)
          .map(([tierId, quantity]) => ({ tierId, quantity })),
      });
    },
    onSuccess: (order) => {
      router.push(`/orders/${order.id}`);
    },
    onError: (error) => {
      if (error instanceof ApiError) checkoutKey.current = null;
    },
  });

  const change = (tierId: string, delta: number, max: number) => {
    setQuantities((current) => {
      const next = Math.min(max, Math.max(0, (current[tierId] ?? 0) + delta));
      return { ...current, [tierId]: next };
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {checkout.isError && <Alert tone="danger">{errorMessage(checkout.error)}</Alert>}
      <ul className="divide-y divide-line">
        {event.tiers.map((tier) => {
          const left = available[tier.id] ?? tier.available;
          const max = Math.min(tier.maxPerOrder, left, MAX_TICKETS_PER_ORDER);
          const quantity = Math.min(quantities[tier.id] ?? 0, max);
          const label = availabilityLabel(left, tier.capacity);
          return (
            <li key={tier.id} className="flex items-center justify-between gap-4 py-3">
              <div className="flex flex-col gap-0.5">
                <span className="font-medium">{tier.name}</span>
                <span className="text-sm text-ink-muted">
                  {formatPrice(tier.priceInPaise)} · {label}
                </span>
              </div>
              {max > 0 && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    square
                    aria-label={`Remove one ${tier.name} ticket`}
                    disabled={quantity === 0}
                    onClick={() => {
                      change(tier.id, -1, max);
                    }}
                  >
                    <Minus aria-hidden className="size-4" strokeWidth={1.5} />
                  </Button>
                  <span className="w-6 text-center font-mono" aria-live="polite">
                    {quantity}
                  </span>
                  <Button
                    variant="secondary"
                    square
                    aria-label={`Add one ${tier.name} ticket`}
                    disabled={quantity >= max}
                    onClick={() => {
                      change(tier.id, 1, max);
                    }}
                  >
                    <Plus aria-hidden className="size-4" strokeWidth={1.5} />
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {user.data === null ? (
        <Link
          href={`/sign-in?next=${encodeURIComponent(`/events/${event.slug}`)}`}
          className={buttonClasses('primary')}
        >
          Sign in to get tickets
        </Link>
      ) : (
        <Button
          disabled={totalTickets === 0}
          pending={checkout.isPending}
          onClick={() => {
            checkout.mutate();
          }}
        >
          {totalTickets === 0
            ? 'Choose tickets'
            : total === 0
              ? `Get ${totalTickets} free ${totalTickets === 1 ? 'ticket' : 'tickets'}`
              : `Continue · ${formatPrice(total)}`}
        </Button>
      )}
    </div>
  );
}
