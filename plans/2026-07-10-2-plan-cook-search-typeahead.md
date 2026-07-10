# Cook-search typeahead (Browse + Meals add-a-cook)

**Status:** Closed (on branch `feat/cook-search-typeahead`, worktree). All 4
phases shipped; nothing skipped or deferred. Rebased onto the updated main
(`e714600`) after a concurrent agent landed work there — only `styles.css`
conflicted (both blocks kept); `browse.ts`/`meals.ts`/`TODO.md` auto-merged.
Full gate re-run green on the rebased tree: lint · typecheck · 322 unit · 109
e2e. Not yet pushed (awaiting user).

## Outcome Summary

| Phase | Outcome | Commit | Note |
|-------|---------|--------|------|
| 1 — actor-search data module | ✅ SHIPPED | `27d7184` | AppView typeahead query → suggestions; soft-degrade; 11 unit tests. |
| 2 — typeahead UI component | ✅ SHIPPED | `9c07674` | Debounced a11y listbox; generation guard; avatar; 10 unit tests. Visual smoke → Phase 3 live run. |
| 3 — wire into Browse | ✅ SHIPPED | `801822c` | runFind() shared by submit + pick; e2e wiring green; Browse+CSP 39 green. |
| 4 — wire into Meals | ✅ SHIPPED | `8dce493` | addCookByHandle() shared by Add button + pick; e2e wiring green; Meals 8 / e2e 109 green. |

## Problem Statement

