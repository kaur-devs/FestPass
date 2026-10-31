# ADR-0009: Confirm payments from the browser, the webhook and reconciliation

- Status: Accepted
- Date: 2026-10-26

## Context

Razorpay tells FestPass about a successful payment in two ways: the checkout widget hands the browser a signed result, and Razorpay sends a signed webhook to the API. Either can fail. The student may close the tab right after paying, so the browser never reports back. Webhooks can arrive late, more than once, out of order, or not at all if the API was down and retries ran out.

Whatever happens, a student who paid must get their tickets or their money back, and must never be charged twice for one order.

## Options

1. **Webhook only.** One code path, but the student waits on a spinner until the webhook arrives, and a lost webhook loses the sale.
2. **Browser only.** Instant, but closing the tab after paying loses the confirmation.
3. **All three: browser, webhook and a reconciliation sweep, through one idempotent confirmation.**

## Decision

Option 3.

| Path           | Trust check                                                  | When it matters                           |
| -------------- | ------------------------------------------------------------ | ----------------------------------------- |
| Browser        | HMAC-SHA256 of `order_id\|payment_id` with the key secret    | Normal case: instant confirmation         |
| Webhook        | HMAC-SHA256 of the raw body with the webhook secret          | Tab closed after paying; source of truth  |
| Reconciliation | Asks Razorpay for captured payments before expiring an order | Webhook lost or delayed past the deadline |

All three call the same `settle` step, which checks the amount and currency, then calls `OrdersService.confirm`. Confirmation locks the order row, so whichever path arrives second sees `PAID` and does nothing.

Webhook events are recorded by Razorpay's event ID after processing; a redelivered event is skipped. Processing happens before recording, so a failure mid-way lets Razorpay's retry try again instead of being skipped.

## Consequences

- Confirmation is fast for the common case and still reliable when browsers or webhooks fail.
- Signatures are verified with `timingSafeEqual`, and the webhook route reads the raw body, because re-serialised JSON would not match the signature.
- A second, different payment for an already-paid order (two checkout windows) is refunded automatically.
- A payment for an order that can no longer be fulfilled becomes `REFUND_PENDING`; a sweep refunds it and records the refund. Before refunding, the sweep asks Razorpay for an existing refund, so a crash between refunding and saving cannot refund twice.
- Razorpay must be set to capture payments automatically, because only `captured` payments confirm an order.
