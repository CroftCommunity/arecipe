# Mobile enhancement pass — fix the Focus bug + a jankiness sweep

**Status:** ✅ **Objective fixes shipped 2026-07-10**; subjective device polish
(tap-target sizing) deferred pending real-device review (per Phase 0 / OQ4).

## Outcome Summary

| Track / Phase | Outcome | Note |
|---|---|---|
| 0 Discovery | ✅ | Focus root cause found by static analysis: `.focus-view { background: var(--paper) }` — `--paper` is an **undefined token with no fallback**, so the overlay rendered transparent and the page bled through (the "errors out" report). Overflow catalog via `mobile-fit.spec.ts` at 320/360/390: only **settings** overflowed. |
| A Focus fix | ✅ | Opaque themed background (`var(--tile)`) + safe-area padding on `.focus-view`; `mountFocus` now skips the Fullscreen API on coarse-pointer/touch devices and guards a synchronous throw (the overlay is the reliable mechanism). Mobile e2e asserts an opaque, error-free overlay. |
| B Overflow sweep | ✅ | `.draft-row` (Settings "Hidden recipes" — a raw ULID + Unhide) overflowed because it was a no-wrap flex row with an unbreakable token. Fixed: `flex-wrap` + `min-width:0` + `overflow-wrap:anywhere`. The reference-table scroll fix (prior commit) verified clean. `mobile-fit.spec.ts` (27 checks across 9 pages × 3 widths) is the standing regression guard. |
| 4 Tap targets / subjective | ⏸️ Deferred | Per the plan's own posture: subjective "reads right" and comfortable tap-target judgments need real-device review (unavailable in this environment). Objective overflow/opacity invariants are guarded; sizing polish is a follow-up with a phone in hand. |



## Problem Statement

On mobile the app has accumulated rough edges. Two concrete reports:

1. **The "Focus" button errors out on mobile.** On a recipe page, tapping
   ⛶ Focus (full-screen cook view) fails rather than opening the distraction-free
   overlay.
2. **General jankiness** — misaligned elements and layout that doesn't sit right
   on small screens, across multiple pages.

There is no single owner for "does this look right on a phone"; layout is
mobile-first in `styles.css` but has drifted as features landed (the meal
planner, cookbook source/toolbar row, reference tables, recipe detail). This
plan makes a deliberate mobile pass rather than one-off patches.

## Approach

Two tracks: a targeted bug fix (Focus) and a systematic audit.

### Track A — Focus button (targeted)

Current code (`src/pages/recipe.ts` `mountFocus`) appends a full-viewport
`.focus-view` overlay to `<body>`, then *also* calls
`overlay.requestFullscreen?.()`. The overlay is the real UI; the Fullscreen API
is an enhancement.

Likely mobile failure modes to verify in Phase 0:

- **iOS Safari** does not support the Fullscreen API on arbitrary elements (only
  `<video>`); `element.requestFullscreen` is often `undefined` (so the optional
  call is skipped) — but some engines expose a `webkitRequestFullscreen` that
  *rejects or throws* under a non-video element, and any synchronous throw here
  is uncaught if it isn't a promise.
- The overlay may render but be visually broken: `.focus-view` z-index vs. the
  bottom tab bar, `position`/height on mobile viewports, or the overlay not
  covering the notch/safe-area — reading to the user as "errored out."

