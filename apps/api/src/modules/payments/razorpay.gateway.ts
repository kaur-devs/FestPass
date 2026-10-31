import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

const API_BASE = 'https://api.razorpay.com/v1';
const REQUEST_TIMEOUT_MS = 10_000;

export interface GatewayOrder {
  id: string;
}

export interface CapturedPayment {
  id: string;
  amountInPaise: number;
  currency: string;
}

export interface PaymentGateway {
  readonly keyId: string;
  createOrder(input: {
    amountInPaise: number;
    receipt: string;
    notes: Record<string, string>;
  }): Promise<GatewayOrder>;
  findCapturedPayment(gatewayOrderId: string): Promise<CapturedPayment | null>;
  findRefund(paymentId: string): Promise<{ id: string } | null>;
  refund(paymentId: string, amountInPaise: number, receipt: string): Promise<{ id: string }>;
  verifyCheckoutSignature(gatewayOrderId: string, paymentId: string, signature: string): boolean;
  verifyWebhookSignature(rawBody: Buffer, signature: string): boolean;
}

export function hmacSha256Hex(secret: string, payload: string | Buffer): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

export function safeEqualHex(expected: string, received: string): boolean {
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(received, 'hex');
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

const orderResponse = z.object({ id: z.string() });
const paymentsResponse = z.object({
  items: z.array(
    z.object({ id: z.string(), status: z.string(), amount: z.number(), currency: z.string() }),
  ),
});
const refundResponse = z.object({ id: z.string() });
const refundsResponse = z.object({ items: z.array(refundResponse) });

export class RazorpayGatewayError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'RazorpayGatewayError';
  }
}

export class RazorpayGateway implements PaymentGateway {
  constructor(
    readonly keyId: string,
    private readonly keySecret: string,
    private readonly webhookSecret: string,
  ) {}

  async createOrder(input: {
    amountInPaise: number;
    receipt: string;
    notes: Record<string, string>;
  }) {
    return orderResponse.parse(
      await this.request('POST', '/orders', {
        amount: input.amountInPaise,
        currency: 'INR',
        receipt: input.receipt,
        notes: input.notes,
      }),
    );
  }

  async findCapturedPayment(gatewayOrderId: string): Promise<CapturedPayment | null> {
    const { items } = paymentsResponse.parse(
      await this.request('GET', `/orders/${encodeURIComponent(gatewayOrderId)}/payments`),
    );
    const captured = items.find((payment) => payment.status === 'captured');
    return captured
      ? { id: captured.id, amountInPaise: captured.amount, currency: captured.currency }
      : null;
  }

  async findRefund(paymentId: string) {
    const { items } = refundsResponse.parse(
      await this.request('GET', `/payments/${encodeURIComponent(paymentId)}/refunds`),
    );
    return items[0] ?? null;
  }

  async refund(paymentId: string, amountInPaise: number, receipt: string) {
    return refundResponse.parse(
      await this.request('POST', `/payments/${encodeURIComponent(paymentId)}/refund`, {
        amount: amountInPaise,
        receipt,
      }),
    );
  }

  verifyCheckoutSignature(gatewayOrderId: string, paymentId: string, signature: string): boolean {
    return safeEqualHex(hmacSha256Hex(this.keySecret, `${gatewayOrderId}|${paymentId}`), signature);
  }

  verifyWebhookSignature(rawBody: Buffer, signature: string): boolean {
    return safeEqualHex(hmacSha256Hex(this.webhookSecret, rawBody), signature);
  }

  private async request(method: 'GET' | 'POST', path: string, body?: unknown): Promise<unknown> {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64')}`,
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
      },
      ...(body !== undefined && { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new RazorpayGatewayError(
        res.status,
        `Razorpay ${method} ${path} failed with ${res.status}`,
      );
    }
    return res.json();
  }
}
