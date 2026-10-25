# ADR-0003: PostgreSQL with Prisma as the source of truth

- Status: Accepted
- Date: 2026-10-25

## Context

The core correctness rule is that a seat is never sold twice and a payment never creates two orders. The data is relational: events have tiers and seats, orders have tickets, tickets have check-ins.

## Options

1. **MongoDB.** Flexible schema, but multi-document transactions are less natural, and uniqueness across related records is harder to enforce.
2. **PostgreSQL with Prisma.** Strong transactions, row-level locks, foreign keys and unique constraints; Prisma adds type-safe queries and migrations.
3. **PostgreSQL with Drizzle.** Closer to SQL and lighter, but a smaller ecosystem for seeding and migrations tooling.

## Decision

PostgreSQL as the single source of truth, accessed through Prisma. Queries that need explicit locking (`SELECT ... FOR UPDATE`) use Prisma's raw SQL inside a transaction.

## Consequences

- Double booking is prevented by the database itself, not only by application code.
- Relational integrity (no ticket without an order, no order without a user) is enforced by foreign keys.
- Locking queries are written in raw SQL, so they need integration tests against a real Postgres instance.
- Migrations are versioned in git and never edited after being applied.
