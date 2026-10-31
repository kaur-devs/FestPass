# ADR-0012: Offline check-in from a downloaded guest list

- Status: Accepted
- Date: 2026-11-01

## Context

Gates are where connectivity is worst: hundreds of phones in one place, often outdoors or underground. A scanner that stops when the network drops causes a queue at the door within minutes, so check-in has to keep working offline.

Ticket codes are signed with HMAC ([tickets.md](../features/tickets.md)). Verifying an HMAC needs the secret, and the secret must never reach a phone: anyone holding it could print valid tickets.

## Options

1. **Online only.** Simple and always correct, but the gate stops whenever the network does.
2. **Public-key signatures (Ed25519) verified on the phone.** The phone could prove a code is genuine offline, but every existing ticket would need reissuing, and a genuine code still says nothing about whether it was already used.
3. **Download the guest list.** Before doors open, each phone saves the event's active tickets (ID, name, tier, seat, whether already checked in). Offline, a scanned code is accepted only if its ticket ID is on that list and not yet checked in on this phone. Scans are queued and sent when the network returns; the server decides.

## Decision

Option 3.

- Online, every scan goes to the server, which verifies the HMAC and records the check-in under the unique constraint. Online is always preferred; a scan request that takes more than 4 seconds falls back to offline.
- Offline, the phone checks the code's ticket ID against the saved guest list. Ticket IDs are random UUIDs and appear only inside the QR code, so a guessed or made-up code is not on the list.
- Queued scans are stored in IndexedDB, survive the app being closed, and sync in order. Each carries the time it was scanned on the phone, stored as `device_scanned_at`.
- Resending a batch whose response was lost is recognised (same volunteer, same scan time) and reported as admitted, not as a duplicate.

## Consequences

- The gate keeps admitting people with no network.
- The same ticket can be admitted at two gates that are both offline. Sync reports the later one as a duplicate, with the time, gate and volunteer of the first scan, so the organizer can follow up. This is the accepted cost; one copied ticket getting in during an outage is better than a stopped gate.
- Tickets bought after the list was downloaded are not on it. Offline, the phone says so and asks to check again online, instead of refusing outright.
- The guest list holds attendee names on volunteers' phones. It is only given to the event's volunteers and organizers, is never cached by the browser's HTTP cache, and contains no emails or payment details.
