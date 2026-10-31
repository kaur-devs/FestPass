import { z } from 'zod';
import { isValidTimeZone } from './time';

export const SEATING_TYPES = ['GENERAL_ADMISSION', 'RESERVED'] as const;
export type SeatingType = (typeof SEATING_TYPES)[number];
export type EventStatus = 'DRAFT' | 'PUBLISHED' | 'CANCELLED';

export const MAX_SEATS_PER_EVENT = 5000;
export const MAX_TIER_PRICE_IN_PAISE = 10_000_000;
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const instantSchema = z.iso.datetime({ offset: true, message: 'Enter a valid date and time.' });

export const eventDetailsSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(3, 'Use at least 3 characters.')
      .max(120, 'Use at most 120 characters.'),
    description: z.string().trim().max(5000, 'Use at most 5,000 characters.').default(''),
    venue: z.string().trim().min(1, 'Enter a venue.').max(120, 'Use at most 120 characters.'),
    timezone: z.string().refine(isValidTimeZone, 'Choose a valid time zone.'),
    startsAt: instantSchema,
    endsAt: instantSchema,
    salesStartAt: instantSchema,
    salesEndAt: instantSchema,
  })
  .superRefine((event, ctx) => {
    const time = (value: string) => new Date(value).getTime();
    if (time(event.endsAt) <= time(event.startsAt)) {
      ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'End after the event starts.' });
    }
    if (time(event.salesEndAt) <= time(event.salesStartAt)) {
      ctx.addIssue({
        code: 'custom',
        path: ['salesEndAt'],
        message: 'Close sales after they open.',
      });
    }
    if (time(event.salesEndAt) > time(event.endsAt)) {
      ctx.addIssue({
        code: 'custom',
        path: ['salesEndAt'],
        message: 'Close sales before the event ends.',
      });
    }
  });

export const createEventSchema = z.intersection(
  eventDetailsSchema,
  z.object({ seatingType: z.enum(SEATING_TYPES) }),
);

export const updateEventSchema = z.intersection(
  eventDetailsSchema,
  z.object({
    slug: z
      .string()
      .trim()
      .min(3, 'Use at least 3 characters.')
      .max(80, 'Use at most 80 characters.')
      .regex(SLUG_PATTERN, 'Use lowercase letters, numbers and single hyphens.')
      .optional(),
  }),
);

export const tierSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name.').max(60, 'Use at most 60 characters.'),
  description: z.string().trim().max(300, 'Use at most 300 characters.').default(''),
  priceInPaise: z
    .number()
    .int('Prices are in whole paise.')
    .min(0, 'Prices cannot be negative.')
    .max(MAX_TIER_PRICE_IN_PAISE, 'Use at most ₹1,00,000.'),
  capacity: z
    .number()
    .int()
    .min(1, 'Allow at least 1 ticket.')
    .max(100_000, 'Use at most 1,00,000 tickets.')
    .nullable()
    .default(null),
  maxPerOrder: z
    .number()
    .int()
    .min(1, 'Allow at least 1 per order.')
    .max(20, 'Use at most 20.')
    .default(6),
  sortOrder: z.number().int().min(0).default(0),
});

const seatRowSchema = z
  .object({
    label: z
      .string()
      .trim()
      .min(1, 'Enter a row label.')
      .max(4, 'Use at most 4 characters.')
      .regex(/^[A-Za-z0-9]+$/, 'Use letters and numbers only.'),
    seatCount: z.number().int().min(1, 'Add at least 1 seat.').max(60, 'Use at most 60 seats.'),
    tierId: z.uuid('Choose a tier.'),
    accessibleSeats: z.array(z.number().int().min(1)).max(60).default([]),
  })
  .superRefine((row, ctx) => {
    if (row.accessibleSeats.some((seat) => seat > row.seatCount)) {
      ctx.addIssue({
        code: 'custom',
        path: ['accessibleSeats'],
        message: 'Accessible seats must exist in the row.',
      });
    }
  });

export const seatMapSchema = z
  .object({
    sections: z
      .array(
        z.object({
          name: z
            .string()
            .trim()
            .min(1, 'Enter a section name.')
            .max(30, 'Use at most 30 characters.'),
          rows: z
            .array(seatRowSchema)
            .min(1, 'Add at least one row.')
            .max(40, 'Use at most 40 rows.'),
        }),
      )
      .min(1, 'Add at least one section.')
      .max(8, 'Use at most 8 sections.'),
  })
  .superRefine((map, ctx) => {
    const sectionNames = new Set<string>();
    map.sections.forEach((section, sectionIndex) => {
      const name = section.name.toLowerCase();
      if (sectionNames.has(name)) {
        ctx.addIssue({
          code: 'custom',
          path: ['sections', sectionIndex, 'name'],
          message: 'Section names must be different.',
        });
      }
      sectionNames.add(name);

      const rowLabels = new Set<string>();
      section.rows.forEach((row, rowIndex) => {
        const label = row.label.toUpperCase();
        if (rowLabels.has(label)) {
          ctx.addIssue({
            code: 'custom',
            path: ['sections', sectionIndex, 'rows', rowIndex, 'label'],
            message: 'Row labels must be different within a section.',
          });
        }
        rowLabels.add(label);
      });
    });

    const total = map.sections.flatMap((s) => s.rows).reduce((sum, row) => sum + row.seatCount, 0);
    if (total > MAX_SEATS_PER_EVENT) {
      ctx.addIssue({
        code: 'custom',
        path: ['sections'],
        message: `A venue can have at most ${MAX_SEATS_PER_EVENT.toLocaleString('en-IN')} seats.`,
      });
    }
  });

export type EventDetailsInput = z.input<typeof eventDetailsSchema>;
export type CreateEventInput = z.input<typeof createEventSchema>;
export type CreateEventData = z.output<typeof createEventSchema>;
export type UpdateEventInput = z.input<typeof updateEventSchema>;
export type UpdateEventData = z.output<typeof updateEventSchema>;
export type TierInput = z.input<typeof tierSchema>;
export type TierData = z.output<typeof tierSchema>;
export type SeatMapInput = z.input<typeof seatMapSchema>;
export type SeatMapData = z.output<typeof seatMapSchema>;

export interface TierView {
  id: string;
  name: string;
  description: string;
  priceInPaise: number;
  capacity: number | null;
  maxPerOrder: number;
  sortOrder: number;
  available: number;
}

export interface EventSummary {
  id: string;
  slug: string;
  title: string;
  venue: string;
  timezone: string;
  startsAt: string;
  endsAt: string;
  salesStartAt: string;
  salesEndAt: string;
  status: EventStatus;
  seatingType: SeatingType;
  organization: { name: string; slug: string };
  priceFrom: number | null;
  soldOut: boolean;
}

export interface EventDetail extends EventSummary {
  description: string;
  tiers: TierView[];
}

export type SeatStatus = 'AVAILABLE' | 'HELD' | 'SOLD';

export interface SeatView {
  id: string;
  section: string;
  row: string;
  number: number;
  x: number;
  y: number;
  tierId: string;
  isAccessible: boolean;
  status: SeatStatus;
}

export interface ManagedEvent extends EventDetail {
  organizationId: string;
  seatCount: number;
  ticketsSold: number;
  seatMap: SeatMapData | null;
  publishIssues: string[];
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}
