# RUN-COOK-FOCUS — run summary

Focus mode → a real cook view: screen wake lock, step-at-a-time instructions,
and a real cook type scale. Additive; entry point / overlay lifecycle / exit
behavior unchanged.

## Phase 0 — Re-ground (locations + findings)

Locations verified in-repo (2026-07-23):

| Thing | Location |
| --- | --- |
| Focus view builder | `src/recipes/view.ts` → `renderFocusView()` (was ~L359) |
| Focus handler | `src/pages/recipe.ts` → `mountFocus()` (was ~L427) |
| `onFocus` option site | `src/pages/recipe.ts` `paintVersion()` → `onFocus: () => mountFocus(entry)`; type in `RenderOptions.onFocus` in `view.ts` |
| `.focus-*` CSS | `styles.css` (`.focus-view`/`.focus-top`/`.focus-cols` ~L1971–2004; `.focus-photo-empty` ~L2740–2750) |
| Vitest config | `vitest.config.ts`; DOM via per-file `// @vitest-environment happy-dom` |
| Playwright config | `playwright.config.ts` (testDir `tests/e2e`, baseURL `127.0.0.1:4173`) |
| Existing hermetic recipe spec | `tests/e2e/recipes.spec.ts` (has a `routeFixtures` helper) |

**Fullscreen-skip comment (verify-in-run, §2).** A source comment DOES explain the
coarse-pointer skip, in `mountFocus`:

> "The overlay IS the focus view; the Fullscreen API is a desktop enhancement.
> Skip it on touch/coarse-pointer devices (iOS Safari has no element fullscreen
> and can be hostile) and guard against a synchronous throw so a fullscreen
> hiccup can never break the button. The overlay already shows."

The `.focus-view` `--paper`→`--tile` comment (§2) is also present verbatim; not
reintroducing an undefined token.

### FINDINGS (contradictions with §2/§3 — recorded, not silently adapted)

- **F1 — no `src/ui/` directory exists.** D1 locks the wake-lock module at
  `src/ui/wake-lock.ts`, tagged `[verify-in-run: correct directory]`. The repo
  currently keeps non-recipe UI utilities *flat* at `src/` (`update-toast.ts`,
  `icons.ts`, `theme.ts`, `nav.ts`, `log.ts`) — there is no `src/ui/`.
  **Decision:** honor the locked D1 path and create a new `src/ui/` directory
  for the wake-lock module. `tsconfig.json` includes all of `src`, esbuild
  bundles by explicit page entrypoints (imported transitively via `recipe.ts`),
  and eslint lints `.` — so a new `src/ui/` needs no config change.

- **F2 — unit-test path in §Phase-1 (`src/ui/wake-lock.test.ts`,
  `src/recipes/step-state.test.ts`) is incompatible with this repo's gate.**
  The runner is `vitest run tests/unit` and `tsconfig.json` includes `src`
  (production config: no `node`/vitest types) — a `*.test.ts` co-located under
  `src/` would (a) not be collected by the unit gate and (b) fail `typecheck`
  and `lint`. **Decision:** place the unit specs under the repo's convention:
  `tests/unit/recipes/step-state.spec.ts` and `tests/unit/ui/wake-lock.spec.ts`.
  Module paths (`src/recipes/step-state.ts`, `src/ui/wake-lock.ts`) are as D1/D3
  specify.

- **F3 — `.test`/`.spec` on §2 e2e path.** §Phase-1 names
  `tests/e2e/focus-cook.spec.ts`; that matches repo convention (`.spec.ts`), so
  no change — recorded only because §Phase-1 uses `.spec` here but `.test` for
  the unit files (F2).

## Phase 1 (RED)

Unit (`vitest run` of the two new specs) — modules absent:

```
 FAIL  tests/unit/ui/wake-lock.spec.ts
Error: Failed to resolve import "../../../src/ui/wake-lock.js". Does the file exist?
 FAIL  tests/unit/recipes/step-state.spec.ts
Error: Failed to resolve import "../../../src/recipes/step-state.js". Does the file exist?
 Test Files  2 failed (2)
```

