# RUN: share affordances (recipe + cookbook)

Adds a one-tap **Share** button to the two URLs that were already shareable but
had no affordance: the recipe detail (`recipe.html?u=<at-uri>[&by=<handle>]`) and
the cookbook cold-view (`cookbook.html?did=<did>`). Buttons only — no new pages,
lexicon records, network calls, origins, CSP entries, or dependencies.

Branch: `claude/run-share-affordances-tvjkeu` (off `main` @ `cb284ad`). TDD-first:
acceptance criteria became failing tests before implementation; the red→green
order and actual outputs are below.

## Phase 0 — findings (where the share params come from)

**Recipe page (`src/pages/recipe.ts`).** The canonical URL params are the page's
own query string:
- `u` (the recipe at-uri) is read in `main()` via
  `new URLSearchParams(window.location.search).get('u')` and threaded down as
  `uri` through `loadRecipe` → `paintVersion`.
- `by` (the author handle) is read inside `loadRecipe`
  (`…get('by')`); the displayed author is `byParam ?? handle ?? did` and is
  threaded as `author`.
- On a **version flip** (`mountVersionFlip` → `flipTo`), the shown `uri` changes
  and `window.history.replaceState` rewrites `?u=…&by=…`. Because the share
  button is (re)mounted inside `paintVersion` — which runs on the initial render
  **and every flip** — it always reflects the version currently on screen.

**Cookbook page (`src/pages/cookbook.ts`).** The viewed cookbook's DID is known in
`main()` in both states:
- **Cold view:** `viewedDid = new URLSearchParams(window.location.search).get('did')`
  — the DID is right there in the URL.
- **Signed-in own view:** `did = agent.did` (after `bootSession()`), i.e. the
  viewer's own DID.
Both flow into `mountCookbookShare(header, did)`.

**Clipboard idiom to mirror.** `src/recipes/view.ts` `quickCopyControl`: the copy
payload rides a `data-copy` attribute (inspectable/testable without the async
Clipboard API), a click reads it and calls `navigator.clipboard.writeText`, and a
successful copy flashes a transient confirmation by swapping the button's own
`textContent`. The Share button reuses exactly this shape.

## Feature-detect approach for `navigator.share`

The button (`src/share/button.ts`) branches on `typeof navigator.share ===
'function'`:
- **present** (mobile) → hand off to the native sheet:
  `navigator.share({ title, url })`, rejection/dismissal swallowed.
- **absent** (Playwright, desktop) → the clipboard fallback: `writeText(url)` +
  the transient "Copied" confirmation.

