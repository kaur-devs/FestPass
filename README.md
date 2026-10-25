# FestPass

Ticketing and QR check-in for college fests. Organizers create events with seat maps or ticket tiers, students book and pay online, volunteers scan tickets at the gate, and everyone sees seats and check-ins update live.

## Documentation

Architecture, design decisions and feature write-ups live in [`docs/`](docs/README.md).

## Repository

| Path              | Contents                                    |
| ----------------- | ------------------------------------------- |
| `apps/web`        | Next.js frontend                            |
| `apps/api`        | Express API                                 |
| `packages/db`     | Prisma schema, migrations, seed data        |
| `packages/shared` | Zod schemas and types shared by web and api |
| `packages/config` | Shared TypeScript and ESLint configuration  |

## Getting started

Requirements: Node.js 22.12+, pnpm (via Corepack), Docker.

```bash
corepack enable
pnpm install
pnpm db:up
cp packages/db/.env.example packages/db/.env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
pnpm db:migrate
pnpm db:seed
pnpm dev
```

- Web: http://localhost:3000
- API: http://localhost:4000/health
- Postgres: `localhost:5433` (database `festpass`; test databases are created automatically), Redis: `localhost:6379`

Port 5433 avoids clashing with a locally installed Postgres on 5432.

Seeded accounts use the `@festpass.test` domain and the password `festpass-dev-password`, for example `riya@festpass.test` (organizer), `kabir@festpass.test` (volunteer) and `ananya@festpass.test` (student).

Without an email provider, the API logs emails (verification and reset links) to its console. Set `JWT_SECRET` in `apps/api/.env` to the output of `openssl rand -base64 48`. Google sign-in is optional: set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` with the redirect URI `http://localhost:4000/auth/google/callback`.

## Scripts

| Command                                                     | Does                                                      |
| ----------------------------------------------------------- | --------------------------------------------------------- |
| `pnpm dev`                                                  | Runs all apps in watch mode                               |
| `pnpm check`                                                | Lint, typecheck, test and build everything (what CI runs) |
| `pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm build` | Each step on its own                                      |
| `pnpm format`                                               | Formats the repository with Prettier                      |
| `pnpm db:up` / `pnpm db:down`                               | Starts or stops Postgres and Redis                        |
| `pnpm db:migrate`                                           | Creates and applies migrations after a schema change      |
| `pnpm db:seed`                                              | Resets the dev database to realistic sample data          |
| `pnpm db:studio`                                            | Opens Prisma Studio to browse data                        |

## Contributing

Commits follow [Conventional Commits](https://www.conventionalcommits.org/), checked by commitlint on every commit, for example `feat(booking): hold seats during checkout`.
