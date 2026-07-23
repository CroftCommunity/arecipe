# Pictureless recipe tiles → inline chip at single-column widths (RUN-EMPTY-TILE-CHIP)

**Status:** ✅ **Implemented 2026-07-23.** TDD-first (red → green). Gate green:
lint · typecheck (both tsconfigs) · 918 unit (2 new specs) · build · 244
hermetic e2e (6 new: chip at 360/390, band at 768/1024/1280, keyboard focus).

## Owner-review item — resolved: DROPPED

The run's premise ("photo tiles ~16:7, empty placeholder ~3:2, so the empty
state is taller") **does not hold in this repo.** The only aspect-ratios in
`styles.css` are `3 / 2` (`.card-photo`, both photo and empty share it) and
`auto` (banner). Measured photo vs empty media-box height (px): 360→217/217,
390→237/237, 768→239/239, 1024→212/212, 1280→212/212 — **identical at every
width.** There is no 16:7 photo and no taller empty box, so the "multi-column
empty ratio correction" was a no-op against a false premise. **Owner ruled
(2026-07-23): drop it — nothing to correct.** No ratio rule was added; photo
tiles are untouched.

The single-column chip is still justified on its own: it replaces a ~258px
empty media band with a ~72px chip row (see measurement table).

## D0 findings (file paths)

- **Tile render:** one shared DOM builder — `renderCard` (`src/recipes/view.ts`),
  media via `photoWrapEl`/`placeholderEl`. Call sites: Browse
  (`src/pages/browse.ts`), Cookbook (`src/pages/cookbook.ts`), dish compare grid
  (`src/pages/dish.ts` → `renderDishCompare`). The add-cook preview reuses
  Browse's list — no drifted markup, gate not tripped.
- **"has picture" predicate:** `firstImageCid(value) !== null && did !== ''`.
  No image recorded → placeholder at render. Recorded-but-failed-load → runtime
  swap to placeholder via `img` `error` handler; **decision:** that case keeps
  the band (variant decided at render, where a cid exists) — chip only covers
  "no image recorded". Verified visually (404'd thumbnails degrade to band).
- **Breakpoint (D0.4):** the grid is intrinsic —
  `repeat(auto-fill, minmax(15rem, 1fr))` — with **no media query** for its
  column count; the site's `40rem` breakpoint is 2-column there. Gated instead
  via `SINGLE_COLUMN_MEDIA = '(max-width: 32rem)'`, **derived** from the 15rem
  track (2×15rem + gap + `#app` padding ≈ 33rem to fit 2 columns), sitting
  safely below that threshold so the chip appears only when the grid is genuinely
  single-column. Read via `matchMedia` at render time; tests override with
  `RenderOptions.columns`.
- **Shared SVG helper (D0.5):** `src/icons.ts` has no meal/cutlery glyph — the
  placeholder is a **raster PNG theme pair** (`assets/no-meal-{light,dark}.png`).
  So the chip **reuses that existing mark** through a factored `placeholderMarks()`
  helper (band and chip share one source — honoring the anti-duplication intent),
  not an SVG helper that doesn't exist.
- **Test setup (D0.6):** vitest + `happy-dom` (per-file), Playwright present.
  Both Phase-1 DOM assertions and Phase-3 visual checks automated.
- **Accessible name (D0.7):** comes from the title text (`img alt=""`
  contributes nothing). Removing the image does not regress it; chip glyph is
  `aria-hidden`.

## Measurement (360px, alternating photo/pictureless feed)

| Metric | Before | After |
| --- | --- | --- |
| Height of one pictureless tile (px) | 258 | 72 |
| Height of one photo tile (px) | 258 | 258 (unchanged) |
| Tiles fully visible in 800px viewport | 2 | 4 |
| Scroll distance to reach the 10th recipe (px) | 2492 | 1724 |

Multi-column empty tile height @1024px: 212px before **and** after (ratio item
dropped; unchanged).

## `align-items` finding (Phase 2)

`.recipe-grid` sets no `align-items` (default `stretch`). **`align-items: start`
is NOT required:** the chip applies only at single-column (one tile per row, so
stretch is moot), and at multi-column photo and empty tiles are equal height
(measured identical), so nothing stretches back out. Not added.

## Rollback (both verified)

1. Delete the `.tile-chip*`/`.card--chip` CSS block and make `tileMediaVariant`
   never return `'chip'` → pictureless tiles revert to today's band markup at
   every width (verified: byte-identical band snapshot; CSS is additive, only
   matches `.card--chip` which then never appears).
2. Ratio rule — never added (owner dropped it). Nothing to revert.
