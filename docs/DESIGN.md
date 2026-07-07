# arecipe design system

Direction: **"enamelware, not parchment."** The recipe genre defaults to warm
cream, terracotta, and script-adjacent serifs; arecipe deliberately goes cool
and utilitarian — enamel cookware, tiled kitchens, legible at arm's length
with wet hands. Everything below derives from that. Tokens live in
`styles.css`; this document is the *why* and the usage rules.

## Palette

| Token | Hex | Role | Rules |
|---|---|---|---|
| `--tile` | `#F4F7F5` | Background | The only page background. |
| `--ink` | `#1C2B27` | Text | Body text; dim with opacity, never new grays. |
| `--enamel` | `#175E54` | Brand / primary | Wordmark, active tab, primary buttons, VERIFIED stamp, section heads. |
| `--enamel-deep` | `#124B43` | Primary hover | Hover state of `--enamel` fills only. |
| `--enamel-soft` | `#175E5414` | Tint | Chip fills, photo placeholders, subtle hovers. |
| `--yolk` | `#E8A013` | Focus / attention | Focus rings; sparing accent. Never text on tile (contrast). |
| `--yolk-deep` | `#B87D0A` | Yolk-as-text | The wordmark "a"; when yolk must be readable. |
| `--rust` | `#B4552D` | Warning | UNVERIFIED stamp and warn states only. Not a second accent. |
| `--card` | `#FFFFFF` | Surfaces | Cards, inputs, buttons. |
| `--line` | `#D9E2DE` | Strokes | All borders + dividers at `--stroke` (1.5px). |

New colors do not get invented inline. If a need isn't covered, extend the
palette here first.

## Type roles

| Role | Face | Usage |
|---|---|---|
| Display | **Fraunces** (550–600) | Wordmark, card titles, section heads. Restrained — never body copy. |
| Body | **Atkinson Hyperlegible** | Everything readable. Chosen because arm's-length kitchen legibility is a functional requirement. |
| Machine | `ui-monospace` stack | **Machine facts render in mono**: status lines, chips, stamps, DIDs, the build stamp. If software produced the value, it's mono. |

Scale: `--t-stamp 0.66` → `--t-caption 0.72` → body `1.0625` → card title
`1.15` → section `1.2` → wordmark `2.0` (rem). New sizes join the scale, not
the stylesheet.

## Spacing

4px-base scale: `--s-1 0.25rem` … `--s-7 4rem`. **All padding, margin, and
gap values come from the scale.** Sub-pixel one-offs (optical nudges like the
stamp's `0.18rem` vertical padding) are the only exception and need a
comment.

## Radii + strokes

`--r-s 0.2` (stamps) · `--r-m 0.5` (buttons, inputs) · `--r-l 0.75` (cards,
empty states) · `--r-pill` (chips). One stroke width everywhere: `--stroke`
(1.5px).

## Components + practices

- **The provenance stamp** is the signature element — the CID-verification
  verdict as a rubber stamp (enamel `✓ VERIFIED` / rust `UNVERIFIED`, slight
  rotation). It is a button and **must explain itself**: clicking reveals a
  plain-language note. Spend boldness here and nowhere else.
- **Cards**: white surface, `--line` border, `--r-l`, photo top (3:2; capped
  banner when open), display-face title, chips row (time + stamp). Hover =
  enamel border, nothing louder.
- **Buttons**: primary = enamel fill (one per view, the main action);
  secondary = enamel outline on white. Labels say what happens: "Find
  recipes", "Sign out".
- **Status lines** (`.status`): mono caption, quiet. Diagnostics beyond a
  one-line outcome belong in the console (`?debug=1`), not the UI.
- **Empty states** are invitations with a next step ("Sign in to keep your
  recipes here."), dashed `--line` border — never blank space, never mood.
- **Footer**: build stamp (which build, how big) + colophon (© + source
  link, one action). Both mono caption.
- **Copy**: sentence case, active voice, user-side vocabulary (no "PDS",
  "DID", "record" in primary UI copy — those appear in mono diagnostics).
  Errors say what happened and what to do next; they don't apologize.

## Floors (non-negotiable)

- Focus visible everywhere: 3px `--yolk` outline.
- Contrast: text ≥ 4.5:1 (large display text ≥ 3:1) — the reason
  `--yolk-deep` exists.
- `prefers-reduced-motion` respected; motion is at most a 120ms border/color
  ease anywhere.
- Mobile-first: single-column detail below 40rem; touch targets ≥ 40px.
