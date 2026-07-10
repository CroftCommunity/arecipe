# Meals — a meal-planner tab for arecipe

**Status:** In execution (started 2026-07-10). Phase 0 ✅ · Phase 1 ✅ · Phases 2–9 pending.

## Outcome Summary

| Phase | Outcome | Commit | Note |
|---|---|---|---|
| 0 Discovery | ✅ done | _(no code)_ | D1 structural PASS + D2/D3 verified; D1 live leg gated at Phase 9. |
| 1 Route skeleton | ✅ shipped | `b115baf` | `meals.html` + `src/pages/meals.ts` mount the shared shell; registered in build; wiring e2e GREEN (90/90 e2e, 229/229 unit). |
| 2 Nav tab | ⬜ pending | — | |
| 3 Lexicon + model | ⬜ pending | — | |
| 4 Local store | ⬜ pending | — | |
| 5 Week builder + tap-to-place | ⬜ pending | — | |
| 6 Calendar + repeat | ⬜ pending | — | |
| 7 Palette (Cookbook + Browse) | ⬜ pending | — | |
| 8 Drag enhancement | ⬜ pending | — | |
| 9 PDS sync | ⬜ pending | — | |

## Problem Statement

arecipe has no way to plan meals. A cook can browse, save, and author recipes,
but cannot lay them out across days and weeks. We want a **"Meals" tab**: a
planner where you assign recipes to days of the week, build several weeks, set a
per-week repeat count, and see the result expand onto a calendar below.

A prior exploration produced two **design-only** artifacts, extracted from
`import/meal_planner_thinkingzip`:
- `meal-planner.jsx` — a React component with HTML5 drag-and-drop, localStorage
  persistence, palette→slot / slot→slot dragging, per-week repeat, up to 6 weeks.
- `exchange.recipe.mealPlan.json` — a lexicon draft.

**Both are thinking, not shippable.** They do not match arecipe's real stack and
must be re-homed:

| Thinking artifact | arecipe reality it must become |
|---|---|
| React/JSX component | Vanilla-TS page (`src/pages/meals.ts`) + static HTML shell + `mountShell` chrome |
| `localStorage` only | Local-first **and** PDS-backed (`app.arecipe.mealPlan`) so plans follow the user across devices |
| NSID `exchange.recipe.mealPlan` | **`app.arecipe.mealPlan`** — `docs/LEXICONS.md` ownership policy forbids arecipe minting new `exchange.recipe.*` NSIDs |
| HTML5 `draggable` interaction | **Tap-to-place primary** (mobile is first-class on this PWA), drag as a desktop enhancement |
| 10 hard-coded sample recipes | Palette sourced from the **Cookbook** feed, plus a direct-search leg |
| Standalone artifact | Registered page: `meals.html` + `scripts/build.mjs` + nav destination + SW precache |

### Constraints
- **No backend.** All data lives in the user's PDS repo (atproto) or locally.
- **Mobile-first.** The planner must be fully usable by touch. HTML5
  drag-and-drop does not fire touch events without extra work, so it cannot be
  the only interaction.
