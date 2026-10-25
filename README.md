# FestPass

Ticketing and QR check-in for college fests. Organizers create events with seat maps or ticket tiers, students book and pay online, volunteers scan tickets at the gate, and everyone sees seats and check-ins update live.

## Documentation

Architecture, design decisions and feature write-ups live in [`docs/`](docs/README.md).

## Repository

| Path              | Contents                                    |
| ----------------- | ------------------------------------------- |
| `apps/web`        | Next.js frontend                            |
| `apps/api`        | Express API                                 |
| `packages/shared` | Zod schemas and types shared by web and api |
| `packages/config` | Shared TypeScript and ESLint configuration  |

## Getting started

Requirements: Node.js 22.12+, pnpm (via Corepack), Docker.

```bash
corepack enable
pnpm install
pnpm db:up
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
pnpm dev
```

- Web: http://localhost:3000
- API: http://localhost:4000/health

## Scripts

| Command                                                     | Does                                                      |
| ----------------------------------------------------------- | --------------------------------------------------------- |
| `pnpm dev`                                                  | Runs all apps in watch mode                               |
| `pnpm check`                                                | Lint, typecheck, test and build everything (what CI runs) |
| `pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm build` | Each step on its own                                      |
| `pnpm format`                                               | Formats the repository with Prettier                      |
| `pnpm db:up` / `pnpm db:down`                               | Starts or stops Postgres and Redis                        |

## Contributing

Commits follow [Conventional Commits](https://www.conventionalcommits.org/), checked by commitlint on every commit, for example `feat(booking): hold seats during checkout`.
