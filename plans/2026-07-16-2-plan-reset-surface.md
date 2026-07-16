# Reset surface v2 — surface `reset` + one shared reset icon (Browse, Cookbook, Meals)

**Status:** ✅ **Implemented 2026-07-16.** TDD-first (red → green throughout).
Gate green: lint · typecheck (both tsconfigs) · 518 unit · build (bundle-split
guard intact) · 178 hermetic e2e. Supersedes the unexecuted RUN-RESET-SURFACE
v1 — same visibility fix, shipped together with the shared reset icon so the
control is touched once, not twice.

**Contrast, as measured by the committed guard** (`tests/unit/icons.spec.ts`):
`--rust #b4552d` on `--tile #f4f7f5` = **4.55:1** (light), `--rust #e07a4f` on
`--tile #101b18` = **5.93:1** (dark) — both clear the 3:1 non-text floor. For
the record the guard also confirms the rejected choices: `--yolk` = 2.06:1
(FAIL), `--yolk-deep` = 3.26:1 (borderline). The guard asserts the light-theme
`:root` pair ≥3:1, so a palette drift below it fails the build.

## Problem

The toolbar-unification run put `reset filters` INSIDE the Filters ▾ popover.
With filters active the only visible cue is the badge on a closed disclosure;
clearing takes two taps behind a control the user has no reason to open
(owner-reported, screenshots 2026-07-15).

## Mission

1. Move reset back into sight on Browse and Cookbook (out of the popover, into
   the honest-count block).
2. Replace the text reset controls — the shared toolbar reset and the Meals plan
   reset — with ONE shared reset icon button: a counterclockwise
   arrow-in-a-circle, rust-colored, consistent everywhere something can reset.

## Phase 0 — re-grounding findings (verified against `main` @ b6a1e66)

The run spec (§2/§3) was written against an earlier snapshot. Drift found and
adapted (decisions unchanged, details adjusted):

- **F1 — Meals has ONE reset, not two.** §2 and D5 assume a header reset
  (`reset-plan`) *and* a per-plan variant "~line 1023". In the current tree
  `src/pages/meals.ts` has a single `renderResetControl()` (lines ~1017–1055,
  header, `testid reset-plan`, class `button meals-reset-btn`); the cited
  "~line 1023" IS that one control. No second `meals-reset-btn` exists.
  **Adapt:** swap the single meals reset to the icon helper. "Three text reset
  controls" is really two code sites (shared toolbar reset + one meals reset).
- **F2 — the controller method is `setResetVisible`, not `reflectReset`.** D4
  names `reflectReset(visible)`; the actual `ToolbarController` method is
  `setResetVisible(visible)`, called by `browse.ts:218` + `cookbook.ts:169`.
  "No page API change" is honored by keeping `setResetVisible` — only the
  control's DOM/placement changes, not the API.
- **F3 — no dedicated `.meals-reset-btn` CSS.** The meals reset uses the
  `.button` base; the `.meals-reset` container styles the row. Reset icon
  styling comes from a new shared `.reset-icon-btn` rule.
- **F4 — `.reset-filters-link` styles reset as an underlined enamel link** in
  `.browse-count`; the `.reset-sep` middot class in CSS is unused by current
  toolbar code. Relocation retires `.reset-filters-link` in favor of the icon.
- **F5 — the toolbar module comment** (lines 9–10) claims reset lives in the
  Filters popover; updated on relocation.
- Palette confirmed: `--tile #f4f7f5`, `--yolk #e8a013`, `--yolk-deep #b87d0a`,
  `--rust #b4552d`, `--enamel-soft #175e5414`. Inline-SVG precedent in
  `src/build-stamp.ts` (createElementNS). Browse asserts 2 visible toolbar rows
  (`browse.spec.ts:463`), Cookbook ≤3 (`cookbook.spec.ts:203`).

## Locked design (from the run spec)

- **D1** Counterclockwise arrow-in-a-circle = reset/revert. Clockwise stays
  RESERVED for refresh (the Meals **Resync** shares the header row).
- **D2** New `src/icons.ts` (zero-dep): `resetIcon()` → inline SVG
  (createElementNS, `stroke: currentColor`, `fill: none`, `aria-hidden`,
  viewBox'd); `resetIconButton(label)` → `<button type="button">` with
  `aria-label`+`title`=label containing exactly that svg. All sites consume it.
- **D3** Icon color `var(--rust)` (~4.55:1 on `--tile`, passes non-text 3:1).
  Hover/pressed tint: new `--rust-soft: #b4552d14`. A permanent unit contrast
  guard parses `styles.css`, computes the WCAG ratio, asserts ≥3:1.
- **D4** Toolbar reset moves into `.browse-count` before the honest count,
  becomes `resetIconButton('reset filters')`, keeps `testid reset-filters` and
  the `setResetVisible` contract. Popover loses its copy. Rows: Browse 2,
  Cookbook 3.
- **D5** The (single, per F1) meals reset becomes `resetIconButton('Reset
  plan')`, keeps `testid reset-plan`; confirm flow untouched.
- **D6** ≥44px hit area via CSS padding (glyph ~16–18px); mobile-fit gains
  `reset-filters` (active) + `reset-plan`; aria-label/title via the helper.
- **D7** Responsive-label fallback DEFERRED, not built this run (see Deferred).

## Outcome Summary

| Phase | Outcome | Note |
|---|---|---|
| 0 Re-ground | ✅ | Findings F1–F5 above; decisions unchanged. |
| 1 Icon helper + tokens | ✅ | `src/icons.ts` (`resetIcon`/`resetIconButton`, pinned Lucide rotate-ccw geometry), `--rust-soft` (light+dark), `.reset-icon-btn`; contrast guard + geometry pin in `tests/unit/icons.spec.ts`. |
| 2 Toolbar relocation | ✅ | Reset moved from the Filters popover into `.browse-count` (before the count) as the icon button; `setResetVisible` contract kept (F2). Unit + e2e reverted to prove reset shows without opening `filters-dd`. Rows: Browse 2, Cookbook 3 (unmodified). |
| 3 Meals reset | ✅ | The single meals reset (F1) → `resetIconButton('Reset plan')`, `testid reset-plan` kept; confirm/cancel flow byte-identical; Resync untouched. |
| 4 Mobile + closeout | ✅ | mobile-fit gained two tap-target tests (Browse reset active, Meals reset), both ≥44px; full gate green. |

### Deliberately-changed assertions (enumerated per §1)

- `tests/unit/recipes/toolbar.spec.ts` — the D7 "collapses photos + facets +
  reset behind one Filters ▾" test previously asserted `reset-filters` was
  INSIDE the disclosure. Reversed: reset is now asserted absent from the popover
  and present in `.browse-count` (three new placement/visibility/click tests
  added). Reason: D4 moves reset out of the popover.
- `tests/e2e/browse.spec.ts` (×3) + `tests/e2e/cookbook.spec.ts` (×1) — the
  toolbar-run had these open `filters-dd` before touching `reset-filters`.
  Reverted to assert reset is visible/clickable with the popover CLOSED (a query
  or a closed-popover facet reveals it). Reason: the whole point of v2 — one
  visible tap, not two behind a disclosure.

## Deferred

- **D7 responsive label** (icon + `reset` text ≥480px, icon-only below) — the
  contingency if icon-only tests badly in use. Not built this run.
