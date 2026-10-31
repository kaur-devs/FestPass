import {
  type CheckInEvent,
  type CheckInManifest,
  type CheckInRecord,
  type ManifestTicket,
  MAX_SCANS_PER_SYNC,
  ScanOutcome,
  type ScanResult,
  ticketIdFromCode,
} from '@festpass/shared';
import { createStore, del, get, keys, set } from 'idb-keyval';
import { ApiError, apiJson } from './api';

export const checkInKeys = {
  events: ['check-in', 'events'] as const,
};

export const NOT_ON_LIST = 'NOT_ON_LIST';

export type GateOutcome = ScanOutcome | typeof NOT_ON_LIST;

export interface GateResult {
  id: string;
  outcome: GateOutcome;
  ticket: ManifestTicket | null;
  checkIn: CheckInRecord | null;
  offline: boolean;
  at: string;
}

export interface Conflict {
  ticket: ManifestTicket | null;
  checkIn: CheckInRecord | null;
}

export type ScanInput = { code: string } | { ticketId: string };

interface PendingScan extends Partial<Record<'code' | 'ticketId', string>> {
  scannedAt: string;
}

export interface GateState {
  manifest: CheckInManifest | null;
  pending: number;
  online: boolean;
  syncing: boolean;
  conflicts: Conflict[];
  error: string | null;
}

const SCAN_TIMEOUT_MS = 4000;

const store = typeof indexedDB === 'undefined' ? undefined : createStore('festpass-gate', 'data');
const manifestKey = (eventId: string) => `manifest:${eventId}`;
const queueKey = (eventId: string) => `queue:${eventId}`;

function isNetworkFailure(error: unknown): boolean {
  return !(error instanceof ApiError) || error.status >= 500;
}

function sendScans(eventId: string, scans: PendingScan[], signal?: AbortSignal) {
  return apiJson<{ results: ScanResult[] }>(`/check-in/events/${eventId}/scans`, {
    method: 'POST',
    body: { scans },
    signal,
  });
}

export async function storedEvents(): Promise<CheckInEvent[]> {
  if (!store) return [];
  const all = await keys<string>(store);
  const manifests = await Promise.all(
    all.filter((key) => key.startsWith('manifest:')).map((key) => get<CheckInManifest>(key, store)),
  );
  return manifests.flatMap((manifest) => (manifest ? [manifest.event] : []));
}

export class GateSession {
  private state: GateState;
  private queue: PendingScan[] = [];
  private readonly listeners = new Set<() => void>();
  private syncInFlight: Promise<void> | undefined;

  constructor(private readonly eventId: string) {
    this.state = {
      manifest: null,
      pending: 0,
      online: typeof navigator === 'undefined' ? true : navigator.onLine,
      syncing: false,
      conflicts: [],
      error: null,
    };
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = () => this.state;

  async start(): Promise<void> {
    if (store) {
      const [manifest, queue] = await Promise.all([
        get<CheckInManifest>(manifestKey(this.eventId), store),
        get<PendingScan[]>(queueKey(this.eventId), store),
      ]);
      this.queue = queue ?? [];
      this.update({ manifest: manifest ?? null, pending: this.queue.length });
    }
    await this.sync();
  }

  setOnline(online: boolean) {
    this.update({ online });
    if (online) void this.sync();
  }

  dismissConflicts() {
    this.update({ conflicts: [] });
  }

  async scan(input: ScanInput): Promise<GateResult> {
    const scannedAt = new Date().toISOString();
    if (this.state.online) {
      try {
        const { results } = await sendScans(
          this.eventId,
          [{ ...input, scannedAt }],
          AbortSignal.timeout(SCAN_TIMEOUT_MS),
        );
        const [result] = results;
        if (!result) throw new Error('The server returned no scan result.');
        if (result.ticket) this.markCheckedIn(result.ticket.id, result.checkIn?.at ?? scannedAt);
        return { ...result, id: crypto.randomUUID(), offline: false, at: scannedAt };
      } catch (error) {
        if (!isNetworkFailure(error)) throw error;
        this.update({ online: false });
      }
    }
    return this.scanOffline(input, scannedAt);
  }

  sync(): Promise<void> {
    this.syncInFlight ??= this.runSync().finally(() => {
      this.syncInFlight = undefined;
    });
    return this.syncInFlight;
  }

  private async runSync(): Promise<void> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    this.update({ syncing: true });
    try {
      while (this.queue.length > 0) {
        const batch = this.queue.slice(0, MAX_SCANS_PER_SYNC);
        const { results } = await sendScans(this.eventId, batch);
        const conflicts = results
          .filter((result) => result.outcome !== ScanOutcome.Admitted)
          .map(({ ticket, checkIn }) => ({ ticket, checkIn }));
        this.queue = this.queue.slice(batch.length);
        await this.persistQueue();
        this.update({ conflicts: [...this.state.conflicts, ...conflicts] });
      }
      await this.refreshManifest();
      this.update({ online: true, error: null });
    } catch (error) {
      if (isNetworkFailure(error)) {
        this.update({ online: false });
      } else {
        this.update({ error: error instanceof Error ? error.message : 'Could not sync scans.' });
      }
    } finally {
      this.update({ syncing: false });
    }
  }

