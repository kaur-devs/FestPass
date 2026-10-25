# Overview

## Problem

College fests and club events sell tickets through Google Forms, UPI screenshots and spreadsheets. This leads to:

- Overbooking, because nothing stops two people from claiming the same seat.
- Manual payment verification by organizers matching screenshots to names.
- Slow, error-prone entry at the gate, where volunteers check names against printed lists.
- No live view of sales or attendance for organizers.

## Solution

FestPass is a ticketing and check-in platform for college events. Organizers create events with ticket tiers or seat maps, students book and pay online, volunteers scan QR tickets at the gate, and organizers see sales and check-ins update live.

## Users and roles

| Role | Can do |
|---|---|
| Student | Browse events, book seats or tickets, pay, view and download tickets |
| Organizer | Create and manage events, tiers and seat maps; view sales and check-in dashboards |
| Volunteer | Scan and validate tickets at the gate for events they are assigned to |
| Admin | Manage organizers and platform-wide settings |

## Functional requirements

1. Users sign up with email or Google and are assigned a role.
2. Organizers create events with either general-admission tiers or a reserved seat map.
3. Students see seat availability update in real time.
4. Selecting a seat holds it for a fixed window during checkout.
5. Payment confirms the booking and issues a ticket with a signed QR code, delivered by email.
6. Volunteers scan tickets from a phone; a ticket can be checked in only once.
7. Organizers see live sales and check-in numbers.

## Non-functional requirements

| Requirement | Target |
|---|---|
| Correctness | A seat is never sold twice; a payment never creates two orders |
| Burst handling | Ticket release opens to hundreds of users at the same moment |
| Latency | Seat availability updates reach other clients within about one second |
| Availability at the gate | Check-in keeps working through poor connectivity and syncs later |
| Security | Tickets cannot be forged or reused; role checks enforced on the server |

## Out of scope (for now)

- Refunds and partial cancellations beyond releasing a seat
- Multiple currencies or international payments
- Native mobile apps (the check-in app is a PWA)
