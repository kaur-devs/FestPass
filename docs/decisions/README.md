# Architecture Decision Records

An ADR records one significant decision: the context, the options, what was chosen and the consequences. ADRs are never edited after acceptance; a changed decision gets a new ADR that supersedes the old one.

| ADR                                          | Title                                                                 | Status                    |
| -------------------------------------------- | --------------------------------------------------------------------- | ------------------------- |
| [0001](0001-monorepo.md)                     | Monorepo with pnpm workspaces and Turborepo                           | Accepted                  |
| [0002](0002-separate-express-api.md)         | Separate Express API instead of Next.js route handlers                | Accepted                  |
| [0003](0003-postgres-prisma.md)              | PostgreSQL with Prisma as the source of truth                         | Accepted                  |
| [0004](0004-seat-holds.md)                   | Redis holds with Postgres as the final arbiter for seats              | Accepted                  |
| [0005](0005-database-enforced-invariants.md) | Enforce business invariants in the database                           | Accepted                  |
| [0006](0006-session-tokens.md)               | Short-lived JWT access tokens with rotating refresh tokens in cookies | Accepted                  |
| [0007](0007-tier-capacity.md)                | Tier capacity and sold count as the single availability source        | Partly superseded by 0008 |
| [0008](0008-reserve-at-checkout.md)          | Reserve capacity at checkout, not at payment                          | Accepted                  |
| [0009](0009-payment-confirmation.md)         | Confirm payments from the browser, the webhook and reconciliation     | Accepted                  |
| [0010](0010-worker-entry-point.md)           | Run the worker as a second entry point of the API codebase            | Accepted                  |
| [0011](0011-realtime-state-messages.md)      | Push current state, not change events, over Socket.IO                 | Accepted                  |
| [0012](0012-offline-check-in.md)             | Offline check-in from a downloaded guest list                         | Accepted                  |

## Template

```markdown
# ADR-XXXX: Title

- Status: Proposed | Accepted | Superseded by ADR-YYYY
- Date: YYYY-MM-DD

## Context

What problem forces a decision.

## Options

1. Option A: pros, cons
2. Option B: pros, cons

## Decision

What was chosen.

## Consequences

What gets easier, what gets harder, what to watch for.
```
