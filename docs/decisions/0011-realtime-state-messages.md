# ADR-0011: Push current state, not change events, over Socket.IO

- Status: Accepted
- Date: 2026-11-01

## Context

Students choosing seats should see other people's holds and purchases immediately, and organizers want sales figures to update as tickets sell. Seat changes happen in two processes (the API and the worker) and possibly on several API instances, while viewers are connected to whichever instance their WebSocket reached.

Changes also overlap: a checkout can expire in the worker at the same moment another student holds the same seat through the API.

## Options

**Transport**

1. Polling every few seconds: simple, but slow to update and expensive at scale.
2. Server-Sent Events: one-way and simple, but needs its own fan-out across instances.
3. Socket.IO with the Redis adapter and emitter: rooms, reconnection, fallbacks, and fan-out across instances and from non-HTTP processes.

**Message content**

1. Change events ("seat A3 was released"): small, but a client applying them out of order, or a release racing a new hold, ends up showing the wrong state.
2. Current state ("seat A3 is now HELD until 18:42"): each message is read from the source of truth just before sending, so the last message a client receives is always correct.

## Decision

Socket.IO, and every message carries current state.

- After any change, the publisher reads the affected seats' real status (sold from Postgres, held and expiry from Redis) and the tiers' remaining counts, and sends them to the event's room.
- The worker publishes through `@socket.io/redis-emitter`; API instances share rooms through `@socket.io/redis-adapter`. Both go through Redis, so every viewer receives every update.
- Held seats include `heldUntil`. Browsers release them locally at that time, so hold expiry, which happens silently inside Redis, needs no server message.
- On reconnect, the client reloads the full seat map, covering anything missed while offline. A 60-second refresh remains as a final fallback.

## Consequences

- Messages are slightly larger and each publish costs two small queries. Both are negligible next to the seat map load they replace.
- Out-of-order or duplicate messages are harmless: applying a state twice changes nothing.
- Publishing never blocks or fails a sale; errors are logged and the next message or refresh corrects the view.
- Real-time is a view of the truth, not the truth: holds and sales are still decided by Redis scripts and Postgres constraints.
