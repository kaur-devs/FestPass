'use client';

import { type EventSalesStats, formatPrice } from '@festpass/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '@/components/ui/alert';
import { apiJson } from '@/lib/api';
import { errorMessage } from '@/lib/forms';
import { manageKeys } from '@/lib/manage';
import { useSalesUpdates } from '@/lib/realtime';

const relativeTime = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

function ago(iso: string): string {
  const seconds = Math.round((Date.parse(iso) - Date.now()) / 1000);
  if (Math.abs(seconds) < 60) return relativeTime.format(seconds, 'second');
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return relativeTime.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return relativeTime.format(hours, 'hour');
  return relativeTime.format(Math.round(hours / 24), 'day');
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-ink-muted uppercase">{label}</span>
      <span className="font-display text-display-md font-extrabold">{value}</span>
    </div>
  );
}

export function SalesPanel({ eventId }: { eventId: string }) {
  const queryClient = useQueryClient();
  const stats = useQuery({
    queryKey: [...manageKeys.event(eventId), 'stats'],
    queryFn: async () =>
      (await apiJson<{ stats: EventSalesStats }>(`/manage/events/${eventId}/stats`)).stats,
  });
  const { connected } = useSalesUpdates(eventId, () => {
    void queryClient.invalidateQueries({ queryKey: [...manageKeys.event(eventId), 'stats'] });
  });

  return (
    <section className="flex flex-col gap-6 rounded-card border border-line bg-surface p-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold">Sales</h2>
        <span className="flex items-center gap-2 text-sm text-ink-muted" aria-live="polite">
          <span
            aria-hidden
            className={`size-2 rounded-full ${connected ? 'bg-success' : 'bg-line'}`}
          />
          {connected ? 'Live' : 'Reconnecting'}
        </span>
      </div>

      {stats.isPending && <div aria-busy className="h-32 animate-pulse rounded-control bg-line" />}
      {stats.isError && <Alert tone="danger">{errorMessage(stats.error)}</Alert>}
      {stats.data && (
        <>
          <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
            <Figure label="Tickets sold" value={stats.data.ticketsSold.toLocaleString('en-IN')} />
            <Figure
              label="Revenue"
              value={formatPrice(stats.data.revenueInPaise).replace('Free', '₹0')}
            />
            <Figure label="Checking out now" value={String(stats.data.checkoutsInProgress)} />
            <Figure
              label="Checked in"
              value={`${stats.data.ticketsCheckedIn.toLocaleString('en-IN')} / ${stats.data.ticketsSold.toLocaleString('en-IN')}`}
            />
          </div>

          <ul className="flex flex-col gap-3">
            {stats.data.tiers.map((tier) => {
              const percent =
                tier.capacity && tier.capacity > 0
                  ? Math.round((tier.sold / tier.capacity) * 100)
                  : 0;
              return (
                <li key={tier.id} className="flex flex-col gap-1">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{tier.name}</span>
                    <span className="font-mono text-ink-muted">
                      {tier.sold} / {tier.capacity ?? '—'}
                    </span>
                  </div>
                  <div
                    role="progressbar"
                    aria-label={`${tier.name} sold`}
                    aria-valuenow={percent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    className="h-2 overflow-hidden rounded-control bg-line"
                  >
                    <div className="h-full bg-accent" style={{ width: `${percent}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">Recent orders</h3>
            {stats.data.recentOrders.length === 0 ? (
              <p className="text-sm text-ink-muted">No paid orders yet.</p>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {stats.data.recentOrders.map((order) => (
                  <li key={order.id} className="flex justify-between gap-4 py-2">
                    <span>
                      {order.buyerName} · {order.ticketCount}{' '}
                      {order.ticketCount === 1 ? 'ticket' : 'tickets'}
                    </span>
                    <span className="text-ink-muted">
                      {formatPrice(order.totalInPaise)} · {ago(order.paidAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}