Playwright never exposes a native share sheet, and to make the fallback path
**deterministic** regardless of the engine, both e2e specs `addInitScript(() =>
delete navigator.share)` before load. This is what the task called for ("gate on
`typeof navigator.share`"); no pre-existing share pattern existed to follow.

## Phase 1 (RED) — tests first, actual outputs

**Unit** (`tests/unit/share/urls.spec.ts`) against the intended signatures
`buildRecipeShareUrl(origin, atUri, handle?)` / `buildCookbookShareUrl(origin,
did)` — encode-exactly-once, `by` only when a handle is present, origin passed in
(pure, incl. a subpath base):

```
FAIL  tests/unit/share/urls.spec.ts [ tests/unit/share/urls.spec.ts ]
Error: Cannot find module '../../../src/share/urls.js' …
 Test Files  1 failed (1)
      Tests  no tests
```

**E2E** (`tests/e2e/recipe-share.spec.ts`, `tests/e2e/cookbook-share.spec.ts`):

```
1) tests/e2e/cookbook-share.spec.ts › … copies the canonical cookbook URL (wiring)
   expect(locator).toBeVisible() failed
   Locator: getByTestId('share-cookbook')  — element(s) not found
2) tests/e2e/recipe-share.spec.ts › … copies the canonical recipe URL (wiring)
   expect(locator).toBeVisible() failed
   Locator: getByTestId('share-recipe')    — element(s) not found
  2 failed
```

## Phase 2 (GREEN) — implementation

- `src/share/urls.ts` — pure builders (no globals); each identifier
  `encodeURIComponent`'d once; `&by=` appended only for a non-empty handle.
- `src/share/button.ts` — `renderShareButton({url,title,label,ariaLabel,testid})`
  returns a real `<button type="button">` with `aria-label`/`title`, the URL on
  `data-copy`, the `navigator.share`→clipboard behavior, and the textContent-swap
  confirmation. Also exports `shareOrigin()` (origin + current page directory, no
  trailing slash — bare origin at root, `…/pr-preview/pr-N` under a preview),
  kept out of the pure `urls.ts` because it reads `window`.
- `src/pages/recipe.ts` — mounts `share-recipe` into `.recipe-title-row` inside
  `paintVersion`, URL built from the normalized `uri`/`author` (not echoed raw),
  rebuilt per version.
- `src/pages/cookbook.ts` — `mountCookbookShare(header, did)` mounts
  `share-cookbook` into `.cookbook-header`, called with `viewedDid` (cold view)
  and `agent.did` (own view).

No CSP or `build.mjs` change was needed. The recipe entry bundle stays light
(**13K / 5K gz**) and statically imports no `@atproto/api` — `src/share/*` is
DOM/`navigator`-only, so the split-chunk discipline (recipe.ts's NOTE) holds.

### GREEN outputs

```
# unit
 Test Files  1 passed (1)
      Tests  8 passed (8)

# the two new e2e specs
 ✓ tests/e2e/recipe-share.spec.ts:56:1 › … copies the canonical recipe URL (wiring)
 ✓ tests/e2e/cookbook-share.spec.ts:84:1 › … copies the canonical cookbook URL (wiring)
  2 passed
```

## Phase 3 — full hermetic gate (all green)

```
lint       eslint .                      → clean
typecheck  tsc src + tsc tests           → clean
unit       vitest                        → 455 passed
build      node scripts/build.mjs        → built 2026.07.15-cb284ad (recipe 13K/5Kgz)
e2e        playwright (167)              → 167 passed
```

Playwright note (per CLAUDE.md): this environment's Chromium is `chromium-1194`
while the npm-pinned Playwright expects a newer build, so e2e was run through a
**throwaway** config setting `use.launchOptions.executablePath` to
`/opt/pw-browsers/chromium-1194/chrome-linux/chrome` (not committed; `playwright
install` was not run). CI, with matching browsers, runs the unmodified
`npm test`.

Also ran a real-browser screenshot pass (mobile 390px, light + dark) on both
pages: the recipe Share button wraps to a tidy left-aligned control under the
long title; the cookbook Share button sits right-aligned next to the "Cookbook"
heading. No horizontal overflow (the 320/360/390 `mobile-fit` guard passes).

## Accessibility

Real `<button>`, `aria-label` ("Share this recipe" / "Share this cookbook") plus
matching `title`, inherits the app's `.button` focus-visible styling, and the
confirmation is surfaced through the same textContent-swap the quick-copy control
uses.

## Scoped out (with reason)

- **Cookbook signed-in own-view e2e assertion.** The hermetic cookbook harness
  fakes no session (signed-out visits redirect to Browse; the own feed is
  exercised only `@live`, per `cookbook.spec.ts`). The own-view Share button *is*
  implemented (via `agent.did`) but asserting it requires `@live` — no `@live`
  tests in this run — so only the `?did=` cold-view is asserted hermetically.
  Noted in `tests/e2e/cookbook-share.spec.ts`.
- Out of scope by directive: share previews / OG meta (`docs/PREVIEWS.md`), any
  change to the `?did=`/`?u=` formats, and share buttons on dish/meals/plan pages.

## Files touched

| File | Change |
| --- | --- |
| `src/share/urls.ts` | **new** — pure share-URL builders |
| `src/share/button.ts` | **new** — `renderShareButton` + `shareOrigin` |
| `src/pages/recipe.ts` | mount `share-recipe` in `paintVersion` |
| `src/pages/cookbook.ts` | mount `share-cookbook` in both views |
| `tests/unit/share/urls.spec.ts` | **new** — unit (RED→GREEN) |
| `tests/e2e/recipe-share.spec.ts` | **new** — e2e (RED→GREEN) |
| `tests/e2e/cookbook-share.spec.ts` | **new** — e2e (RED→GREEN) |
| `RUN-SHARE-SUMMARY.md` | **new** — this file |
