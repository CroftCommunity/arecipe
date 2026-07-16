# Cookbook: one filter line, share icon, shared-cookbook banner

**Status:** ✅ **Implemented 2026-07-16** (same day), TDD-first red → green.
Gate green: lint · typecheck (both tsconfigs) · 541 unit · build · **185**
hermetic e2e (browser via the CLAUDE.md `executablePath` override — the
environment ships chromium-1194, the pin expects 1228). The three new e2e
specs + the underline guard were red-verified against the pre-change tree
(`git stash` → build → 4 failed → pop), since the browser mismatch had masked
the initial red run. Visual check: 390px screenshot of the shared view
(banner + ✕, share icon beside the heading, one filter line) over the
cookbook.spec fixtures.

Planned 2026-07-16, from owner mobile screenshot feedback
(cookbook.html @ ~390px). Four asks, one page:

1. **All filtering on one line (mobile-first).** Put the Filters ▾ disclosure on
   the same row as the Mine | Liked | Both source control, to its right. The row
   below keeps the Tiles | Details picker, the reset control (when present), and
   the honest count.
2. **De-underline "New Recipe".** The title-row builder link shows the UA anchor
   underline; buttons shouldn't.
3. **Share icon on the title row.** A share **icon** to the right of the
   "Cookbook" heading that opens the native share sheet on mobile
   (`navigator.share`) or copies a shareable cookbook URL on desktop — "share
   your cookbook in its entirety", like published meal plans.
4. **Shared-cookbook view banner.** Opening someone else's shared cookbook shows
   a banner across the top, under the site banner: *"Viewing \[user\]'s shared
   cookbook"* — \[user\] = their Bluesky handle, linked to their Bluesky
   profile — with an ✕ on the banner's right that takes you back to your own
   cookbook (same page path, so the ✕ is the way "back in place").

## Phase 0 — grounding (what already exists)

- **The shareable URL already exists.** `cookbook.html?did=<did>` is the public
  cold-view (src/pages/cookbook.ts `main()`), and
  `buildCookbookShareUrl(origin, did)` (src/share/urls.ts) builds the canonical
  link — the share-affordances run (RUN-SHARE-SUMMARY.md) shipped a **text**
  "Share" button on both the own view (your DID) and the cold-view (the viewed
  DID) via `mountCookbookShare`. So ask 3 is a **re-skin to an icon**, not new
  plumbing; no new params are needed — the "user id + cookbook param" is `?did=`.
- **`renderShareButton`** (src/share/button.ts) already branches
  `navigator.share` (mobile sheet) vs clipboard + "Copied" flash — exactly the
  requested mobile/desktop behavior. Keep the behavior, add an icon variant.
- **Toolbar rows** (src/recipes/toolbar.ts, D7): row 1 search, row 2 source slot
  (Cookbook mounts Mine|Liked|Both), row 3 view toggle + Filters ▾ + count block
  (reset icon + status). Ask 1 moves Filters ▾ from row 3 to row 2 — on the own
  cookbook only. Browse has no source row and is untouched; the **cold-view**
  cookbook mounts no source control, so it also keeps Filters on the controls
  row (this preserves the cookbook.spec "≤3 toolbar rows @390px" guard, which
  runs against the cold view).
- **Handle resolution is free.** The cold-view already calls
  `resolveDidDoc(viewedDid)` for the PDS; the same `DidFacts` carries
  `handle` (from `alsoKnownAs`). No extra network call for the banner.
- **Glyph precedent:** icons.ts pins geometry in exported constants
  (Lucide marks), tested by tests/unit/icons.spec.ts; `.reset-icon-btn` is the
  icon-button CSS idiom (≥44px hit area, currentColor stroke).
- **Banner precedent:** `.preview-demo-banner` (slim full-width strip) and the
  Meals shared view (`meals.html?mealplan=…&user=…`) — the cookbook cold view is
  the same "shared document" idiom, it just never had a labeled banner.

## Decisions

- **D1 — Filters joins the source row via a toolbar option.**
  `renderToolbar({ filtersInSourceRow: true })` mounts the Filters ▾ disclosure
  at the end of the source row; the page's source control mounts into an inner
  `sourceSlot` that precedes it (so DOM/tab order is segmented → Filters).
  Default (false) keeps today's structure — Browse and the cookbook cold-view
  pass nothing. Cookbook passes `viewer !== undefined` (own view only). Row 3
  becomes view toggle + count block (reset + count) on the own view.
