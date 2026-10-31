import { z } from 'zod';
import { ValidationError } from './errors';

const eventCursorSchema = z.object({ startsAt: z.iso.datetime(), id: z.uuid() });

export type EventCursor = z.infer<typeof eventCursorSchema>;

export function encodeEventCursor(cursor: EventCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

export function decodeEventCursor(value: string): EventCursor {
  try {
    return eventCursorSchema.parse(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')));
  } catch {
    throw new ValidationError({ fieldErrors: { cursor: ['This page link is invalid.'] } });
  }
}
