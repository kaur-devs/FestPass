'use client';

import { formatEventDate, formatPrice, type OrderView, ticketReference } from '@festpass/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { TicketQr } from '@/components/ticket-qr';
import { Alert } from '@/components/ui/alert';
import { Button, buttonClasses } from '@/components/ui/button';
import { API_URL } from '@/lib/api';
import { errorMessage } from '@/lib/forms';
import { bookingApi, bookingKeys, formatCountdown, useSecondsUntil } from '@/lib/orders';
import { PayButton } from './pay-button';

function EventHeader({ order, title }: { order: OrderView; title: string }) {
  return (
    <header className="flex flex-col gap-2">
      <p className="font-mono text-sm text-ink-muted">
        {formatEventDate(order.event.startsAt, order.event.timezone)} · {order.event.venue}
      </p>
      <h1 className="text-2xl font-semibold">{title}</h1>
      <Link href={`/events/${order.event.slug}`} className="text-sm text-accent-text underline">
        {order.event.title}
      </Link>
    </header>
  );
}

function Summary({ order }: { order: OrderView }) {
  return (
    <section className="flex flex-col gap-3 rounded-card border border-line bg-surface p-6">
      <h2 className="text-lg font-semibold">Order summary</h2>
      <ul className="divide-y divide-line">
        {order.items.map((item, index) => (
          <li key={index} className="flex justify-between gap-4 py-2 text-sm">
            <span>
              {item.tierName}
              {item.seatLabel ? ` · ${item.seatLabel}` : ` × ${item.quantity}`}
            </span>
            <span className="font-mono">{formatPrice(item.unitPriceInPaise * item.quantity)}</span>
          </li>
        ))}
      </ul>
      <div className="flex justify-between border-t border-line pt-3 font-semibold">
        <span>Total</span>
        <span>{formatPrice(order.totalInPaise)}</span>
      </div>
    </section>
  );
}

function Tickets({ order }: { order: OrderView }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h2 className="text-lg font-semibold">Your tickets</h2>
        <a
          href={`${API_URL}/orders/${order.id}/tickets.pdf`}
          className={buttonClasses('secondary', 'self-start')}
        >
          <Download aria-hidden className="size-4" strokeWidth={1.5} />
          Download PDF
        </a>
      </div>
      <p className="text-sm text-ink-muted">
        Show the QR code at the gate. Each code admits one person once, so do not share it.
      </p>
      <ul className="flex flex-col gap-3">
        {order.tickets.map((ticket) => (
          <li
            key={ticket.id}
            className="flex flex-col overflow-hidden rounded-card border border-line bg-surface md:flex-row"
          >
            <div className="flex flex-1 flex-col gap-1 border-l-8 border-accent p-4">
              <span className="font-display text-2xl font-bold uppercase">{order.event.title}</span>
              <span className="text-lg font-semibold">
                {ticket.seatLabel ?? 'General admission'}
              </span>
              <span className="text-sm text-ink-muted">{ticket.tierName}</span>
            </div>
            <div className="flex flex-col items-center justify-center gap-2 border-t border-dashed border-line p-4 md:border-t-0 md:border-l">
              <TicketQr
                code={ticket.code}
                size={160}
                label={`Entry QR code for ${ticket.seatLabel ?? ticket.tierName}`}
              />
              <span className="font-mono text-xs text-ink-muted">{ticketReference(ticket.id)}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Pending({ order }: { order: OrderView }) {
  const queryClient = useQueryClient();
  const secondsLeft = useSecondsUntil(order.expiresAt) ?? 0;
  const cancel = useMutation({
    mutationFn: () => bookingApi.cancel(order.id),
    onSuccess: (updated) => {
      queryClient.setQueryData(bookingKeys.order(order.id), updated);
    },
  });

  if (secondsLeft === 0) {
    return (
      <Ended order={order} title="This checkout has ended">
        Your seats were released because payment was not completed in time.
      </Ended>
    );
  }

  return (
    <>
      <EventHeader order={order} title="Complete your booking" />
      <Alert tone="success">
        Your {order.items.some((item) => item.seatLabel) ? 'seats are' : 'tickets are'} held for{' '}
        <span className="font-mono font-semibold">{formatCountdown(secondsLeft)}</span>.
      </Alert>
      <Summary order={order} />
      {cancel.isError && <Alert tone="danger">{errorMessage(cancel.error)}</Alert>}
      <div className="flex flex-col gap-3">
        <PayButton order={order} />
        <Button
          variant="ghost"
          className="self-start"
          pending={cancel.isPending}
          onClick={() => {
            cancel.mutate();
          }}
        >
          Cancel and release {order.items.some((item) => item.seatLabel) ? 'seats' : 'tickets'}
        </Button>
      </div>
    </>
  );
}

function Ended({
  order,
  title,
  children,
}: {
  order: OrderView;
  title: string;
  children: ReactNode;
}) {
  return (
    <>
      <EventHeader order={order} title={title} />
      <Alert tone="danger">{children}</Alert>
      <Link
        href={`/events/${order.event.slug}`}
        className={buttonClasses('secondary', 'self-start')}
      >
        Back to the event
      </Link>
    </>
  );
}

export function OrderDetails({ orderId }: { orderId: string }) {
  const order = useQuery({
    queryKey: bookingKeys.order(orderId),
    queryFn: () => bookingApi.order(orderId),
    refetchInterval: (query) => (query.state.data?.status === 'PENDING' ? 5000 : false),
  });

  if (order.isPending) return <div aria-busy className="h-64 animate-pulse rounded-card bg-line" />;
  if (order.isError) return <Alert tone="danger">{errorMessage(order.error)}</Alert>;

  const data = order.data;
  switch (data.status) {
    case 'PENDING':
      return <Pending order={data} />;
    case 'PAID':
      return (
        <>
          <EventHeader order={data} title="You're going" />
          <Tickets order={data} />
          <Summary order={data} />
        </>
      );
    case 'EXPIRED':
      return (
        <Ended order={data} title="This checkout has ended">
          The seats or tickets were released. You can start again from the event page.
        </Ended>
      );
    case 'REFUND_PENDING':
    case 'REFUNDED':
      return (
        <Ended order={data} title="We could not confirm your booking">
          The seats sold out before your payment reached us. Your payment of{' '}
          {formatPrice(data.totalInPaise)} will be refunded.
        </Ended>
      );
    case 'FAILED':
      return (
        <Ended order={data} title="We could not confirm your booking">
          These tickets were taken before your booking finished. Nothing was charged.
        </Ended>
      );
  }
}
