import type { SeatMapData } from './events';

const SECTION_GAP = 2;

export interface PlacedSeat {
  section: string;
  row: string;
  number: number;
  x: number;
  y: number;
  tierId: string;
  isAccessible: boolean;
}

export function layoutSeatMap(map: SeatMapData): PlacedSeat[] {
  const seats: PlacedSeat[] = [];
  let sectionOffset = 0;

  for (const section of map.sections) {
    const sectionWidth = Math.max(...section.rows.map((row) => row.seatCount));

    section.rows.forEach((row, y) => {
      const startX = sectionOffset + Math.floor((sectionWidth - row.seatCount) / 2);
      const accessible = new Set(row.accessibleSeats);
      for (let number = 1; number <= row.seatCount; number += 1) {
        seats.push({
          section: section.name,
          row: row.label.toUpperCase(),
          number,
          x: startX + number - 1,
          y,
          tierId: row.tierId,
          isAccessible: accessible.has(number),
        });
      }
    });

    sectionOffset += sectionWidth + SECTION_GAP;
  }

  return seats;
}

export function describeSeatMap(seats: readonly PlacedSeat[]): SeatMapData | null {
  if (seats.length === 0) return null;

  const sections = new Map<string, { minX: number; rows: Map<number, PlacedSeat[]> }>();
  for (const seat of seats) {
    const section = sections.get(seat.section) ?? {
      minX: seat.x,
      rows: new Map<number, PlacedSeat[]>(),
    };
    section.minX = Math.min(section.minX, seat.x);
    section.rows.set(seat.y, [...(section.rows.get(seat.y) ?? []), seat]);
    sections.set(seat.section, section);
  }

  return {
    sections: [...sections.entries()]
      .sort(([, a], [, b]) => a.minX - b.minX)
      .map(([name, section]) => ({
        name,
        rows: [...section.rows.entries()]
          .sort(([a], [b]) => a - b)
          .map(([, rowSeats]) => {
            const [first] = rowSeats;
            return {
              label: first?.row ?? '',
              seatCount: rowSeats.length,
              tierId: first?.tierId ?? '',
              accessibleSeats: rowSeats
                .filter((seat) => seat.isAccessible)
                .map((seat) => seat.number)
                .sort((a, b) => a - b),
            };
          }),
      })),
  };
}
