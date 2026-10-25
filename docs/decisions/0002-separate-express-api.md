# ADR-0002: Separate Express API instead of Next.js route handlers

- Status: Accepted
- Date: 2026-10-25

## Context

Next.js can serve API endpoints through route handlers and server actions. FestPass also needs persistent WebSocket connections for the live seat map, a payment webhook endpoint, and close control over middleware order for auth, validation and rate limiting.

## Options

1. **Next.js route handlers only.** One deployable, but WebSockets are not supported on most serverless hosts, and the backend becomes tied to the frontend's deployment.
2. **Express API as its own app.** A long-running Node process that handles REST, WebSockets and webhooks; can scale separately from the frontend.
3. **NestJS.** Strong structure and dependency injection, but more framework to learn and more boilerplate than this project needs.

## Decision

A standalone Express API in `apps/api`, organised into feature modules with a routes → controllers → services → repositories layering. Next.js handles rendering and calls the API.

## Consequences

- REST, Socket.IO and webhooks run in one process with one auth model.
- The API can run multiple instances behind a load balancer independently of the frontend.
- Two apps to deploy instead of one, and cookies must work across the web and API origins. Both are served under one parent domain so auth cookies can use `SameSite=Lax`.
- Structure is enforced by convention rather than a framework, so the layering rules in [Low-level design](../04-low-level-design.md) matter.
