# Cook follows + unified search/filter toolbar (Browse, Cookbook, Account)

**Status:** ✅ **Built 2026-07-15** on branch `claude/cook-follows-toolbar-h5iz1u`.
All six phases landed with the locked design. Full gate green at the end of every
phase (lint · typecheck both tsconfigs · 489 unit · build · 174 e2e). See the run
summary at the bottom for red→green evidence, Phase 0 drift, the deliberately-
changed e2e assertions, and the [verify-in-run] outcomes.

## Problem statement

Two coupled changes:

**A. Cook follows.** Browse's handle lookup is a feed-*replacing* search. We reframe
it as **look-up → preview → follow**: looking up a cook previews only their recipes
(this-list-only, survives open-recipe-and-return via `last-find`); a **Follow**
action adds them to your cooks so the default feed merges them in. Signed out,
Follow persists device-locally (never the PDS). Signed in, Follow also writes a
public per-cook `app.arecipe.cookFollow` record — arecipe's analog of
`app.bsky.graph.follow`. Account's members listing gains the same add mechanism at
the top, an `added` badge, and per-row unfollow.

**B. Toolbar unification.** Browse and Cookbook stacked several rows of mixed-idiom
controls. We restructure both to a shared contract: content search is the primary
search on row 1; filters collapse behind one `Filters ▾` disclosure with a count
badge (D7).

## Phase 0 — grounding against main (post-search-run, verified 2026-07-15)

- **Toolbar** (`src/recipes/toolbar.ts`): ONE `.browse-controls` row holds, in order,
  the `Tiles|Details` segmented (`view-tiles`/`view-details`), the `recipe-search`
  input (`type=search`, testid `recipe-search`), the `photos-only` checkbox pill,
  and a `.browse-facets` container with `Meal ▾` / `Cuisine ▾` (`renderFacetDropdown`,
  `details.facet-dd`, `name="browse-facet"`). Below it, `.browse-count` carries
  `reset-filters` + `reset-sep` + `recipes-status`, plus (Browse only) a
  `preference ↗` diet link. **Drift vs §2:** the search input already exists (post
  search-run) and sits inline on the single control row — not yet split into D7's
  rows. No `filters-dd`, `add-cook`, or aggregate `facet-count` badge exists yet.
- **Browse** (`src/pages/browse.ts`): `runFind(handle)` → resolve → read whole repo →
  `showEntries` sets `current={kind:'search',author,…}`, replacing the feed;
  `last-find` (sessionStorage) restores on return; actor typeahead on the `form`
  input; export button + panel present; default feed = starter (`showStarterFeed`).
- **Cookbook** (`src/pages/cookbook.ts`): `Mine|Liked|All` source segmented is
  *prepended into* `.browse-controls`; New Recipe rides the header.
- **Account** (`src/pages/account.ts`): `mountMembersList` renders members; taste
  prefs use `facet-count` bubbles + exclusive-accordion `name="taste-never"`.
- **LEXICONS.md**: flat `app.arecipe.*` style; `app.arecipe.mealPlan` is the closest
  analog (own PDS `listRecords`, unauth read).
- **Bundle-split guard** (`tests/e2e/nav.spec.ts`): the built browse bundle must not
  contain `oauth` and must be < 200 KB. Constrains D5.

## Locked decisions

D1–D9 as given in the run instructions. Key resolutions:

