# Design System

Captured from the client's references. Styling is parked behind the architecture work,
but recorded here so nothing is lost. **Confirm exact brand hex + grab font licenses
before launch.**

## Direction

Clean **Swiss-style** layouts — generous whitespace, strong typographic hierarchy,
restrained color. Documentation shell with a **left-side navigation** rail, in the
spirit of **Palantir Foundry docs / GitHub docs**: persistent nav (corridors → pillars →
units), readable content column, minimal chrome.

## Typography

- **Headers:** General Sans (Fontshare / Indian Type Foundry).
- **Body:** Arial (system).
- **Accent headers:** the all-caps, mixed-weight treatment — e.g.
  "THE **ART** OF BEING **LOCAL** IN CANADA" — uppercase with selected words bold.
  Implemented as a `.accent-head` utility.

## Color

| Token | Value (confirm) | Use |
|-------|-----------------|-----|
| `--color-brand` | `#D6A45F` (approx — confirm exact hex) | Brand orange/tan: step labels, accents, links |
| `--color-ink` | `#1A1A1A` | Primary text |
| `--color-muted` | `#6B6B6B` | Secondary text |
| `--color-line` | `#E6E1D8` | Hairlines, nav borders |
| `--color-bg` | `#FFFFFF` | Page |
| `--color-bg-soft`| `#FAF7F1` | Cards, callouts (warm off-white) |

## Patterns

- **Step / pillar headers:** small brand-orange eyebrow label ("Step 1" / "Pillar 1")
  above a large General Sans heading, with a hairline rule.
- **Corridor callout:** warm `--color-bg-soft` block — the "how it differs for your
  corridor" section, visually distinct as the moat.
- **Citations:** every claim shows an inline source chip linking to the official source.
- **Trust strip:** author byline + credentials + visible last-reviewed date on every
  published unit (E-E-A-T requirement, not decoration).
