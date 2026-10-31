import { createHmac, timingSafeEqual } from 'node:crypto';

const VERSION = 'FP1';
const SIGNATURE_BYTES = 16;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export class TicketCodes {
  constructor(private readonly secret: string) {}

  sign(ticketId: string): string {
    return `${VERSION}.${ticketId}.${this.signature(ticketId).toString('base64url')}`;
  }

  verify(code: string): string | null {
    const [version, ticketId, signature, ...rest] = code.trim().split('.');
    if (version !== VERSION || !ticketId || !signature || rest.length > 0 || !UUID.test(ticketId)) {
      return null;
    }
    const expected = this.signature(ticketId);
    const received = Buffer.from(signature, 'base64url');
    return received.length === expected.length && timingSafeEqual(received, expected)
      ? ticketId
      : null;
  }

  private signature(ticketId: string): Buffer {
    return createHmac('sha256', this.secret)
      .update(`${VERSION}.${ticketId}`)
      .digest()
      .subarray(0, SIGNATURE_BYTES);
  }
}
