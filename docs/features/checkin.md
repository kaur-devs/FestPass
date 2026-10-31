# Feature: Volunteer check-in

- Status: Done
- Related ADRs: [0005](../decisions/0005-database-enforced-invariants.md), [0011](../decisions/0011-realtime-state-messages.md), [0012](../decisions/0012-offline-check-in.md)

## What it does

Volunteers open FestPass Gate on their phones, pick their event and point the camera at tickets. A full-screen green or red result tells them in under a second whether to let the person in, and why not if not. It keeps working without a network and syncs when the connection returns. Organizers add volunteers by email, assign them to gates, and watch the checked-in count rise live.

## User stories

- As a volunteer, I want to scan a QR code and see a clear yes or no, so that the queue keeps moving.
- As a volunteer, I want scanning to work when the network drops, so that the gate never stops.
- As a volunteer, I want to find someone by name or ticket reference, so that I can let them in when their phone is dead or the code will not scan.
- As an organizer, I want to add volunteers and assign gates, so that the right people can scan.
- As an organizer, I want to see how many people have arrived, so that I know when to start the show.

## High-level design

```mermaid
sequenceDiagram
    participant V as Volunteer phone
    participant IDB as IndexedDB
    participant API
    participant PG as Postgres
    participant O as Organizer dashboard

    V->>API: GET /check-in/events/:id/manifest
    API-->>V: Guest list
    V->>IDB: Save guest list

    alt Online
        V->>API: POST /scans { code }
        API->>API: Verify HMAC
        API->>PG: Lock ticket, insert check_in (unique ticket_id)
        API-->>V: ADMITTED / ALREADY_CHECKED_IN / ...
        API-->>O: sales.updated
    else Offline
        V->>IDB: Is the ticket on the list and not yet admitted?
        V->>IDB: Queue scan with phone time
        Note over V: Network returns
        V->>API: POST /scans [queued scans]
        API-->>V: Results; duplicates shown as conflicts
    end
```

The PWA is a set of pages under `/check-in` in the web app, installable to the home screen with its own manifest and icon. A service worker caches the pages and scripts so the scanner opens without a network.

## Low-level design

### Data model

No new tables; this phase uses `event_volunteers` and `check_ins` from the first migration.

| Rule                                     | Where it is enforced                                                                                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| A ticket is checked in at most once      | Unique index `check_ins_ticket_id_key`                                                                                                |
| A check-in belongs to its ticket's event | Composite foreign key `(ticket_id, event_id)`                                                                                         |
| A cancelled ticket cannot be checked in  | The ticket row is locked `FOR SHARE` and its status checked in the same transaction as the insert, so a refund cannot slip in between |
| Only the event team can scan             | `AuthorizationService.requireEventScanner`: volunteers of the event, its organizers, admins                                           |

### API

| Method | Path                                         | Auth       | Description                                                    |
| ------ | -------------------------------------------- | ---------- | -------------------------------------------------------------- |
| GET    | `/check-in/events`                           | Signed in  | Published events the user can scan for, ended within 12 hours  |
| GET    | `/check-in/events/:eventId/manifest`         | Event team | Guest list for offline use; `Cache-Control: private, no-store` |
| POST   | `/check-in/events/:eventId/scans`            | Event team | 1–200 scans, processed in order; 300 requests per minute       |
| GET    | `/manage/events/:eventId/volunteers`         | Organizer  | Volunteers with their gate and check-in count                  |
| POST   | `/manage/events/:eventId/volunteers`         | Organizer  | Add by email, or change the gate of an existing volunteer      |
| DELETE | `/manage/events/:eventId/volunteers/:userId` | Organizer  | Remove a volunteer                                             |

```http
POST /check-in/events/0190.../scans
{ "scans": [{ "code": "FP1.0190...-....AbC", "scannedAt": "2026-11-24T13:41:07.000Z" }] }

200 OK
{ "results": [{
  "outcome": "ALREADY_CHECKED_IN",
  "ticket": { "holderName": "Ananya Gupta", "tierName": "Gold", "seatLabel": "Centre · Row C · Seat 12", ... },
  "checkIn": { "at": "2026-11-24T13:12:40.000Z", "gate": "Gate 2", "scannedBy": "Meera Iyer" }
}] }
```

A scan sends either `code` (from the camera) or `ticketId` (picked from the guest list), never both. Every outcome is a `200`: a refused ticket is a normal answer at a gate, not an error.

| Outcome              | Meaning                                                        |
| -------------------- | -------------------------------------------------------------- |
| `ADMITTED`           | Checked in now                                                 |
| `ALREADY_CHECKED_IN` | Checked in earlier; includes when, where and by whom           |
| `TICKET_CANCELLED`   | Refunded or cancelled                                          |
| `WRONG_EVENT`        | A genuine ticket for another event; the holder is not revealed |
| `INVALID_CODE`       | Not a FestPass code, or a forged or altered one                |

### Modules

