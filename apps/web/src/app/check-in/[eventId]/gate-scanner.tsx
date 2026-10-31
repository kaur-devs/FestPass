'use client';

import {
  type CheckInRecord,
  formatClockTime,
  type ManifestTicket,
  ScanOutcome,
} from '@festpass/shared';
import { ArrowLeft, CloudOff, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { QrScanner } from '@/components/qr-scanner';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { type GateResult, GateSession, NOT_ON_LIST, type ScanInput } from '@/lib/checkin';
import { errorMessage } from '@/lib/forms';

const ADMITTED_DISPLAY_MS = 2000;
const REFUSED_DISPLAY_MS = 4000;
const SYNC_INTERVAL_MS = 30_000;
const MAX_MATCHES = 6;

function useGateSession(eventId: string) {
  const [session] = useState(() => new GateSession(eventId));
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);

  useEffect(() => {
    void session.start();
    const online = () => {
      session.setOnline(true);
    };
    const offline = () => {
      session.setOnline(false);
    };
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    const timer = setInterval(() => void session.sync(), SYNC_INTERVAL_MS);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
      clearInterval(timer);
    };
  }, [session]);

  return { session, state };
}

function whenAndWhere(checkIn: CheckInRecord, timeZone: string): string {
  const details = [
    formatClockTime(checkIn.at, timeZone),
    checkIn.gate,
    checkIn.scannedBy && `by ${checkIn.scannedBy}`,
  ].filter(Boolean);
  return `at ${details.join(', ')}`;
}

function describe(result: GateResult, timeZone: string) {
  const { checkIn } = result;
  switch (result.outcome) {
    case ScanOutcome.Admitted:
      return {
        tone: 'success' as const,
        title: 'Checked in',
        detail: result.offline
          ? 'Saved on this phone. It will sync when you are back online.'
          : null,
      };
    case ScanOutcome.AlreadyCheckedIn:
      return {
        tone: 'danger' as const,
        title: 'Already scanned',
        detail: checkIn ? `Scanned ${whenAndWhere(checkIn, timeZone)}.` : null,
      };
    case ScanOutcome.TicketCancelled:
      return {
        tone: 'danger' as const,
        title: 'Ticket cancelled',
        detail: 'This ticket was refunded or cancelled.',
      };
    case ScanOutcome.WrongEvent:
      return {
        tone: 'danger' as const,
        title: 'Wrong event',
        detail: 'This ticket is for a different event.',
      };
    case ScanOutcome.InvalidCode:
      return {
        tone: 'danger' as const,
        title: 'Not a valid ticket',
        detail: 'This QR code is not a FestPass ticket for this event.',
      };
    case NOT_ON_LIST:
      return {
        tone: 'warning' as const,
        title: 'Not on the saved list',
        detail:
          'This phone is offline and the ticket is not in the saved guest list. Check again once online.',
      };
  }
}

const toneClasses = {
  success: 'bg-success',
  danger: 'bg-danger',
  warning: 'bg-warning',
};

