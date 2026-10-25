# ADR-0005: Enforce business invariants in the database

- Status: Accepted
- Date: 2026-10-25

## Context

The rules that matter most to FestPass are about money and seats: a seat is sold once, a payment is applied once, a ticket is scanned once, a tier never sells past capacity. These rules are checked in application code, but application code can have bugs, run concurrently across many instances, or be bypassed by a script or a future feature that forgets a check.

## Options

1. **Application code only.** Simple to read and change, but two concurrent requests can both pass a "seat is free" check before either writes.
2. **Application code plus database constraints.** The application checks first to return friendly errors; the database rejects anything that slips through, including races between concurrent requests.

## Decision

Option 2. Every invariant listed in [Database schema](../features/database.md#invariants) has a database constraint: unique and partial unique indexes, composite foreign keys, or CHECK constraints. Each one has an integration test that tries to break it against a real Postgres instance.

Constraints are named, and `getConstraintViolation()` in `packages/db` reports which one failed. Services translate specific violations into domain errors, for example `tickets_active_seat_key` into "This seat was just booked by someone else."

## Consequences

- Races between concurrent requests cannot corrupt data; the losing request gets a constraint error instead.
- CHECK constraints live in hand-edited migration SQL, because the Prisma schema cannot express them. Prisma does not manage or drop them, which was verified by generating a migration after adding them and getting an empty diff.
- Constraint names become part of the contract between the database and services; renaming one requires updating the code that maps it.
- Tests need a real Postgres database, so CI runs a Postgres service.
