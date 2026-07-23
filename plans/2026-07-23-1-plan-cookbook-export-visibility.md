# Cookbook export button — opt-in visibility via a Settings toggle

**Status:** ✅ **Implemented 2026-07-23.** TDD-first (red → green): the
`createCookbookPrefs` unit spec failed on the missing module, then went green on
the real module; the existing cookbook-share e2e (which pinned the
always-visible button) was rewritten to opt in, and a hidden-by-default e2e was
added alongside a Settings-toggle e2e. Gate green locally: lint · typecheck
(both tsconfigs) · unit (3 new) · build · e2e (`cookbook-share`, `settings`,
`mobile-fit`, `cookbook` — 3 new, all passing).

## What & why

The export/share affordance beside the "Cookbook" title (the ↑ icon, wired by
`mountCookbookShare` → `renderShareButton`) was always shown. Owner request:
hide it by default and let people opt in from a new **Cookbook** section on the
Settings page. Framed to the user as "export" (their wording); it is the same
share button internally.

## Changes

- **`src/social/cookbook-prefs.ts`** (new) — `createCookbookPrefs()` exposing
  `showExport()`/`setShowExport()`, localStorage key `cookbook-show-export`,
  **default OFF** (button hidden). Same defensive `try/catch` posture as
  `social/prefs.ts` — private-mode storage failure degrades to the default,
  never throws. Injectable `{ storage }` for tests.
- **`src/pages/cookbook.ts`** — `mountCookbookShare` early-returns unless
  `createCookbookPrefs().showExport()`, so both mount sites (cold-view and
  signed-in own view) are gated at one point.
- **`src/pages/settings.ts`** — new "Cookbook" section (testid
  `cookbook-settings`) with a **"Show export"** checkbox (testid
  `cookbook-show-export`), placed after Social in the section order.

## Tests

- `tests/unit/social/cookbook-prefs.spec.ts` (new): default-off, persistence
  across re-creation, private-mode degradation.
- `tests/e2e/cookbook-share.spec.ts`: the wiring test now sets the pref before
  load (opt-in); a new test asserts the button is absent by default.
- `tests/e2e/settings.spec.ts`: new test — the toggle starts unchecked (no
  stored pref), checking it persists `'1'`, and the choice survives a reload.

## Notes

- No lexicon/record shape change; this is a viewer-side localStorage pref only.
- The button is internally the cookbook **Share** button; the UI copy matches
  the user's "export" wording. If the copy should read "Show share" instead,
  it's a one-line change in `settings.ts`.
