# ADR-0001: Monorepo with pnpm workspaces and Turborepo

- Status: Accepted
- Date: 2026-10-25

## Context

FestPass has a frontend, an API and a background worker. All three use the same request and response shapes, and the API and worker use the same database schema. Keeping these in sync across separate repositories means publishing packages or copying types, and they drift.

## Options

1. **Separate repositories.** Independent deploys, but shared types must be published and versioned; a schema change touches three repositories.
2. **Single Next.js app.** Simplest setup, but long-running workers and WebSocket servers fit poorly into Next.js deployments.
3. **Monorepo with workspaces.** One pull request changes the schema, API and UI together; shared packages are imported directly.

## Decision

A monorepo using pnpm workspaces for dependency management and Turborepo for running tasks with caching.

## Consequences

- Shared Zod schemas in `packages/shared` give one source of truth for validation on client and server.
- A Prisma schema change and the code that uses it land in the same commit.
- CI must build only what changed; Turborepo's cache and task graph handle this.
- Tooling setup is more involved at the start than a single app.
