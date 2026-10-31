import { describe, expect, it } from 'vitest';
import { hmacSha256Hex, RazorpayGateway, safeEqualHex } from './razorpay.gateway';

const gateway = new RazorpayGateway('rzp_test_key', 'key-secret', 'webhook-secret');

describe('checkout signature', () => {
  it('accepts the HMAC of "order_id|payment_id" made with the key secret', () => {
    const signature = hmacSha256Hex('key-secret', 'order_123|pay_456');

    expect(gateway.verifyCheckoutSignature('order_123', 'pay_456', signature)).toBe(true);
  });

  it('rejects a signature for a different payment or secret', () => {
    const otherPayment = hmacSha256Hex('key-secret', 'order_123|pay_999');
    const otherSecret = hmacSha256Hex('wrong-secret', 'order_123|pay_456');

    expect(gateway.verifyCheckoutSignature('order_123', 'pay_456', otherPayment)).toBe(false);
    expect(gateway.verifyCheckoutSignature('order_123', 'pay_456', otherSecret)).toBe(false);
  });
});

describe('webhook signature', () => {
  it('is computed over the exact raw body', () => {
    const body = Buffer.from('{"event":"payment.captured"}');
    const signature = hmacSha256Hex('webhook-secret', body);

    expect(gateway.verifyWebhookSignature(body, signature)).toBe(true);
    expect(
      gateway.verifyWebhookSignature(Buffer.from('{"event": "payment.captured"}'), signature),
    ).toBe(false);
  });
});

describe('safeEqualHex', () => {
  it('rejects empty, malformed and different-length input without throwing', () => {
    expect(safeEqualHex('abcd', '')).toBe(false);
    expect(safeEqualHex('abcd', 'not-hex')).toBe(false);
    expect(safeEqualHex('abcd', 'abcdef')).toBe(false);
  });
});