- **Page-per-destination.** No SPA router, no tab state — a real `meals.html`
  document reached by a real link (`docs/DESIGN.md` § "Navigation: pages, not
  modals (non-negotiable)").
- **Open-world validation.** Records validate like `src/recipes/read.ts`:
  tolerate unknown fields, fail loud on missing/mistyped required fields.
- **Concurrent work in flight.** Another agent is on branch `recipe-cookbook-ui`
  editing `src/pages/cookbook.ts` and `src/social/cookbook-members-view.ts`
  (the module this feature reads the palette through). This plan is developed in
  an isolated worktree off `origin/main`; the coupling is called out in Open
  Questions and Documentation Impact.

### User decisions already locked (via clarifying questions, 2026-07-10)
1. **Persistence:** **PDS-durable + local in-flight buffer** — reuses the drafts
   *mechanics* (write-through to PDS on save, recover from PDS on load) but with
   the roles clarified for meal plans (user, 2026-07-10): the **PDS record
   `app.arecipe.mealPlan` is the durable, cross-browser home**; the local store is
   an **in-flight editing buffer**, not the authoritative copy. (Drafts invert
   this — their local store *is* the source of truth. See Reasoning + Phase 4.)
2. **Nav placement:** New **top-level "Meals" tab** (5th tab).
3. **Palette source:** Recipes from the **Cookbook**, plus a leg to surface any
   recipe by **searching directly**.
4. **Interaction:** **Mobile is first-class** → tap-to-place primary, drag as
   enhancement.

## Reasoning

### Why re-home instead of adapting the JSX
arecipe ships zero framework runtime. Every page is a small TS module that
builds DOM with a local `el()` helper and calls `mountShell(app, content)`
(`src/nav.ts`). Bundling React would blow the size budget the build script
tracks per page and violate the established idiom. The JSX is valuable only as a
**behavior spec** (weeks, slots, repeat, calendar expansion); the code is
rewritten in the house style.

### Why `app.arecipe.mealPlan`, not `exchange.recipe.mealPlan`
`docs/LEXICONS.md` states the ownership policy unambiguously: `exchange.recipe.*`
is owned by **recipe.exchange**, and arecipe "do[es] **not** mint new
`exchange.recipe.*` NSIDs." A meal plan is arecipe-specific application data, so
it belongs in arecipe's own namespace, `app.arecipe.*` — alongside the existing
`app.arecipe.draft`, `app.arecipe.comment`, `app.arecipe.interaction`. This is a
hard correction of the thinking artifact, not a preference.

### Why PDS-durable + local in-flight buffer (drafts mechanics, roles clarified)
The drafts subsystem already solved this write-through shape: a **local** store
(`src/recipes/drafts-local.ts` — **IndexedDB-backed**; a Pass 3 correction of an
earlier "localStorage" mischaracterization) plus an `app.arecipe.draft` PDS record
written on save and recovered on load (`src/recipes/drafts-sync.ts`, consumed in
`src/pages/mine.ts`). We copy the drafts **mechanics** (write-through on save,
recover-on-load, idempotent rkey), but with the **roles deliberately different**
(user, 2026-07-10):

| | Drafts | Meal plans (this feature) |
|---|---|---|
| Authoritative copy | **local store** (drafting is fully local, offline) | **PDS record** (`app.arecipe.mealPlan`) — durable, cross-browser |
| Local store's role | source of truth | **in-flight editing buffer** in front of the PDS home |
| Backend | IndexedDB | **`localStorage`** (deliberate — see below) |

The user's requirement is that a saved plan **hits the PDS so it persists across
browsers** — so the PDS record is the durable home, and the local store is a
disposable editing buffer, not the authoritative copy. This is why Phase 4 can
pick the simpler backend: the local copy is scratch, so it needs neither IDB's
robustness nor its indexing.

Concretely, the write-through architecture:
- The planner works **signed-out** (local buffer only) — no auth wall on a
  planning tool. For a signed-out user the local buffer is their only copy until
  they sign in (best-effort; both localStorage and IndexedDB are equally
  eviction-exposed, so this does not argue for IDB).
- When signed in, every save is **written through** to the PDS (`putRecord`) and
  the plan is **recovered** from the PDS if missing locally (fresh browser /
  eviction), exactly like drafts. This is what "persistent across browsers" means
  concretely — the PDS, not the local buffer, delivers it.
- A stable rkey derived from the plan id makes re-saves overwrite (idempotent),
  same as `drafts-sync.ts`'s `rkeyOf`.

**Why `localStorage` for the local buffer (resolves Pass 3 ADVISORY #6).** With
the PDS owning durability, the local backend choice is only about the disposable
in-flight buffer, and the decisive factor is the **tap-to-place interaction**: a
synchronous localStorage read/write gives a clean optimistic-update loop
(`tap → save (sync, instant) → re-render (sync) → fire-and-forget syncPlanToPds`)
with no async flicker on every tap. The data is a single ~KB record, far under
localStorage's ~5MB cap, needing no indexing. The one cost — diverging from
drafts' IndexedDB — is acceptable precisely because the two local stores have
**different roles** (drafts local = source of truth, wanting IDB robustness;
meal-plan local = scratch buffer in front of a PDS home). IndexedDB's only real
win here would be codebase consistency; it buys no capability this feature uses.

### Why the palette is the Cookbook feed
"Cookbook" in arecipe is not a saved-list; it is a **feed of recipe records**
from a bounded reach — your own recipes + starter-pack cooks + your Bluesky
follows + your Bluesky followers — assembled by
`resolveCookbook` → `membersToAuthors` → `loadAuthorsFeed`
(`src/social/cookbook.ts` + `src/social/feed.ts` are the exported shared modules;
`membersToAuthors` is currently a page-private helper in `src/pages/cookbook.ts`
— see the Pass 3 seam correction in Verified Assumptions).
Those functions return recipe entries carrying
`{ uri, cid, value }`, where `value.name` is the display name and `uri`/`cid`
are exactly the strong-reference material a meal-plan slot needs
(`src/recipes/refs.ts` → `strongRefOf`). So the palette adapter is thin: run the
same resolver the Cookbook page runs, map each entry to `{ uri, cid, name }`.

Reusing the **shared modules** (not the Cookbook *page*) insulates this feature
from the other agent's in-flight Cookbook **UI** churn — the seam is the
exported function signatures, which are stable.

### Why the palette has two sources — Cookbook and Browse (user-clarified)
The user clarified "search directly" as: reach the recipes that appear on the
**Browse** tab but are **not** in your Cookbook. So the palette exposes a
**source switch** between two providers, both feeding the same filterable chips:
1. **My Cookbook** — your bounded reach (default, signed in).
2. **Browse** — the same corpus Browse itself shows, reusing Browse's exact read
   paths: the **starter-pack feed** (`loadStarterFeed` / `createStarterPrefs`,
   the default Browse content) **plus add-a-cook-by-handle** (`createResolver` →
   `createRecipeReader`, Browse's only "search"). Client-side facet/text filters
   (cuisine/category/photos, `matchesFilter` / `availableFacets` from
   `browse-state.ts`) narrow whichever source is loaded.

**Honest limitation, confirmed with the user:** there is **no dish-name
free-text search** (type "lasagna", get everyone's lasagna). atproto has no
cross-repo search without an AppView and arecipe ships none — Browse's "search"
is by-cook (handle), not by-dish. The palette therefore reaches beyond your
Cookbook via the starter feed + handle lookup + facet filtering, which satisfies
"recipes on Browse but not in my Cookbook" without implying an index that does
not exist. This shapes Phase 7.

### Why tap-to-place is primary
This is a mobile-first PWA whose primary tab bar sits at the bottom for thumb
reach. HTML5 `draggable`/`dragstart` do **not** fire from touch input without a
pointer-event shim — the JSX mockup's interaction is effectively desktop-only.
Tap-to-place (tap a recipe to "arm" it, tap a day to drop it; tap a filled slot
to clear) works identically on touch and mouse, is trivially testable in
Playwright, and is accessible. HTML5 drag is layered on afterward as a desktop
nicety (Phase 8), never as the sole path.

### Why the calendar "expansion" is a pure view, not stored data
A week has a `repeat` count; the calendar below stamps that week `repeat` times
in order. The **record stores what the user built** (a few weeks + repeat
counts); the expanded calendar is derived at render time by a pure
`expandCalendar(weeks)` function. Storing the expansion would denormalize and
bloat the record for no gain — the same reasoning the thinking artifact reached,
and it is correct.

### Alternatives considered and rejected
- **PDS-record-only (no local store):** Rejected — it walls the planning tool
  behind sign-in and makes the tab dead for signed-out visitors. The user chose
  local-first.
- **`exchange.recipe.mealPlan`:** Rejected — violates the ownership policy.
- **Bundling a drag library / React DnD:** Rejected — size budget + idiom.
- **A generic "collections" record reused as a plan:** Rejected —
  `exchange.recipe.collection` is a flat recipe list with no day/week/repeat
  structure and is recipe.exchange-owned. A plan needs day-positioning.
- **Entry under My recipes instead of a tab:** Rejected — user chose a top-level
  tab for first-class discoverability.

## Verified Assumptions

Confirmed firsthand this session by reading the code at `origin/main`:

- **Page shape.** Every page is `src/pages/<name>.ts` building DOM via a local
  `el()` and calling `mountShell(app, content)`. Confirmed: `src/pages/mine.ts`,
  `src/pages/cookbook.ts`, `src/pages/browse.ts`.
- **Shell + nav.** `src/nav.ts` exports `mountShell`, `renderTopbar`,
  `renderTabs`. Tabs come from a `DESTINATIONS` array (label, href, testid,
  match regex); currently Browse / Cookbook / My recipes / Reference. Adding a
  5th entry is the whole nav change. Confirmed by reading `src/nav.ts`.
- **Build registration.** `scripts/build.mjs` has a `PAGES` array and an `HTML`
  map; SW precache is derived from the `HTML` map keys, so registering the page
  there also gets it precached. Confirmed by reading `scripts/build.mjs`.
- **HTML shell template.** `mine.html` / `cookbook.html` are byte-similar
  shells: theme pre-paint inline script, fonts/manifest/styles links,
  `<div id="app">`, `<script type="module" src="./<page>.js">`. The build injects
  CSP/SRI and rewrites the script src to the hashed bundle. Confirmed.
- **`app.arecipe.*` record CRUD pattern.** `src/recipes/drafts-sync.ts` writes
  via `agent.com.atproto.repo.putRecord({ repo, collection, rkey, record })`,
  deletes via `deleteRecord`, and reads via public
  `fetch('.../xrpc/com.atproto.repo.listRecords?repo=&collection=&limit=100')`.
  Records carry a `$type`. Confirmed by reading the file.
- **Open-world validation idiom.** `src/recipes/read.ts` validates required
  fields (throw on missing/mistyped), returns the value with
  `[key: string]: unknown` preserving extras. Confirmed.
- **strongRef helper.** `src/recipes/refs.ts` exports
  `strongRefOf({ uri, cid }) → { uri, cid }` and staleness helpers. Confirmed.
- **Palette data path.** `src/pages/cookbook.ts` resolves the feed via
  `resolveCookbook(...)` → `membersToAuthors(members)` → `loadAuthorsFeed(authors)`,
  and `feed.entries` are recipe records with `{ uri, cid, value }` (rendered by
  `renderRecipeList`). `value.name` is the display name (per `read.ts`
  `RecipeValue`). Confirmed by reading `cookbook.ts`.
  - **Pass 3 correction (seam location).** On `origin/main`, `resolveCookbook`
    (`src/social/cookbook.ts`) and `loadAuthorsFeed` (`src/social/feed.ts`) are
    exported shared modules, **but `membersToAuthors` is a page-private helper
    inside `src/pages/cookbook.ts:47`** (an ~11-line `member → { handle, did }`
    map with a `resolveDidDoc` fallback from `src/identity/did.ts`) — it is **not**
    exported, and `src/social/cookbook-members-view.ts` **does not exist** on
    `origin/main` (it is introduced by the in-flight `recipe-cookbook-ui` branch).
    Consequence for Phase 7: the palette adapter cannot import `membersToAuthors`
    from a shared module today; it must **replicate** that ~11-line mapping
    (trivial, one `resolveDidDoc` import) and switch to the exported version only
    after the in-flight branch merges. This sharpens confirmed open question Q3 —
    it does not reopen the decision (build on `origin/main`, isolate to the
    adapter), it corrects *where* the seam lives.
- **Search reality.** Browse's search is handle-lookup via `createRecipeReader`,
  not a global index. Confirmed by reading `browse.ts` head + grepping `src/`.
- **Ownership policy.** `docs/LEXICONS.md`: arecipe does not mint
  `exchange.recipe.*` NSIDs; `app.arecipe.*` is arecipe's own namespace.
  Confirmed by reading the file.
- **Test infra.** Vitest unit tests in `tests/unit/**` (happy-dom,
  fake-indexeddb available), Playwright e2e in `tests/e2e/**`. `npm test` runs
  lint → typecheck → unit → build → e2e. Confirmed by `package.json` + `tests/`.

**Verified in Phase 0 execution (2026-07-10) — firsthand:**
- **D1 (structural half — PASS).** A representative `app.arecipe.mealPlan` value
  (2 weeks; 7 slots each; a strongRef `{ uri, cid }` + `note` slot; empty slots;
  `startDate`/`langs`) round-trips through the **exact PDS codec path**
  (`recomputeCid`: lex-JSON → DAG-CBOR → sha-256 → CIDv1, `src/recipes/cache.ts`):
  bytes round-trip byte-identical, CID stable, order-insensitive deep-equal holds,
  strongRef/note/empty-slot/startDate/langs all preserved (throwaway probe,
  deleted per disposition). **Design-relevant finding:** DAG-CBOR **canonicalizes
  map key order** (sorts keys) — this determinism is the mechanism behind stable
  CIDs and Phase 9's idempotent re-saves; any value-equality check must be
  order-insensitive. **Live-acceptance half deferred to Phase 9** (see D1 note in
  Phase 0 / Phase 9): confirming `bsky.social` accepts the collection over the
  wire needs credentials not present in this worktree; precedent
  (`app.arecipe.draft`/`comment`/`interaction`/`probe` — all unknown-to-AppView
  `app.arecipe.*` collections that write fine) plus Phase 9's LIVE e2e is the
  firsthand proof of the live leg.
- **D2 (palette seam signatures — PASS).** `FeedAuthor = { handle: string; did:
  string }` (`src/social/feed.ts:18`); `loadAuthorsFeed(authors: FeedAuthor[]):
  Promise<AuthorsFeedResult>` (`feed.ts:33`); a feed entry is a `CachedRecipe =
  { uri: string; cid: string; value: Record<string, unknown>; verified: boolean;
  cachedAt: string }` (`src/recipes/cache.ts:14`) — so `uri`, `cid`, and
  `value.name` are all exposed. `resolveCookbook(args: { you?; config?; starters?;
  fetchFn?; appView? }): Promise<CookbookMember[]>` (`src/social/cookbook.ts:47`).
  `loadStarterFeed = loadAuthorsFeed` (`src/recipes/starter.ts:72`). The
  page-private `membersToAuthors` (`src/pages/cookbook.ts:47`) is
  `(members: CookbookMember[]): Promise<FeedAuthor[]>`, mapping each member →
  `{ handle, did }` with a `resolveDidDoc` fallback (`src/identity/did.ts`) — the
  ~11-line body Phase 7 replicates.
- **D3 (Browse read paths — PASS).** Starter feed: `createStarterPrefs({ storage?
  }).enabledAuthors(): StarterAuthor[]` (`starter.ts:33/59`) → `loadStarterFeed`;
  default Browse corpus is the four baked `STARTER_AUTHORS` (`starter.ts:14`).
  Handle lookup: `createResolver()` (`src/identity/resolve.ts`) → `createRecipeReader()`
  (`src/recipes/read.ts`) — `browse.ts:94-95`, input placeholder "a cook's handle
  — try rdur.dev" (`browse.ts:39`). **Confirmed no global recipe search**: Browse's
  only "search" is `kind: 'search'` = a single-handle resolve+read (`browse.ts:317`),
  never a cross-repo index. Both Browse read chains captured for Phase 7's loaders.

## Documentation Impact

- `docs/LEXICONS.md` — **add** an `app.arecipe.mealPlan` row to the
  "`app.arecipe.*` — created" table (status: `live` once Phase 9 writes real
  records; `planned` until then). Note the strongRef-collection limitation
  (a slot ref cannot declare its target is a recipe — same caveat the doc
  already records for consumed strongRefs). **Handled in Phase 3** (schema/model)
  and updated to `live` in **Phase 9** (PDS sync).
- `README.md` — the page inventory (lines ~32–35: "`index.html` (Browse),
  `cookbook.html` (Cookbook …), `mine.html` (My recipes …)") must gain
  `meals.html` (Meals — the planner). **Pass 3 note:** this inventory is a **prose
  sentence**, not a table, so the edit inserts a clause into that sentence (the
  sentence already omits `reference.html` — pre-existing drift, out of scope here;
  do not expand scope to fix it). **Handled in Phase 1** (route skeleton makes the
  reference stale).
- `docs/DESIGN.md` — § "Navigation: pages, not modals" enumerates destination
  pages; the nav-destinations list should include Meals. `docs/DESIGN.md` is
  also modified on the in-flight branch — coordinate at merge. **Handled in
  Phase 2** (nav tab).
- `import/meal_planner_thinkingzip` — the `exchange.recipe.mealPlan.json` inside
  is **superseded** by `app.arecipe.mealPlan`. Not a doc to edit, but the plan
  records that the zip is design-only history; no action beyond this note.
- Grepped `src`, `docs`, `README.md` for existing "meal" references: only
  `src/recipes/toolbar.ts` "Meal ▾" (a recipe **category** facet:
  breakfast/lunch/dinner) and `no-meal` image assets — **unrelated** to meal
  planning. No naming collision; no code references to update. Search terms:
  `meal`, `planner`, `tab`, `nav`, `destination`.

## Concurrency Map

**Sequential spine:**
Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6 → Phase 7 → Phase 8 → Phase 9

**Default: all phases sequential.** Reason: Phases 5–9 all grow the single file
`src/pages/meals.ts` (and several also touch `styles.css`), so their write-sets
overlap and they must be sequential. The foundational phases each feed the next
(model → store → page). Developed by one agent under TDD, so sequential
execution is the natural fit.

**Opt-in parallel candidate (user's call, not taken by default):**
`{Phase 2 (nav tab), Phase 3 (lexicon + model)}`.
- Disjoint write-sets: Phase 2 writes `src/nav.ts` + `tests/unit/nav.spec.ts`;
  Phase 3 writes `tests/fixtures/lexicons/app.arecipe.mealPlan.json` +
  `src/recipes/meal-plan.ts` + `docs/LEXICONS.md`. No overlap.
- Shared-state contract: both are pure code/doc edits; no git operations in the
  parent worktree, no ports, no daemons, no env. If run as parallel worktrees,
  neither invokes `git checkout`/`stash`/`rebase` in the parent.
- Re-entry verification: parent-repo HEAD == pre-dispatch SHA; `git worktree
  list` shows only expected worktrees; `git status` clean in the parent.
- **Not recommended** for a single-agent run — the coordination overhead exceeds
  the savings for two small phases. Listed so the option is explicit.

**Hard rule honored:** no two phases sharing a write-set entry are grouped
parallel. Phases 5–9 (all touch `meals.ts`) are strictly sequential.

## Phases

### Phase 0: Discovery — ✅ EXECUTED (2026-07-10)
**Goal:** Resolve the record-shape and seam unknowns before building on them.
**Discovery Exemption applies** (no TDD / no wiring test / probes may be throwaway).
**Outcome:** D1 structural half PASS, D2 PASS, D3 PASS — all findings promoted to
Verified Assumptions (firsthand). D1's live-acceptance half is deferred to Phase 9
(no credentials in this worktree; precedent + Phase 9 LIVE e2e is the live proof).
No later phase needed restructuring; Phase 3's schema stands.

- [x] **D1: Does `app.arecipe.mealPlan` with nested weeks + a strongRef array round-trip byte-identically?**
  - **Split at execution:** the question has a *structural* half (does the shape
    survive canonical serialization + produce a stable CID?) and a *live* half
    (does `bsky.social` accept the collection over the wire?).
  - **Structural half — ✅ done (offline, credential-free).** Ran a throwaway
    probe (`spike/d1-mealplan-roundtrip.mjs`, since deleted) through the **exact
    PDS codec** (`recomputeCid`, `src/recipes/cache.ts`): a 2-week / 7-slot value
    with a strongRef+note slot, empty slots, `startDate`/`langs` → bytes round-trip
    byte-identical, CID stable, order-insensitive deep-equal holds. **Finding:**
    DAG-CBOR canonicalizes map key order (→ stable CIDs / idempotent re-saves).
    Logged in Verified Assumptions.
  - **Live half — deferred to Phase 9.** No `.env`/credentials in this worktree,
    and the only known account is production `arecipe.bsky.social`. The live
    write/read/delete is exactly what Phase 9's `LIVE=1 meals-live.spec.ts` does
    against a test account; unknown `app.arecipe.*` collections
    (draft/comment/interaction/probe) already write fine, so the residual risk is
    low. **Phase 9 gate:** run the LIVE round-trip before flipping LEXICONS to
    `live`.
  - **Disposition:** `throwaway` — probe deleted after findings logged. ✅
- [x] **D2: What are the exact export signatures of the palette seam on `origin/main`?** — ✅ PASS (see Verified Assumptions D2).
  - **Probe:** Read `src/social/cookbook.ts` (`resolveCookbook`),
    `src/social/feed.ts` (`loadAuthorsFeed`, `FeedAuthor`, entry shape), and
    **the page-private `membersToAuthors` at `src/pages/cookbook.ts:47`** (NOT
    `src/social/cookbook-members-view.ts` — that file does not exist on
    `origin/main`; see Verified Assumptions Pass 3 correction). Record the precise
    parameter/return types the palette adapter depends on, and copy the
    `membersToAuthors` body (member → `{ handle, did }` + `resolveDidDoc`
    fallback) that Phase 7's adapter will **replicate**.
  - **Success criteria:** A written-down signature for `resolveCookbook` and
    `loadAuthorsFeed`; confirmation that a feed entry exposes `uri`, `cid`, and
    `value.name`; and the replicable `membersToAuthors` body captured for Phase 7.
  - **Disposition:** `throwaway` (reading only).
- [x] **D3: Confirm the Browse-source read paths for the palette.** — ✅ PASS (see Verified Assumptions D3).
  - **Probe:** Read `src/pages/browse.ts` (starter-feed + handle-lookup paths),
    `src/recipes/starter.ts` (`createStarterPrefs`, `loadStarterFeed`), and
    `src/identity/resolve.ts`. Confirm there is no global recipe search and that
    (a) `loadStarterFeed(enabledAuthors)` yields the Browse default corpus and
    (b) handle → DID/PDS → `createRecipeReader` is the reusable by-cook path.
  - **Success criteria:** Confirmed no global index; both Browse read chains
    (starter feed + handle lookup) written down for Phase 7's palette loaders.
  - **Disposition:** `throwaway` (reading only).

**Key property:** Phase 0 may restructure later phases. If D1 shows the record
shape needs adjustment (e.g., the PDS rejects some structure), update Phase 3's
schema before proceeding.
**Read-set:** `src/social/cookbook.ts`, `src/pages/cookbook.ts` (page-private
`membersToAuthors` at line 47 — **not** `cookbook-members-view.ts`, which is
absent on `origin/main`), `src/identity/did.ts`, `src/social/feed.ts`,
`src/pages/browse.ts`, `src/identity/resolve.ts`, `spike/**` (probe scaffolding).
**Write-set:** a throwaway probe script under `spike/` (deleted after).
**Shared-state contract:** D1's structural probe touched **no external state**
(offline codec round-trip); the deferred live leg (Phase 9) creates + deletes one
record on a test account's PDS, self-cleaned. No repo/git state touched here.
**Done when:** D1 (structural)/D2/D3 success criteria met and Verified Assumptions
updated with firsthand evidence. ✅ Met 2026-07-10 — D1 live leg gated at Phase 9.

---

### Phase 1: Route skeleton — `meals.html` + page stub + build registration — ✅ SHIPPED (`b115baf`)
**Delivered (2026-07-10):** as specified. `meals.html` (mine.html shell, title "arecipe — meals"),
`src/pages/meals.ts` (sync `main()`: `#app` → `content` section with `<h2 class="section-title">Meals</h2>`
+ placeholder → `mountShell` + `mountBuildStamp` + `registerServiceWorker`; no `bootSession` yet, per
"no auth needed"), `scripts/build.mjs` (`'meals'` in `PAGES`, `'meals.html':'meals'` in `HTML` → also
SW-precached), README page inventory clause. Wiring test `tests/e2e/meals.spec.ts` RED→GREEN. Full suite:
229/229 unit, 90/90 e2e, lint + typecheck clean, build emits a `meals` bundle. The Pass 3 mount-log seam
(`log.debug('shell','mounted',…)`) is intentionally deferred to Phase 5 per plan.
**Goal:** A live, reachable `meals.html` that mounts the shared shell and shows a
"Meal planner" heading. Nothing interactive yet, but the page is real and built.
**Changes:**
- [ ] `meals.html` — copy the `mine.html` shell verbatim; title "arecipe — meals";
  `<script type="module" src="./meals.js">`.
- [ ] `src/pages/meals.ts` — `main()` that gets `#app`, builds
  `content = el('section','panel')` with an `<h2 class="section-title">Meals</h2>`
  and a placeholder, calls `mountShell(app, content)`, `mountBuildStamp`,
  `registerServiceWorker()`. Mirror `mine.ts`'s boot skeleton (no auth needed yet).
- [ ] `scripts/build.mjs` — add `'meals'` to `PAGES` and `'meals.html': 'meals'`
  to `HTML`.
- [ ] `README.md` — add `meals.html` to the page inventory (Documentation Impact).
**Call chain:** Browser loads `meals.html` → `meals.js` bundle → `meals.ts main()`
→ `mountShell(app, content)` renders the topbar + tabs + content.
**Wiring test:** e2e `tests/e2e/meals.spec.ts` — navigate to `/meals.html`,
assert the shell topbar renders and the "Meals" heading is visible. RED before
the page exists, GREEN after.
**Depends on:** Phase 0 (none of its outputs, but ordering keeps discovery first).
**Read-set:** `mine.html`, `src/pages/mine.ts`, `src/nav.ts`, `scripts/build.mjs`.
**Write-set:** `meals.html`, `src/pages/meals.ts`, `scripts/build.mjs`,
`README.md`, `tests/e2e/meals.spec.ts`.
**Shared-state contract:** no shared mutable state beyond the file write-set;
build writes only to `dist/`.
**Risks:** Forgetting the `HTML` map entry → page not built / not precached.
The wiring test (loading the built page) catches this.
**Done when:**
1. **Behavioral:** Visiting `/meals.html` shows the arecipe shell with a "Meals"
   heading; `npm run build` emits a `meals-<hash>.js` bundle.
2. **Verification:** `npx playwright test tests/e2e/meals.spec.ts` passes; `npm
   run build` output lists a `meals` bundle.
**Validation:** Moderate — wiring e2e + a manual `npm run serve` load of the page.

---

### Phase 2: Nav tab — "Meals" as a 5th destination
**Goal:** "Meals" appears in the tab bar on every page and is marked active on
`meals.html`.
**Changes:**
- [ ] `src/nav.ts` — add `{ label: 'Meals', href: './meals.html',
  testid: 'tab-meals', match: /\/meals\.html$/ }` to `DESTINATIONS` (placement:
  after "My recipes" or as decided in Q2 follow-up — default append before
  Reference or after; see Open Questions).
- [ ] `tests/unit/nav.spec.ts` — extend to assert the Meals tab renders with the
  right href/testid and gets `tab--active` when `pathname` is `/meals.html`.
- [ ] `docs/DESIGN.md` — add Meals to the destination-pages enumeration
  (Documentation Impact; coordinate with the in-flight branch's DESIGN.md edits).
**Call chain:** Any page → `mountShell` → `renderTabs(pathname)` → iterates
`DESTINATIONS` → renders the Meals `<a class="tab">`.
**Wiring test:** `tests/unit/nav.spec.ts` asserts `renderTabs('/meals.html')`
contains a Meals tab with `tab--active`; and that `renderTabs('/index.html')`
contains a non-active Meals tab. (Nav is exercised through `renderTabs`, the real
entry used by every `mountShell`.)
**Depends on:** Phase 1 (the href target must exist).
**Read-set:** `src/nav.ts`, `tests/unit/nav.spec.ts`.
**Write-set:** `src/nav.ts`, `tests/unit/nav.spec.ts`, `docs/DESIGN.md`.
**Shared-state contract:** none beyond the write-set.
**Risks:** 5 tabs tighten the mobile bottom bar; verify no overflow/wrap
regression in the e2e nav check on a narrow viewport. `docs/DESIGN.md` edit may
conflict with the in-flight branch at merge — small, hand-resolvable.
**Done when:**
1. **Behavioral:** The tab bar shows Browse / Cookbook / My recipes / Reference /
   Meals, and Meals is highlighted on `meals.html`.
2. **Verification:** `npm run test:unit -- nav` passes; the Phase 1 e2e still
   passes with the tab present.
**Validation:** Narrow — unit test is sufficient; plus a manual mobile-viewport
glance for tab-bar fit.

---

### Phase 3: Lexicon + model core (`app.arecipe.mealPlan`)
**Goal:** The record schema and a pure model module (types, validation, strongRef
slot construction, calendar expansion) exist and are unit-tested.
**Changes:**
- [ ] `tests/fixtures/lexicons/app.arecipe.mealPlan.json` — the re-homed schema:
  `id: "app.arecipe.mealPlan"`, `key: "tid"`, required `name`/`weeks`/`createdAt`/
  `updatedAt`, `#week` (optional `repeat` 1–12, `days` length-7 of `#slot`),
  `#slot` (optional `recipe` → `com.atproto.repo.strongRef`, optional `note`),
  optional `text`/`langs`/`startDate`. (Structurally the artifact's schema with
  the namespace corrected.)
- [ ] `src/recipes/meal-plan.ts` — TS types (`MealPlanValue`, `PlanWeek`,
  `PlanSlot`), `MEAL_PLAN_COLLECTION = 'app.arecipe.mealPlan'`,
  `validateMealPlanValue(uri, value)` (open-world; fail loud on missing/mistyped
  required fields, exactly 7 days per week), `slotWithRecipe(entry)` building a
  `#slot` via `strongRefOf` from `src/recipes/refs.ts`, and the pure
  `expandCalendar(weeks) → CalendarWeek[]` (stamp each week `repeat` times in
  order — the JSX's expansion logic).
- [ ] `docs/LEXICONS.md` — register `app.arecipe.mealPlan` (status `planned`
  until Phase 9) with the strongRef-collection caveat.
**Call chain:** (Library phase — no entry point of its own; see the export→wiring
map below.) Consumers arrive in later phases; named here so the wiring is planned,
not deferred.
**Export → wiring-phase map (Pass 3 — prevents any export from shipping as dead
code):** Phase 3's Verification (`npm run test:unit -- meal-plan`) proves the
module *in isolation only*. Each export must have a named later phase whose e2e/
LIVE test exercises it through the entry point — that consumer phase is the
export's real wiring test:
- `validateMealPlanValue` → **Phase 9** (`listPdsPlans` validates PDS records;
  hermetic unit + LIVE e2e). Note: Phase 4's local store stores the *editable*
  shape (`{ uri, cid, name }` per day), **not** the record shape, so Phase 4 does
  **not** call `validateMealPlanValue` — the record validator is a PDS-boundary
  function wired in Phase 9. (Resolves the Phase 3/Phase 4 call-chain ambiguity:
  the earlier "store validates via `validateMealPlanValue`" line was wrong.)
- `slotWithRecipe` → **Phase 9** (`planToRecord` builds strongRef `#slot`s;
  hermetic unit + LIVE e2e).
- `expandCalendar` → **Phase 6** (calendar view; e2e asserts repeat stamping).
- Types (`MealPlanValue`/`PlanWeek`/`PlanSlot`) → compile-time only (`typecheck`).
If any of these three consumer phases ships without exercising its mapped export,
that export is dead code — the guard is: **no Phase 3 export lands without its
mapped consumer phase's wiring test asserting on it.**
**Wiring test:** Unit tests in `tests/unit/recipes/meal-plan.spec.ts`:
`validateMealPlanValue` rejects a missing `weeks`, a 6-day **and** an 8-day week
(boundary at exactly 7), a mistyped `name`; accepts a valid 7-day plan and
preserves an unknown extra field; `expandCalendar`
turns `[{repeat:2, days},{repeat:1, days}]` into a 3-entry calendar in order, and
handles the `repeat` boundaries (reject/clamp `0` and `13`, accept `1` and `12`
per the schema's 1–12 range — name the edges, not a single mid-range point);
`slotWithRecipe` produces `{ recipe: { uri, cid } }`. (Pure functions — unit
tests are the appropriate isolated proof; the **entry-point wiring** for each
export is its mapped consumer phase above, not this phase.)
**Depends on:** Phase 0 D1 (record shape confirmed).
**Read-set:** `tests/fixtures/lexicons/exchange.recipe.collection.json`
(reference shape), `src/recipes/refs.ts`, `src/recipes/read.ts` (validation idiom).
**Write-set:** `tests/fixtures/lexicons/app.arecipe.mealPlan.json`,
`src/recipes/meal-plan.ts`, `docs/LEXICONS.md`,
`tests/unit/recipes/meal-plan.spec.ts`.
**Shared-state contract:** none beyond the write-set.
**Risks:** Getting `expandCalendar` ordering wrong (weeks must stamp top-to-bottom
in array order); the unit test pins ordering explicitly.
**Done when:**
1. **Behavioral:** The model validates/normalizes a plan value and expands weeks
   to a calendar; the fixture schema is present for tests.
2. **Verification:** `npm run test:unit -- meal-plan` passes; `npm run typecheck`
   clean.
**Validation:** Narrow — unit tests sufficient for pure functions.

---

### Phase 4: Local store (in-flight buffer) — `meal-plan-local.ts`
**Goal:** A localStorage-backed **in-flight editing buffer** that creates, gets,
lists, saves, and removes meal plans, reusing the drafts write-through mechanics.
The buffer is **not** the authoritative copy — the PDS record (Phase 9) is the
durable, cross-browser home. On a fresh browser or after eviction the buffer is
rehydrated from the PDS.
**Storage-API note (Pass 3, resolved):** `drafts-local.ts` is **IndexedDB-backed**,
but Phase 4 uses **`localStorage`** by decision (user, 2026-07-10; see Reasoning
"Why `localStorage` for the local buffer"). Rationale: the local copy is a
disposable scratch buffer in front of a PDS home, so it needs neither IDB's
robustness nor indexing; a single ~KB record is far under the ~5MB cap; and a
synchronous read/write gives the tap-to-place UI a clean optimistic-update loop
with no async flicker. This is a considered divergence from drafts' backend, not
"mirroring drafts' storage API." (Pass 3 ADVISORY #6 is resolved to `localStorage`
— not deferred.)
**Changes:**
- [ ] `src/recipes/meal-plan-local.ts` — `createMealPlanStore()` with
  `list()`, `get(id)`, `save(plan, id?)`, `remove(id)`; a stable client id per
  plan; a versioned storage key (`arecipe.mealplans.v1`). Store the editable
  shape (weeks with day → `{ uri, cid, name }` cached for display, plus `repeat`).
  **Logging seams (mirror `drafts-local.ts` posture exactly):**
  `log.debug('meal-plan', 'saved', { id })` and
  `log.debug('meal-plan', 'removed', { id })` on the success paths. **Fail
  posture:** like `drafts-local.ts`, the store does **not** swallow storage
  errors internally — a `localStorage` write/read that throws (quota, disabled,
  private-mode) propagates to the **call site**, which wraps it and emits
  `log.warn('meal-plan', 'list failed'/'save failed', { error })` (mirroring
  `src/pages/mine.ts:71`). One exception mirrors drafts' read tolerance: a
  **corrupt/undecodable stored value** on read yields an empty result rather than
  throwing (a `log.warn('meal-plan', 'discarding corrupt stored plan', { error })`
  at the decode boundary). (Corrects the earlier "fail-soft in the store (log,
  don't throw)" line — the real drafts posture is fail-loud-in-store,
  warn-at-call-site, tolerate-corrupt-on-read.)
- [ ] `tests/unit/recipes/meal-plan-local.spec.ts` — behavior via the public API
  using `happy-dom`/fake storage: save→list round-trips; save with same id
  overwrites; remove deletes; a corrupt stored value yields empty (and logs a
  warn), not a throw; a throwing storage backend propagates from the store (so the
  call-site wrap is exercised, not masked).
**Call chain:** (Library phase.) Consumer: Phase 5 page mounts the store as the
in-flight editing buffer and re-renders from it (the PDS record is the durable
copy — Phase 9).
**Wiring test:** The unit spec exercises the store's public API end-to-end
(save→get→list→remove). The user-visible wiring test is Phase 5's persistence e2e.
**Depends on:** Phase 3 (model types).
**Read-set:** `src/recipes/drafts-local.ts` (pattern), `src/recipes/meal-plan.ts`.
**Write-set:** `src/recipes/meal-plan-local.ts`,
`tests/unit/recipes/meal-plan-local.spec.ts`.
**Shared-state contract:** reads/writes `localStorage` under a single versioned
key namespace; no cross-test bleed if tests reset storage per case (use factory
data, not shared setup — house TDD rule).
**Risks:** Storage-key collision with other features — the `arecipe.mealplans.v1`
prefix is unique (grepped: no existing `mealplan` key).
**Done when:**
1. **Behavioral:** A plan can be persisted and re-read locally across "reloads."
2. **Verification:** `npm run test:unit -- meal-plan-local` passes.
**Validation:** Narrow — unit tests sufficient.

---

### Phase 5: Week builder + tap-to-place + local persistence
**Goal:** The core interaction. The page renders week rows of 7 day-slots, a
palette (injected for this phase), tap-to-place assignment, tap-to-clear,
add/remove week (up to 6), and persists to the local store across reloads.
**Changes:**
- [ ] `src/pages/meals.ts` — grow from the stub: render a palette column and a
  builder of week rows (`el()`-built DOM). Tap a palette recipe to "arm" it
  (visual selected state); tap an empty day slot to place the armed recipe; tap a
  filled slot's × to clear. "+ Add week" (cap 6) and per-row "remove". All
  mutations go through the Phase 4 store; the page re-renders from store state.
  Accept the palette via an **injected provider** (default: the injected fake in
  tests; real Cookbook provider wired in Phase 7) so this phase is testable in
  isolation.
  **Logging seam (Pass 3, mirror `mine.ts:161` / `cookbook.ts:138`):** emit
  `log.debug('shell', 'mounted', { page: 'meals', signedIn: agent !== null })`
  once after `mountShell`, so a console trace shows the planner booted and its
  auth posture. (Phase 6 keeps this single mount log; do not duplicate per
  re-render.)
- [ ] `styles.css` — planner styles (palette chips, week rows, day slots,
  armed/selected + filled states), themed via existing CSS vars (`--enamel`
  etc.), mobile-first grid. Port the JSX's CSS intent into the site's tokens.
**Call chain:** `meals.ts main()` → build palette + builder → tap handlers call
`store.save(...)` → re-render reads `store.get(...)`. Palette provider →
`{ uri, cid, name }[]`.
**Wiring test:** e2e in `tests/e2e/meals.spec.ts` (extended): with a seeded
injected palette, tap a recipe, tap Tue of week 1, assert Tue shows the recipe;
reload the page, assert the assignment persists; tap ×, assert cleared;
add a week, assert two week rows.
**Depends on:** Phases 1, 3, 4.
**Read-set:** `src/pages/mine.ts` (DOM idioms), `styles.css`,
`src/recipes/meal-plan.ts`, `src/recipes/meal-plan-local.ts`.
**Write-set:** `src/pages/meals.ts`, `styles.css`, `tests/e2e/meals.spec.ts`.
**Shared-state contract:** page state lives in the local store (localStorage);
no other ambient state.
**Risks:** This is the largest phase — keep it to builder mechanics only
(calendar/repeat is Phase 6, real palette is Phase 7, drag is Phase 8) so it fits
one context window. If `meals.ts` grows past a comfortable size, extract a
`src/recipes/meal-plan-view.ts` render helper (still this phase's write-set).
**Done when:**
1. **Behavioral:** A user can tap-place recipes onto days, clear them, add/remove
   weeks, and the plan survives reload — all by touch or mouse.
2. **Verification:** `npx playwright test tests/e2e/meals.spec.ts` passes,
   including the reload-persistence assertion.
**Validation:** Moderate — wiring e2e + manual exercise on a mobile viewport
(touch tap-to-place) via `npm run serve`.

---

### Phase 6: Calendar expansion view + per-week repeat
**Goal:** Below the builder, a calendar renders each week stamped `repeat` times
in order; each week row gets a `repeat N×` control.
**Changes:**
- [ ] `src/pages/meals.ts` — add a per-week `repeat` number input (1–12) wired to
  the store, and a calendar section that renders `expandCalendar(weeks)` from the
  model (week label + rep indicator + 7 cells). Empty state when nothing planned.
- [ ] `styles.css` — calendar grid styles (day headers, week-label column, cells)
  in site tokens; mobile horizontal scroll like the JSX's `@media` rule.
**Call chain:** repeat input → `store.save` → re-render → `expandCalendar(weeks)`
→ calendar DOM.
**Wiring test:** e2e (extended): set week 1 repeat to 3, assert the calendar shows
3 stamped rows for week 1 in order; a filled day appears in each stamped row.
**Depends on:** Phase 5 (builder + store), Phase 3 (`expandCalendar`).
**Read-set:** `src/recipes/meal-plan.ts`, `src/pages/meals.ts`, `styles.css`.
**Write-set:** `src/pages/meals.ts`, `styles.css`, `tests/e2e/meals.spec.ts`.
**Shared-state contract:** none beyond the store.
**Risks:** Repeat expansion must match `expandCalendar` order exactly; reuse the
model function (do not re-implement in the page).
**Done when:**
1. **Behavioral:** Changing a week's repeat count changes how many times it
   appears on the calendar below, top-to-bottom in week order.
2. **Verification:** `npx playwright test tests/e2e/meals.spec.ts` passes the
   repeat/calendar assertions.
**Validation:** Moderate — wiring e2e + manual check.

---

### Phase 7: Palette from Cookbook + Browse source (starter feed + handle)
**Goal:** Replace the injected palette with two real providers behind a source
switch — **My Cookbook** and **Browse** — both feeding the same filterable chips.
**Changes:**
- [ ] `src/recipes/meal-plan-palette.ts` — three loaders, each mapping recipe
  entries to `{ uri, cid, name }` and degrading like the Cookbook/Browse pages
  (a failed source contributes nothing, never blanks). **Each loader logs its
  degrade seam** (Pass 3, mirroring `cookbook.ts:95/119` and `feed.ts:59`):
  `log.warn('meal-plan', 'palette source failed', { source, error: String(err) })`
  on a source that throws, and `log.info('meal-plan', 'palette loaded',
  { source, count })` on success — so a blank palette is diagnosable (source
  failed vs. genuinely empty) from the console alone:
  - `loadCookbookPalette(you, config?)` — `resolveCookbook` → **replicated**
    `membersToAuthors` (see Pass 3 seam correction: it is page-private on
    `origin/main`, so this loader carries the ~11-line map + `resolveDidDoc`
    fallback locally until the in-flight branch exports it) → `loadAuthorsFeed`.
  - `loadStarterPalette()` — `createStarterPrefs().enabledAuthors()` →
    `loadStarterFeed` (Browse's default corpus).
  - `loadHandlePalette(handle)` — `createResolver()` → `createRecipeReader`
    (Browse's by-cook search).
- [ ] `src/pages/meals.ts` — wire the providers in behind a **source switch**
  (My Cookbook ↔ Browse). Cookbook is the default when signed in; Browse (starter
  feed) works signed-out via public reads. A text-filter input narrows the loaded
  chips; an "add a cook by handle" input appends via `loadHandlePalette`. Reuse
  `browse-state.ts` facet filtering (`matchesFilter`/`availableFacets`) if cheap,
  else start with plain text filter (facets are an ADVISORY follow-up).
**Call chain:** `meals.ts` → selected provider (`loadCookbookPalette` /
`loadStarterPalette` / `loadHandlePalette`) → shared modules → palette chips.
Filter input → client-side filter over loaded chips.
**Wiring test:** e2e (extended, hermetic): stub the feed loaders (Playwright route
or injected fetch) to return recipes for each source; assert switching source
swaps the chips; type a filter, assert the list narrows. Per-loader unit tests in
`meal-plan-palette.spec.ts` with an injected `fetchFn` prove each mapping +
degrade path.
**Depends on:** Phases 5–6; Phase 0 D2/D3 (seam signatures + Browse read paths).
**Read-set:** `src/social/cookbook.ts`, `src/pages/cookbook.ts` (the page-private
`membersToAuthors` at line 47 to replicate — **not** `cookbook-members-view.ts`,
which does not exist on `origin/main`), `src/identity/did.ts` (`resolveDidDoc`),
`src/social/feed.ts`, `src/pages/browse.ts`, `src/recipes/starter.ts`,
`src/pages/browse-state.ts`, `src/identity/resolve.ts`, `src/recipes/read.ts`.
**Write-set:** `src/recipes/meal-plan-palette.ts`, `src/pages/meals.ts`,
`tests/unit/recipes/meal-plan-palette.spec.ts`, `tests/e2e/meals.spec.ts`.
**Shared-state contract:** network reads only (public listRecords / AppView);
no repo/git state. **Coupling:** the palette adapter **replicates** the
page-private `membersToAuthors` (`src/pages/cookbook.ts:47`) on `origin/main`;
the in-flight `recipe-cookbook-ui` branch promotes that helper to an exported
`src/social/cookbook-members-view.ts`. On merge, swap the replicated copy for the
exported import (single-line change in one adapter) and re-verify the signature
(Open Question Q3 / Phase 0 D2).
**Risks:** The in-flight branch may change `membersToAuthors`'s signature; Phase 0
D2 pins the current one, and the palette adapter isolates the dependency to one
module. Cookbook is a signed-in surface, so signed-out palette relies on the
handle leg — matches the local-first, no-auth-wall intent.
**Done when:**
1. **Behavioral:** Signed in, the palette shows recipes from your Cookbook,
   filterable by text; entering a handle adds that cook's recipes; you can plan
   with real recipes.
2. **Verification:** `npx playwright test tests/e2e/meals.spec.ts` (palette +
   filter) and `npm run test:unit -- meal-plan-palette` pass.
**Validation:** Broad — wiring e2e + unit + a manual signed-in run confirming the
real Cookbook feed populates and the handle leg pulls a known cook (e.g. the
Browse sample handle `rdur.dev`).

---

### Phase 8: Drag-and-drop enhancement (desktop)
**Goal:** Layer HTML5 drag on top of tap-to-place: drag a palette recipe onto a
slot, and drag a filled slot to another slot (move/swap). Tap-to-place remains
the primary, touch-safe path.
**Changes:**
- [ ] `src/pages/meals.ts` — add `draggable` + `dragstart`/`dragover`/`drop`
  handlers to palette chips and slots, reusing the same store mutations as
  tap-to-place (`setSlot`/`moveSlot` semantics from the JSX: within-week swap,
  cross-week move). Guard so touch is unaffected (drag is additive).
- [ ] `styles.css` — drop-target `over` state.
**Call chain:** `dragstart` records source → `drop` on a slot calls the same
store mutation the tap path uses → re-render.
**Wiring test:** e2e (extended, desktop project): use Playwright's
`dragTo`/mouse API to drag a palette chip to a slot and assert placement; drag a
filled slot to another and assert move/swap.
**Depends on:** Phase 5 (slots + store mutations).
**Read-set:** `src/pages/meals.ts`, `styles.css`.
**Write-set:** `src/pages/meals.ts`, `styles.css`, `tests/e2e/meals.spec.ts`.
**Shared-state contract:** none beyond the store.
**Risks:** Drag handlers must not break tap-to-place on touch; keep the two paths
converging on the same store mutations. Playwright drag can be flaky — assert on
resulting state, not intermediate DnD events.
**Done when:**
1. **Behavioral:** On desktop, dragging a recipe onto a day places it, and
   dragging between slots moves/swaps; touch tap-to-place is unchanged.
2. **Verification:** `npx playwright test tests/e2e/meals.spec.ts` drag cases
   pass.
**Validation:** Moderate — wiring e2e + manual desktop drag + a manual touch
re-check that tap-to-place still works.

---

### Phase 9: PDS sync — plan follows the user across devices
**Goal:** When signed in, the local plan is also written to the PDS as an
`app.arecipe.mealPlan` record and recovered from the PDS if missing locally —
mirroring drafts sync.
**Changes:**
- [ ] `src/recipes/meal-plan-sync.ts` — `planToRecord(plan)` (build the
  `app.arecipe.mealPlan` value with strongRef slots via the model,
  `createdAt`/`updatedAt`), `syncPlanToPds(agent, plan)` (`putRecord`, stable
  rkey from plan id), `removePlanFromPds(agent, id)`, `listPdsPlans(pds, did)`
  (public `listRecords` + `validateMealPlanValue`, skip-malformed like
  `listPdsDrafts`). Mirror `drafts-sync.ts` exactly, **including its logging
  seams** (Pass 3, mirror `drafts-sync.ts:52/64/67/83`):
  `log.info('meal-plan', 'synced to PDS', { id })` after `putRecord`;
  `log.info('meal-plan', 'removed from PDS', { id })` after `deleteRecord`, with
  `log.debug('meal-plan', 'PDS remove skipped', { id, error })` on a tolerated
  remove failure; and `log.warn('meal-plan', 'skipping malformed PDS plan',
  { error })` per record `validateMealPlanValue` rejects in `listPdsPlans`.
- [ ] `src/pages/meals.ts` — when `agent !== null`: on save, also
  `syncPlanToPds`; on load, recover any PDS plans missing locally into the store
  (like `mine.ts`'s draft recovery), emitting
  `log.info('meal-plan', 'recovered from PDS', { count })` on success and
  `log.warn('meal-plan', 'PDS plan recovery failed', { error })` on failure
  (mirror `mine.ts:103/107`). Signed-out path is unchanged (local only).
- [ ] `docs/LEXICONS.md` — flip `app.arecipe.mealPlan` status to `live`.
**Call chain:** page save handler → `store.save` → (signed in) `syncPlanToPds` →
`agent.com.atproto.repo.putRecord`. Page load (signed in) → `listPdsPlans` →
merge into store → re-render.
**Wiring test:** e2e `tests/e2e/meals-live.spec.ts` gated behind the `LIVE` flag
(pattern of `drafts-live.spec.ts`): sign in, create a plan, assert a
`app.arecipe.mealPlan` record exists via `listRecords`; plus a hermetic unit test
on `meal-plan-sync.ts` with an injected agent/`fetchFn` proving `planToRecord`
shape and `listPdsPlans` validation.
**Depends on:** Phases 3–5; Phase 0 D1 (structural round-trip confirmed offline).
**D1 live gate (from Phase 0):** this phase's `LIVE=1 meals-live.spec.ts` **is**
the live-acceptance proof D1 deferred — confirm the `app.arecipe.mealPlan`
createRecord→listRecords→delete round-trip succeeds against a test account before
flipping `docs/LEXICONS.md` to `live`.
**Read-set:** `src/recipes/drafts-sync.ts` (pattern), `src/pages/mine.ts`
(recovery pattern), `src/recipes/meal-plan.ts`, `src/recipes/meal-plan-local.ts`.
**Write-set:** `src/recipes/meal-plan-sync.ts`, `src/pages/meals.ts`,
`docs/LEXICONS.md`, `tests/unit/recipes/meal-plan-sync.spec.ts`,
`tests/e2e/meals-live.spec.ts`.
**Shared-state contract:** signed-in writes create/update/delete
`app.arecipe.mealPlan` records on the user's PDS (external mutable state). The
LIVE e2e must clean up records it creates (delete in teardown, like
`drafts-live.spec.ts`). No git/process state.
**Risks:** rkey stability — re-saves must overwrite, not duplicate (stable
id-derived rkey, verified by unit test). CSP `connect-src` already allows the PDS
hosts used by drafts; confirm no new host is needed (it is the same
`putRecord`/`listRecords` surface — no CSP change expected).
**Done when:**
1. **Behavioral:** A signed-in user's plan is written to their PDS and reappears
   on a second device / after local eviction.
2. **Verification:** `npm run test:unit -- meal-plan-sync` passes; `LIVE=1
   npx playwright test meals-live` passes against a test account.
**Validation:** Broad — unit + LIVE e2e + a manual two-context check (create in
one browser profile signed in, confirm the record via `listRecords`).

## Open Questions

- [CONFIRMED: PHASE-GATED (Phase 2)] **Tab placement/order and the mobile
  5-tab fit.** **Resolved 2026-07-10:** order is
  `Browse · Cookbook · My recipes · Meals · Reference` (Meals after My recipes,
  grouping the personal/authoring surfaces). Keep full labels; Phase 2's nav
  check verifies no wrap/overflow on a narrow viewport.
- [CONFIRMED: PHASE-GATED (Phase 7)] **"Search directly" scope.** **Resolved
  2026-07-10:** the palette exposes a **source switch** — *My Cookbook* and
  *Browse*. The Browse source reuses Browse's read paths (starter-pack feed +
  add-a-cook-by-handle) so the palette reaches recipes outside your Cookbook,
  with client-side filtering. Confirmed limitation: **no dish-name free-text
  search** (the stack has no cross-repo index without an AppView); reach is
  by-cook + starter feed + filters. Phase 0 D3 verifies the read paths.
- [CONFIRMED: PHASE-GATED (Phase 7)] **In-flight Cookbook coupling.**
  **Resolved 2026-07-10:** build against the current `origin/main` signature of
  `membersToAuthors`/`loadAuthorsFeed`; the palette adapter
  (`meal-plan-palette.ts`) isolates the dependency to one module. When the
  `recipe-cookbook-ui` branch merges to main, **re-run Phase 0 D2** to confirm
  the signature and patch the single adapter if it drifted. Phases 0–6 and 8–9
  are independent of the cookbook work.
- [CONFIRMED: ADVISORY] **`startDate` in v1.** **Resolved 2026-07-10:** v1
  renders **relative weeks** (Week 1, Week 2 …), no date picker. The optional
  `startDate` stays in the schema (no migration cost) for a real-dates
  fast-follow. Phase 6's calendar renders relative labels only.
- [CONFIRMED: ADVISORY] **Multiple named plans vs. a single plan.** **Resolved
  2026-07-10:** v1 edits a **single implicit plan** — no picker/naming/"New
  plan" UI. The store keeps an id internally (Phase 4) so multi-plan is a
  pure-additive follow-up with no data migration. Phase 5 renders exactly one
  plan (create-if-absent on load).

## Review Log

### Pass 1: Base plan — 2026-07-10
Established problem, re-homing rationale, verified assumptions against
`origin/main`, and a 10-phase sequential plan (Phase 0 discovery + 9
implementation phases). Grounded every phase in a named existing pattern
(drafts-local / drafts-sync / read.ts / nav.ts / build.mjs / cookbook social
modules). Locked the four user decisions.

### Pass 2: Gap Analysis — 2026-07-10 (combined with Pass 1)
**Found:**
- Phases 1+2 originally drafted as one; split — `meals.html` + `meals.ts` +
  `build.mjs` + `nav.ts` is 4 files, over the hard 3-file limit. Now Phase 1
  (route skeleton, 3 files) and Phase 2 (nav tab, separate).
- The palette needs *something to place* before the real Cookbook source lands.
  Resolved by giving Phase 5 an **injected palette provider** (fake in tests),
  with the real Cookbook provider swapped in at Phase 7 — keeps Phase 5 testable
  in isolation and avoids a cross-phase precondition gap.
- "Search directly" risked implying a global search index that does not exist.
  Added the reasoning + Phase 0 D3 + a phase-gated open question to pin the
  filter+handle-lookup interpretation.
- Cross-phase precondition: Phase 2's nav href requires Phase 1's page to exist —
  made explicit in Depends-on. Phase 6 requires Phase 3's `expandCalendar` —
  explicit. Phase 9 requires Phase 0 D1's round-trip proof — explicit.
- Documentation Impact: grepped firsthand — README page inventory + DESIGN.md nav
  list are the only stale references; the "Meal ▾" facet is unrelated (no
  collision). Assigned README to Phase 1, DESIGN to Phase 2, LEXICONS to Phase 3
  (planned) → Phase 9 (live).
**Concurrency:**
- Confirmed Phases 5–9 share `src/pages/meals.ts` (and often `styles.css`) →
  strictly sequential. Surfaced one opt-in parallel candidate {Phase 2, Phase 3}
  with disjoint write-sets and a re-entry check; marked not-recommended for a
  single-agent run. Map is otherwise fully sequential with a stated reason.
**Changed:**
- Split Phase 1/2; added injected-provider seam to Phase 5; added Phase 0 D2/D3;
  added coupling notes to Phase 7 + an open question; sharpened every Depends-on.
**Confirmed:**
- The drafts local+PDS architecture maps cleanly onto meal plans (store +
  sync + page-recovery), so Phases 4/9 are low-risk pattern replication.
- `app.arecipe.mealPlan` (not `exchange.recipe.*`) is required by the ownership
  policy — the central correction of the thinking artifact holds.

### Open-question walk-through — 2026-07-10
All 5 open questions confirmed with the user one at a time:
1. Tab order → `Browse · Cookbook · My recipes · Meals · Reference` (PHASE-GATED).
2. Search leg → palette **source switch** (My Cookbook / Browse = starter feed +
   handle lookup + filter); no dish-name search. Reasoning, Phase 7, and Phase 0
   D3 updated accordingly (PHASE-GATED).
3. Cookbook coupling → build on `origin/main`, re-verify D2 at merge (PHASE-GATED).
4. `startDate` → relative weeks in v1, field retained for a follow-up (ADVISORY).
5. Plan count → single implicit plan in v1; store keeps ids for a follow-up
   (ADVISORY).
No severities overridden. Tally: 3 PHASE-GATED, 2 ADVISORY, 0 BLOCKING.

### Pass 3: Quality Gates — 2026-07-10
Clean-eyes gate pass over the whole plan; codebase spot-checked at `origin/main`
(`src/log.ts`, `drafts-sync.ts`, `drafts-local.ts`, `cookbook.ts`, `feed.ts`,
`mine.ts`, `nav.ts`, plus README/LEXICONS/DESIGN anchors). All changes additive.

**Two factual corrections (Pass 2 missed these; both verified firsthand):**
1. **Palette seam location.** The plan claimed `membersToAuthors` lives in
   `src/social/cookbook-members-view.ts`. That file **does not exist on
   `origin/main`** — `membersToAuthors` is a **page-private helper at
   `src/pages/cookbook.ts:47`** (~11 lines: member→`{handle,did}` + `resolveDidDoc`
   fallback from `src/identity/did.ts`). Fixed Verified Assumptions, "Not yet
   verified", Phase 0 D2 probe target, Phase 7 changes/read-set/coupling: the
   adapter **replicates** the helper on `origin/main` and swaps to the exported
   version only after the in-flight branch merges. Sharpens confirmed Q3; does
   not reopen it.
2. **Drafts storage backend.** The plan called `drafts-local.ts` a "localStorage
   store" it "mirrors." It is **IndexedDB-backed** (`indexedDB.open`). Fixed
   Reasoning + Phase 4: the meal-plan store copies the drafts **mechanics**
   (write-through on save + recovery-on-load + idempotent rkey), and Phase 4
   **deliberately** chooses `localStorage` for one small record — a considered
   divergence. (See the post-Pass-3 resolution below, where the user's
   cross-browser-persistence requirement settled this as `localStorage` and
   reframed the local store as an in-flight buffer, not the source of truth.)

**TDD ordering:**
- Flagged Phases 3 and 4 per focus area #1 — both are library phases whose
  Verification (`test:unit -- meal-plan` / `meal-plan-local`) proves modules **in
  isolation only**, not through an entry point. Rather than force a synthetic
  wiring test, added an explicit **export → wiring-phase map** to Phase 3
  (`validateMealPlanValue`→P9, `slotWithRecipe`→P9, `expandCalendar`→P6, types→
  typecheck) with a guard: no export lands without its mapped consumer phase's
  e2e/LIVE test asserting on it. Phase 4's store is wired by Phase 5's e2e.
- Resolved a Phase 3/Phase 4 call-chain contradiction: Phase 3 claimed "the store
  validates via `validateMealPlanValue`," but Phase 4 stores the *editable* shape,
  not the record shape — the validator is a PDS-boundary function wired in Phase 9,
  not Phase 4. Corrected in Phase 3's export map.
- Mutation resistance: Phase 3's test spec named single boundaries (6-day reject);
  added the opposite edge (8-day) and `repeat` boundary cases (reject 0/13, accept
  1/12 per the 1–12 schema range) so assertions survive one-line mutations.

**Observability:** The plan named logging only once (a vague Phase 4 line). Added
concrete `log.*` seams grounded in the exact codebase posture:
- Phase 4 store: `log.debug('meal-plan','saved'/'removed')` on success; corrected
  the fail posture to the real drafts model (fail-loud-in-store,
  `log.warn` at the call site per `mine.ts:71`, tolerate-corrupt-on-read).
- Phase 5/6 page: single `log.debug('shell','mounted',{page:'meals',signedIn})`
  (mirror `mine.ts:161`).
- Phase 7 palette: per-loader `log.warn('meal-plan','palette source failed')` +
  `log.info('…','palette loaded',{source,count})` (mirror `cookbook.ts:95/119`,
  `feed.ts:59`) so a blank palette is diagnosable.
- Phase 9 sync: `info` on sync/remove, `debug` on tolerated remove-skip, `warn` on
  malformed-record skip and recovery failure (mirror `drafts-sync.ts:52/64/67/83`,
  `mine.ts:103/107`).

**Debugging readiness:** Phase 0 remains the structural checkpoint; each
implementation phase keeps a per-phase e2e/LIVE gate and commit. The added log
seams make a post-deploy, backendless failure traceable from the console alone
(the stated intent of `src/log.ts`).

**Validation calibration:** Confirmed calibrated — P1/P5/P6/P8 Moderate (wiring
e2e + manual), P2/P3/P4 Narrow (unit), and the two risk phases **validate beyond
the harness**: P7 Broad (unit + e2e + manual signed-in run pulling a real handle),
P9 Broad (unit + `LIVE=1` e2e + two-context PDS check). No change needed.

**Concurrency honesty:** Map confirmed. Re-verified write-set disjointness for the
sole opt-in parallel set {P2, P3} after Pass 3's edits: P2 writes `src/nav.ts` +
`tests/unit/nav.spec.ts` + `docs/DESIGN.md`; P3 writes the fixture +
`src/recipes/meal-plan.ts` + `docs/LEXICONS.md` + its test — still disjoint (the
two doc files differ). Shared-state contract already stated as invariants;
re-entry checks concrete. P5–P9 all write `src/pages/meals.ts` → correctly
strictly sequential. No new parallelism surfaced (the model→store→page→sync spine
is genuinely serial). Sequential plan confirmed honest.

**Documentation impact:** All three doc updates are scheduled in the phase that
makes them stale (README→P1, DESIGN→P2, LEXICONS→P3 `planned`→P9 `live`) — no
trailing docs phase. Verified anchors exist: README inventory (prose, lines
32–35), LEXICONS `app.arecipe.* — created` table (line 87), DESIGN "Navigation:
pages, not modals" (line 110). Added a note that the README target is a prose
sentence, not a table.

**No-stubs / ≤3 files:** Confirmed every phase is ≤3 production files (P1=3:
`meals.html`+`meals.ts`+`build.mjs`; all others ≤2). Phase 5 is the largest
behavioral scope but only 2 files and already scoped (calendar→P6, palette→P7,
drag→P8) with a `meal-plan-view.ts` extraction escape hatch — no stub pressure.

**Resolved with the user (2026-07-10, post-Pass-3):**
- **Meal-plan store backend → `localStorage` (decided).** The user confirmed the
  saved plan must hit the PDS to persist across browsers, so the **PDS record is
  the durable home and the local store is a disposable in-flight buffer**. With
  durability owned by the PDS, the local backend choice is only about the scratch
  buffer; `localStorage` wins on the tap-to-place optimistic-update loop
  (synchronous read/write, no async flicker) for a single ~KB record, and IDB's
  robustness/indexing buy nothing this feature uses. Updated the Persistence
  decision, the Reasoning section (roles table + "Why `localStorage`"), and
  Phase 4's Storage-API note. This also **reframed the persistence model**: drafts'
  local store is the source of truth, whereas meal plans' local store is a buffer
  in front of a PDS home — same write-through mechanics, inverted authority.

**Confirmed ready:** yes — no BLOCKING items; 3 PHASE-GATED + 2 ADVISORY carry
over confirmed. The Pass 3 storage-backend flag is now **resolved** to
`localStorage` (no open flag remains).

### Phase 0 execution — 2026-07-10
Ran the three discovery probes under the Discovery Exemption. Setup: this worktree
had no `node_modules` — ran `npm ci` (184 pkgs, lockfile-deterministic) to enable
the codec probe and all downstream phases.

**D1 — split into structural (done) + live (deferred).** The worktree has no
`.env`/PDS credentials and the only known account is production
`arecipe.bsky.social`, so the planned live createRecord→getRecord→deleteRecord
could not run here. Instead ran the **structural** half offline via a throwaway
probe against the exact PDS codec (`recomputeCid`): a 2-week/7-slot value with a
strongRef+note slot, empty slots, and `startDate`/`langs` → **PASS** (bytes
round-trip byte-identical, CID stable, order-insensitive deep-equal). Surfaced
that **DAG-CBOR canonicalizes map key order**, which is the mechanism behind
stable CIDs / Phase 9's idempotent rkey. Probe deleted per `throwaway`
disposition. The **live-acceptance** half is deferred to Phase 9's `LIVE=1`
e2e (its natural home) — recorded as a Phase 9 gate. Low residual risk: existing
unknown `app.arecipe.*` collections all write fine.

**D2 — PASS.** Captured firsthand signatures: `FeedAuthor`, `loadAuthorsFeed`,
`CachedRecipe` (entry exposes `uri`/`cid`/`value.name`), `resolveCookbook`,
`loadStarterFeed = loadAuthorsFeed`, and the page-private `membersToAuthors`
(`cookbook.ts:47`) body Phase 7 replicates. Moved to Verified Assumptions.

**D3 — PASS.** Confirmed the two Browse read chains (starter feed via
`createStarterPrefs().enabledAuthors()` → `loadStarterFeed`; handle lookup via
`createResolver` → `createRecipeReader`) and **no global recipe search** (Browse
"search" is a single-handle resolve+read, `browse.ts:317`). Moved to Verified
Assumptions.

**Plan changes:** Verified Assumptions "Not yet verified" bullets promoted to
firsthand D1/D2/D3 findings; Phase 0 marked executed; Phase 9 carries the D1 live
gate. No later phase needed structural changes — the Phase 3 schema stands as
written. **No BLOCKING items introduced.**

**Checkpoint:** Phase 0 is the pre-implementation decision point. Paused here for
user go-ahead on Phase 1, and for the user's call on the D1 live leg (defer to
Phase 9 [recommended] vs. run now against production creds).
