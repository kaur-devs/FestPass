'use client';

import { formatPrice, type SeatView, type TierView } from '@festpass/shared';
import { Accessibility, Check } from 'lucide-react';
import { type KeyboardEvent, useId, useRef, useState } from 'react';

const CELL = 32;
const SEAT = 26;
const STAGE_HEIGHT = 40;
const STAGE_GAP = 24;
const SECTION_LABEL_HEIGHT = 24;

type SeatState = 'available' | 'selected' | 'held' | 'sold';

interface SeatMapProps {
  seats: readonly SeatView[];
  tiers: readonly TierView[];
  selectedIds?: ReadonlySet<string>;
  onSeatToggle?: (seat: SeatView) => void;
}

interface SectionBounds {
  name: string;
  minX: number;
  maxX: number;
  rows: Map<number, string>;
}

function sectionBounds(seats: readonly SeatView[]): SectionBounds[] {
  const sections = new Map<string, SectionBounds>();
  for (const seat of seats) {
    const section = sections.get(seat.section) ?? {
      name: seat.section,
      minX: seat.x,
      maxX: seat.x,
      rows: new Map<number, string>(),
    };
    section.minX = Math.min(section.minX, seat.x);
    section.maxX = Math.max(section.maxX, seat.x);
    section.rows.set(seat.y, seat.row);
    sections.set(seat.section, section);
  }
  return [...sections.values()];
}

function seatState(seat: SeatView, selectedIds: ReadonlySet<string> | undefined): SeatState {
  if (selectedIds?.has(seat.id)) return 'selected';
  if (seat.status === 'SOLD') return 'sold';
  if (seat.status === 'HELD') return 'held';
  return 'available';
}

const STATE_LABELS: Record<SeatState, string> = {
  available: 'available',
  selected: 'selected',
  held: 'being booked by someone else',
  sold: 'sold',
};

function seatLabel(seat: SeatView, tier: TierView | undefined, state: SeatState): string {
  const parts = [`${seat.section}, row ${seat.row}, seat ${seat.number}`];
  if (tier) parts.push(`${tier.name} ${formatPrice(tier.priceInPaise)}`);
  if (seat.isAccessible) parts.push('wheelchair accessible');
  parts.push(STATE_LABELS[state]);
  return parts.join(', ');
}

function neighbour(seats: readonly SeatView[], from: SeatView, key: string): SeatView | undefined {
  const byDistance = (a: SeatView, b: SeatView) => Math.abs(a.x - from.x) - Math.abs(b.x - from.x);
  switch (key) {
    case 'ArrowRight':
      return seats.filter((s) => s.y === from.y && s.x > from.x).sort((a, b) => a.x - b.x)[0];
    case 'ArrowLeft':
      return seats.filter((s) => s.y === from.y && s.x < from.x).sort((a, b) => b.x - a.x)[0];
    case 'ArrowDown': {
      const nextRow = Math.min(...seats.filter((s) => s.y > from.y).map((s) => s.y));
      return seats.filter((s) => s.y === nextRow).sort(byDistance)[0];
    }
    case 'ArrowUp': {
      const previousRow = Math.max(...seats.filter((s) => s.y < from.y).map((s) => s.y));
      return seats.filter((s) => s.y === previousRow).sort(byDistance)[0];
    }
    default:
      return undefined;
  }
}

function seatClasses(state: SeatState): string {
  switch (state) {
    case 'selected':
      return 'fill-accent stroke-ink';
    case 'sold':
      return 'fill-ink opacity-15';
    case 'available':
      return 'fill-surface stroke-ink-muted';
    case 'held':
      return '';
  }
}