E2E (`tests/e2e/focus-cook.spec.ts`, hermetic, wakeLock stubbed) — wiring absent:

```
  6 failed
    › entering focus requests a screen wake lock exactly once
    › exiting focus via the Exit button releases the wake lock
    › exiting focus via Escape releases the wake lock
    › the wake-state status is non-empty while the lock is held
    › the wake-state status is empty when the wake lock is unsupported
    › Step Next moves aria-current="step" from the first step to the second
  1 passed  (the "full instruction list survives focus" guard — the current
             overlay already renders every <li>, so it is green from the start)
```

## Phase 2 (GREEN)

Implemented in dependency order: `step-state.ts` → `wake-lock.ts` → focus view
builder → handler wiring → CSS.

Unit (both new modules, and the full suite for regressions):

```
# new specs
 Test Files  2 passed (2)      Tests  13 passed (13)
# full unit gate (no regressions)
 Test Files  82 passed (82)    Tests  854 passed (854)
```

E2E (`focus-cook.spec.ts`, hermetic) and the full hermetic suite:

```
tests/e2e/focus-cook.spec.ts    7 passed
# full hermetic e2e (incl. the pre-existing version-flip focus tests — AC #7)
230 passed
```

`lint` and `typecheck` (both `tsconfig.json` and `tsconfig.tests.json`) clean.

## Phase 3 — Manual device pass

NOT performed — this run executes in a headless CI-style container with no real
touch device. The automatable slice of the wake-lock contract IS covered:

- acquire-on-enter / release-on-exit (both routes) — `focus-cook.spec.ts`.
- backgrounding re-acquires a NEW sentinel; explicit release does not —
  `wake-lock.spec.ts` visibility tests (5, 6), which drive the exact
  `visibilitychange` path a real background/return uses.

The physically-observable checks — screen visibly stays awake 5 min untouched;
background→return restores the lock; exit restores normal sleep — remain PENDING
human verification. Because of the iOS 18.4 Home-Screen-PWA distinction (§2),
that pass must record: device, OS version, browser, and installed-PWA vs tab.

## Phase 4 — Gate + files touched

**Files touched**

- `src/recipes/step-state.ts` (new) — pure step reducer (D3).
- `src/ui/wake-lock.ts` (new) — `createScreenWakeLock()` (D1). New `src/ui/` dir (F1).
- `src/recipes/view.ts` — `renderFocusView` gains the wake-state line (D2) and
  step-at-a-time instructions (D3); signature adds optional `wakeLock`.
- `src/pages/recipe.ts` — `mountFocus` creates the lock, acquires on enter,
  releases on every exit route.
- `styles.css` — `.focus-*` block: `--cook-size` scale + `line-height` (D4),
  `overscroll-behavior: contain` (D5), wake-state + step styles.
- `tests/unit/recipes/step-state.spec.ts`, `tests/unit/ui/wake-lock.spec.ts`,
  `tests/e2e/focus-cook.spec.ts` (new).

**Gate note.** Per this repo's CLAUDE.md, `npm test`'s e2e step fails in this
environment on the Playwright browser-pin mismatch, not on code. E2E was run
through the documented throwaway `pw-local.config.ts` (pointing at
`/opt/pw-browsers/chromium-1194`), then removed (never committed). The other
sub-gates (`lint`, `typecheck`, `test:unit`, `build`) were run directly and pass.

**Scoped out (per §6, unchanged):** step-position persistence; ingredient
check-off / timers / unit conversion / servings; any NoSleep.js-style
video-loop fallback (unsupported browsers degrade silently); the fullscreen
guard and touch-fullscreen (untouched); voice / screen-reader step announcements
beyond `aria-current`. A `100dvh` rewrite for address-bar collapse (D5
verify-in-run) was NOT attempted — that check needs a real iOS device and is
part of the pending Phase 3 pass.

## Phase 3 — Manual device pass

<!-- device / OS / browser / PWA-vs-tab + results -->

## Phase 4 — Gate + files touched

<!-- final gate output, files, scope-outs -->