Fix direction: treat the overlay as the sole mechanism on touch/mobile (feature-
detect and skip Fullscreen where it isn't genuinely supported), guard the request
call so a synchronous throw can't escape, and verify the overlay covers the
viewport (including safe-area insets) with the exit control reachable.

### Track B — Jankiness audit (systematic)

Sweep each page at representative phone widths (320, 360, 390 px) and catalog
misalignments, overflow, and cramped controls. Candidate hotspots already known:

- **Reference grid tables** — addressed in the 2026-07-10 UI pass (`.ref-scroll`
  horizontal scroll); confirm it reads well on device.
- **Cookbook** — the new source + toolbar single row (`.browse-controls` with the
  prepended source segment) and the `.cookbook-header` title/New-Recipe row:
  verify wrap behavior at 320px.
- **Meal planner** — 7-column week grid + calendar (`.week-days`, `.cal-days`),
  the palette pager row, and the `.week-actions` (Add / Repeat) buttons.
- **Recipe detail** — the new `.detail-footer` (provenance + Hide) and
  `.section-head` (heading + quick-copy) rows at narrow widths.
- **Nav** — the 5-tab bottom bar (a prior 5-tab overflow was fixed once; re-check
  after layout churn).
- **Tap targets** — buttons/links meeting a ~44px minimum; segmented controls and
  pager arrows are small.

Deliver as small, independently-verifiable CSS fixes, each with a Playwright
viewport assertion where a regression is cheap to guard (the meals nav-fit
assertion at 360px is the existing template).

## Reasoning

- **Why separate the Focus fix from the sweep?** The Focus bug is a concrete
  defect with a likely root cause; it shouldn't wait behind a broad audit. The
  sweep is open-ended and benefits from a catalog-then-fix rhythm.
- **Why feature-detect rather than force Fullscreen?** The overlay already works
  without the API; the API is a progressive enhancement. On platforms where it's
  absent or hostile (iOS), the enhancement should simply not fire — never error.
- **Why viewport assertions instead of visual review only?** Layout regressions
  recur as features land. A cheap width-fit assertion (does the tab bar fit at
  360px, does a row not overflow) catches the class of bug that keeps returning,
  without the flакiness of pixel snapshots.
- **Why phone-width breakpoints 320/360/390?** 320 is the small-Android/older-iPhone
  floor, 360 the common Android, 390 the modern iPhone — covering these covers
  the bulk of real devices without chasing every size.

## Open Questions

- **OQ1 — repro surface for the Focus error.** Is it a thrown JS error (console)
  or a visually-broken overlay? Phase 0 must reproduce on a real device / mobile
  emulation and read the console before choosing the fix. Do not fix blind.
- **OQ2 — safe-area insets.** Do we adopt `env(safe-area-inset-*)` for the
  overlay and the bottom tab bar (notch / home indicator), or is that out of
  scope for this pass?
- **OQ3 — scope boundary.** Is this "fix reported breakage + obvious
  misalignment," or a broader responsive redesign? Leaning: the former —
  targeted fixes, not a redesign.
- **OQ4 — regression guardrails.** How much Playwright viewport-assertion
  coverage is worth it vs. manual device review? Leaning: assert only the
  overflow/fit invariants that have regressed before.

## Phase sketch (each phase leaves the suite green)

0. **Discovery / repro** — reproduce the Focus error under mobile emulation
   (device toolbar) and on a real phone if possible; capture the console; walk
   each page at 320/360/390 and catalog misalignments into a checklist. Answer
   OQ1–OQ3.
1. **Focus fix** — feature-detect Fullscreen, guard the request, ensure the
   overlay is the reliable path and covers the viewport (safe-area if OQ2 says
   so). Hermetic e2e: Focus opens the overlay and Exit/Esc closes it (already
   partially covered — extend for the mobile viewport).
2. **High-traffic pages** — recipe detail, cookbook, meals: fix the catalogued
   misalignments; add width-fit assertions where a regression is cheap to guard.
3. **Remaining pages** — browse, account, settings, reference, editor, signin:
   same treatment.
4. **Tap-target + polish** — bump undersized controls to a comfortable minimum;
   final device walkthrough against the Phase 0 checklist.

## Test posture

- Focus behavior: hermetic Playwright with a mobile viewport
  (`page.setViewportSize`) — overlay opens, Exit/Esc closes, no console error.
- Layout invariants: targeted Playwright viewport assertions (fit/overflow),
  following the existing 360px meals nav-fit assertion; avoid pixel snapshots.
- Manual device review against the Phase 0 catalog for the subjective "reads
  right" judgment CSS assertions can't make.