  private async refreshManifest() {
    const { manifest } = await apiJson<{ manifest: CheckInManifest }>(
      `/check-in/events/${this.eventId}/manifest`,
    );
    const local = new Map(
      this.state.manifest?.tickets.map((ticket) => [ticket.id, ticket.checkedInAt]),
    );
    const queued = new Set(
      this.queue.map((scan) => scan.ticketId ?? ticketIdFromCode(scan.code ?? '')),
    );
    const merged = {
      ...manifest,
      tickets: manifest.tickets.map((ticket) =>
        !ticket.checkedInAt && queued.has(ticket.id)
          ? { ...ticket, checkedInAt: local.get(ticket.id) ?? null }
          : ticket,
      ),
    };
    if (store) await set(manifestKey(this.eventId), merged, store);
    this.update({ manifest: merged });
  }

  private async scanOffline(input: ScanInput, scannedAt: string): Promise<GateResult> {
    const base = { id: crypto.randomUUID(), offline: true, at: scannedAt, checkIn: null };
    const ticketId = 'ticketId' in input ? input.ticketId : ticketIdFromCode(input.code);
    if (!ticketId) return { ...base, outcome: ScanOutcome.InvalidCode, ticket: null };

    const ticket = this.state.manifest?.tickets.find((entry) => entry.id === ticketId);
    if (!ticket) return { ...base, outcome: NOT_ON_LIST, ticket: null };
    if (ticket.checkedInAt) {
      return {
        ...base,
        outcome: ScanOutcome.AlreadyCheckedIn,
        ticket,
        checkIn: { at: ticket.checkedInAt, gate: null, scannedBy: '' },
      };
    }

    this.queue = [...this.queue, { ...input, scannedAt }];
    await this.persistQueue();
    this.markCheckedIn(ticketId, scannedAt);
    return {
      ...base,
      outcome: ScanOutcome.Admitted,
      ticket: { ...ticket, checkedInAt: scannedAt },
    };
  }

  private markCheckedIn(ticketId: string, at: string) {
    const { manifest } = this.state;
    if (!manifest) return;
    const next = {
      ...manifest,
      tickets: manifest.tickets.map((ticket) =>
        ticket.id === ticketId && !ticket.checkedInAt ? { ...ticket, checkedInAt: at } : ticket,
      ),
    };
    this.update({ manifest: next });
    if (store) void set(manifestKey(this.eventId), next, store);
  }

  private async persistQueue() {
    this.update({ pending: this.queue.length });
    if (!store) return;
    if (this.queue.length === 0) await del(queueKey(this.eventId), store);
    else await set(queueKey(this.eventId), this.queue, store);
  }

  private update(patch: Partial<GateState>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
}
