# Architecture Decision Records

An ADR records one significant decision: the context, the options, what was chosen and the consequences. ADRs are never edited after acceptance; a changed decision gets a new ADR that supersedes the old one.

| ADR | Title | Status |
|---|---|---|
| [0001](0001-monorepo.md) | Monorepo with pnpm workspaces and Turborepo | Accepted |
| [0002](0002-separate-express-api.md) | Separate Express API instead of Next.js route handlers | Accepted |
| [0003](0003-postgres-prisma.md) | PostgreSQL with Prisma as the source of truth | Accepted |
| [0004](0004-seat-holds.md) | Redis holds with Postgres as the final arbiter for seats | Proposed |

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