- **D2 — underline dies at the `.button` base rule.** `text-decoration: none`
  on `.button` fixes every anchor-styled-as-button (cookbook "New Recipe",
  Alchemy "New") in one place; `<button>` elements are unaffected.
- **D3 — icon share = a variant of the one share control.**
  `renderShareButton({ …, icon: true })` renders the Lucide **"share"** mark
  (tray + up arrow — the platform-neutral "send it out" glyph) instead of a text
  label, class `.share-icon-btn` mirroring `.reset-icon-btn` (enamel, ≥44px hit
  area). Geometry pinned in icons.ts constants. The clipboard confirmation
  stays a transient **"Copied"** text swap (test-visible, screen-reader-visible
  via the same content swap idiom). recipe.html keeps the labeled variant.
  The cookbook mounts the icon variant beside the heading in a
  `.cookbook-title-group` (heading + share left, "New Recipe" pushed right).
- **D4 — the shared view is the same page path** (`cookbook.html?did=`), no new
  page. The banner replaces the bare `Cookbook of <did>` status line and mounts
  at the top of the content panel, under the site banner:
  `Viewing <handle>’s shared cookbook`. The handle paints as the DID first and
  upgrades to the handle when the DID doc resolves; it links to
  `https://bsky.app/profile/<handle||did>` (bsky.app accepts both),
  `target=_blank rel=noopener`.
- **D5 — ✕ close = a link to `./cookbook.html`,** shown **only when a session
  hint exists** (`hasSessionHint()`): signed-in users get "back to your own
  cookbook in place"; signed-out visitors have no own cookbook (bare
  cookbook.html bounces them to Browse), so they get no ✕. `aria-label`
  "Back to your cookbook", ≥44px hit area, right-aligned on the banner.

## TDD order (red → green)

1. **Unit — icons.spec.ts:** share glyph constants + `shareIcon()` (aria-hidden,
   currentColor, no fill, pinned geometry, fresh node per call).
2. **Unit — toolbar.spec.ts:** `filtersInSourceRow: true` puts `filters-dd` in
   `.toolbar-row--source` (and NOT in `--controls`), with page-mounted source
   content ordered before it; default keeps today's placement.
3. **E2E — cookbook-share.spec.ts:** the cold-view share control is icon-only
   (contains an `svg`, no "Share" text), keeps `data-copy` = canonical URL,
   aria-label, clipboard copy + "Copied" flash.
4. **E2E — cookbook.spec.ts:** cold view shows the banner with the resolved
   handle linked to the Bluesky profile; no ✕ without a session hint; with the
   hint, ✕ links to `./cookbook.html`; the old `Cookbook of <did>` line is gone.
5. **E2E — alchemy-status.spec.ts (or nearest mine.html spec):** the
   `a.button` "New" link computes `text-decoration-line: none` (guards ask 2 for
   every anchor-button, incl. the signed-in-only cookbook "New Recipe").
6. **Green:** icons.ts, share/button.ts, recipes/toolbar.ts, pages/cookbook.ts,
   styles.css. Then the full gate (`npm run test`), incl. mobile-fit +
   the cookbook 390px row guard.

## Outcome

Shipped as planned; no decision changed during implementation. Touched:
`src/icons.ts` (share glyph + pinned constants), `src/share/button.ts`
(`icon: true` variant, `.share-icon-btn`), `src/recipes/toolbar.ts`
(`filtersInSourceRow` — composite source row `[inner slot | Filters ▾]`),
`src/pages/cookbook.ts` (title group + icon share, own-view one-line filters,
shared-cookbook banner + ✕), `styles.css` (`.button { text-decoration: none }`,
`.toolbar-source-slot`, `.cookbook-title-group`, `.share-icon-btn`,
`.shared-cookbook-banner`). The cold-view kept default Filters placement, so
the cookbook.spec "≤3 toolbar rows @390px" guard passed untouched. The
own-view one-filter-line layout is structurally guarded by the toolbar unit
spec (own-view e2e needs @live credentials, out of the hermetic tier — same
split as the own-view Share button, per RUN-SHARE-SUMMARY.md).
