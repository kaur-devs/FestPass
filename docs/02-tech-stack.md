# Tech Stack

Each choice lists why it was picked and what was considered instead. Exact versions live in `package.json` files.

## Monorepo and tooling

| Tool | Why | Alternatives considered |
|---|---|---|
| pnpm workspaces | Fast installs, strict dependency resolution prevents phantom dependencies | npm workspaces, Yarn |
| Turborepo | Cached, dependency-aware task running across apps and packages | Nx (heavier), plain scripts |
| TypeScript (strict) | One language end to end; shared types between client and server | — |
| ESLint + Prettier | Consistent style enforced automatically | Biome |
| Husky + lint-staged + commitlint | Checks run before each commit; conventional commit messages | — |

See [ADR-0001](decisions/0001-monorepo.md).

## Frontend (`apps/web`)

| Tool | Why | Alternatives considered |
|---|---|---|
| Next.js (App Router) | Server rendering for public event pages (SEO, fast first load); client components for interactive booking | Vite + React SPA (no SSR) |
| Tailwind CSS + shadcn/ui | Accessible components that are owned in the repo, not a black-box library | MUI, Chakra |
| TanStack Query | Server-state caching, invalidation and optimistic updates | Redux Toolkit Query, SWR |
| React Hook Form + Zod | Performant forms with validation schemas shared with the API | Formik |
| Socket.IO client | Live seat map and dashboards | Native WebSocket |

## Backend (`apps/api`)

| Tool | Why | Alternatives considered |
|---|---|---|
| Express | Mature, well understood, explicit middleware chain | Fastify, NestJS |
| Zod | Runtime validation of requests and environment config | Joi, class-validator |
| Pino | Fast structured JSON logging with request IDs | Winston |
| Socket.IO + Redis adapter | Rooms per event, reconnection, and fan-out across multiple API instances | ws |

See [ADR-0002](decisions/0002-separate-express-api.md).

## Data

| Tool | Why | Alternatives considered |
|---|---|---|
| PostgreSQL | Transactions, row locks and constraints are required to prevent double booking | MongoDB |
| Prisma | Type-safe queries, migrations and seeding; raw SQL where locking needs it | Drizzle, TypeORM |
| Redis | Seat holds with TTL, caching, rate limiting, BullMQ backend, Socket.IO adapter | Memcached (cache only) |

See [ADR-0003](decisions/0003-postgres-prisma.md) and [ADR-0004](decisions/0004-seat-holds.md).

## Background work (`apps/worker`)

| Tool | Why | Alternatives considered |
|---|---|---|
| BullMQ | Redis-backed jobs with retries, backoff, delays and dead-letter handling | RabbitMQ, Kafka (both too heavy at this scale) |

Jobs: ticket PDF and QR generation, emails, hold expiry follow-ups, waitlist notifications.

## Integrations

| Service | Purpose |
|---|---|
| Razorpay (test mode) | Payments; webhooks are the source of truth for payment status |
| Resend | Transactional email |
| S3-compatible storage | Ticket PDFs and event images |
| Google OAuth | Social sign-in |

## Infrastructure

| Tool | Purpose |
|---|---|
| Docker + Docker Compose | Postgres and Redis locally; production images for api and worker |
| GitHub Actions | Lint, typecheck, test and build on every push and pull request |
| Vitest, Supertest, Playwright | Unit, API integration and end-to-end tests |
