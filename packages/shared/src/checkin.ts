import { z } from 'zod';
import { emailSchema } from './auth';

export const MAX_SCANS_PER_SYNC = 200;

const TICKET_CODE = /^FP1\.([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.[\w-]+$/;

export function ticketIdFromCode(code: string): string | null {
  return TICKET_CODE.exec(code.trim())?.[1] ?? null;
}

const gateSchema = z
  .string()
  .trim()
  .max(60)
  .transform((gate) => (gate === '' ? undefined : gate))
  .optional();

export const scanSchema = z
  .object({
    code: z.string().trim().min(1).max(200).optional(),
    ticketId: z.uuid().optional(),
    scannedAt: z.iso.datetime().optional(),
  })
  .refine((scan) => (scan.code === undefined) !== (scan.ticketId === undefined), {
    message: 'Send either a scanned code or a ticket chosen from the guest list.',
  });

export const scanBatchSchema = z.object({
  gate: gateSchema,
  scans: z.array(scanSchema).min(1).max(MAX_SCANS_PER_SYNC),
});

export const addVolunteerSchema = z.object({
  email: emailSchema,
  gate: gateSchema,
});

export type ScanBatchInput = z.input<typeof scanBatchSchema>;
export type ScanBatchData = z.output<typeof scanBatchSchema>;
export type AddVolunteerInput = z.input<typeof addVolunteerSchema>;
export type AddVolunteerData = z.output<typeof addVolunteerSchema>;

export const ScanOutcome = {
  Admitted: 'ADMITTED',
  AlreadyCheckedIn: 'ALREADY_CHECKED_IN',
  TicketCancelled: 'TICKET_CANCELLED',
  WrongEvent: 'WRONG_EVENT',
  InvalidCode: 'INVALID_CODE',
} as const;

export type ScanOutcome = (typeof ScanOutcome)[keyof typeof ScanOutcome];

export interface CheckInEvent {
  id: string;
  title: string;
  venue: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  gate: string | null;
}

export interface CheckInRecord {
  at: string;
  gate: string | null;
  scannedBy: string;
}

export interface ManifestTicket {
  id: string;
  reference: string;
  holderName: string;
  tierName: string;
  seatLabel: string | null;
  checkedInAt: string | null;
}

export interface CheckInManifest {
  event: CheckInEvent;
  generatedAt: string;
  tickets: ManifestTicket[];
}

export interface ScanResult {
  outcome: ScanOutcome;
  ticket: ManifestTicket | null;
  checkIn: CheckInRecord | null;
}

export interface VolunteerView {
  userId: string;
  name: string;
  email: string;
  gate: string | null;
  checkIns: number;
}
