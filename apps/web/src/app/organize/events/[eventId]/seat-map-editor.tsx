'use client';

import {
  layoutSeatMap,
  type ManagedEvent,
  MAX_SEATS_PER_EVENT,
  type SeatMapData,
  type SeatMapInput,
  seatMapSchema,
  type SeatView,
} from '@festpass/shared';
import { Plus, Trash2 } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { SeatMap } from '@/components/seat-map/seat-map';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import { errorMessage } from '@/lib/forms';
import { manageApi, useEventMutation } from '@/lib/manage';

interface RowDraft {
  key: number;
  label: string;
  seatCount: string;
  tierId: string;
  accessibleSeats: string;
}

interface SectionDraft {
  key: number;
  name: string;
  rows: RowDraft[];
}

let nextKey = 0;
const newKey = () => (nextKey += 1);

function nextRowLabel(rows: readonly RowDraft[]): string {
  const last = rows.at(-1)?.label.toUpperCase();
  if (!last || !/^[A-Y]$/.test(last)) return String.fromCharCode(65 + rows.length);
  return String.fromCharCode(last.charCodeAt(0) + 1);
}

function toDraft(map: SeatMapData | null, defaultTierId: string): SectionDraft[] {
  if (!map) {
    return [
      {
        key: newKey(),
        name: 'Main',
        rows: ['A', 'B', 'C', 'D', 'E'].map((label) => ({
          key: newKey(),
          label,
          seatCount: '12',
          tierId: defaultTierId,
          accessibleSeats: '',
        })),
      },
    ];
  }
  return map.sections.map((section) => ({
    key: newKey(),
    name: section.name,
    rows: section.rows.map((row) => ({
      key: newKey(),
      label: row.label,
      seatCount: String(row.seatCount),
      tierId: row.tierId,
      accessibleSeats: row.accessibleSeats.join(', '),
    })),
  }));
}

function toInput(
  sections: readonly SectionDraft[],
  resolveTier: (tierId: string) => string,
): SeatMapInput {
  return {
    sections: sections.map((section) => ({
      name: section.name,
      rows: section.rows.map((row) => ({
        label: row.label,
        seatCount: Number(row.seatCount),
        tierId: resolveTier(row.tierId),
        accessibleSeats: row.accessibleSeats
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean)
          .map(Number),
      })),
    })),
  };
}

const inputClass =
  'h-11 w-full rounded-control border border-line bg-surface px-3 text-base text-ink';

