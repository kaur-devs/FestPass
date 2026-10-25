# Design System

- Status: Accepted
- Date: 2026-10-25

Every screen is built from the tokens and rules in this document. If a design needs something that is not here, add it here first, then use it.

## Direction: "Printed ticket"

FestPass should feel like the physical things a fest produces: tickets, wristbands, gig posters and gate passes. Warm paper backgrounds, near-black ink, condensed poster type for event names, and one bright marigold accent, the colour of fest decorations.

Principles:

1. **Content first.** Event names, dates and seats are the design. Decoration never competes with them.
2. **One accent, used sparingly.** Marigold marks the single most important action or state on a screen.
3. **Flat and printed.** Borders and solid fills instead of gradients, glows and blur.
4. **Built for phones in a hurry.** Big tap targets, high contrast, readable in sunlight at a gate.

### References

| Product                 | What to learn from it                                         |
| ----------------------- | ------------------------------------------------------------- |
| Luma                    | Event page layout, whitespace, how little chrome a page needs |
| DICE                    | Bold type on tickets, confident use of a single colour        |
| Linear                  | Dense but calm dashboards, keyboard-friendly tables           |
| Airline boarding passes | Ticket hierarchy: the seat and gate are the largest text      |

## Colour

All text pairs below meet WCAG AA (4.5:1 or higher). Ratios were calculated, not estimated.

### Light theme

| Token         | Hex       | Use                                          | Contrast          |
| ------------- | --------- | -------------------------------------------- | ----------------- |
| `paper`       | `#FAF7F2` | Page background                              | —                 |
| `surface`     | `#FFFFFF` | Cards, inputs, popovers                      | —                 |
| `ink`         | `#1A1714` | Primary text, primary buttons                | 16.7 on paper     |
| `ink-muted`   | `#6B645C` | Secondary text, seat outlines                | 5.45 on paper     |
| `line`        | `#D9D2C7` | Dividers and borders (decorative only)       | —                 |
| `accent`      | `#F59E0B` | Fills: primary call to action, selected seat | `ink` on it: 8.31 |
| `accent-text` | `#B45309` | Accent used as text or links                 | 4.70 on paper     |
| `success`     | `#15803D` | Confirmed, checked in                        | 4.69 on paper     |
| `warning`     | `#A16207` | Hold expiring, low stock                     | 4.61 on paper     |
| `danger`      | `#B91C1C` | Errors, already scanned                      | 6.05 on paper     |

### Dark theme

| Token         | Hex       | Contrast             |
| ------------- | --------- | -------------------- |
| `paper`       | `#141210` | —                    |
| `surface`     | `#1F1B18` | —                    |
| `ink`         | `#F5F1EA` | 16.6 on paper        |
| `ink-muted`   | `#A39B91` | 6.81 on paper        |
| `line`        | `#2E2A25` | —                    |
| `accent`      | `#FBBF24` | `paper` on it: 11.19 |
| `accent-text` | `#FBBF24` | 11.19 on paper       |
| `success`     | `#4ADE80` | 10.72 on paper       |
| `warning`     | `#FACC15` | 12.20 on paper       |
| `danger`      | `#F87171` | 6.76 on paper        |

Rules:

- Text on `accent` is always `ink` (light) or `paper` (dark), never white.
- `accent` appears at most once per view as a filled element.
- No gradients, glows or `backdrop-blur`.

## Typography

| Role    | Font                            | Use                                                    |
| ------- | ------------------------------- | ------------------------------------------------------ |
| Display | Big Shoulders (700–800)         | Event names, ticket stubs, large numbers on dashboards |
| UI      | Instrument Sans (400, 500, 600) | Everything else                                        |
| Mono    | JetBrains Mono (500)            | Seat codes, ticket IDs, order numbers                  |

All three are loaded with `next/font/google`, self-hosted with no layout shift.

### Scale

| Token        | Size / line height | Use                                           |
| ------------ | ------------------ | --------------------------------------------- |
| `text-xs`    | 12 / 16            | Labels, table metadata                        |
| `text-sm`    | 14 / 20            | Secondary text, table cells                   |
| `text-base`  | 16 / 24            | Body text, inputs (16px prevents zoom on iOS) |
| `text-lg`    | 18 / 28            | Card titles                                   |
| `text-2xl`   | 24 / 32            | Section headings                              |
| `display-md` | 40 / 40            | Event names on cards, ticket stubs            |
| `display-lg` | 64 / 60            | Event page hero                               |

Display text is uppercase with `0.01em` tracking. UI text is never uppercase except `text-xs` labels.

## Spacing, radius, borders, elevation

| Category  | Values                                                                                            |
| --------- | ------------------------------------------------------------------------------------------------- |
| Spacing   | Tailwind's 4px scale only: 1, 2, 3, 4, 6, 8, 12, 16, 24. No arbitrary values.                     |
| Radius    | `4px` for inputs, buttons, seats and chips; `12px` for cards and dialogs; `full` for avatars only |
| Borders   | `1px line` by default; `2px ink` for focus and the selected state                                 |
| Elevation | Flat by default. One shadow, `0 1px 2px rgb(0 0 0 / 0.06)`, only for popovers and dialogs         |
| Layout    | Content max width 1120px; 16px side gutter on mobile, 24px on tablet and up                       |
| Motion    | 150ms for hover and press, 250ms for panels; `ease-out`; disabled under `prefers-reduced-motion`  |

