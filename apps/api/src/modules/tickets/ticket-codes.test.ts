import { describe, expect, it } from 'vitest';
import { TicketCodes } from './ticket-codes';

const codes = new TicketCodes('ticket-secret-that-is-long-enough-123');
const TICKET = '01a1750e-ab5f-749b-9b12-68f20aef43d7';

describe('ticket codes', () => {
  it('round-trips a ticket ID', () => {
    const code = codes.sign(TICKET);

    expect(code).toMatch(/^FP1\.[0-9a-f-]{36}\.[\w-]{22}$/);
    expect(codes.verify(code)).toBe(TICKET);
  });

  it('rejects a code signed with another secret', () => {
    const forged = new TicketCodes('a-different-secret-of-similar-length').sign(TICKET);

    expect(codes.verify(forged)).toBeNull();
  });

  it('rejects a valid signature moved onto another ticket', () => {
    const signature = codes.sign(TICKET).split('.')[2] ?? '';
    const other = '01a1750e-ab5f-749b-9b12-68f20aef43d8';

    expect(codes.verify(`FP1.${other}.${signature}`)).toBeNull();
  });

  it.each([
    '',
    'FP1',
    'FP2.x.y',
    `FP1.${TICKET}`,
    `FP1.${TICKET}.short`,
    `FP1.not-a-uuid.abc`,
    'x'.repeat(500),
  ])('rejects malformed input %j', (input) => {
    expect(codes.verify(input)).toBeNull();
  });
});
