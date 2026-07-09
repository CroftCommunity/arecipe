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

### Dark enamelware (same kitchen at night)

Applied as `[data-theme='dark']` token overrides; resolved pre-paint by an
inline head script, owned by `src/theme.ts` after load (auto → light → dark
cycle in the top bar, persisted; auto follows `prefers-color-scheme`).

| Token | Dark value | Note |
|---|---|---|
| `--tile` | `#101B18` | Deep green-black. |
| `--ink` | `#E2EBE7` | |
| `--enamel` | `#5CB3A1` | Lightened for text/border contrast on dark. |
| `--enamel-deep` | `#79C7B6` | Hover lightens (inverted from light mode). |
| `--yolk-deep` | `#E5B13D` | The wordmark "a" brightens on dark. |
| `--rust` | `#E07A4F` | Warning stays loud — verified against the ALTERED? stamp. |
| `--card` / `--line` | `#182622` / `#2B3B36` | |
| `--stamp-veil` | `#101B18D9` | The ALTERED? stamp's backing veil. |

## The mark

The butterfly-spatula (wings as line-art outlines, a slotted spatula for the
body, one gold dot on the handle — the same warm accent as the wordmark's
"a"). Enamel-palette theme pair in `assets/logo-{light,dark}.png`, shown
beside the wordmark (which reads **a recipe**) and as the favicon. The blue
`assets/brand/arecipe-app-lockup-blue.png` is sticker/splash source material
(Phase 8b splash candidate), not app UI.

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

- **Trust surface: silent when good, loud when bad** (the browser-padlock
  lesson — positive security badges inform nobody; warnings do). Intact
  records carry **no badge**. The opened detail ends with one quiet mono
  provenance line: `as published by <author> · fingerprint matches · <date>`.
  A record that fails the integrity check gets the signature element — the
  rust **ALTERED?** rubber stamp across its photo (double border, rotated)
  plus an always-visible plain-language warning. Never soften it, never
  badge the happy path. "Verified" as a word is banned from primary UI copy
  (it reads as account status, not content integrity).
- **Cards**: white surface, `--line` border, `--r-l`, photo top (3:2; capped
  banner when open), display-face title, chips row (time + stamp). Hover =
  enamel border, nothing louder.
- **Browse toolbar**: a compact control bar above the feed — a Tiles/Details
  view toggle, a "Photos only" toggle, and transient `Meal ▾` / `Cuisine ▾`
  multi-select filter dropdowns (OR within a dimension, AND across), with the
  count right-aligned. Dietary preference is not a transient filter — it is a
  persisted "Only show me" preference set in Settings (linked from the count).
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

## Navigation: pages, not modals (non-negotiable)

Mobile is first-class, and modals are a mess there — a lesson paid for in
`chasemp/peadoubleueh`: hidden overlays that keep blocking touch, back
buttons that don't close them, keyboards that break their positioning, focus
traps. So:

- **Content navigates to views** (list → detail → back), driven by history
  so the back button/gesture always does the expected thing. No content in
  overlays.
- Acceptable overlay-ish elements: inline reveals in normal document flow
  (the stamp note, `<details>` expansion) and transient toasts. Nothing that
  captures focus or floats over the page.
- If a flow seems to want a modal (confirm delete, quick share), prefer an
  inline confirm or a dedicated view. On mobile there is no hover and no
  mouse-dismiss; design for thumbs and the back gesture.
- **The proven shape** (from `blockdoku.523.life`, the maintainer's most
  successful complex PWA): destinations are **separate HTML pages**
  (`index.html`, `settings.html`, …) — the menu navigates, the back button
  is native, and each page loads only its own JS (free code-splitting: the
  browse page never downloads auth). arecipe should adopt page-per-
  destination at the M2/M3 re-plan rather than growing SPA tab state.
- **Updates ask, they don't ambush** (also from blockdoku): when a new
  build is available, show a small "Update available → Update now" toast;
  the user applies it. Belongs to Phase 8b/11 SW update flow.

## Header, nav placement, settings architecture (M2/M3 re-plan inputs)

Patterns lifted from the maintainer's own PWAs (blockdoku + mealplanner),
to be implemented with the page-per-destination restructure:

- **Top bar**: wordmark top-left is always a tap target for home (both
  apps). Quick app controls top-right: theme toggle (one tap, mealplanner's
  sun icon) and a settings gear. Nothing else lives up there.
