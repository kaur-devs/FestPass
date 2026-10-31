# ADR-0004: Redis holds with Postgres as the final arbiter for seats

- Status: Accepted
- Date: 2026-10-25 (accepted 2026-10-26, when booking was built)

## Context

When tickets go on sale, many students try to book the same seats within seconds. A student needs a few minutes to complete payment, during which nobody else should be able to start checkout for that seat. A held seat must become available again automatically if the student abandons checkout.

## Options

1. **Hold in Postgres** with a `held_until` column. One system to reason about, but every hold attempt hits the database during the busiest moment, and expired holds need a cleanup job.
2. **Hold in Redis only.** Fast, with automatic expiry through TTL, but a Redis failure or eviction could let a seat be sold twice.
3. **Hold in Redis, sell in Postgres.** Redis absorbs contention and expires holds automatically; the sale itself is a Postgres transaction protected by a row lock and a unique constraint.

## Decision

Option 3.

- Holds live in one Redis hash per event (`{event:<id>}:held`, seat ID to user ID) with a per-field expiry (Redis 7.4 `HPEXPIRE`), so every held seat of an event is read with one `HKEYS`. A Lua script checks and claims all requested seats at once, so a multi-seat hold is all-or-nothing and only the first of many simultaneous requests wins.
- Checkout extends the hold to the 10-minute checkout window and creates a pending order. The sale runs in a Postgres transaction that locks the order row, creates the tickets and marks the order paid.
- A unique constraint on the seat's active ticket is the last line of defence.

## Consequences

- Losing requests fail fast in Redis without touching Postgres.
- Correctness does not depend on Redis: even if a hold is lost, Postgres refuses a second sale.
- A payment can succeed after its hold expired and someone else bought the seat. This case is detected in the webhook and the order is marked for refund.
- Seat availability shown to users combines sold seats from Postgres with held seats from Redis.
