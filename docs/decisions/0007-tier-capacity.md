# ADR-0007: Tier capacity and sold count as the single availability source

- Status: Accepted
- Date: 2026-10-26

## Context

Event listings and event pages show whether tickets are available, how many are left and whether an event is sold out. FestPass has two kinds of events:

- **General admission:** a tier has a fixed number of tickets.
- **Reserved seating:** a tier is a set of seats in the seat map.

Availability could be computed differently for each: capacity minus sold for general admission, and "seats in this tier without an active ticket" for reserved seating. The second requires counting across `seats` and `tickets` for every tier of every event on every listing request.

## Options

1. **Compute reserved availability from seats and tickets on read.** Always exact, but the listing page runs a counting query per event, and two code paths answer the same question.
2. **Store capacity on every tier.** For reserved seating, capacity is the number of seats assigned to the tier, written whenever the seat map is saved. Availability is `capacity - sold_count` for both event types.

## Decision

Option 2.

- Saving a seat map sets each tier's `capacity` to its seat count in the same transaction that writes the seats.
- Every sale increments `sold_count` in the same transaction that creates the ticket (booking phase).
- The existing CHECK constraint `sold_count <= capacity` now protects reserved tiers too.

## Consequences

- Listings and event pages read availability from the tier rows they already load: no extra queries.
- One rule for both event types in the API, the web app and the publish checklist.
- `sold_count` is a counter that must stay in step with tickets. Both change in one transaction, and the seat map cannot change after the first sale, so capacity cannot drift from the seats.
- The seat map view still reads tickets directly, because it needs to know _which_ seats are sold, not how many.