## Signature components

These three components define how FestPass looks. They get the most design attention.

### Ticket

- Shaped like a stub: perforated divider (a dashed border with notched semicircle cut-outs) separating the event half from the QR half.
- Event name in `display-md`; seat, gate and date in mono, laid out like a boarding pass.
- The QR code sits on pure white even in dark mode, so scanners can read it.
- Exports to PDF with the same layout.

### Seat map

| Seat state           | Visual (never colour alone)                           |
| -------------------- | ----------------------------------------------------- |
| Available            | `surface` fill, `ink-muted` outline                   |
| Selected by you      | `accent` fill, `2px ink` outline, check mark          |
| Held by someone else | Diagonal stripes in `line`, no outline, not clickable |
| Sold                 | `ink` fill at 15% opacity, no outline, not clickable  |
| Accessible seat      | Wheelchair icon in the seat                           |

- Minimum seat tap target 32px; the map pans and zooms on mobile.
- A legend is always visible.
- When another user takes a seat, it changes state with a 250ms fade, so changes are noticeable without being jarring.
- Screen readers get a row and seat label and its state, for example "Row C, seat 12, available".

### Gate scanner

- Full-screen camera with a framing guide.
- The result fills the whole screen: `success` with "Checked in" and the attendee name, or `danger` with the reason ("Already scanned at 18:42, Gate 2").
- Result text is at least 32px, readable at arm's length.
- Vibrates on result where supported; returns to scanning after 2 seconds or a tap.

## Base components

shadcn/ui is the base, restyled through these tokens. After theming, nothing should look like the shadcn default.

| Component | Rules                                                                                                                                                                                     |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Button    | Variants: `primary` (ink fill), `accent` (one per view), `secondary` (outline), `ghost`, `danger`. Minimum height 44px on mobile. Shows a spinner and stays the same width while pending. |
| Input     | 16px text, visible label above (no placeholder-only labels), error text below in `danger`.                                                                                                |
| Card      | `surface` fill, `1px line` border, 12px radius, no shadow. Not every group of content needs a card.                                                                                       |
| Table     | Used for organizer data. Sticky header, right-aligned numbers, mono for IDs.                                                                                                              |
| Toast     | Bottom on mobile, bottom-right on desktop. Errors stay until dismissed.                                                                                                                   |

## States every screen must handle

| State   | Rule                                                                                           |
| ------- | ---------------------------------------------------------------------------------------------- |
| Loading | Skeletons that match the real layout; no full-page spinners after the first load               |
| Empty   | Explains what goes here and offers the next action ("No events yet. Create your first event.") |
| Error   | Says what happened and what to do, in plain words; never a raw error code alone                |
| Offline | Banner on the check-in app showing how many scans are queued                                   |
| Partial | Optimistic updates roll back visibly if the server rejects them                                |

## Writing

- Specific over generic: "Book your seat for Techfest in under a minute", not "Seamless event experiences".
- Sentence case for headings and buttons; buttons say what they do ("Pay ₹299", not "Submit").
- Money as `₹1,299`, dates as `Sat, 14 Feb · 6:30 PM`, in the user's timezone.
- No emoji in the interface.
- Error messages explain and suggest: "Someone booked this seat a moment ago. Pick another seat."

## Imagery and icons

- Icons from Lucide only, 1.5px stroke, sized 16 or 20.
- Event images are organizer uploads, shown at a fixed aspect ratio of 3:2 with a solid `line` fallback.
- No stock illustrations, 3D blobs or AI-generated art.

## Accessibility

- WCAG AA contrast for all text; 3:1 for interactive outlines.
- Every interactive element reachable and usable by keyboard, with a visible `2px ink` focus ring.
- Semantic HTML first; ARIA only where native elements fall short.
- Respect `prefers-reduced-motion` and `prefers-color-scheme`.

## Avoid

These are the signs of an interface assembled from defaults:

- Purple or blue gradients, glowing blobs, glassmorphism
- Centered hero with a vague tagline and two buttons
- Rows of three identical feature cards with icons in rounded squares
- Untouched shadcn styling (zinc greys, default radius)
- Sparkles icons, emoji as icons
- Invented statistics or testimonials
- Arbitrary spacing values and one-off colours
- Screens that only handle the happy path

## Review checklist

Before a frontend pull request is merged, check each changed screen:

- [ ] Uses only tokens from this document
- [ ] Checked at 375px, 768px and 1280px
- [ ] Light and dark mode both correct
- [ ] Loading, empty and error states implemented
- [ ] Keyboard navigation and focus ring work
- [ ] Copy is specific and follows the writing rules
- [ ] Nothing from the "Avoid" list
- [ ] Compared side by side with a reference product