- **NSID (ledger #1):** `app.arecipe.cookFollow` — flat `app.arecipe.*` style,
  matching `app.arecipe.mealPlan`/`comment`/`interaction`. Value mirrors
  `app.bsky.graph.follow`: `{ subject: <did>, createdAt: <datetime> }`.
- **Read path (ledger #2):** `listRecords` on your own PDS, unauthenticated — the
  identical path `resolveCookbook` already uses for `app.bsky.graph.follow` and
  `listPdsPlans` uses for `app.arecipe.mealPlan`. Live behavior assumed equivalent
  to mealPlan (no live test this run; recorded as assumption).
- **Filters ▾ accordion (ledger #3):** a single disclosure, so popover stacking is
  not a concern; it reuses the `details.facet-dd` popover idiom. The per-dimension
  Meal/Cuisine dropdowns move *inside* the popover, so they no longer share the
  toolbar row and their `name="browse-facet"` accordion stays intact.
- **D5:** the local store (`cook-follows-local.ts`) is the universal read model.
  Browse reads ONLY the local store (keeps the zero-auth bundle). Signed-in pages
  mirror PDS `cookFollow` records down into the local store on load.

## Phases

1. **Pure cores** — lexicon fixture + LEXICONS row first; `cook-follows-local.ts`
   (durable `{did,handle}[]`, defensive) + `cook-follows-pds.ts` (list/follow/
   unfollow/mirror-down via fetch-fake + Agent), red-first.
2. **Membership** — `resolveCookbook` `added` source (priority you→starter→added→
   follow→follower); reach `added`; members-view badge + unfollow; Account add-panel
   mount + D6 publish offer.
3. **Browse preview + follow + merged feed** — default feed = starter + local
   follows deduped by DID; preview follow control; `last-find` preserved.
4. **Toolbar restructure (D7)** — row contract, `filters-dd` with aggregate
   `facet-count`, Browse `add-cook` panel, honest count outside; both pages + CSS.
5. **e2e + mobile** — preview/follow/account/filters specs; `mobile-fit` row-count
   extension (Browse ≤2, Cookbook ≤3); bundle guard stays green.
6. **Docs + closeout** — LEXICONS re-check, this Status, run summary.

## Deferred (D9)

- follows-of-follows reach source
- per-author facet/filter in the merged feed
- relocating export
- starter-pack UI changes

## Run summary (2026-07-15)

### Red → green evidence per phase

- **Phase 1 — stores.** RED: `cook-follows-local.spec.ts` + `cook-follows-pds.spec.ts`
  failed to import (modules absent). GREEN after adding the lexicon fixture +
  LEXICONS row, then `cook-follows-local.ts` / `cook-follows-pds.ts` (15 tests).
- **Phase 2 — membership.** RED: extended `cookbook.spec` (added source + priority),
  `reach.spec` (added key), `cookbook-members-view.spec` (added badge + unfollow) —
  6 failing. GREEN after the resolver `added` source, reach `added`, members-view
  badge/unfollow, the shared `add-cook-panel`, and `mountMembersList` add/mirror/
  unfollow/D6 wiring.
- **Phase 3 — Browse.** RED: `default-feed.spec` (merge/dedup) failed absent. GREEN
  after `mergeCookAuthors` + Browse preview bar / follow control / merged default
  feed. e2e `cook-follows.spec` (preview-only, round-trip, follow→feed, durable
  signed-out + zero PDS writes) authored and green.
- **Phase 4 — toolbar.** RED: `toolbar.spec` D7 block (Filters disclosure, badge,
  facet groups, slots) — failing. GREEN after the `renderToolbar` rewrite +
  `renderFacetGroup` + both pages' wiring + CSS.
- **Phase 5 — e2e/mobile.** Added mobile row-count guards + Filters-badge e2e;
  made `mountMembersList` injectable and covered the signed-in add/unfollow/D6
  flow hermetically (3 wiring tests, red first via absent behavior).

### Phase 0 drift findings (vs §2 of the run file)

The pre-search-run snapshot said the Browse lookup was a plain feed-replacing
search. On main it already carried a `recipe-search` input (post search-run) on a
single `.browse-controls` row — no `filters-dd`/`add-cook`/aggregate badge yet.
Adapted the phase details (not the locked decisions): Part B moved the existing
`recipe-search` to row 1 and collapsed photos/facets behind the new Filters
disclosure; the handle lookup moved into the new `+ Cook` panel.

### Deliberately-changed e2e assertions (D7 behavior change)

The toolbar restructure intentionally changed these specs:
- `browse.spec`: photos-only / facet / reset interactions now open `Filters ▾`
  first; Meal/Cuisine are flat checkbox groups in that one popover (not per-
  dimension dropdowns); the cook lookup moved to the `+ Cook` panel
  (`add-cook`/`add-cook-input`/`add-cook-submit`) and now shows a preview.
- `cookbook.spec`: reset lives inside `Filters ▾`.
- `starter.spec`, `offline.spec`, `recipes.spec`, `two-device-read.spec`: Browse
  lookups moved to the `+ Cook` panel.
- `landing.spec`, `nav.spec`, `reference.spec`: Browse presence now asserted via
  `recipe-search` (the old `find-recipes`/`handle-input` are gone from Browse).
- `mobile-fit.spec`: Browse ready selector `recipe-search`; tap-target `add-cook`
  replaces `find-recipes`.
New coverage: Browse ≤2 / cold-view Cookbook ≤3 toolbar rows @390px; Filters badge
count; preview/follow/merge; durable signed-out follow with zero PDS writes.

### [verify-in-run] outcomes

1. **NSID:** `app.arecipe.cookFollow` (flat `app.arecipe.*` style, value
   `{subject, createdAt}` mirroring `app.bsky.graph.follow`).
2. **listRecords for a novel `app.arecipe.*` collection:** assumed equivalent to
   `app.arecipe.mealPlan` (public `listRecords` on own PDS, unauth). No live test
   this run — recorded as assumption; the hermetic fetch-fake tests exercise the
   read/parse path.
3. **Toolbar rows / accordion:** main had one control row + a count line. The
   single `Filters ▾` disclosure needs no exclusive-accordion `name` (only one
   popover); the per-dimension dropdowns became flat groups inside it, so nested
   popover stacking is a non-issue.

### Notes / follow-ups

- Signed-in **Account** cook-follows UI is covered hermetically by the injectable
  `mountMembersList` unit tests; an end-to-end signed-in pass remains an `@live`
  concern per the repo's split (needs real credentials, out of scope this run).
- Deferred (D9), unchanged: follows-of-follows reach source; per-author facet in
  the merged feed; relocating export; starter-pack UI changes.