export function SeatMap({ seats, tiers, selectedIds, onSeatToggle }: SeatMapProps) {
  const patternId = useId();
  const interactive = onSeatToggle !== undefined;
  const seatElements = useRef(new Map<string, SVGGElement>());
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [keyboardFocus, setKeyboardFocus] = useState(false);

  const tiersById = new Map(tiers.map((tier) => [tier.id, tier]));
  const sections = sectionBounds(seats);
  const columns = Math.max(...seats.map((seat) => seat.x)) + 1;
  const rows = Math.max(...seats.map((seat) => seat.y)) + 1;

  const gutter = CELL;
  const top = STAGE_HEIGHT + STAGE_GAP + SECTION_LABEL_HEIGHT;
  const width = gutter + columns * CELL;
  const height = top + rows * CELL;
  const available = seats.filter((seat) => seat.status === 'AVAILABLE').length;
  const tabStopId =
    focusedId ?? seats.find((seat) => seat.status === 'AVAILABLE')?.id ?? seats[0]?.id;

  const seatX = (x: number) => gutter + x * CELL + (CELL - SEAT) / 2;
  const seatY = (y: number) => top + y * CELL + (CELL - SEAT) / 2;

  const toggle = (seat: SeatView) => {
    const state = seatState(seat, selectedIds);
    if (state === 'available' || state === 'selected') onSeatToggle?.(seat);
  };

  const onKeyDown = (event: KeyboardEvent<SVGGElement>, seat: SeatView) => {
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      toggle(seat);
      return;
    }
    const next = neighbour(seats, seat, event.key);
    if (!next) return;
    event.preventDefault();
    setFocusedId(next.id);
    seatElements.current.get(next.id)?.focus();
  };

  return (
    <figure className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-card border border-line bg-surface p-4">
        <svg
          role={interactive ? 'group' : 'img'}
          aria-label={`Seat map: ${available} of ${seats.length} seats available`}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          className="mx-auto block"
        >
          <defs>
            <pattern
              id={patternId}
              width={6}
              height={6}
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <rect width={6} height={6} className="fill-surface" />
              <line x1={0} y1={0} x2={0} y2={6} strokeWidth={3} className="stroke-line" />
            </pattern>
          </defs>

          <rect
            x={gutter}
            y={0}
            width={columns * CELL}
            height={STAGE_HEIGHT}
            rx={4}
            className="fill-line"
          />
          <text
            x={gutter + (columns * CELL) / 2}
            y={STAGE_HEIGHT / 2}
            textAnchor="middle"
            dominantBaseline="central"
            className="fill-ink-muted font-mono text-xs tracking-widest"
          >
            STAGE
          </text>

          {sections.map((section) => (
            <g key={section.name} aria-hidden>
              <text
                x={gutter + ((section.minX + section.maxX + 1) / 2) * CELL}
                y={STAGE_HEIGHT + STAGE_GAP + SECTION_LABEL_HEIGHT / 2}
                textAnchor="middle"
                dominantBaseline="central"
                className="fill-ink text-xs font-semibold"
              >
                {section.name}
              </text>
              {[...section.rows.entries()].map(([y, label]) => (
                <text
                  key={y}
                  x={gutter + section.minX * CELL - CELL / 2}
                  y={top + y * CELL + CELL / 2}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className="fill-ink-muted font-mono text-xs"
                >
                  {label}
                </text>
              ))}
            </g>
          ))}

          {seats.map((seat) => {
            const state = seatState(seat, selectedIds);
            const label = seatLabel(seat, tiersById.get(seat.tierId), state);
            const selectable = interactive && (state === 'available' || state === 'selected');
            const x = seatX(seat.x);
            const y = seatY(seat.y);

            return (
              <g
                key={seat.id}
                ref={(element) => {
                  if (element) seatElements.current.set(seat.id, element);
                  else seatElements.current.delete(seat.id);
                }}
                {...(interactive && {
                  role: 'checkbox',
                  'aria-checked': state === 'selected',
                  'aria-disabled': !selectable,
                  'aria-label': label,
                  tabIndex: seat.id === tabStopId ? 0 : -1,
                  onClick: () => {
                    setFocusedId(seat.id);
                    toggle(seat);
                  },
                  onKeyDown: (event: KeyboardEvent<SVGGElement>) => {
                    onKeyDown(event, seat);
                  },
                  onFocus: () => {
                    setFocusedId(seat.id);
                    setKeyboardFocus(true);
                  },
                  onBlur: () => {
                    setKeyboardFocus(false);
                  },
                })}
                className={`outline-none ${selectable ? 'cursor-pointer' : ''}`}
              >
                {!interactive && <title>{label}</title>}
                <rect
                  x={x}
                  y={y}
                  width={SEAT}
                  height={SEAT}
                  rx={4}
                  strokeWidth={state === 'selected' ? 2 : state === 'available' ? 1.5 : 0}
                  fill={state === 'held' ? `url(#${patternId})` : undefined}
                  className={seatClasses(state)}
                />
                {state === 'selected' && (
                  <Check
                    x={x + 5}
                    y={y + 5}
                    width={SEAT - 10}
                    height={SEAT - 10}
                    strokeWidth={2.5}
                    className="text-on-accent"
                    aria-hidden
                  />
                )}
                {seat.isAccessible && state !== 'selected' && (
                  <Accessibility
                    x={x + 5}
                    y={y + 5}
                    width={SEAT - 10}
                    height={SEAT - 10}
                    strokeWidth={1.5}
                    className="text-ink-muted"
                    aria-hidden
                  />
                )}
                {keyboardFocus && focusedId === seat.id && (
                  <rect
                    x={x - 3}
                    y={y - 3}
                    width={SEAT + 6}
                    height={SEAT + 6}
                    rx={6}
                    fill="none"
                    strokeWidth={2}
                    className="stroke-ink"
                  />
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <figcaption>
        <SeatLegend interactive={interactive} patternId={patternId} />
      </figcaption>
    </figure>
  );
}

function SeatLegend({ interactive, patternId }: { interactive: boolean; patternId: string }) {
  return (
    <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-muted">
      <li className="flex items-center gap-2">
        <span aria-hidden className="size-4 rounded-control border border-ink-muted bg-surface" />
        Available
      </li>
      {interactive && (
        <li className="flex items-center gap-2">
          <span aria-hidden className="size-4 rounded-control border-2 border-ink bg-accent" />
          Your seats
        </li>
      )}
      <li className="flex items-center gap-2">
        <svg aria-hidden width={16} height={16}>
          <rect width={16} height={16} rx={4} fill={`url(#${patternId})`} />
        </svg>
        Being booked
      </li>
      <li className="flex items-center gap-2">
        <span aria-hidden className="size-4 rounded-control bg-ink opacity-15" />
        Sold
      </li>
      <li className="flex items-center gap-2">
        <Accessibility aria-hidden className="size-4" strokeWidth={1.5} />
        Wheelchair accessible
      </li>
    </ul>
  );
}
