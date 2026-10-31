import type { SeatMapData } from './events';
import { describe, expect, it } from 'vitest';
import { describeSeatMap, layoutSeatMap } from './seat-map';

const GOLD = '0192a000-0000-7000-8000-000000000001';
const SILVER = '0192a000-0000-7000-8000-000000000002';

const auditorium: SeatMapData = {
  sections: [
    {
      name: 'Left',
      rows: [
        { label: 'A', seatCount: 4, tierId: GOLD, accessibleSeats: [] },
        { label: 'B', seatCount: 6, tierId: SILVER, accessibleSeats: [] },
      ],
    },
    {
      name: 'Centre',
      rows: [{ label: 'A', seatCount: 8, tierId: GOLD, accessibleSeats: [1, 2] }],
    },
  ],
};

describe('layoutSeatMap', () => {
  const seats = layoutSeatMap(auditorium);

  it('creates one seat per position, numbered from 1', () => {
    expect(seats).toHaveLength(4 + 6 + 8);
    const leftA = seats.filter((s) => s.section === 'Left' && s.row === 'A');
    expect(leftA.map((s) => s.number)).toEqual([1, 2, 3, 4]);
  });

  it('centres shorter rows within their section', () => {
    const leftA = seats.filter((s) => s.section === 'Left' && s.row === 'A');
    const leftB = seats.filter((s) => s.section === 'Left' && s.row === 'B');
    expect(leftB.map((s) => s.x)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(leftA.map((s) => s.x)).toEqual([1, 2, 3, 4]);
  });

  it('places sections side by side with an aisle between them', () => {
    const centre = seats.filter((s) => s.section === 'Centre');
    expect(Math.min(...centre.map((s) => s.x))).toBe(6 + 2);
    expect(new Set(centre.map((s) => s.y))).toEqual(new Set([0]));
  });

  it('never puts two seats in the same place', () => {
    const positions = new Set(seats.map((s) => `${s.x},${s.y}`));
    expect(positions.size).toBe(seats.length);
  });

  it('marks accessible seats', () => {
    const accessible = seats.filter((s) => s.isAccessible);
    expect(accessible.map((s) => `${s.section}-${s.row}${s.number}`)).toEqual([
      'Centre-A1',
      'Centre-A2',
    ]);
  });
});

describe('describeSeatMap', () => {
  it('rebuilds the layout definition from placed seats', () => {
    expect(describeSeatMap(layoutSeatMap(auditorium))).toEqual(auditorium);
  });

  it('returns null when there are no seats', () => {
    expect(describeSeatMap([])).toBeNull();
  });
});