- **Mobile nav goes to the bottom**: primary destinations render as a
  bottom tab bar on small screens (thumb reach — mealplanner does this),
  top tabs on wide screens. Same destinations, responsive placement.
- **Cookbook is a third top-level destination** (M4/CB3; was "Friends" in 9a):
  Browse · Cookbook · My recipes. Your **Cookbook** is your own recipes plus a
  bounded, chosen **reach** — starter-pack cooks + who you follow on Bluesky +
  your Bluesky followers (Bluesky primitives; there is no arecipe-native friend
  record anymore). The page shows your cookbook members (with a source badge)
  and their recipes as a read feed. It also answers `cookbook.html?did=<did>` as
  a shareable, signed-out **cold-view** of any account's cookbook — the same
  page-not-modal, real-URL discipline as `recipe.html?u=`. The legacy
  `friends.html` redirects here (query preserved). Browse stays broader and
  zero-auth; the Cookbook is "my-people's-kitchen."
- **Signed-in landing → Cookbook** (CB3.1): a signed-in visitor arriving at the
  home entry (typed URL, PWA launch, external link — anything without an in-app
  referrer) is sent to their Cookbook; everyone else lands on Browse. Browse
  keeps its zero-auth guarantee — the signal is a localStorage "session hint"
  written by the auth boot flow (`src/auth/session-hint.ts`) and read by a
  pre-paint inline script in `index.html`, never the auth client. Clicking the
  Browse tab (an in-app, same-origin referrer) is exempt, so Browse stays
  reachable while signed in.
- **Sign-in is its own page** (`signin.html`): authentication is a distinct
  task with a distinct mental model, so it gets a dedicated document rather than
  a section on My recipes — enter a handle, sign in via atproto OAuth, land in
  the app (forwards to Cookbook on success). Every signed-out "Sign in"
  affordance (nav top-right, the Cookbook gate, the Account note, the My recipes
  pointer) points here. **My recipes stays account-free for drafting**: signed
  out it shows New recipe + local Drafts plus a short pointer to `signin.html`,
  not a login form. The OAuth callback (`?code=…`) round-trips back to the page
  that initiated it, so `signin.html` is the registered `redirect_uri`
  (`client-metadata.json` on the hosted origin; derived per-page on loopback)
  and completes its own callback. Read-only mirror origins, where no OAuth
  client can exist, show a terminal "unavailable here" note instead of a
  pointer.
- **Comments live on the recipe page** (M4/9b), below the recipe, threaded
  (reply nests under parent). Discovery is **cookbook-scoped** — you see the
  recipe author's, your own, and your cookbook's comments; there is no backend
  to index everyone's, and that is the honest boundary. Author names link to
  Bluesky profiles; a comment made on an older recipe revision carries a quiet
  "on an earlier version" marker (silent-good / loud-bad). Signed-out is
  read-only with a sign-in pointer; the compose box + reply need a session.
- **"Social" settings panel** (M4/9b) on `settings.html`: viewer-side display
  toggles, off by default. **Hide comments** ships in 9b (skips the comment
  section when on); **Hide likes** lands in 9c with the like interaction, on the
  same panel.
- **Settings split in two, cross-linked** (blockdoku: `settings.html` ↔
  `gamesettings.html`, both linked from index, each links back home and
  sideways):
  - **App management** — the PWA machinery: version/build stamp, update
    check, cache/storage, install, About. arecipe additions: the
    integrity-check explainer and (later) signed-release verification
    live here. The security posture behind these integrity guarantees —
    auth, credential storage, and the CSP/SRI XSS defense — is documented
    in [SECURITY.md](SECURITY.md).
  - **Domain settings** — account (sign in/out, handle), display prefs,
    recipe defaults.
- **Native light/dark**: honor `prefers-color-scheme` by default with a
  manual override in the top bar. The token system needs a dark palette
  (enamelware-at-night: deep green-black tile, same enamel/yolk/rust
  hues re-tuned for contrast) — design it at the re-plan, not ad hoc.

## Floors (non-negotiable)

- Focus visible everywhere: 3px `--yolk` outline.
- Contrast: text ≥ 4.5:1 (large display text ≥ 3:1) — the reason
  `--yolk-deep` exists.
- `prefers-reduced-motion` respected; motion is at most a 120ms border/color
  ease anywhere.
- Mobile-first: single-column detail below 40rem; touch targets ≥ 40px.
