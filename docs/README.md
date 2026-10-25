# FestPass Documentation

Engineering documentation for FestPass: what it does, how it is built, and why it is built that way.

## Contents

| Document | What it covers |
|---|---|
| [Overview](01-overview.md) | Problem, users, scope, requirements |
| [Tech stack](02-tech-stack.md) | Every technology used, why it was chosen, what it replaced |
| [High-level design](03-high-level-design.md) | Components, data flow, scaling, failure handling |
| [Low-level design](04-low-level-design.md) | Code structure, layering, conventions, error handling |
| [Design system](05-design-system.md) | Visual direction, tokens, signature components, UI review checklist |
| [Decisions](decisions/README.md) | Architecture Decision Records (ADRs) |
| [Features](features/README.md) | One document per feature: design, API, schema, edge cases |

## How these docs are maintained

- A feature is not done until its document in `features/` is written.
- Any decision that would be expensive to reverse gets an ADR in `decisions/`.
- Diagrams use [Mermaid](https://mermaid.js.org/) so they render on GitHub and live next to the code.
- When code and docs disagree, fix the docs in the same pull request.