| Module                          | Responsibility                                                                                               |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `checkin/checkin.service.ts`    | Authorizes the scanner, verifies codes, classifies each scan, recognises resent batches, notifies organizers |
| `checkin/checkin.repository.ts` | Scannable events, guest list, and the locked insert that admits a ticket                                     |
| `checkin/volunteers.service.ts` | Add, list and remove volunteers                                                                              |
| `web/lib/checkin.ts`            | `GateSession`: guest list and scan queue in IndexedDB, online-first scanning with offline fallback, sync     |
| `web/components/qr-scanner.tsx` | Camera and QR decoding: the browser's `BarcodeDetector` where available, otherwise `jsQR`                    |
| `web/public/check-in-sw.js`     | Caches scripts (cache first) and check-in pages (network first) so the app opens offline                     |

## Decisions and trade-offs

| Decision                                             | Why                                                                                                                                                |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Offline checks against a downloaded guest list       | The HMAC secret cannot live on phones; the list lets a phone recognise real tickets without it ([ADR-0012](../decisions/0012-offline-check-in.md)) |
| The server decides every admission                   | Two gates can scan the same ticket at the same moment; only the unique constraint in Postgres can pick one                                         |
| One endpoint for single scans and offline batches    | The same rules and code path for both, so offline sync cannot drift from online behaviour                                                          |
| Refusals are `200` with an outcome                   | The scanner shows every outcome the same way; HTTP errors stay for problems with the request itself                                                |
| Resent batches recognised by volunteer and scan time | If a sync response is lost, retrying must not turn the volunteer's own admissions into false duplicates                                            |
| `BarcodeDetector` with a `jsQR` fallback             | Native detection is fast on Android Chrome; `jsQR` covers iOS Safari, is pure JavaScript and needs no download at the gate                         |
| Search by name or reference                          | Dead phones and crumpled printouts happen at every gate                                                                                            |
| Results stay 2 seconds for green, 4 for red          | Admissions should be quick; a refusal needs time for the volunteer to read the reason aloud                                                        |
| A separate web manifest for `/check-in`              | Volunteers install "FestPass Gate" straight to the scanner; students are not offered a scanner app                                                 |

## Edge cases and failure handling

| Case                                                | Behaviour                                                                                            |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Three gates scan the same ticket at once            | Exactly one admits; the others see "Already scanned" with the first gate's details                   |
| Same ticket admitted at two offline gates           | Both admit; the second phone's sync shows a duplicate with the first scan's time, gate and volunteer |
| Network hangs instead of failing                    | The scan request times out after 4 seconds and the phone continues offline                           |
| Sync response lost after the server saved the scans | Resending is recognised and reported as admitted                                                     |
| Ticket bought after the guest list was saved        | Offline: "Not on the saved list, check again online"; online: admitted normally                      |
| Ticket refunded while being scanned                 | The row lock orders the two; a cancelled ticket is never admitted                                    |
| Camera blocked or missing                           | Explains how to allow it; guest list search still works                                              |
| Same QR held in front of the camera                 | Ignored for 3 seconds, so one ticket is not scanned repeatedly                                       |
| Volunteer removed mid-event                         | Their next scan or sync is refused                                                                   |
| Event cancelled                                     | Scans are refused with `EVENT_CANCELLED`                                                             |

## Testing

- **API (19 tests):**
  - admit once, then "already scanned" with gate and volunteer
  - forged, altered and malformed codes
  - tickets for another event and cancelled tickets
  - three simultaneous scans of one ticket
  - offline batches, including phone scan times, gate override and resent batches
  - guest-list check-in by ticket ID
  - permissions for strangers, anonymous users, organizers and removed volunteers
  - the guest list's contents and its headers
  - the event list
  - volunteer management and check-in counts in sales figures
- **Mutation check:** ignoring the unique violation makes the concurrent-scan test fail; removing the scanner permission check fails three tests.
- **QR decoding:** a generated ticket QR decodes with `jsQR` using the scanner's settings.
- **Manual:**
  - checked in by guest-list search
  - with the API stopped, a check-in was saved on the phone
  - meanwhile another gate checked in the same ticket
  - after restarting the API, the queue synced by itself and showed the duplicate with the other gate's time and name
  - the organizer page showed "2 / 2 checked in" and per-volunteer counts

## Interview questions

**How do you stop one ticket being used twice?**
A unique index on `check_ins.ticket_id`. Whatever happens in the app, Postgres accepts only one check-in per ticket. Two gates scanning at the same instant both try to insert; one succeeds and the other gets a unique violation, which is turned into "Already scanned at 6:42 PM, Gate 2 by Meera".

**How does a phone verify a ticket offline if it cannot have the signing secret?**
It downloads the event's guest list before doors open. A ticket ID only exists inside its QR code, so a code whose ID is on the list is genuine for practical purposes. The server still verifies the signature when the scan syncs.

**What happens if two offline gates admit the same ticket?**
Both let the person in, because neither can know about the other. When they sync, the server accepts the first and reports the second as a duplicate, with full details. That is the deliberate trade-off: during an outage, a stopped gate is worse than one copied ticket getting in.

**What if the sync request succeeds but the response is lost?**
The phone resends. The server sees a check-in by the same volunteer with the same phone scan time and reports it as admitted, so the volunteer does not see false duplicates.

**Why does a refused ticket return 200?**
"This ticket was already used" is a correct, expected answer from the scanner, not a failed request. Keeping HTTP errors for broken requests (bad input, no permission) lets the client treat every scan result the same way.