To find a cook's recipes today you must type their **exact** Bluesky handle into
the Browse search box (`src/pages/browse.ts:44`, placeholder "a cook's handle —
try rdur.dev") and the Meals palette add-a-cook input (`src/pages/meals.ts:131`).
If you don't already know the handle, there is no way in. From the originating
transcript:

> "you have to know someone's username to look at and see if they have recipes
> associated. … a client side library can't pull thirty eight million accounts.
> I'm just wondering if there was, like, a built-in utility to do this."

The friction is real: arecipe is a public-read, zero-backend PWA (Browse ships
**no auth code** — enforced by the bundle-split e2e test), so we cannot build a
server-side account index, and we cannot ship a client-side index of the whole
network.

There **is** a built-in utility: Bluesky's AppView exposes
`app.bsky.actor.searchActorsTypeahead`, a public, CORS-open, unauthenticated
prefix-search over actors. We delegate the prefix match to the AppView instead
of indexing anything ourselves. This plan adds a typeahead affordance to both
handle inputs, backed by that endpoint.

## Reasoning

**Why the AppView endpoint, not client-side indexing.** The transcript's own
framing is correct — a browser cannot hold 38M accounts. The AppView's
`searchActorsTypeahead` is purpose-built for exactly this (it powers Bluesky's
own composer/mention typeahead). It is served from `https://public.api.bsky.app`,
the same origin arecipe's resolver already uses as its default
`handleResolver` (`src/identity/resolve.ts:45`), so it needs no new trust
dependency and no CSP change (the origin is already in the connect-src
allowlist asserted by `tests/e2e/csp.spec.ts:25`).

**Why a two-layer split (data module + UI component).** The codebase already
separates I/O modules (factory functions taking injectable `fetchFn`/deps —
`createResolver`, `createRecipeReader`) from page wiring. Following that seam:
- `actor-search.ts` — pure-ish data module: query string → suggestion list.
  Fetch-mockable in unit tests exactly like `resolve.spec.ts`.
- `actor-typeahead.ts` — a reusable UI attachment: given an `<input>` and a
  `search` function, it manages debounce, an accessible listbox dropdown,
  keyboard navigation, and selection. Both mount points (Browse, Meals) attach
  it to their existing inputs; neither reimplements the interaction.

**Why suggestions degrade soft while the submit still fails loud.** CLAUDE.md
mandates fail-loud, no silent fallbacks *unless the fallback behavior is
explicitly defined*. Here it is defined deliberately:
- The **typeahead suggestion path** is an ambient enhancement fired on every
  keystroke. A transient network hiccup must not error the page or block typing.
  On any fetch/HTTP error it logs `log.warn` and yields **no suggestions** — the
  user can still type a full handle and submit. This mirrors the existing
  degrade pattern in `meal-plan-palette.ts` `collect()` (a failed source
  contributes nothing, logged, never blanks the palette).
- The **"Find recipes" submit path** is unchanged and still fails loud, surfacing
  the resolver's message in the status line (`browse.ts:371-375`).
This split is a design decision, not an oversight; each behavior gets a test.

**Why not a free-text recipe/dish search.** Out of scope and impossible without
an AppView index we don't run — `meal-plan-palette.ts:9-11` already records this.
This plan is strictly cook (actor) discovery, which the AppView *does* index.

**Alternatives considered and rejected:**
- *Bundle a client-side account index* — rejected: infeasible at network scale
  (the transcript's own conclusion).
- *Stand up our own AppView/indexer* — rejected: violates the zero-backend
  constraint; enormous ops cost for a discovery affordance.
- *`searchActors` (the full, paginated search) instead of `searchActorsTypeahead`*
  — rejected for the input affordance: typeahead is lower-latency and
  purpose-shaped for per-keystroke use. (A future "see all results" page could
  use `searchActors`; noted as out of scope.)
- *One combined actor+UI module* — rejected: couples fetch logic to DOM, hurts
  unit testability against the established `fakeFetch` pattern.

## Verified Assumptions

- **Endpoint shape** (probe, 2026-07-10):
  `GET https://public.api.bsky.app/xrpc/app.bsky.actor.searchActorsTypeahead?q=recipe&limit=3`
  → `200`, body `{ "actors": [ { "did", "handle", "displayName", "avatar",
  "associated", "labels", "createdAt" }, ... ] }`. `displayName` and `avatar`
  are present on real results but are **optional** in the lexicon — the mapping
  must treat them as possibly-absent.
- **CORS** (probe): response carries `access-control-allow-origin: *`; no auth
  header required. Callable from a public client.
- **CSP**: `https://public.api.bsky.app` is already in the connect-src allowlist
  asserted by `tests/e2e/csp.spec.ts:25` (the resolver uses the same origin). No
  manifest/CSP change needed. *Phase 3's csp.spec run confirms this holds.*
- **Existing mount points** (read): Browse input `browse.ts:42-48`
  (`data-testid="handle-input"`, submit resolves→reads); Meals add-a-cook
  `meals.ts:126-137` (`data-testid="palette-handle-input"`, `palette-handle-add`
  button → `loadHandlePalette`).
- **Unit test convention** (read `tests/unit/identity/resolve.spec.ts`): Vitest,
  a local `fakeFetch(routes)` helper injected via the module's `fetchFn` option;
  fixtures under `tests/fixtures/`.
- **E2e network mocking** (read `tests/e2e/*.spec.ts`): Playwright
  `page.route('https://public.api.bsky.app/**', route => route.fulfill(...))`;
  `-live.spec.ts` variants hit the real network, `.spec.ts` variants are mocked.
- **jsdom timers**: Vitest supports `vi.useFakeTimers()` for debounce tests
  (used elsewhere in the suite — confirm in Phase 2 before relying on it).

## Documentation Impact

- `TODO.md` — the "Cook-search typeahead" idea item (added this session) points
  here; **Phase 4** (the final phase) marks it done once both mount points ship.
  (Consolidated to Phase 4 only — Pass 3 — so Phases 3/4 write-sets stay
  disjoint.)
- `docs/DESIGN.md` — add one line under the identity/discovery discussion noting
  Browse and Meals use `searchActorsTypeahead` (public AppView) for cook
  suggestions, with the soft-degrade contract. Handled in **Phase 3** (the phase
  that makes the discovery story real).
- `docs/LEXICONS.md` — **no change**: it registers arecipe's *own* NSIDs;
  `app.bsky.actor.searchActorsTypeahead` is a *consumed* Bluesky lexicon, not one
  we define. (grepped `docs/LEXICONS.md` — it lists only `app.arecipe.*` /
  consumed-record NSIDs; a consumed *query* method has no entry there.)
- Grepped for other cross-references to the Browse handle input / add-a-cook:
  none outside `browse.ts`, `meals.ts`, and their specs.

## Concurrency Map

Sequential spine: Phase 1 → Phase 2 → Phase 3 → Phase 4

Phases 1 and 2 have a strict data→UI dependency (2 imports 1's type/function).
Phase 3 depends on 2. Phase 4 also depends only on 2.

Parallel set {Phase 3, Phase 4} — *available but not required*:
- Disjoint write-sets: Phase 3 writes `src/pages/browse.ts` + `docs/DESIGN.md`
  + `tests/e2e/browse.spec.ts`; Phase 4 writes `src/pages/meals.ts` +
  `tests/e2e/meals.spec.ts` + `TODO.md`. No overlap. (Pass 3 moved the
  `TODO.md` edit out of Phase 3 into Phase 4 to remove the one shared file.)
- Shared-state contract: both only import the Phase 2 component (read-only);
  neither mutates shared modules or `styles.css` (dropdown CSS lands in Phase 2).
  No git/process/port state touched beyond the working tree.
- Re-entry verification: if run in parallel worktrees, confirm parent-repo HEAD
  unchanged from pre-dispatch SHA and `git status` clean in the main worktree.

Given the small size, default execution is **sequential** (3 then 4); the
parallel option is documented only to satisfy the "was parallelism considered"
requirement. Phase 4 is PHASE-GATED (see Open Questions) — Browse is the
user-named target; Meals reuse is a bonus that can ship in the same branch or be
deferred.

## Phases

### Phase 1: Actor-search data module — ✅ SHIPPED (`27d7184`)

**Goal:** A fetch-mockable module that turns a query string into a list of actor
suggestions from the AppView, degrading soft on error.

**Changes:**
- [ ] `src/identity/actor-search.ts` — `createActorSearch(options?: {
      appView?: string; fetchFn?: typeof fetch })` returning
      `async (query: string, opts?: { limit?: number; signal?: AbortSignal }) =>
      ActorSuggestion[]`. `ActorSuggestion = { did: string; handle: string;
      displayName?: string; avatar?: string }`. Trims query; returns `[]` for
      queries shorter than a min length (2). Calls
      `${appView}/xrpc/app.bsky.actor.searchActorsTypeahead?q=…&limit=…`
      (`appView` default `https://public.api.bsky.app`). Maps `actors[]` →
      `ActorSuggestion` dropping absent `displayName`/`avatar`. On non-ok HTTP,
      thrown fetch error, or `AbortError`: `log.warn('identity', …)` and return
      `[]`. On a successful search, `log.debug('identity', 'actor search', {
      qlen: query.length, count })` so a "no suggestions" report is diagnosable
      (mirrors `resolve.ts`'s step-by-step debug tracing; debug level keeps the
      per-keystroke volume gated). Passes `opts.signal` to fetch for cancellation.
- [ ] `tests/unit/identity/actor-search.spec.ts` — behavior (test-first / RED
      before the module): maps a multi-actor response to suggestions (with and
      without displayName/avatar); **min-length boundary** — a 1-char query
      returns `[]` and does **not** fetch, a 2-char query **does** fetch (assert
      via the fake fetch being called / not called), empty and whitespace-only
      likewise no-fetch; returns `[]` and warns on HTTP 500; returns `[]` on a
      thrown network error; forwards `limit`; passes the abort signal through to
      fetch. Uses the `fakeFetch(routes)` pattern from `resolve.spec.ts`.
- [ ] `tests/fixtures/identity/searchActorsTypeahead-cooks.json` — a recorded
      response captured via the verified probe (real shape, trimmed to ~3
      actors, at least one lacking `displayName`/`avatar`).

**Call chain:** (data module — no entry point yet) Phase 2's `attachActorTypeahead`
will call this; Phase 3/4 construct it. Verified reachable by Phase 2's wiring.

**Wiring test:** N/A at this layer (pure I/O module). Its reachability is proven
by Phase 2's component test calling the real function, and by Phase 3's e2e.

**Depends on:** nothing.
**Read-set:** `src/log.ts`, `src/identity/resolve.ts` (for the appView default
convention only).
**Write-set:** `src/identity/actor-search.ts`,
`tests/unit/identity/actor-search.spec.ts`,
`tests/fixtures/identity/searchActorsTypeahead-cooks.json`.
**Shared-state contract:** none beyond the file write-set.
**Risks:** over-mapping optional fields; forgetting the min-length short-circuit
(would fire a fetch on every single keystroke). Both covered by tests.
**Done when:**
1. **Behavioral:** `createActorSearch` returns mapped suggestions for a valid
   query and `[]` (logged) for errors/short queries.
2. **Verification:** `npx vitest run tests/unit/identity/actor-search.spec.ts`.
**Validation:** Narrow — wiring/unit tests sufficient.

### Phase 2: Reusable typeahead UI component — ✅ SHIPPED (`9c07674`)

**Delivered:** As specified. The visual/positioning + theme smoke was folded
into Phase 3's live run (the component has no page to render in until it's
wired); unit tests + typecheck cover the logic here.

**Goal:** Attach accessible, debounced typeahead behavior to any existing
`<input>`, driven by an injected `search` function.

**Changes:**
- [ ] `src/identity/actor-typeahead.ts` — `attachActorTypeahead(args: {
      input: HTMLInputElement; onSelect: (s: ActorSuggestion) => void;
      search?: (q: string, opts?: { signal?: AbortSignal }) => Promise<ActorSuggestion[]>;
      debounceMs?: number; minChars?: number }): { destroy: () => void }`.
      Behavior: on `input`, debounce (default 150ms); abort any in-flight
      search (AbortController); below `minChars` (default 2) clear/hide the
      dropdown without searching; render results as a listbox
      (`role="listbox"`, options `role="option"`, `aria-selected`) positioned
      under the input; wire `aria-expanded`/`aria-activedescendant` on the input
      (combobox pattern). Keyboard: ArrowDown/ArrowUp move the active option
      (wrapping), Enter selects the active option (or does nothing if none —
      letting the form's own submit proceed), Escape closes. Mouse: click an
      option selects it. Selecting calls `onSelect(suggestion)`, sets
      `input.value` to the handle, and closes. Closes on blur/click-outside.
      `destroy()` removes listeners and the dropdown node. `search` defaults to
      `createActorSearch()`.
- [ ] `styles.css` — dropdown styles (`.typeahead`, `.typeahead-option`,
      `.typeahead-option--active`, avatar/handle/displayName layout), matching
      existing panel/segmented conventions; respects the existing theme vars.
- [ ] `tests/unit/identity/actor-typeahead.spec.ts` — behavior (jsdom +
      `vi.useFakeTimers()`): typing < minChars does not call `search`; typing ≥
      minChars after the debounce calls `search` once and renders one option per
      result; a newer keystroke aborts/supersedes an older in-flight search
      (only the latest results render); ArrowDown+Enter selects and fires
      `onSelect` with the right suggestion and fills `input.value`; Escape
      closes; clicking an option selects it; `destroy()` unbinds. Assert ARIA
      roles/attributes are present.

**Call chain:** `attachActorTypeahead` → (default) `createActorSearch()` →
AppView. `onSelect` is supplied by the caller in Phase 3/4. The component test
exercises `attach → simulated input → search → render → select → onSelect`,
proving the internal chain independent of a page.

**Wiring test:** `tests/unit/identity/actor-typeahead.spec.ts`'s
select-fires-onSelect case is the component-level wiring test (input event →
onSelect). Page-level wiring is Phase 3/4.

**Depends on:** Phase 1.
**Read-set:** `src/identity/actor-search.ts`, `src/log.ts`, `styles.css`.
**Write-set:** `src/identity/actor-typeahead.ts`, `styles.css`,
`tests/unit/identity/actor-typeahead.spec.ts`.
**Shared-state contract:** appends to shared `styles.css`; no runtime shared
state. (This is why Phases 3/4 must not also edit `styles.css`.)
**Risks:** debounce/abort races (explicit test for supersession); focus/blur
timing closing the dropdown before a click registers (use mousedown or a blur
delay — decide during GREEN, cover with the click-select test); accessibility
attributes drifting (asserted in tests). Confirm `vi.useFakeTimers()` is already
used in the suite before relying on it; if not, use a real short debounce with
`await`.
**Done when:**
1. **Behavioral:** attaching to a bare input yields a working debounced,
   keyboard-navigable, accessible suggestion dropdown that fires `onSelect`.
2. **Verification:** `npx vitest run tests/unit/identity/actor-typeahead.spec.ts`.
**Validation:** Moderate — unit tests + a manual smoke in `ui-lab/` or a scratch
page to eyeball positioning/theme before wiring into pages.

### Phase 3: Wire typeahead into Browse (primary target) — ✅ SHIPPED (`801822c`)

**Delivered:** As specified. Broad validation: e2e wiring test (mocked network)
+ full Browse/CSP suites green + the AppView endpoint verified live via probe
(200, CORS `*`). The one residual is a human eyeball of dropdown positioning/
theme in a real browser against live network — recommend before release.

**Goal:** The Browse cook-search box suggests accounts as you type; picking one
fills the handle and the existing Find flow runs.

**Changes:**
- [ ] `src/pages/browse.ts` — after the input is created (`browse.ts:42-48`),
      `attachActorTypeahead({ input, onSelect })`. `onSelect` sets
      `input.value = suggestion.handle` and triggers the existing find path
      (dispatch a submit / call the same async find used by the submit handler —
      refactor the submit body into a named `runFind(handle)` if needed so both
      the form submit and onSelect call it, avoiding duplicated logic). Preserve
      the existing submit-on-Enter and the last-search restore behavior.
- [ ] `docs/DESIGN.md` — one line on the AppView typeahead discovery path +
      soft-degrade contract.
- [ ] `tests/e2e/browse.spec.ts` — **wiring test**: `page.route` the
      `searchActorsTypeahead` call to a fulfilled fixture; type ≥2 chars into
      `[data-testid="handle-input"]`; assert the suggestion listbox renders the
      mocked actors; click one; assert the input value becomes the handle and
      the existing resolve/read find path fires (route those too, as
      `browse.spec.ts` already does for plc/PDS). Assert no auth code regressed
      (the existing bundle-split guard still passes).

**Call chain:** page load → `main()` builds `input` → `attachActorTypeahead` →
`createActorSearch` → AppView; user picks → `onSelect` → `runFind(handle)` →
`resolve` → `readRecipes` → `showEntries` (existing chain).

**Wiring test:** the `browse.spec.ts` case above — proves the entry point
(Browse page) reaches the component and that selection drives the real find.

**Depends on:** Phase 2.
**Read-set:** `src/pages/browse.ts`, `src/identity/actor-typeahead.ts`.
**Write-set:** `src/pages/browse.ts`, `docs/DESIGN.md`,
`tests/e2e/browse.spec.ts`. (No `TODO.md` — moved to Phase 4 for write-set
disjointness.)
**Shared-state contract:** none beyond the write-set. Does not touch `styles.css`
(dropdown CSS shipped in Phase 2).
**Risks:** the Isolation Trap — building the component but not wiring
`onSelect` to the find path (dropdown appears, selection does nothing). The
wiring test's "input value becomes handle AND find fires" assertion guards
this. Also: not superseding the last-search restore that pre-fills the input on
load (ensure typeahead does not fire on the programmatic restore value).
**Done when:**
1. **Behavioral:** On Browse, typing "rdu" shows a suggestion for `rdur.dev`;
   clicking it loads that cook's recipes — no exact handle needed.
2. **Verification:** `npx playwright test tests/e2e/browse.spec.ts` +
   `npx playwright test tests/e2e/csp.spec.ts` (confirms no new origin).
**Validation:** Broad — e2e wiring test + manual run of the dev build against the
real AppView to confirm live suggestions and the CSP allowlist in a real browser.

### Phase 4: Wire typeahead into Meals add-a-cook (reuse) — ✅ SHIPPED (`8dce493`)

**Delivered:** As specified. Ran sequentially (not parallel to Phase 3, per the
Concurrency Map default).

**Goal:** The Meals palette add-a-cook input gets the same typeahead; picking a
cook adds their recipes to the palette via the existing `loadHandlePalette`.

**Changes:**
- [ ] `src/pages/meals.ts` — attach the component to
      `[data-testid="palette-handle-input"]` (`meals.ts:129-136`). `onSelect`
      sets the input value to the handle and invokes the existing add-a-cook
      action (the `palette-handle-add` click handler / `loadHandlePalette`
      path). Preserve the existing "Add" button behavior.
- [ ] `TODO.md` — mark the typeahead item done (both mount points shipped).
- [ ] `tests/e2e/meals.spec.ts` — **wiring test**: mock
      `searchActorsTypeahead`; type into the palette handle input; assert
      suggestions render; select one; assert the add-a-cook path runs and the
      cook's recipes join the palette (route plc/PDS as `meals.spec.ts` already
      does).

**Call chain:** Meals load → palette build → `attachActorTypeahead(palette
input)` → `createActorSearch` → AppView; pick → `onSelect` → existing
add-a-cook → `loadHandlePalette` → palette chips.

**Wiring test:** the `meals.spec.ts` case above.

**Depends on:** Phase 2. (Independent of Phase 3.)
**Read-set:** `src/pages/meals.ts`, `src/identity/actor-typeahead.ts`.
**Write-set:** `src/pages/meals.ts`, `TODO.md`, `tests/e2e/meals.spec.ts`.
**Shared-state contract:** none beyond the write-set.
**Re-entry verification:** (only if run parallel to Phase 3) parent-repo HEAD ==
pre-dispatch SHA; `git status` clean in the main worktree; `git worktree list`
shows only expected worktrees.
**Risks:** two live typeahead dropdowns on pages that both exist — ensure the
component instance is per-input and `destroy()`-able (no global singleton state).
**Done when:**
1. **Behavioral:** In Meals, typing a partial handle in add-a-cook shows
   suggestions; picking one adds that cook's recipes to the palette.
2. **Verification:** `npx playwright test tests/e2e/meals.spec.ts`.
**Validation:** Moderate — e2e wiring test + a manual palette smoke.

## Open Questions

- [RESOLVED 2026-07-10, Pass 3] `vi.useFakeTimers()` availability for debounce
  tests. **Grepped the suite — fake timers are used nowhere.** Decision: make
  `debounceMs` injectable (already in the component signature) and have Phase 2
  tests use a small real debounce with `await`; no fake timers introduced.
- [RESOLVED 2026-07-10] Ship Meals add-a-cook typeahead in the same branch as
  Browse, or defer? **Decision: same branch — all four phases in scope
  (Browse + Meals).** User confirmed.
- [RESOLVED 2026-07-10, Pass 3] Show avatar thumbnails, or text only?
  **`build.mjs:97` sets `img-src 'self' data: blob: https:` and the app already
  loads `cdn.bsky.app` images (`present.ts:49`)** — avatars are permitted with
  no CSP change. Decision: render the avatar when present, placeholder/omit when
  absent. No CSP edit needed.
- [RECOMMENDED: ADVISORY] Min chars (2) and debounce (150ms) defaults. *Standard
  typeahead values; tune during the Phase 2/3 manual smoke if they feel off.
  The only remaining open item — does not gate execution.*

## Review Log

- **2026-07-10 — Pass 1 (base):** Drafted problem, reasoning, verified
  assumptions (endpoint probe + CORS + CSP + mount points + test conventions),
  four phases (data module → UI component → Browse wiring → Meals reuse).
- **2026-07-10 — Pass 2 (gap analysis), same context:** Added:
  (1) explicit soft-degrade vs. fail-loud split in Reasoning + a dedicated
  error-path test in Phase 1, resolving the apparent CLAUDE.md fail-loud tension.
  (2) Documentation Impact section — confirmed LEXICONS.md is *not* touched
  (consumed query method, not an arecipe NSID) with the grep rationale; DESIGN.md
  line scheduled into Phase 3, not a trailing docs phase.
  (3) Concurrency Map — {Phase 3, Phase 4} flagged parallelizable (disjoint
  write-sets) but defaulted sequential; noted `styles.css` is written only in
  Phase 2 precisely so 3/4 stay disjoint.
  (4) Isolation-Trap risk called out in Phase 3 (dropdown renders but onSelect
  not wired) with the wiring-test assertion that guards it.
  (5) `runFind(handle)` refactor noted so form-submit and onSelect share one
  path instead of duplicating the find logic.
  (6) Avatar/CSP `img-src` advisory added — rendering actor avatars may need a
  connect/img origin check; text-only fallback specified.
  (7) last-search-restore interaction flagged (typeahead must not fire on the
  programmatic restore value).

### Pass 3: Quality Gates — 2026-07-10
**TDD ordering:** Phase 1 test bullet now says "test-first / RED before the
module" and names the **min-length boundary edges** (1-char no-fetch / 2-char
fetch / empty / whitespace), converting a single-point assertion into a
mutation-resistant one. Other phases already lead with named behaviors +
wiring tests.
**Observability:** Added a `log.debug('identity', 'actor search', { qlen,
count })` on the success path in Phase 1 so a "no suggestions" report is
traceable, matching `resolve.ts`'s debug tracing. Warn-on-degrade was already
present.
**Debugging readiness:** Per-phase commits remain the checkpoints; the
debug+warn logging makes the ambient suggestion path diagnosable without a
debugger.
**Validation calibration:** Confirmed calibrated — P1 narrow (unit), P2
moderate (unit + manual smoke), P3 broad (e2e + live run), P4 moderate. No
Phase 0 (all assumptions verified by probe/reads). Left as-is.
**Concurrency honesty:** Found a real defect — `TODO.md` was in both Phase 3
and Phase 4 write-sets, breaking the {3,4} disjointness claim. Fixed by
consolidating all `TODO.md` edits into Phase 4; updated Documentation Impact,
Phase 3 changes/write-set, and the Concurrency Map. {3,4} write-sets are now
genuinely disjoint. Default execution stays sequential.
**Documentation impact:** DESIGN.md scheduled in Phase 3, TODO.md in Phase 4,
LEXICONS.md confirmed no-change (grepped). No trailing docs phase.
**Coherence:** Plan still solves the stated problem; scope confirmed
Browse + Meals (all 4 phases); no creep.
**Confirmed ready:** yes — pending the walk-through of the two ADVISORY and one
PHASE-GATED open questions (none BLOCKING).

### Plan close-out — 2026-07-10
**Shipped:** Cook-search typeahead across both handle inputs, delivered on
`feat/cook-search-typeahead` in a worktree off committed main (`41a8f15`), so a
second agent's in-flight work on main was never touched; later rebased onto that
agent's landed main (`e714600`). Two new modules —
`src/identity/actor-search.ts` (AppView `searchActorsTypeahead` query →
`ActorSuggestion[]`, min-length short-circuit, soft-degrade, abort/debug) and
`src/identity/actor-typeahead.ts` (reusable debounced, ARIA-combobox, keyboard-
navigable listbox with a generation guard) — plus dropdown CSS in `styles.css`.
Wired into Browse (`browse.ts`, shared `runFind()`) and Meals add-a-cook
(`meals.ts`, shared `addCookByHandle()`). Observable behavior: typing ≥2 chars in
either box shows live account suggestions; picking one loads that cook's recipes
(Browse) or adds them to the palette pool (Meals) with no exact handle needed.
Tests: 21 new unit + 3 new e2e wiring; full suite green post-rebase (lint,
typecheck, 322 unit — includes the other agent's new tests, 109 e2e). No CSP
change. Commits (post-rebase): `27d7184`, `9c07674`, `801822c`, `8dce493`
(+ per-phase plan-sync docs commits). Not pushed.
**Stopped or skipped:** Nothing. All four planned phases shipped.
**Discoveries:** (1) The worktree had no `node_modules` (worktrees don't share
gitignored files) and the `node_modules` symlink isn't covered by the dir-shaped
`.gitignore` rule — added a worktree-local `info/exclude` so it can't be staged.
(2) `vi.useFakeTimers()` is used nowhere in the suite, so the component takes an
injectable `debounceMs` and tests drive debounce/supersession with real awaits +
deferred promises rather than fake timers. (3) `img-src` is already
`'self' data: blob: https:` with existing `cdn.bsky.app` usage, so avatars ship
with no CSP work. (4) The RTK bash hook mangles `npx`/piped `curl`; ran vitest/
tsc/eslint/playwright via their `node_modules` binaries directly. (5) The
concurrent agent's main touched the same `browse.ts`/`meals.ts`/`meals.spec.ts`/
`TODO.md`, but the rebase auto-merged all of them (disjoint regions); only
`styles.css` needed a manual resolve, and it was a positional clash (both the
export-panel and typeahead blocks inserted at the same anchor) — kept both. The
full gate re-run on the rebased tree is what confirmed the auto-merges were
semantically sound, not just textually clean. **Residual:** a human eyeball of
dropdown positioning/theme in a real browser against live network (the ADVISORY
min-chars/debounce tuning rides along with that smoke).
