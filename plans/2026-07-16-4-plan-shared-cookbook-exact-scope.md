# Shared cookbook = exactly the owner's recipes + their likes

**Status:** ✅ **Implemented 2026-07-16** (same day), TDD-first red → green.
Gate green: lint · typecheck (both tsconfigs) · 544 unit · build · **186**
hermetic e2e (browser via the CLAUDE.md `executablePath` override). Unit red
verified before implementation (8 failed); the reworked cookbook.spec semantics
red-verified against the pre-change page code (`git stash src` → build → 4
failed → pop). Visual check: 390px screenshot over the new fixtures — banner +
4 tiles (2 own + 2 liked), "4 recipes".

Owner decision, follow-up to the shared-view run in
`2026-07-16-3-plan-cookbook-filter-line-share-icon-shared-view.md`.

## Problem

The shared cookbook view (`cookbook.html?did=<did>`) predates the sharing
feature: it renders the viewed account's **reach feed** — `resolveCookbook`
resolves their starter/follows/followers members and `loadAuthorsFeed` loads
all of those authors' recipes. But the cookbook the owner actually sees (and
now shares, via the title-row share icon) is **Both = their own recipes +
their liked recipes**. Sharing should hand the recipient exactly that, not a
broader (and slower — full member fan-out) feed of everyone the owner follows.

## Mission

Shared view (`?did=`) = the viewed account's **own recipes + their liked
recipes, deduped** — the same set their signed-in "Both" shows. Their follows'
un-liked recipes must NOT appear.

## Phase 0 — grounding

- **Both halves are public reads.** Own recipes: `loadAuthorsFeed([viewed])`
  (`com.atproto.repo.listRecords`, CORS-open, no auth). Likes:
  `listInteractionsFor({pds, did, kind: 'liked'})` reads the
  `app.arecipe.interaction` collection off their repo (plain fetch, no agent),
  then `loadLikedFeed` resolves each ref DID→PDS and `getRecord`s it. The
  signed-in "Liked" source already runs exactly this pair — the shared view
  reuses it verbatim.
- **SWR cache is author-keyed.** `cookbook-feed-cache` persists
  `{authors, fetchedAt}` per viewed DID; the cache-first paint filters the
  IndexedDB recipe cache by author DID. Liked recipes live on OTHER authors'
  DIDs, so an author-only filter would drop them from the instant paint.
- **Liked authors have no handles.** `loadLikedFeed` resolves each ref's DID
  doc (for the PDS) and throws the handle away; liked entries then render with
  the raw DID as the author fallback (`view.ts` `authorsByDid[did] ?? did`).
  The signed-in Both view has the same gap today.
- **The e2e cold-view fixtures encode the OLD semantics** (VIEWED follows
  FOLLOW; FOLLOW's 4 recipes fill the feed) across `cookbook.spec.ts` and
  `cookbook-share.spec.ts` — they must be reworked to own+liked, and gain a
  regression guard that a follow's un-liked recipe stays OUT.

## Decisions

- **D1 — shared loader = own + liked, deduped, own first** (mirrors the
  signed-in Both's mine-then-liked order). `resolveCookbook` is no longer
  called on the shared path (faster: no member fan-out). A liked-fetch failure
  degrades to own-only with a warning — never blanks the feed (house posture).
- **D2 — `loadLikedFeed` returns `{entries, authorsByDid}`.** It already
  resolves each ref's DID doc; keep the handle instead of dropping it, so
  liked entries render with real author handles on the shared view AND the
  signed-in Both (call sites merge maps: feed/member handles win on conflict).
- **D3 — feed meta gains optional `likedUris`.** `FeedMeta` becomes
  `{authors, fetchedAt, likedUris?}` (`writeFeedMeta(did, meta, opts)`); the
  cache-first paint filters cached recipes to `author ∈ meta.authors OR
  uri ∈ likedUris`. Shared view persists `authors=[viewed]` + the shown liked
  uris → a revisit paints the complete Both set instantly. Old persisted meta
  (no `likedUris`) reads tolerantly as before. The signed-in path is unchanged
  (its liked feed stays a fresh lazy fetch; it persists no likedUris).
- **D4 — empty copy.** A shared cookbook with nothing published or liked says
  so ("This cookbook is empty — nothing published or liked yet."), replacing
  the members-feed phrasing that no longer describes the cold view.
- **D5 — signed-in view untouched** beyond the D2 author-handle improvement.
  (That the signed-in page still loads the reach feed it never displays is a
  separate cleanup, out of scope here.)

## TDD order (red → green)

1. **Unit — cookbook-feed-cache.spec:** `likedUris` round-trip; tolerant read
   of old meta without it; writeFeedMeta's meta-object signature.
2. **Unit — liked-feed.spec:** return shape `{entries, authorsByDid}` with
   handles from the per-ref DID docs; existing edge cases keep passing on
   `.entries`.
3. **E2E — rework the cold-view fixtures** (cookbook.spec + cookbook-share.spec):
   VIEWED owns 2 recipes (Greek Salad, American Pancakes) and has 2 `liked`
   interactions on FOLLOW's recipes (Italian Minestrone, Greek Vegan Lunch
   Bowl); FOLLOW also publishes an un-liked "Follow-Only Dish". New test: the
   shared feed is exactly those 4 — the follow-only recipe absent, liked
   entries showing FOLLOW's handle. Existing feed/taste/search/SWR/mobile
   tests keep their assertions on the reworked fixtures; the SWR test now also
   proves the instant paint includes the liked recipes (via `likedUris`).
4. **Green:** `src/social/liked-feed.ts`, `src/social/cookbook-feed-cache.ts`,
   `src/pages/cookbook.ts` (shared loader + cache paint + empty copy + liked
   author merge). Full gate.

## Outcome

Shipped as planned; one in-flight adjustment: the "liked entries carry a real
author handle" e2e assertion moved from visible text to the row link's `by=`
param — the details view only prints the author in the verified-provenance
footer, and the fixture records are unverified, so the link param is the
observable surface. Touched: `src/social/liked-feed.ts` (returns
`{entries, authorsByDid}`), `src/social/cookbook-feed-cache.ts` (`FeedMeta`
gains optional `likedUris`; `writeFeedMeta(did, meta, opts)`),
`src/pages/cookbook.ts` (shared loader = own + liked deduped with no member
fan-out, cache paint covers `likedUris`, liked-author merge on both views,
shared empty copy). E2E fixtures reworked in cookbook.spec (own 2 + liked 2 +
an un-liked "Follow-Only Dish" guarded absent) and cookbook-share.spec (owner's
own recipes). One nice side effect: the signed-in Both/Liked views now show
liked recipes' real author handles too.