function ResultScreen({
  result,
  timeZone,
  onDismiss,
}: {
  result: GateResult;
  timeZone: string;
  onDismiss: () => void;
}) {
  const { tone, title, detail } = describe(result, timeZone);

  useEffect(() => {
    if ('vibrate' in navigator) navigator.vibrate(tone === 'success' ? 80 : [200, 100, 200]);
    const timer = setTimeout(
      onDismiss,
      tone === 'success' ? ADMITTED_DISPLAY_MS : REFUSED_DISPLAY_MS,
    );
    return () => {
      clearTimeout(timer);
    };
  }, [tone, onDismiss]);

  return (
    <button
      type="button"
      onClick={onDismiss}
      aria-live="assertive"
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 p-6 text-center text-paper ${toneClasses[tone]}`}
    >
      <span className="font-display text-display-lg font-extrabold uppercase">{title}</span>
      {result.ticket && (
        <span className="flex flex-col gap-1">
          <span className="text-[2rem] leading-tight font-semibold">
            {result.ticket.holderName}
          </span>
          <span className="text-xl">
            {result.ticket.tierName}
            {result.ticket.seatLabel && ` · ${result.ticket.seatLabel}`}
          </span>
        </span>
      )}
      {detail && <span className="max-w-md text-xl">{detail}</span>}
      <span className="mt-6 text-sm opacity-80">Tap to scan the next ticket</span>
    </button>
  );
}

function GuestSearch({
  tickets,
  disabled,
  onCheckIn,
}: {
  tickets: ManifestTicket[];
  disabled: boolean;
  onCheckIn: (ticket: ManifestTicket) => void;
}) {
  const [query, setQuery] = useState('');
  const matches = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (term.length < 2) return [];
    return tickets
      .filter(
        (ticket) =>
          ticket.holderName.toLowerCase().includes(term) ||
          ticket.reference.toLowerCase().startsWith(term),
      )
      .slice(0, MAX_MATCHES);
  }, [query, tickets]);

  return (
    <section className="flex flex-col gap-3">
      <TextField
        label="Search the guest list"
        hint="Use when a QR code will not scan. Type a name or the ticket reference."
        value={query}
        autoComplete="off"
        onChange={(event) => {
          setQuery(event.target.value);
        }}
      />
      {query.trim().length >= 2 && matches.length === 0 && (
        <p className="text-sm text-ink-muted">Nobody on the guest list matches “{query.trim()}”.</p>
      )}
      {matches.length > 0 && (
        <ul className="divide-y divide-line rounded-card border border-line bg-surface">
          {matches.map((ticket) => (
            <li key={ticket.id} className="flex items-center justify-between gap-3 p-3">
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-medium">{ticket.holderName}</span>
                <span className="truncate text-sm text-ink-muted">
                  <span className="font-mono">{ticket.reference}</span> · {ticket.tierName}
                  {ticket.seatLabel && ` · ${ticket.seatLabel}`}
                </span>
              </span>
              {ticket.checkedInAt ? (
                <span className="shrink-0 text-sm font-medium text-danger">Checked in</span>
              ) : (
                <Button
                  variant="secondary"
                  className="shrink-0"
                  disabled={disabled}
                  onClick={() => {
                    onCheckIn(ticket);
                    setQuery('');
                  }}
                >
                  Check in
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function GateScanner({ eventId }: { eventId: string }) {
  const { session, state } = useGateSession(eventId);
  const [result, setResult] = useState<GateResult | null>(null);
  const [recent, setRecent] = useState<GateResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { manifest } = state;
  const timeZone = manifest?.event.timezone ?? 'Asia/Kolkata';
  const total = manifest?.tickets.length ?? 0;
  const checkedIn = manifest?.tickets.filter((ticket) => ticket.checkedInAt).length ?? 0;

  const submit = (input: ScanInput) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    session
      .scan(input)
      .then((scanned) => {
        setResult(scanned);
        setRecent((previous) => [scanned, ...previous].slice(0, 5));
      })
      .catch((cause: unknown) => {
        setError(errorMessage(cause));
      })
      .finally(() => {
        setBusy(false);
      });
  };

  const dismiss = useCallback(() => {
    setResult(null);
  }, []);

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-line bg-paper">
        <div className="mx-auto flex h-14 max-w-xl items-center gap-3 px-4">
          <Link href="/check-in" aria-label="All events" className="-ml-2 p-2">
            <ArrowLeft aria-hidden className="size-5" strokeWidth={1.5} />
          </Link>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-semibold">{manifest?.event.title ?? 'Loading…'}</span>
            {manifest?.event.gate && (
              <span className="text-xs text-ink-muted">{manifest.event.gate}</span>
            )}
          </div>
          <span
            className={`flex items-center gap-2 text-sm font-medium ${
              state.online ? 'text-success' : 'text-warning'
            }`}
          >
            <span
              aria-hidden
              className={`size-2 rounded-full ${state.online ? 'bg-success' : 'bg-warning'}`}
            />
            {state.online ? 'Online' : 'Offline'}
          </span>
        </div>
      </header>

      <main className="mx-auto flex max-w-xl flex-col gap-5 px-4 py-5">
        {state.pending > 0 && (
          <div
            role="status"
            className="flex items-center justify-between gap-3 rounded-card border border-warning px-4 py-3 text-sm"
          >
            <span className="flex items-center gap-2">
              <CloudOff aria-hidden className="size-4 text-warning" strokeWidth={1.5} />
              {state.pending} {state.pending === 1 ? 'scan is' : 'scans are'} waiting to sync
            </span>
            <Button
              variant="ghost"
              square
              aria-label="Sync now"
              pending={state.syncing}
              onClick={() => void session.sync()}
            >
              {!state.syncing && <RefreshCw aria-hidden className="size-4" strokeWidth={1.5} />}
            </Button>
          </div>
        )}

        {state.conflicts.length > 0 && (
          <Alert tone="danger">
            <p className="font-medium">
              {state.conflicts.length === 1
                ? 'One offline entry was a duplicate.'
                : `${state.conflicts.length} offline entries were duplicates.`}
            </p>
            <ul className="mt-1 flex flex-col gap-1">
              {state.conflicts.map((conflict, index) => (
                <li key={`${conflict.ticket?.id ?? 'unknown'}-${String(index)}`}>
                  {conflict.ticket?.holderName ?? 'Unknown ticket'}
                  {conflict.checkIn &&
                    ` was already checked in ${whenAndWhere(conflict.checkIn, timeZone)}`}
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="mt-2 font-medium underline"
              onClick={() => {
                session.dismissConflicts();
              }}
            >
              Dismiss
            </button>
          </Alert>
        )}

        {state.error && <Alert tone="danger">{state.error}</Alert>}
        {error && <Alert tone="danger">{error}</Alert>}

        <div className="flex items-end justify-between">
          <span className="text-sm text-ink-muted uppercase">Checked in</span>
          <span className="font-mono text-lg">
            <span className="font-display text-display-md font-extrabold">{checkedIn}</span> /{' '}
            {total}
          </span>
        </div>

        <QrScanner
          paused={result !== null || busy}
          onCode={(code) => {
            submit({ code });
          }}
        />

        {manifest ? (
          <GuestSearch
            tickets={manifest.tickets}
            disabled={busy}
            onCheckIn={(ticket) => {
              submit({ ticketId: ticket.id });
            }}
          />
        ) : (
          !state.online && (
            <p className="text-sm text-ink-muted">
              The guest list has not been saved on this phone yet. Connect once to download it.
            </p>
          )
        )}

        {recent.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold">Recent scans</h2>
            <ul className="divide-y divide-line text-sm">
              {recent.map((scan) => {
                const { tone, title } = describe(scan, timeZone);
                return (
                  <li key={scan.id} className="flex justify-between gap-3 py-2">
                    <span className="truncate">{scan.ticket?.holderName ?? 'Unknown ticket'}</span>
                    <span
                      className={`shrink-0 font-medium ${
                        tone === 'success'
                          ? 'text-success'
                          : tone === 'danger'
                            ? 'text-danger'
                            : 'text-warning'
                      }`}
                    >
                      {title} · {formatClockTime(scan.at, timeZone)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </main>

      {result && <ResultScreen result={result} timeZone={timeZone} onDismiss={dismiss} />}
    </div>
  );
}
