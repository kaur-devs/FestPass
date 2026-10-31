# ADR-0008: Reserve capacity at checkout, not at payment

- Status: Accepted
- Date: 2026-10-26
- Supersedes: the "every sale increments `sold_count`" rule in [ADR-0007](0007-tier-capacity.md)

## Context

ADR-0007 made `capacity - sold_count` the single availability figure and planned to increment `sold_count` when tickets are issued. Building checkout showed a problem: between starting checkout and paying, a student has spent up to ten minutes on a payment page. If capacity is only taken at payment, many students can start paying for the same last ticket, and all but one are refunded after paying.

## Options

1. **Take capacity at payment.** Simple counters, but oversells checkouts and forces refunds.
2. **Take capacity at checkout, give it back if the checkout ends unpaid.** Students who reach the payment page are guaranteed a ticket for the checkout window.

## Decision

Option 2. `sold_count` counts tickets sold **plus** tickets reserved by pending orders.

- Creating an order increments `sold_count` per tier in the same transaction. The `sold_count <= capacity` CHECK constraint rejects the order if there is not enough left, so concurrent checkouts cannot oversell without any explicit lock.
- Cancelling or expiring an unpaid order decrements it again, in the same statement that changes the order's status, so a reservation is released exactly once.
- Confirming a pending order does not touch `sold_count`; it was already counted.
- Confirming an order that has already expired (a late payment) tries to take the capacity again. If the tier or seat is gone, the order is marked `REFUND_PENDING`.

## Consequences

- "Sold out" on the event page includes tickets in other people's checkouts, which matches what a student can actually buy.
- A crash between reserving and paying cannot leak capacity forever: a sweep expires unpaid orders every 15 seconds, and checkout also expires overdue orders for the same event before reserving.
- `sold_count` must only change inside these transactions. The name is kept for continuity; it means "committed", not only "paid".
- Tiers are updated in a fixed order (by ID) inside each transaction, so two orders touching the same tiers cannot deadlock.
