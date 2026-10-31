# ADR-0010: Run the worker as a second entry point of the API codebase

- Status: Accepted
- Date: 2026-10-26

## Context

The original layout planned a separate `apps/worker` application for background jobs. Building the jobs showed that every one of them needs the API's domain code:

- Ticket emails need orders, tickets, seat labels, ticket codes and the PDF renderer.
- Checkout expiry needs `OrdersService` and the Redis seat hold store.
- Reconciliation and refunds need `PaymentsService` and the Razorpay gateway.

## Options

1. **Separate `apps/worker` that duplicates the logic.** Two implementations of the same rules drift apart.
2. **Move the domain code into a shared package** used by both apps. Correct, but a large refactor that turns most of the API into a library for one consumer.
3. **One codebase, two entry points.** `src/server.ts` starts the HTTP server; `src/worker.ts` starts BullMQ workers. Both build from the same modules and deploy from one image with different commands.

## Decision

Option 3.

| Process  | Command (production)   | Does                                                                |
| -------- | ---------------------- | ------------------------------------------------------------------- |
| `server` | `node dist/server.mjs` | HTTP and webhooks; puts jobs on queues                              |
| `worker` | `node dist/worker.mjs` | Sends email, renders and emails tickets, runs scheduled maintenance |

In development, `pnpm dev` runs both.

## Consequences

- Business rules exist once. The worker's checkout expiry is the same function the tests exercise.
- The two processes scale independently: more API instances for traffic, more worker instances for email bursts after a sale opens.
- The API no longer runs timers. Scheduled jobs use BullMQ job schedulers, so with several workers each run happens once instead of once per process.
- A crash in PDF rendering or an email provider outage cannot slow down or crash the HTTP server.
- Both processes must be deployed together, since they share job payload shapes.