export function SeatMapEditor({ event }: { event: ManagedEvent }) {
  const firstTierId = event.tiers[0]?.id ?? '';
  const [sections, setSections] = useState(() => toDraft(event.seatMap, firstTierId));
  const save = useEventMutation(event.id, (input: SeatMapInput) =>
    manageApi.replaceSeatMap(event.id, input),
  );
  const locked = event.ticketsSold > 0 || event.status === 'CANCELLED';

  const resolveTier = useCallback(
    (tierId: string) => (event.tiers.some((tier) => tier.id === tierId) ? tierId : firstTierId),
    [event.tiers, firstTierId],
  );
  const input = useMemo(() => toInput(sections, resolveTier), [sections, resolveTier]);
  const parsed = useMemo(() => seatMapSchema.safeParse(input), [input]);
  const clientErrors = new Map<string, string>(
    parsed.success ? [] : parsed.error.issues.map((issue) => [issue.path.join('.'), issue.message]),
  );
  const serverErrors =
    save.error instanceof ApiError
      ? new Map(
          Object.entries(save.error.fieldErrors).map(([key, value]) => [key, value?.[0] ?? '']),
        )
      : new Map<string, string>();
  const errorAt = (path: string) => serverErrors.get(path) ?? clientErrors.get(path);

  const preview: SeatView[] = parsed.success
    ? layoutSeatMap(parsed.data).map((seat) => ({
        ...seat,
        id: `${seat.section}-${seat.row}-${seat.number}`,
        status: 'AVAILABLE',
      }))
    : [];

  const updateSection = (key: number, change: (section: SectionDraft) => SectionDraft) => {
    setSections((current) =>
      current.map((section) => (section.key === key ? change(section) : section)),
    );
  };
  const updateRow = (sectionKey: number, rowKey: number, change: Partial<RowDraft>) => {
    updateSection(sectionKey, (section) => ({
      ...section,
      rows: section.rows.map((row) => (row.key === rowKey ? { ...row, ...change } : row)),
    }));
  };

  if (event.tiers.length === 0) {
    return (
      <p className="text-sm text-ink-muted">Add a ticket tier first, then assign rows to it.</p>
    );
  }

  const tierOptions = event.tiers.map((tier) => ({ value: tier.id, label: tier.name }));
  const totalSeats = preview.length;

  return (
    <div className="flex flex-col gap-6">
      {locked && (
        <Alert tone="danger">
          {event.status === 'CANCELLED'
            ? 'This event is cancelled, so the seat map is read-only.'
            : 'Seats have been booked, so the seat map can no longer change.'}
        </Alert>
      )}

      <fieldset disabled={locked} className="flex flex-col gap-6">
        <legend className="sr-only">Seat map sections and rows</legend>
        {sections.map((section, s) => (
          <div
            key={section.key}
            className="flex flex-col gap-3 rounded-card border border-line p-4"
          >
            <div className="flex items-end gap-3">
              <label className="flex flex-1 flex-col gap-1 text-sm font-medium">
                Section name
                <input
                  className={inputClass}
                  value={section.name}
                  onChange={(e) => {
                    updateSection(section.key, (current) => ({ ...current, name: e.target.value }));
                  }}
                />
              </label>
              {sections.length > 1 && (
                <Button
                  variant="ghost"
                  aria-label={`Remove section ${section.name}`}
                  onClick={() => {
                    setSections((current) => current.filter((item) => item.key !== section.key));
                  }}
                >
                  <Trash2 aria-hidden className="size-4" strokeWidth={1.5} />
                </Button>
              )}
            </div>
            {errorAt(`sections.${s}.name`) && (
              <p className="text-sm text-danger">{errorAt(`sections.${s}.name`)}</p>
            )}

            <div className="overflow-x-auto">
              <table className="w-full min-w-xl text-sm">
                <thead>
                  <tr className="text-left text-ink-muted">
                    <th className="pb-2 font-medium">Row</th>
                    <th className="pb-2 font-medium">Seats</th>
                    <th className="pb-2 font-medium">Tier</th>
                    <th className="pb-2 font-medium">Accessible seats</th>
                    <th className="pb-2" />
                  </tr>
                </thead>
                <tbody>
                  {section.rows.map((row, r) => {
                    const path = `sections.${s}.rows.${r}`;
                    const rowErrors = ['label', 'seatCount', 'tierId', 'accessibleSeats']
                      .map((field) => errorAt(`${path}.${field}`))
                      .filter(Boolean);
                    return (
                      <tr key={row.key} className="align-top">
                        <td className="pr-2 pb-2">
                          <input
                            aria-label={`Row ${r + 1} label`}
                            className={`${inputClass} w-20 font-mono uppercase`}
                            value={row.label}
                            onChange={(e) => {
                              updateRow(section.key, row.key, { label: e.target.value });
                            }}
                          />
                        </td>
                        <td className="pr-2 pb-2">
                          <input
                            aria-label={`Row ${row.label} seat count`}
                            inputMode="numeric"
                            className={`${inputClass} w-24`}
                            value={row.seatCount}
                            onChange={(e) => {
                              updateRow(section.key, row.key, { seatCount: e.target.value });
                            }}
                          />
                        </td>
                        <td className="pr-2 pb-2">
                          <select
                            aria-label={`Row ${row.label} tier`}
                            className={inputClass}
                            value={resolveTier(row.tierId)}
                            onChange={(e) => {
                              updateRow(section.key, row.key, { tierId: e.target.value });
                            }}
                          >
                            {tierOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="pr-2 pb-2">
                          <input
                            aria-label={`Row ${row.label} accessible seats`}
                            placeholder="e.g. 1, 2"
                            className={inputClass}
                            value={row.accessibleSeats}
                            onChange={(e) => {
                              updateRow(section.key, row.key, { accessibleSeats: e.target.value });
                            }}
                          />
                          {rowErrors.length > 0 && (
                            <p className="pt-1 text-danger">{rowErrors[0]}</p>
                          )}
                        </td>
                        <td className="pb-2">
                          {section.rows.length > 1 && (
                            <Button
                              variant="ghost"
                              aria-label={`Remove row ${row.label}`}
                              onClick={() => {
                                updateSection(section.key, (current) => ({
                                  ...current,
                                  rows: current.rows.filter((item) => item.key !== row.key),
                                }));
                              }}
                            >
                              <Trash2 aria-hidden className="size-4" strokeWidth={1.5} />
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <Button
              variant="ghost"
              className="self-start"
              onClick={() => {
                updateSection(section.key, (current) => {
                  const last = current.rows.at(-1);
                  return {
                    ...current,
                    rows: [
                      ...current.rows,
                      {
                        key: newKey(),
                        label: nextRowLabel(current.rows),
                        seatCount: last?.seatCount ?? '12',
                        tierId: last?.tierId ?? firstTierId,
                        accessibleSeats: '',
                      },
                    ],
                  };
                });
              }}
            >
              <Plus aria-hidden className="size-4" strokeWidth={1.5} />
              Add row
            </Button>
          </div>
        ))}

        <Button
          variant="secondary"
          className="self-start"
          onClick={() => {
            setSections((current) => [
              ...current,
              {
                key: newKey(),
                name: `Section ${current.length + 1}`,
                rows: [
                  {
                    key: newKey(),
                    label: 'A',
                    seatCount: '10',
                    tierId: firstTierId,
                    accessibleSeats: '',
                  },
                ],
              },
            ]);
          }}
        >
          <Plus aria-hidden className="size-4" strokeWidth={1.5} />
          Add section
        </Button>
      </fieldset>

      {errorAt('sections') && <Alert tone="danger">{errorAt('sections')}</Alert>}
      {save.isError &&
        !(save.error instanceof ApiError && Object.keys(save.error.fieldErrors).length > 0) && (
          <Alert tone="danger">{errorMessage(save.error)}</Alert>
        )}
      {save.isSuccess && (
        <Alert tone="success">Seat map saved. Tier capacities now match the seats.</Alert>
      )}

      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h3 className="font-semibold">Preview</h3>
          <span className="font-mono text-sm text-ink-muted">
            {totalSeats.toLocaleString('en-IN')} / {MAX_SEATS_PER_EVENT.toLocaleString('en-IN')}{' '}
            seats
          </span>
        </div>
        {preview.length > 0 ? (
          <SeatMap seats={preview} tiers={event.tiers} />
        ) : (
          <p className="text-sm text-ink-muted">Fix the highlighted rows to see the preview.</p>
        )}
      </div>

      {!locked && (
        <Button
          className="self-start"
          disabled={!parsed.success}
          pending={save.isPending}
          onClick={() => {
            if (parsed.success) save.mutate(input);
          }}
        >
          Save seat map
        </Button>
      )}
    </div>
  );
}
