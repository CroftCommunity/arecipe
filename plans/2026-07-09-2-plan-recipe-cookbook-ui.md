# arecipe — recipe-page + cookbook UI overhaul (likes, overlay, hide, comments, toolbar)

Pass 1 (base) — 2026-07-09. Analysis only, no code. Pass 2 (gap analysis) and
Pass 3 (quality gates) to follow in fresh contexts before execution.

**Execution isolation:** this plan is developed and will execute on branch
`recipe-cookbook-ui`, branched off `main` at **`027a4f9`** (the watercolor
banner commit) so it stays clear of another plan currently deploying to `main`.
Rebase/merge onto the latest `main` before the feature branch is consolidated.

## Problem Statement

A batch of related UI/UX changes across the recipe page, Cookbook, and Account,
requested together. Grouped by surface:

**Recipe page (`recipe.html` / `src/pages/recipe.ts` + `src/recipes/view.ts`):**
1. **Drop "saved", keep only "like".** Today each recipe has both a like
   (public, cookbook-scoped count) and a save (private bookmark) toggle
   (`src/social/interactions.ts` kinds `liked`/`saved`). Remove `saved`
   entirely; "like" becomes the single collect/approve action. (Note: no
   "Saved" view was ever built — `mine.ts` has only Drafts — so nothing
   currently displays saves; see OQ1 for where liked recipes should surface.)
2. **Move the like heart onto the image** as an overlay in the upper-right of
   the recipe banner (currently a button in a separate `.interactions` section
   below the detail).
3. **Center the comment section** at the bottom of the page.
4. **Restyle the comment composer** — the `Add a comment…` textarea + `Post
   comment` button read as unstyled/off vs the design system.
5. **Fix dark-mode link contrast.** Some links (e.g. the commenter handle
   `.comment-author` on a posted comment) render as default browser blue —
   unreadable on the dark `--tile`. All content links should use the same
   readable themed color the credit/provenance links already use
   (`--enamel`).
6. **"Hide this recipe" → "Hide".** Move the control onto the same horizontal
   line as the recipe title (title left, control far-right, under the image),
   rename to just "Hide", and require a confirmation before hiding.

**Account page (`account.html` / `src/pages/account.ts`):**
7. **Surface the cookbook-members list on Account.** The members list (starter
   cooks + Bluesky follows/followers with role labels, plus the "Your starter
   cooks plus who you follow…" explainer and Settings link) currently renders
   only on Cookbook (`cookbook.ts` `renderMembersList`). Show it on Account too
   when signed in.

**Cookbook page (`cookbook.html` / `src/pages/cookbook.ts`):**
8. **Add the Browse-style toolbar** — a Tiles/Details view toggle, `Meal ▾` /
   `Cuisine ▾` facet dropdowns, and a count — driving the same view/filter over
   the Cookbook recipe feed that Browse already provides.
9. **Add a source filter: "my recipes" (ones I created) and/or "liked"
   (hearted) recipes**, either/or, on that toolbar.
10. **A "New Recipe" button** on the far right of the toolbar that opens the
    recipe-builder page.

**Alchemy (was "My recipes" — `mine.html` / `src/pages/mine.ts`):**
11. **Rename "My recipes" → "Alchemy"** and make it the drafting workspace:
    create · edit · save · publish new recipes, its own New Recipe button, and a
    top tag toolbar (tag scope per OQ9). Distinct from Cookbook (published +
    liked + members); Alchemy is your unpublished/authoring space.

Scope boundary: this plan is UI/UX + the minimal data plumbing those views
need (reading the viewer's own `liked` records into a feed). It does **not**
add new atproto lexicons, change the like/comment record formats, or touch
auth/CSP. The security posture (CSP/SRI) from
`plans/2026-07-09-1-plan-security-posture-and-csp-hardening.md` must be
preserved — no inline styles/scripts (style-src/script-src 'self'), assets
same-origin.

## Reasoning

**Why grouped but phased small.** These are independent-feeling asks but they
cluster on a few shared files — `styles.css`, `src/recipes/view.ts`,
`src/pages/recipe.ts`, `src/pages/cookbook.ts` — and two of them (the Cookbook
toolbar, the Account members list) are best served by *extracting existing
Browse/Cookbook code into shared components* rather than duplicating. So the
plan front-loads a discovery pass (is the Browse toolbar cleanly extractable?
can we build a "liked recipes" feed from the viewer's own interaction records?)
and then ships one concern per phase, each ≤ 3 files, each leaving a working,
committable app.

**Why "like" absorbs "save" (item 1).** `saved` is a half-wired feature: the
recipe page writes `app.arecipe.interaction` records with `kind:'saved'`
(`interactions.ts:16`), but no view ever lists them (`mine.ts` is Drafts-only;
the "Saved view under My recipes" in the `interactions.ts:4` comment was never
built). Meanwhile the Cookbook "liked" filter (item 9) is exactly a
collect-your-hearted-recipes view. So likes cleanly subsume the bookmark role:
remove `saved`, and liked recipes surface via the new Cookbook "liked" filter.
This is coherent — one action (heart), one collection view (Cookbook → Liked).

**Why the heart moves to the image (item 2).** The interactions currently
mount as a `.interactions` `<section>` appended after the detail
(`recipe.ts:264`). An image overlay is a common, compact pattern and frees the
below-image space. The banner element is built in `renderRecipeDetail`
(`view.ts:288`, `.photo-wrap--banner`), which already overlays the image credit
(`imageCreditOverlay`, `view.ts:123`) — so an absolutely-positioned overlay on
`.photo-wrap` is an established pattern here. The cookbook-scoped like *count*
and sign-in gating (`recipe.ts:296-300`) stay; only the control's location
moves. (OQ7: heart placement when the recipe has no photo → the no-meal
placeholder.)

**Why the link fix is a themed color, applied broadly (item 5).** There is no
global `a {}` color rule in `styles.css` (confirmed — only `a.card` at :696),
so any anchor without an explicit class color falls back to UA blue, which is
unreadable on the dark tile. The project already solved this locally for the
interaction/reset links with a comment: *"link blue, unreadable on the dark
--tile background. --enamel has a light and a dark variant, so it reads in both
themes"* (`styles.css:548-550`), and `.provenance-author` / `.nav-auth` /
wordmark all use `--enamel`. The fix generalizes that: give content anchors a
themed default (`--enamel`) so `.comment-author` (`comments-view.ts:31`, no
color today) and any future link inherit the readable color in both themes.

**Why extract the toolbar rather than duplicate (items 8-10).** The Browse
toolbar is built inline in `browse.ts:48-91` (segmented Tiles/Details, Photos-
only, facet dropdowns via the reusable `renderFacetDropdown`/
`renderRecipeDetailsList` in `view.ts`, a count block). Its filter/state lives
in `browse-state.ts` (`BrowseState`, `matchesFilter`, `availableFacets`,
`createBrowsePrefs`). Cookbook needs the same toolbar over its own feed, so the
right move is to extract a reusable `renderToolbar(...)` (Phase 7) that both
pages consume — behavior-preserving for Browse, then adopted by Cookbook
(Phase 8). Duplicating the inline toolbar would fork two copies that drift.

**Why the Account members list is an extraction (item 7).** `renderMembersList`
+ `membersToAuthors` live inside `cookbook.ts` (`:61`, `:47`). Extract them to a
shared view module so Account and Cookbook render the identical list from the
same code.

**Alternatives considered & rejected:**
- *Native `confirm()` for Hide (item 6).* Rejected as the default — a blocking
  JS dialog is untestable in the hermetic Playwright tier and jarring; prefer
  an inline two-step confirm (Hide → "Hide? · Confirm / Cancel"). See OQ5.
- *Duplicate the toolbar into cookbook.ts.* Rejected — drift; extract instead.
- *Keep `saved` in the lexicon but hide the button.* Rejected — leaves dead
  write paths and a confusing two-kind model; remove it cleanly (old `saved`
  records simply stop being read — harmless).
- *A brand-new "Liked recipes" page for item 1.* Rejected as redundant with the
  Cookbook "liked" filter (item 9) — that IS the liked collection.

## Verified Assumptions

- **Interactions model.** `app.arecipe.interaction` records carry `kind`
  (`'liked'|'saved'`, `interactions.ts:16`; `KINDS` is module-private at `:17`,
  not exported), a recipe `strongRef`, `createdAt`. `summarize` (`:111-123`)
  returns `{likeCount, youLiked, youSaved}`; add/remove =
  `createRecord`/`deleteRecord` (`:155-201`). Confirmed by reading the file.
  **[Pass 2 correction]** `summarize` dedupes likers **by author DID**
  (`:115` `new Set(...map(i=>i.author))`) over *whatever interactions it is
  handed* — it does **not** scope to a cookbook or recipe itself. The
  cookbook-scoping is emergent: `loadRecipeInteractions` (`:89-107`) is the
  aggregator that narrows by `recipeUri` and by the cookbook `repos` passed in,
  then hands the result to `summarize`. So "cookbook-scoped like count" is a
  property of the *caller*, not of `summarize`. Phase 3 (overlay) is
  presentation-only and does not touch this scoping.
- **A "liked recipes" feed needs a NEW by-ref loader (not just reuse).**
  `listInteractionsFor(target, {kind:'liked'})` (`interactions.ts:55-58`) reads
  the viewer's own repo and returns `Interaction[]`, each carrying a recipe
  `strongRef` (uri+cid) — **but the value can fall back to `{uri:'',cid:''}`
  when a record lacks `recipe` (`:77`), so empties must be filtered out.**
  **[Pass 2 correction]** There is **no by-URI / by-strongRef batch recipe
  loader anywhere.** The existing feed path `loadAuthorsFeed` (`social/feed.ts:33`)
  loads **by author**: `resolveDidDoc(author.did)` → `createRecipeReader` reads
  that repo's recipes → `cache.put` → `CachedRecipe[]` (using `createRecipeCache`
  `recipes/cache.ts:79` + `createRecordReader`/`createRecipeReader`
  `recipes/read.ts:45,64` + `resolveDidDoc` `identity/did.ts`). The liked feed
  is keyed by **recipe URI**, not by author, so Phase 9 must build a new
  `loadLikedFeed(interactions) → CachedRecipe[]` that (1) filters empty refs,
  (2) parses each `at://did/exchange.recipe.recipe/rkey`, (3) `resolveDidDoc(did)`
  → pds (**cross-PDS: a liked recipe may live on another PDS**), (4)
  `createRecordReader({pds,did,rkey})`, (5) `cache.put` → `CachedRecipe`, then
  (6) `renderRecipeList`. It reuses the same *primitives* as `loadAuthorsFeed`
  but is a genuinely new function, with a discovery **cap**. Designing this
  signature is Phase 0 D2's real job (the path does not yet exist); true
  cross-PDS behavior needs `@live` to verify.
- **Save is half-wired.** Recipe page renders a save toggle (`recipe.ts:272`,
  `:300`, `:365`); no view lists saved recipes (`mine.ts` = Drafts only).
  Confirmed by grep — no `Saved` view anywhere in `src/`.
- **No global anchor color.** `styles.css` has no `a{color}` rule (only
  `a.card` at :696); `.comment-author` (`comments-view.ts:31`) sets no color →
  UA blue. `.provenance-author`/`.nav-auth` use `--enamel` (`:337`, `:194`).
  `--enamel` has light (`#175e54`) + dark (`#5cb3a1`) variants. Confirmed.
- **Recipe detail structure. [Pass 3 exec / REBASE RE-GROUNDING 2026-07-09 —
  line refs + structure updated after rebasing onto `origin/main` `7db0999`
  (+37 commits: versioning, fun facts, Focus mode).]** `renderRecipeDetail`
  (`view.ts:468`, was `:280`): banner (`.photo-wrap--banner`, `:476-477`, with
  the `imageCreditOverlay` credit at `:478`; `imageCreditOverlay` def now `:176`,
  was `:123`) → **NEW `.detail-actions` Focus-button block** (`:481-491`, only
  when `options.onFocus` is set — right-aligned row, `styles.css:981`) →
  `h2.recipe-title` (`:492`, was `:293`) → chips → lede → attribution → columns
  → **NEW fun-facts section** (`:512-515`, when `showFunFacts !== false`) →
  provenance. `.photo-wrap` still `position:relative` (`styles.css:741`);
  `.photo-wrap--banner .photo-credit` still bottom (`:887`). **`renderRecipeDetail`
  now takes `{author, onFocus?, showFunFacts?, ...}`.**
- **Recipe page is now VERSION-AWARE via `paintVersion` (NEW — rebase). This is
  the single most important re-grounding for Phases 2–5.** `recipe.ts` no longer
  renders once into `content`; it renders through **`paintVersion(host, entry,
  uri, author, getAgent, {checkStale})`** (`recipe.ts:411-468`), called on the
  initial load (`:548`) **and on every version flip** (`mountVersionFlip` →
  `flipTo` → `paintVersion`, `:510-518`). `paintVersion`:
  (1) `host.replaceChildren(renderRecipeDetail(entry, {author, onFocus, showFunFacts}))`
  (`:419-425`); (2) staleness check prepends a note (`:426-445`);
  (3) **builds the Hide button inline** (`:448-460`) and appends it to `host`
  (`:460`) — this REPLACES the old detached `recipe.ts:427` append; label logic
  `Hide this recipe`/`Unhide this recipe` at `:452`, toggle + `log.info` at
  `:454-459`; (4) `mountComments(host, …)` (`:462`) + `mountInteractions(host, …)`
  (`:465`). **Container for Phases 3/4/5 is `host` (`.version-host`), not the
  outer `content` (`.panel`).** Because `paintVersion` re-runs per flip, whatever
  Phases 2–5 change re-applies to each version automatically (no extra wiring),
  but tests must tolerate the `content > host > article` nesting (all selectors
  are testid-based, so this is fine).
- **Interactions/save current line refs (rebase; interactions.ts itself
  UNCHANGED).** In `mountInteractions` (`recipe.ts:255-369`): `like-button`
  `:268-270`, `like-count` `:271-272`, **`save-button` `:273-275`** (box.append
  `:276`); `render()` reads `youSaved` `:296` and sets `saveBtn` `:301-302`;
  generic `toggle(kind)` `:338`; `likeBtn`/`saveBtn` click wiring `:365`/`:366`.
  (Phase 2 targets shift from the Pass 2 refs `:272/:300-302/:365` to these.)
- **Comments current line refs (rebase).** `mountComments` `recipe.ts:113`;
  `.comments` `<section>` `:124`; `.comment-compose` form `:200`; `.comment-text`
  textarea `:202-204` (placeholder "Add a comment…"); `comment-post` `:215-217`.
  Phase 5 stays CSS-only.
- **Two NEW stale "My recipes" label refs surfaced by the rebase** (Phase 11a
  scope grows): (a) `recipe.ts:245` signed-out comment pointer "Sign in on **My
  recipes** to join the conversation." → "…on Alchemy…"; (b) `nav.ts` gained a
  4th destination **Reference** (`:69-73`), so `docs/DESIGN.md`'s canonical nav
  list is now "Browse · Cookbook · My recipes · Reference" — the 11a doc edit must
  rename *My recipes* while preserving *Reference*.
- **Image overlay precedent.** `imageCreditOverlay` already overlays the banner
  (`view.ts:123`, `:290`), so absolute-positioning on `.photo-wrap` is
  established. Confirmed.
- **Browse toolbar is inline + reusable pieces.** `browse.ts:48-91` assembles
  `.browse-toolbar`; `renderFacetDropdown`/`renderRecipeDetailsList`/
  `renderRecipeList` are in `view.ts`; state in `browse-state.ts`. Confirmed.
- **Cookbook structure.** `cookbook.ts`: `renderMembersList` (`:61`) +
  `renderRecipeList` feed (`:92`), assembled in `showCookbook` (`:100`).
  Explainer text at `:171`. Confirmed.
- **Editor is the recipe builder.** `editor.html`/`src/pages/editor.ts` is the
  existing authoring page (drafts, publish). "New Recipe Builder" is most likely
  this page (OQ2). Confirmed the page exists; identity is an OQ.
- **CSP constraint.** All styling must stay in the external `styles.css`
  (style-src 'self'); no inline `style=`/`.style` writes, no new remote assets
  (from the security plan). Confirmed by the shipped CSP.

## Documentation Impact

**[Pass 2 — D0 grep run early; real hits found. The Pass 1 claim "no app docs
go stale" was wrong.]** `.claude/` is empty. Symbols with NO doc hits (code-only,
nothing goes stale): `Alchemy`, `Hide this recipe`, `cookbook-members`,
`renderMembersList`, the `browse-toolbar` class. New source modules (shared
toolbar, members-view, liked-feed) are code, not docs. Real prose that DOES go
stale, mapped to the phase that makes it stale:

- `README.md:32-38` — page inventory incl. `:35` "`mine.html` (My recipes —
  drafting is account-free…)". The "My recipes" label → **Phase 11a** (rename to
  Alchemy).
- `docs/DESIGN.md:148` — canonical nav list "Browse · Cookbook · My recipes." →
  **Phase 11a**.
- `docs/DESIGN.md:167`, `:169-171` — "a section on My recipes…"; "**My recipes
  stays account-free for drafting**: signed out it shows New recipe + local
  Drafts plus a short pointer to signin.html." → **Phase 11a** (rename;
  New-recipe affordance already exists, see Phase 11a note).
- `docs/DESIGN.md:147-156` — "The page shows your cookbook members (with a source
  badge) and their recipes as a read feed." Members move off Cookbook → **Phase 6**
  (update to: members live on Account; Cookbook = feed + toolbar).
- `docs/DESIGN.md:92-96` — "**Browse toolbar**: a compact control bar…" described
  as Browse-only. Cookbook gains the same bar → **Phase 8** (note the toolbar is
  now shared Browse+Cookbook).
- `docs/DESIGN.md:178-188` — comments "below the recipe", cookbook-scoped, plus
  the "Hide likes / Hide comments" social prefs. Low impact; if Phase 2 removes
  the save affordance and any DESIGN prose describes a save/bookmark UI, update
  it in **Phase 2** (grep DESIGN.md for a save/bookmark *UI* mention; the
  `saved` hits in `docs/sources/*`, `STACK.md`, `BUILD-PLAN.md` are
  **lexicon/spec** level — the atproto `interaction.saved` record still exists,
  we just stop writing/reading it in the UI, so those spec docs do NOT go stale).
- **Doc updates ride the phase that makes them stale** (per template) — not a
  trailing docs phase.

## Concurrency Map

Sequential spine: **Phase 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11a →
11b → 11c.** (**[Pass 2]** Phase 11 split into 11a/11b/11c — see Phase 11.)

- Nearly every phase writes `styles.css` and/or `src/recipes/view.ts` and/or a
  page file, and phases 7→8→9→10 form a hard chain (extract toolbar → Cookbook
  adopts it → filter uses it → button sits on it). So sequential is **required
  by the write-sets**, not merely chosen.
- **[Pass 2]** The new 11a/11b/11c chain is sequential by shared write-sets:
  11a writes `mine.ts`; 11c writes `mine.ts` (the status filter) + `editor.ts`;
  11b writes `drafts-local.ts` + `drafts-sync.ts` (the data model 11c's UI
  reads). `mine.ts` is shared across 11a/11c → sequential.
- Candidate parallelism considered and rejected: the link-color fix (Phase 1)
  is genuinely independent (only `styles.css` + maybe one class), and the
  Account members extraction (Phase 6) is largely disjoint from the recipe
  cluster — but both touch `styles.css`, and running a fleet here isn't worth
  the worktree/merge overhead for ~12 small edits by one executor. **[Pass 2]**
  Re-checked after the gap analysis added phases: still no parallel set worth
  opting into — the extractions (6, 7) and the data-model split (11b) each feed
  a downstream consumer on the same files. Default sequential; revisit only if
  the user wants parallel execution.
- All sequential → no worktrees, no re-entry-verification fields.
- **[Pass 3 — concurrency honesty re-check]** Re-walked every phase write-set
  after the Pass 3 additions (no files moved between phases in Pass 3). The
  sequential spine holds and is *required*, not merely chosen: `styles.css` is
  written by Phases 1/3/4/5/8/10 (and maybe 11c); `cookbook.ts` by 6/8/9/10;
  `view.ts` by 3/4; `mine.ts` by 11a/11c; `browse-state.ts` feeds 7→8→9. Every
  adjacent pair shares ≥1 write-set entry or a producer→consumer data
  dependency, so no two phases have disjoint write-sets → no parallel set is
  admissible under the hard rule. Map confirmed; sequential plan, no re-entry
  verification needed (no worktrees dispatched).

## Phases

**Cross-phase conventions:** TDD — tests-first for behavior (RED before GREEN,
watch it fail); the hermetic Playwright/vitest tier (over the built `dist`) is
the gate; `@live` (real-PDS) only where the write path is the feature (likes,
liked-feed). CSP stays intact — styling in `styles.css` only, no inline styles.
Every phase commits when green; the plan doc's status is synced per phase.

**[Pass 3 — cross-phase conventions added]:**
- **File-count ceiling counts *source* files.** The ≤3–4 ceiling counts
  production/source files (`.ts`/`.css`/`.html`); the test file(s) each phase
  writes and any cosmetic doc-label edits ride along and do **not** count
  toward the ceiling. This is the convention Pass 2 already used when it wrote
  "= 3 files" for Phases 6/7. Under it, every phase is ≤4 source files
  (verified in the Pass 3 log). Stated explicitly so execution doesn't
  mis-count tests and split unnecessarily.
- **Gate command is `npm test`** = `lint && typecheck && test:unit && build &&
  test:e2e` (confirmed `package.json:15`); the build step is required because
  e2e runs over the built `dist`. `@live` is grep-inverted out of the hermetic
  e2e run (`playwright.config.ts:14`) and only runs under `LIVE=1 npm run
  test:live`. A phase's "`npm test` green" already means the full hermetic tier.
- **Observability spine is `src/log.ts`**: `log.<level>(component, message,
  {data})`. `debug`/`info` are gated behind `?debug=1` (or a `debug`
  localStorage entry); `warn`/`error` **always emit**. So any *user-impacting*
  drop or redirect must log at `warn`/`info` (per-phase notes below name the
  exact calls). Mirror the established `feed.ts` pattern (`:52` info cache-serve,
  `:59` warn per-author failure).
- **Two silence classes, deliberately distinguished** (see per-phase notes):
  (a) *silent-by-design* — dropping/defaulting **expected legacy** data as
  normal operation (Phase 2 legacy `saved` filter-drop, Phase 11b status
  default) needs **no** log; (b) *must-not-be-silent* — dropping **wanted**
  data the user asked for (Phase 9 discovery cap, Phase 9 per-ref cross-PDS
  failures) **must** `log.warn` the drop. Truncation of wanted data without a
  log is the anti-pattern; defaulting legacy records is not.

### Phase 0: Discovery

**Goal:** Resolve the reusability/data unknowns and confirm the interpretation
open questions before committing to the toolbar/liked-feed phases.

- [x] **D0: Documentation + reference grep.** *(Run in Pass 2 — findings folded
      into Documentation Impact above.)* `grep -rn` the touched pages and
      symbols across `README.md`, `docs/`, `.claude/`. **Result:** `.claude/`
      empty; real stale prose in `README.md:32-38` and `docs/DESIGN.md:92-96,
      147-156,148,167,169-171` mapped to Phases 6/8/11a; `saved` hits are
      lexicon-level (no stale UI doc). Re-confirm during execution only if the
      docs changed since Pass 2.
- [x] **D1: Is the Browse toolbar cleanly extractable?** *(Answered — execution
      2026-07-09, post-rebase.)* Read `browse.ts` end-to-end + `browse-state.ts`.
      **YES, cleanly extractable — the Phase 7 [Pass 2] pinned shape holds against
      current code.** Toolbar assembled at `browse.ts:49-92`: `.browse-toolbar`
      (`:49`) → `.browse-controls` (`:50`: segmented `view-tiles`/`view-details`
      `:52-60`, `photos-only` toggle `:63-68`, `.browse-facets` container `:72`) +
      `.browse-count` (`:74`: `reset-filters` `:78`, `recipes-status` `:44`,
      `diet-pref-link` `:85`). Two render seams confirmed exactly as planned:
      **`renderCurrent()`** (`:177-213`, filter/view change — dropdowns stay open)
      vs **`showCurrent()`** (`:242-245` = `rebuildToolbarFacets`+`renderCurrent`,
      feed/reset). `createBrowsePrefs` (`browse-state.ts:133`) currently takes only
      `{storage?}` with hardcoded keys `browse-view-mode`/`browse-photos-only`/
      `browse-facets` (`:115-117`) → OQ11's `prefix` param is the exact change
      pinned. **New since Pass 2 (rebase):** `renderCurrent` now calls
      `collapseVersions(shown)` (`browse.ts:202`, from the version work) before
      picking `renderRecipeDetailsList`/`renderRecipeList` (`:204`) — this stays
      **Browse-specific inside the render seam**, NOT in the shared toolbar (Phase
      8 decides whether Cookbook also collapses). **Disposition:** throwaway notes
      (folded into Phase 7).
- [x] **D2: Design the "liked recipes" by-ref loader.** *(Answered — execution
      2026-07-09, post-rebase.)* Read `social/feed.ts` + `recipes/cache.ts` +
      `recipes/read.ts`. **Confirmed: no by-URI loader exists; all primitives are
      present and the design below is grounded in current code.** Final signature
      for Phase 9:

      ```
      loadLikedFeed(interactions: Interaction[], opts?: { cap?: number })
        → Promise<CachedRecipe[]>
      ```
      Steps (each primitive verified against the branch):
      1. **Filter empty refs:** `interactions.filter(i => i.recipe.uri !== '')`
         (the `{uri:'',cid:''}` fallback from `interactions.ts:77`). Empty-skip is
         normal filtering → `log.debug` at most.
      2. **Cap:** `const capped = refs.slice(0, cap)` (default cap **50**, matching
         `recipe.ts:49` `COOKBOOK_DISCOVERY_CAP` for consistency). If
         `capped.length < refs.length` → `log.warn('liked-feed', 'liked set
         capped', {total, loaded, dropped})`. **Precedent to mirror:**
         `createRecipeReader` already does exactly this no-silent-truncation warn
         at `read.ts:98` ("listRecords page cap hit — truncating").
      3. **Per ref (concurrent, each in its own try):** parse
         `at://<did>/exchange.recipe.recipe/<rkey>` (own regex — `parseAtUri` is
         local + unexported in `recipe.ts:60`; `RECIPE_COLLECTION` =
         `'exchange.recipe.recipe'`, `read.ts:9`) → `const {pds} =
         await resolveDidDoc(did)` (**cross-PDS**, `did.ts:11`) →
         `await createRecordReader()({pds, did, rkey})` (`read.ts:45`, by-ref
         getRecord) → `await cache.put(record)` (`cache.ts:79`, recomputes CID →
         `verified`). On failure → `log.warn('liked-feed', 'ref load failed',
         {uri, error})`, return null (one bad ref must not blank the feed).
      4. **`return entries.filter(Boolean)`** → Cookbook renders via
         `renderRecipeList` / `renderRecipeDetailsList`.

      Reuses the same primitives as `loadAuthorsFeed` (`feed.ts:33`:
      `resolveDidDoc`+`createRecipeReader`+`cache.put`) but keyed by **recipe URI**,
      not author. Real cross-PDS verification needs `@live` (Phase 9 Broad).
      **Disposition:** throwaway design notes; the real loader is built TDD in
      Phase 9.
- [x] **D3: Confirm the interpretation OQs.** OQ1/2/3/5/6 CONFIRMED in Pass 1;
      **OQ10–OQ13 CONFIRMED by the user in Pass 2** (see Open Questions). All
      interpretation OQs are now resolved — no BLOCKING interpretation gate
      remains for Phase 0. Only D1 (toolbar shape) + D2 (liked-loader design)
      stay as code-discovery tasks.

**Read-set:** `src/pages/{browse,cookbook,account,recipe,editor,mine}.ts`,
`src/recipes/{view,browse-state,exclusions}.ts`, `src/social/{interactions,
cookbook,comments-view}.ts`, `styles.css`.
**Write-set:** throwaway probe notes; no production files.
**Shared-state contract:** read-only exploration; `@live` probe for D2 reuses
one session if run.
**Done when:** D1 (toolbar shape) + D2 (liked-loader design) answered with
evidence. **[Pass 2]** D0 + D3 already complete (D0 grep folded into
Documentation Impact; D3 OQs all confirmed) — Phase 0's remaining work is the two
code-discovery probes only, no interpretation gate.
**Validation:** Discovery (Exemption applies).
**[Pass 3 — discovery concreteness + exemption boundary]:** D1/D2 each carry a
question, a probe, success criteria, and a **`throwaway`** disposition (the real
loader is built TDD in Phase 9) — concrete and answerable. The Discovery
Exemption is correctly bounded: **no TDD, no wiring test, no commit-per-item for
D1/D2** — they produce design notes written back into Phases 7 and 9, not
production code. RED-before-GREEN begins at Phase 1. These are **not** resolvable
in this no-code planning pass (D1 is code-reading; D2's cross-PDS behavior needs
`@live`), so deferring them to execution's stop-point is correct — not a Pass 3
miss. **One hand-off to make explicit:** D2 must decide the concrete **discovery
cap value** and write it into Phase 9, because Phase 9's `log.warn('liked-feed',
'liked set capped', …)` depends on that number being fixed before the loader is
built.
**Stop-point — report D1/D2 findings before Phase 1.**

### Phase 1: Consistent, theme-aware link color (dark-mode fix)

**Goal:** All content links read legibly in both themes (no UA blue on dark).
**Changes:**
- [ ] `styles.css` — give content anchors a themed default color (`--enamel`),
  scoped so it doesn't fight existing styled links (wordmark/nav/card). Cover
  `.comment-author` explicitly. Keep hover/underline affordances.
- [ ] `src/social/comments-view.ts` — only if a class hook is needed (the link
  already has `.comment-author`; likely CSS-only).
**Call chain:** page render → comment/author anchors → CSS applies.
**Wiring test:** `tests/e2e` — load a page with a comment (or a stub comment
DOM) in dark theme; assert `.comment-author` computed color equals the enamel
dark value (`#5cb3a1`-ish), not the UA blue. RED before the CSS lands.
**Depends on:** Phase 0.
**Read-set:** `styles.css`, `comments-view.ts`.
**Write-set:** `styles.css` (+ maybe `comments-view.ts`).
**Shared-state contract:** none beyond files.
**Risks:** over-broad `a{}` recoloring buttons-styled-as-links or card links —
scope to content contexts; verify Browse/nav unaffected by the full e2e run.
**[Pass 2 — risk is lower than it reads]** A bare global `a { color:
var(--enamel) }` is actually **safe**: `styles.css` has no existing `a{}` rule
(only `a.card` at `:696`, which sets `color:inherit` at `:699` and wins on
specificity → cards unaffected); every other "link" (`.nav-auth` `:194`,
`.diet-pref-link` `:550`, `.reset-filters-link` `:559`, `.draft-link` `:952`,
`.nav-gear`) is class-scoped with its own `color:var(--enamel)` → all more
specific than bare `a`, so none change. Buttons are `<button>`, not `<a>` → not
touched. So the simplest fix (global `a{color:var(--enamel)}` + hover) covers
`.comment-author` (`comments-view.ts:31`, an `<a>` with no color) with no
collateral. `comments-view.ts` needs **no** change (the `.comment-author` class
already exists). **Wiring-test fixture:** reuse the existing hermetic
`tests/e2e/comments.spec.ts` comment fixture (it already renders `comment-item`)
rather than inventing a stub DOM.
**[Pass 3 — assertion robustness]:** Do **not** hardcode the hex (`#5cb3a1`) in
the wiring test — it is brittle against a token-value change. Assert the
discriminating facts instead: (a) `.comment-author` computed `color` is **not**
the UA link blue, and (b) it **equals** the computed `color` of an element known
to resolve `--enamel` (e.g. `.provenance-author` or `.nav-auth`) rendered in the
same theme. That both fails RED (today `.comment-author` has no color → UA blue,
so it differs from the enamel reference) and survives a future token retune.
Run the assertion in **both** themes (the token has light `#175e54` + dark
`#5cb3a1` variants) so a one-theme regression can't hide.
**Done when:** 1) links are enamel in both themes; 2) `npm test` green incl. the
new contrast assertion.
**Validation:** Narrow-plus — visual check in both themes + full e2e regression.
**CSP:** styling stays in `styles.css` (one `a{}`-family rule); no inline
`style=`/`.style`, no remote asset. Intact.
**Stop-point.**

### Phase 2: Remove "saved"; like is the only interaction

**Goal:** No save toggle anywhere; `liked` is the single interaction kind.
**Changes:**
- [ ] `src/social/interactions.ts` — remove `'saved'` from `InteractionKind`
  and `KINDS`; drop `youSaved` from `summarize`; keep read-tolerance for any
  legacy `saved` records (ignored, not errored).
- [ ] `src/pages/recipe.ts` — remove `saveBtn` + its toggle wiring
  (**[rebase] refs now `:273-275` (build+append), `:296`/`:301-302` (render
  `youSaved`), `:366` (click)** — see Verified Assumptions "Interactions/save
  current line refs"; approach unchanged); keep like + count. The `toggle` fn
  (`:338`) is generic over `kind` — drop the `'saved'` call site, keep `'liked'`.
- [ ] `tests/unit` + `tests/e2e` — update interactions unit tests and the
  `interactions*.spec` to drop save; assert like-only behavior.
**Call chain:** recipe page → `mountInteractions` → like only.
**Wiring test:** e2e recipe interactions: like toggles + count; **no**
save-button present (`save-button` testid absent). RED first (button exists).
**Depends on:** Phase 1.
**Read-set:** `interactions.ts`, `recipe.ts`, interaction tests.
**Write-set:** `interactions.ts`, `recipe.ts`, tests.
**Shared-state contract:** `@live` like write path unchanged; save write removed.
**[Pass 2 — exact breaking tests to update in this phase]:**
- `tests/unit/social/interactions.spec.ts` (hermetic) — 6 assertions + the type
  import break: `:18` imports `InteractionKind` (union loses `'saved'` →
  typecheck); `:44-46` "builds a saved record"; `:98-104` `youSaved` edges;
  `:106-111`; `:117-121` `findInteractionRkey('saved')`; `:151-155` "saving does
  not drop your like". Rewrite to like-only.
- `tests/e2e/interactions.spec.ts:66` (hermetic) —
  `expect(getByTestId('save-button')).toBeHidden()` in the "signed-out read-only
  like count" test; drop the save-button assertion.
- **Read-tolerance is automatic:** `listInteractionsFor` filters by
  `KINDS.includes` (`:82`); removing `'saved'` from `KINDS` means legacy `saved`
  records simply fail the filter and are ignored — confirm no path throws on an
  unknown kind. `KINDS` is module-private, so no external test asserts its length.
- `summarize`'s `youSaved` field is removed; its only consumer is the recipe
  page `saveBtn` (removed here) — grep for other `youSaved` readers before
  deleting.
**Risks:** unit tests asserting `youSaved` — update them (enumerated above).
**[Pass 3 — observability + debugging]:**
- **Legacy `saved` drop is silent-by-design (class (a)) — no log.** After
  `'saved'` leaves `KINDS`, `listInteractionsFor`'s `.filter(i =>
  KINDS.includes(i.kind))` (`interactions.ts:82`) drops legacy `saved` records
  as ordinary filtering — not lost user data, so no `log.warn` is warranted.
  Confirm only that no path *throws* on the now-unknown kind (the filter can't;
  it evaluates `false`). This is the deliberate contrast with Phase 9's cap,
  which drops wanted data and must log.
- **If RED stays red:** the `save-button`-absent assertion failing GREEN usually
  means a second render path still mounts the save toggle — grep `recipe.ts`
  for every `saveBtn`/`save-button` construction site, not just `:272`.
**Done when:** 1) recipe page shows like only, save gone; 2) `npm test` green;
3) `@live` like still writes/removes.
**Validation:** Moderate — hermetic + a like `@live` toggle.
**CSP:** no styling change; no inline styles introduced. Intact.
**Stop-point.**

### Phase 3: Like heart as an image overlay (upper-right)

**Goal:** The like control overlays the recipe banner (top-right); count stays
readable; signed-out = read-only count.
**Changes:**
- [ ] `src/pages/recipe.ts` — render the like button (+ count) as an overlay
  child of the banner element rather than a separate section. Pass/locate the
  `.photo-wrap--banner` node (from `renderRecipeDetail`) to `mountInteractions`.
- [ ] `src/recipes/view.ts` — expose a hook/slot on the banner for the overlay
  (e.g. return/query `.photo-wrap--banner`), mirroring `imageCreditOverlay`.
- [ ] `styles.css` — `.like-overlay` absolute top-right on `.photo-wrap`;
  legibility scrim/shadow; placement for the no-meal placeholder (OQ7).
**Call chain:** `renderRecipeDetail` banner → overlay mount → heart on image.
**Wiring test:** e2e — like button is a descendant of `.photo-wrap--banner`,
positioned top-right, and still toggles; count visible.
**Depends on:** Phase 2.
**Read-set:** `recipe.ts`, `view.ts`, `styles.css`.
**Write-set:** `recipe.ts`, `view.ts`, `styles.css`.
**Shared-state contract:** none beyond files.
**Risks:** overlay over a light image area hurts contrast → scrim; placeholder
(no image) case → OQ7 placement.
**[Pass 2 — resolved details]:**
- **DOM timing works via `querySelector`, no `view.ts` return-value change
  needed.** `recipe.ts` does `content.replaceChildren(renderRecipeDetail(...))`
  (`:390/:405`), then calls `mountInteractions` at `:448` — so `.photo-wrap--banner`
  already exists in `content` when interactions mount. The overlay can
  `content.querySelector('.photo-wrap--banner')` and append there. The listed
  `view.ts` change ("expose a hook/slot") is **optional** — prefer querySelector
  to keep `view.ts` untouched (it also avoids affecting the sole other overlay,
  `imageCreditOverlay`). If `view.ts` is left unchanged, Phase 3 shrinks to
  `recipe.ts` + `styles.css` (2 files).
- **The count's new home must be decided:** today `like-count` is a sibling
  `<span data-testid=like-count>` inside the `.interactions` `<section>`
  (`recipe.ts:270`), which currently has **no CSS** (`.interactions` is unstyled).
  OQ7 says the control "never moves" — so put **both** the heart and its count in
  the `.like-overlay`. Keep the `like-count`/`like-button` testids so
  `interactions.spec.ts:62/:65` and `interactions-live.spec.ts` survive
  unchanged (they assert text/state, not position).
- **Two overlays share `.photo-wrap--banner`:** `imageCreditOverlay`
  (`.photo-credit`, bottom, `styles.css:887`) and the new `.like-overlay`
  (top-right). `.photo-wrap` is already `position:relative` (`:741`) — so the
  new overlay has its positioning context; just ensure top-right vs bottom don't
  collide, and don't disturb `view.spec.ts:281,296` (which assert the existing
  credit overlay).
**[Rebase re-grounding 2026-07-09]:** The overlay approach still holds, with
three post-rebase adjustments (see Verified Assumptions "Recipe page is now
VERSION-AWARE"):
- **Container is `host`, not `content`.** `mountInteractions(host, …)` is called
  at `recipe.ts:465` inside `paintVersion`, after `host.replaceChildren(
  renderRecipeDetail(...))` at `:419`. So the overlay does
  `host.querySelector('.photo-wrap--banner')` (the `content` param of
  `mountInteractions` IS `host`). The banner exists when interactions mount.
- **Re-mounts per version flip automatically.** `paintVersion` re-runs on every
  flip, so the overlay is rebuilt for each version with no extra wiring — good.
- **Coexists with the NEW `.detail-actions` Focus button** (`view.ts:481-491`,
  right-aligned row *between* banner and title, `styles.css:981`) and the
  existing bottom `.photo-credit`. The like overlay is top-right *on the banner*;
  the Focus button is a separate row *below* the banner — no collision, but keep
  the overlay inside `.photo-wrap--banner` (not `.detail-actions`).
**[Pass 3 — debugging readiness]:** If the "like is a descendant of
`.photo-wrap--banner`" assertion stays RED, check the **mount ordering**:
`mountInteractions` (`recipe.ts:465`) must run *after* `host.replaceChildren(
renderRecipeDetail(...))` (`:419`), so `host.querySelector('.photo-wrap--banner')`
is non-null when the overlay appends. A null querySelector silently appends nowhere (or throws on
`.append`) — log `log.warn('recipe', 'banner node missing for like overlay')`
on the null branch so the placeholder/no-photo path is diagnosable, and confirm
the placeholder case still renders a `.photo-wrap--banner` (OQ7 needs the same
node to exist with no image).
**Done when:** 1) heart+count overlay the image top-right and toggle; 2) same
top-right spot on the no-photo placeholder (OQ7); 3) `npm test` green.
**Validation:** Moderate — hermetic + visual both themes + placeholder case.
**CSP:** `.like-overlay` positioning/scrim is a `styles.css` class; no inline
`style=`/`.style`. Intact.
**Stop-point.**

### Phase 4: "Hide" on the title line, with confirmation

**Goal:** A "Hide" control on the recipe-title row (far right), replacing the
detached "Hide this recipe" button, gated by a confirmation.
**Changes:**
- [ ] `src/recipes/view.ts` — render the title row as title (left) + a control
  slot (right) so the Hide control can sit inline with `h2.recipe-title`.
- [ ] `src/pages/recipe.ts` — build the Hide control into that slot; rename to
  "Hide"; add the confirmation flow (inline two-step per OQ5); keep
  exclusions.hide/unhide + logging.
- [ ] `styles.css` — `.recipe-title-row` flex (title left, control right).
**Call chain:** recipe render → title row → Hide control → confirm → exclusions.
**Wiring test:** e2e — "Hide" sits on the title row; clicking it shows a
confirm affordance; confirming calls exclusions (recipe marked hidden);
cancel does nothing. RED first.
**Depends on:** Phase 3.
**Read-set:** `view.ts`, `recipe.ts`, `exclusions.ts`, `styles.css`.
**Write-set:** `view.ts`, `recipe.ts`, `styles.css`.
**Shared-state contract:** `localStorage` `hidden-recipes` (exclusions) — same
as today.
**Risks:** title-row layout on narrow screens (wrap); confirm UX (OQ5).
**[Pass 2 — resolved details]:**
- **`renderRecipeDetail` has a single caller** (`recipe.ts:390/:405`, confirmed
  by grep) — so adding a title-row slot to it affects no other page. Safe.
- **Wiring:** the Hide button is today `content.append`-ed at `recipe.ts:427` as
  a *sibling* of the detail article (not inside it). To sit on the title row it
  must move *into* the article. Two options: (a) `view.ts` renders
  `.recipe-title-row` (h2 + empty `.title-control-slot`), and `recipe.ts`
  `content.querySelector('.title-control-slot')` then injects the built control;
  or (b) `renderRecipeDetail` takes an optional `titleControl` node param. Prefer
  (a) — keeps `recipe.ts` owning the exclusions/confirm logic. Remove the old
  `:427` append.
- **Preserve the unhide path.** Today the button toggles hide⇄unhide by state
  (`recipe.ts:421-426`). OQ5's two-step confirm is for **Hide**; when the recipe
  is already hidden the control should offer one-tap **Unhide** (no confirm).
  Design the inline control for both states.
**[Rebase re-grounding 2026-07-09]:** The Hide button now lives **inline in
`paintVersion`** (`recipe.ts:448-460`), appended to `host` (`:460`) — this
REPLACES the Pass 2 "old `:427` sibling append" (that line no longer exists).
So Phase 4's move is: `view.ts` `renderRecipeDetail` renders the title row as
`.recipe-title-row` (h2 at `:492` + empty `.title-control-slot`); `paintVersion`
builds the Hide control (keeping the existing `exclusions.hide/unhide` +
`log.info` at `:454-459`) and injects it into
`host.querySelector('.title-control-slot')` instead of `host.append(hideButton)`
at `:460`. The unhide path (`:452-459`, one-tap) is preserved; only Hide gets the
two-step confirm (OQ5). Because `paintVersion` re-runs per version flip, the
title-row control rebuilds per version automatically. `renderRecipeDetail` has a
**single caller** — `paintVersion:420` (confirmed by grep) — so the title-row
slot change is safe. Note the Focus button (`.detail-actions`, `view.ts:481-491`)
is a separate right-aligned row above the title; the Hide control sits on the
title row itself — distinct rows, no collision.
**[Pass 3 — debugging readiness]:** If the confirm-flow e2e stays RED, check the
**two-step state** is driven by swapping DOM/text in the control (Hide →
"Hide? · Confirm / Cancel"), not by a native `confirm()` (OQ5 forbids it and it
would hang the hermetic run). Assert both edges: Confirm → `exclusions.hide`
called (recipe hidden); Cancel → control reverts and `exclusions.hide` **not**
called. `exclusions.hide/unhide` already log — keep those.
**Done when:** 1) Hide is inline-right of the title, confirms before hiding
(unhide stays one-tap); 2) `npm test` green incl. the confirm flow.
**Validation:** Moderate — hermetic + manual narrow-screen check.
**CSP:** `.recipe-title-row` flex is a `styles.css` rule; no inline styles.
Intact.
**Stop-point.**

### Phase 5: Center + style the comment section

**Goal:** The comments block is centered at the page bottom; the composer
(textarea + Post) matches the design system.
**Changes:**
- [ ] `styles.css` — center `.comments`; style `.comment-compose textarea`
  (border/radius/padding/font/focus via tokens — mirror `.editor textarea`
  at `:922`) and the `Post comment` primary button spacing.
- [ ] `src/pages/recipe.ts` — only if a wrapper/class is needed for centering
  (likely CSS-only).
**Call chain:** recipe page → `.comments` section → styled composer.
**Wiring test:** e2e — `.comments` is centered (max-width/margin auto) and the
textarea carries the themed styling (computed border color = `--line`/enamel
focus), not UA default. RED first.
**Depends on:** Phase 4.
**Read-set:** `styles.css`, `recipe.ts`.
**Write-set:** `styles.css` (+ maybe `recipe.ts`).
**Shared-state contract:** none beyond files.
**Risks:** centering the whole comments block vs just the composer — resolved by
OQ8 (center the whole block).
**[Pass 2 — confirmed CSS-only; target classes exist in the DOM already]:**
- `.comments` `<section>` is created in `recipe.ts:123` (`mountComments`),
  wrapping the `Comments` heading + `.comments-thread` (`comments-view.ts:68`) +
  the composer. So OQ8's "center the whole block" = one rule on `.comments`
  (max-width + margin auto). No `recipe.ts` change needed — the wrapper exists.
- Composer classes exist: `.comment-compose` form (`recipe.ts:199`), textarea
  `.comment-text` (`recipe.ts:202`, placeholder "Add a comment…"). Mirror the
  `.editor input, .editor textarea` rule (`styles.css:921-929`:
  `border:var(--stroke) solid var(--line); border-radius:var(--r-m);
  background:var(--card)`).
- **None of `.comments`/`.comment-compose`/`.comment-text`/`.comment-author`
  exist in `styles.css` yet** — Phase 5 *creates* these rules, it doesn't modify
  existing ones. So Phase 5 = `styles.css` only (drop the `recipe.ts` "maybe").
**[Pass 3 — assertion robustness]:** As in Phase 1, don't hardcode a hex/px in
the wiring test. Assert the discriminating facts: (a) `.comments` has a bounded
width and auto side-margins (computed `margin-left === margin-right` and
`> 0` at a wide viewport, or `max-width` set) — proves centering; (b) the
`.comment-text` textarea's computed `border-color` **equals** that of a known
`.editor textarea` reference (the rule it mirrors, `styles.css:921-929`), not
the UA default — proves the composer picked up the design-system border. Both
fail RED today (no `.comments`/`.comment-text` rules exist yet). Run in both
themes.
**Done when:** 1) whole `.comments` block centered at a readable max-width +
composer styled in both themes; 2) `npm test` green.
**Validation:** Narrow-plus — visual both themes + e2e.
**CSP:** new `.comments`/`.comment-compose`/`.comment-text` rules live in
`styles.css`; no inline styles. Intact.
**Stop-point.**

### Phase 6: Move the cookbook-members list to Account (off Cookbook)

**Goal:** The cookbook-members list (with explainer + Settings link) renders on
**Account** when signed in, and is **removed from Cookbook** (OQ4). Cookbook
becomes the recipe feed + toolbar; Account becomes "who's in your cookbook".
**Changes:**
- [ ] `src/social/cookbook-members-view.ts` (new) — extract `renderMembersList`
  + `membersToAuthors` + the explainer/Settings-link block from `cookbook.ts`.
- [ ] `src/pages/cookbook.ts` — stop rendering the members list: drop the
  `membersMount` insertion in `showCookbook` (`:110-111`); keep the feed.
- [ ] `src/pages/account.ts` — mount the shared members view (signed-in) below
  the Account heading; signed-out shows nothing (or a sign-in pointer).
- [ ] **[Pass 3 — doc edit as an explicit change item, not just Done-when]**
  `docs/DESIGN.md:147-156` — update "The page shows your cookbook members…" to:
  members live on **Account**; Cookbook = feed + toolbar; signed-out Cookbook
  redirects to Browse. (Mapped here in Documentation Impact; made a checklist
  item so it can't be skipped.)
**Call chain:** account page (signed in) → shared members view → list renders;
cookbook page → feed only (no members); **cookbook page signed-out → redirect →
Browse (`index.html`).**
**Wiring test:** e2e — **three** assertions, all RED first: (1) signed-in
Account shows `cookbook-members` (explainer + Settings link) — Account has none
today; (2) signed-in Cookbook no longer renders `cookbook-members` — it does
today; (3) **signed-out visiting `cookbook.html` lands on `index.html`
(Browse)** — today it renders the `cookbook-signed-out` gate. Assertion (3) is
**hermetic** (signed-out is the no-auth path — no live creds needed), so the
redirect behavior change is fully covered in the gate tier, not deferred to
`@live`.
**Depends on:** Phase 5.
**Read-set:** `cookbook.ts`, `account.ts`, `social/cookbook.ts`.
**Write-set:** new shared module, `cookbook.ts`, `account.ts`.
**Shared-state contract:** reach prefs read (same as Cookbook today).
**Risks:** any test asserting members on Cookbook must move to Account; Account
signed-out state (members absent) — handle.
**[Pass 2 — gaps]:**
- **Extract the orchestration, not just the leaf renderers.** `renderMembersList`
  + `membersToAuthors` are pure-ish, but the members list is *assembled* in
  `showCookbook` (`cookbook.ts:108-111`): `resolveCookbook({you, config})` →
  `membersToAuthors(members)` → `renderMembersList(members, authors)`, with reach
  prefs (`createReachPrefs().load()`) + `resolveDidDoc`/`retryOnce` async. Account
  (`account.ts`, 56 lines, no cookbook imports today) has none of that. So the
  new module should export a **`mountMembersList(container, you, config)`** that
  does resolve→authors→render (plus empty/error handling), not just the two leaf
  functions — otherwise Account re-implements the async orchestration and drifts.
- **Cookbook still needs `resolveCookbook` + `membersToAuthors` for its FEED.**
  The feed is built from the members' authors (`renderFeedInto(feedContainer,
  authors)`, `cookbook.ts:112`). Phase 6 removes only the members *render* +
  `membersMount` insert (`:110-111`); it must **keep** the resolve→authors chain
  that feeds `renderFeedInto`. Make this explicit so the executor doesn't delete
  the feed's data source.
- **[OQ10 CONFIRMED — routing changes, not just a move]:** members render on
  Account only, on **all** Cookbook paths there are no members. Additionally:
  - **Signed-out Cookbook → redirect to Browse.** Replace today's
    `cookbook-signed-out` gate (`cookbook.ts:146-164`) with a redirect to
    `index.html`. This is a behavior change beyond the members move — call it out
    as its own change item. `tests/e2e/cookbook.spec.ts` signed-out assertions
    (`cookbook-signed-out`/`cookbook-signin-link`) retarget to the redirect.
  - **`?did=` cold-view is no longer a members surface.** Drop members from the
    cold-view path (`:126-141`); `tests/e2e/cookbook.spec.ts:92-103` (asserts
    `cookbook-member` on the cold-view) retargets to the feed or is removed.
  - Account shows "the Bluesky account associations" = the members list.
- `tests/unit/social/cookbook.spec.ts` tests `resolveCookbook` (module logic) and
  survives (still reached by the feed + Account). No test asserts the Cookbook
  *explainer* text.
- **Explainer + Settings link move too:** the "Your starter cooks plus who you
  follow…" note + `Settings ↗` link (`cookbook.ts:168-175`) go with the members
  view to Account.
- **Styles:** members list reuses `.friends-list`/`.friend-row`/`.friend-link`/
  `.chip` (already in `styles.css`) — Phase 6 likely needs **no** `styles.css`
  change. **[Pass 2 — write-set note]** with the signed-out redirect + cold-view
  edit, Phase 6 writes the new members module + `cookbook.ts` + `account.ts` = 3
  files; if the redirect + members-removal in `cookbook.ts` feels large, the
  signed-out redirect can split into its own tiny phase (6b) — size at execution.
**[Pass 3 — observability, redirect idiom, split trigger, debugging]:**
- **Redirect must log (behavior-change trace).** The signed-out branch
  (`cookbook.ts:146`, `agent === null || agent.did === undefined`) currently
  ends by logging `log.debug('shell','mounted',{page:'cookbook',signedIn:false})`.
  Replace the gate with the redirect and log it at **info** so "why did I land
  on Browse?" is answerable from the console: `log.info('cookbook', 'signed-out
  → redirecting to Browse')` immediately before navigating. Use
  `window.location.replace('./index.html')` (not `.href`) so the signed-out
  Cookbook URL doesn't sit in history and bounce the back-button into a redirect
  loop. Redirect **before** `mountShell`/`return` so no cookbook shell flashes.
- **Split trigger (was "size at execution" — now concrete).** Keep Phase 6
  whole (3 source files: new `cookbook-members-view.ts` + `cookbook.ts` +
  `account.ts`). Split the redirect into **Phase 6b** only if, at execution,
  *either*: (i) the `cookbook.ts` diff has to touch **all three** of the
  signed-out gate (`:146-164`), the cold-view members block (`:126-141`), and
  the `showCookbook` members mount (`:110-111`) in one commit and the diff no
  longer reads cleanly; or (ii) the `cookbook.spec.ts` retargets
  (`cookbook-signed-out`/`cookbook-signin-link` → redirect, and `:92-103`
  cold-view `cookbook-member`) plus the new Account members spec push the test
  churn past what one reviewable commit should carry. Otherwise ship as one.
- **If the redirect e2e stays RED:** confirm the redirect fires on the
  `agent===null||agent.did===undefined` branch *before* any `content.append`/
  `mountShell`, and that the Playwright assertion **waits for navigation** to
  `index.html` (`await page.waitForURL(/index\.html$/)`) rather than reading the
  URL synchronously.
**Done when:** 1) Account shows the members list signed-in; Cookbook shows no
members on any path; signed-out Cookbook redirects to Browse; 2)
`docs/DESIGN.md:147-156` updated (change item above); 3) `npm test` green
(retargeted cookbook specs, incl. the hermetic redirect assertion); 4) `@live`
signed-in Account renders members.
**Validation:** Moderate — hermetic (incl. the redirect, no creds) + `@live`
signed-in render. *The routing change is fully covered hermetically; `@live`
only exercises the members-render-with-real-graph path.*
**CSP:** members list reuses existing `.friends-list`/`.friend-row`/`.chip`
classes → no `styles.css` change, no inline styles. Intact.
**Stop-point.**

### Phase 7: Extract the Browse toolbar into a shared component

**Goal:** A reusable `renderToolbar` both Browse and Cookbook can use;
Browse behavior unchanged.
**Changes:**
- [ ] `src/recipes/toolbar.ts` (new) — extract the segmented Tiles/Details
  toggle, facet dropdowns, and count block (shape per Phase 0 D1), taking
  state + callbacks as inputs.
- [ ] `src/pages/browse.ts` — consume `renderToolbar` in place of the inline
  assembly; no behavior change.
- [ ] `tests/e2e/browse.spec.ts` — unchanged assertions must stay green
  (regression guard for the extraction).
**Call chain:** Browse → `renderToolbar` → same toolbar DOM/behavior.
**Wiring test:** the existing `browse.spec` toolbar assertions (view toggle,
facets, count) pass unchanged against the refactor.
**Depends on:** Phase 6, Phase 0 D1.
**Read-set:** `browse.ts`, `src/pages/browse-state.ts` (**[Pass 2]** the path is
`src/pages/`, not `src/recipes/`), `view.ts`.
**Write-set:** new `toolbar.ts`, `browse.ts`, `browse-state.ts` (OQ11 confirmed
separate keys → parameterize `createBrowsePrefs(prefix)`; Browse passes
`'browse'`, unchanged behavior). = 3 files.
**Shared-state contract:** `createBrowsePrefs` localStorage
(`browse-view-mode`/`browse-photos-only`/`browse-facets`, `browse-state.ts:115-117`).
**[Pass 2 — pinned `renderToolbar` shape (from D1 facts)]:**
- **Stays in `browse.ts` (page-specific, NOT in the shared toolbar):** the
  `handle-input`/`find-recipes` search form (`browse.ts:35-42`), the `last-find`
  sessionStorage restore, the starter-feed path, the `Current.kind` status
  strings, and the `set dietary preference ↗` link (diet is a Settings pref).
- **Injected into `renderToolbar({...})`:** `state: BrowseState` (or `prefs`);
  the `entries` list to count + derive facets from (`availableFacets(entries)`,
  `browse-state.ts:102`); a `diet: string[]` source; callbacks `onViewChange`,
  `onPhotosToggle`, `onFacetChange(dimension, value, checked)`, `onReset`; a
  count-string strategy (page-specific text); and a `showDietLink` boolean
  (Browse=true, Cookbook likely false).
- **Preserve exactly** (regression guard = `tests/e2e/browse.spec.ts`): testids
  `view-tiles`/`view-details`/`photos-only`/`reset-filters`/`recipes-status`, and
  selectors `.recipe-grid`/`.recipe-rows`/`details.facet-dd[data-dimension=…]`/
  `input[data-dimension=…][data-value=…]`. Keep the two re-render seams
  (`renderCurrent` for filter/view changes that keep dropdowns open;
  `showCurrent`=rebuild-facets+render for feed/reset changes).
- **Class name:** the CSS is hard-named `.browse-toolbar`/`.browse-controls`/
  `.browse-count` (`styles.css:409+`). To avoid CSS churn AND an odd class on
  Cookbook, have `renderToolbar` emit the **existing `browse-toolbar` class**
  (it's a CSS hook, not user copy) — zero `styles.css` change in Phase 7, and
  Cookbook reuses the same hook in Phase 8. (Renaming to a neutral `.toolbar`
  would touch `styles.css` + both pages for no user-visible gain.)
- **localStorage keys (OQ11 CONFIRMED — separate):** parameterize
  `createBrowsePrefs(prefix)` in `browse-state.ts`; the three key constants
  become `${prefix}-view-mode`/`-photos-only`/`-facets`. Browse passes `'browse'`
  (keys unchanged → no migration); Cookbook passes `'cookbook'` in Phase 8. This
  is why `browse-state.ts` is in the Phase 7 write-set.
**Risks:** subtle Browse regressions — the full `browse.spec` is the guard.
**[Pass 3 — TDD shape is characterization, not RED-first (call this out so
tdd-guardian doesn't flag it, and so nobody manufactures a fake failing test)]:**
Phase 7 is a **behavior-preserving extraction** — there is no new behavior to
drive RED→GREEN. Its "wiring test" is the **existing** `browse.spec.ts` suite,
which is GREEN before and must stay GREEN after (a characterization/regression
guard, not a new failing test). The correct sequence is: (1) confirm
`browse.spec.ts` is GREEN on the pre-refactor tree (baseline); (2) extract
`renderToolbar`; (3) confirm the same suite is still GREEN, unchanged. If a
`browse.spec` assertion is *edited* to make it pass, that is a regression being
masked — revert and fix the extraction instead. This is the one phase legitimately
exempt from "write a failing test first," on the same principle as the Phase 0
Discovery Exemption: no behavior change ⇒ no new RED.
**If a `browse.spec` assertion goes RED:** the extraction changed DOM or
behavior. Check (a) emitted testids/classes are byte-identical
(`view-tiles`/`view-details`/`photos-only`/`reset-filters`/`recipes-status`,
`.browse-toolbar`/`.recipe-grid`/`.recipe-rows`), and (b) the two re-render
seams are preserved — `renderCurrent` (filter/view change, dropdowns stay open)
vs `showCurrent` (feed/reset, rebuild facets). A collapsed seam is the most
likely regression.
**Done when:** 1) Browse works identically via the shared toolbar; 2) `npm test`
green (browse suite unchanged, **not** edited).
**Validation:** Moderate — hermetic; Browse is the highest-regression-risk here.
**CSP:** `renderToolbar` emits the existing `.browse-toolbar` hook → zero
`styles.css` change; no inline styles. Intact.
**Stop-point.**

### Phase 8: Cookbook adopts the toolbar (Tiles/Details + facets + count)

**Goal:** Cookbook's recipe feed gains the Tiles/Details toggle, `Meal ▾`/
`Cuisine ▾` facets, and a count — same behavior as Browse.
**Changes:**
- [ ] `src/pages/cookbook.ts` — mount `renderToolbar` above the feed; wire the
  view toggle + facet filtering to the cookbook feed (reuse `browse-state`
  `matchesFilter`/`availableFacets` over the cookbook entries).
- [ ] `styles.css` — reuse existing `.browse-toolbar` styles (add a shared
  class if the selector is Browse-specific).
- [ ] **[Pass 3 — doc edit as an explicit change item]** `docs/DESIGN.md:92-96`
  — the "Browse toolbar" description (currently Browse-only) gains a note that
  the bar is now shared Browse+Cookbook. (Already in Done-when + Documentation
  Impact; promoted to a checklist item so it rides this phase, not a trailing
  docs pass.)
**Call chain:** Cookbook → shared toolbar → filtered/toggled cookbook feed.
**Wiring test:** e2e cookbook — toggle Tiles/Details changes the feed render;
a facet filter narrows it; count reflects.
**Depends on:** Phase 7.
**Read-set:** `cookbook.ts`, `browse-state.ts`, `toolbar.ts`, `styles.css`.
**Write-set:** `cookbook.ts`, `styles.css`.
**Shared-state contract:** cookbook view prefs in its **own** `cookbook-*`
localStorage keys (OQ11 confirmed) — `createBrowsePrefs('cookbook')`,
independent of Browse. Ties to OQ10's "settings they left" (persisted per-page).
**Risks:** facet availability differs for the cookbook feed — derive from its
own entries.
**[Pass 2 — gaps]:**
- **Toolbar only exists signed-in / cold-view — not signed-out.** Signed-out
  Cookbook renders just the gate (`cookbook.ts:146-164`, `cookbook-signed-out`),
  no feed/toolbar. So the toolbar mounts on the signed-in path (`showCookbook`)
  and, if desired, the public cold-view (`?did=`, `:126-141`). Confirm the
  toolbar is added to **both** feed-bearing paths, not just `showCookbook`.
- **Cookbook must build its own `BrowseState`+prefs+handlers** — today it calls
  `renderRecipeList(feed.entries)` directly with none of Browse's state plumbing.
  Facets are data-compatible: `availableFacets(feed.entries)` and
  `matchesFilter(entry.value, …)` are page-agnostic pure functions over
  `CachedRecipe[]` (feed entries are exactly `CachedRecipe[]`). Cookbook adds the
  `view`/`photosOnly`/`facets` state + the `renderCurrent`/`showCurrent` seams.
- **Cookbook uses only `renderRecipeList` today; the Details view needs
  `renderRecipeDetailsList`** — wire both so the Tiles/Details toggle works.
- **Doc:** update `docs/DESIGN.md:92-96` (Browse toolbar) to note the bar is now
  shared Browse+Cookbook.
**[Pass 3 — mutation resistance + CSP]:** The Tiles/Details toggle and facet
filter are branching behavior — assert **edges**, not one happy point: (a)
Tiles renders `.recipe-grid` and Details renders `.recipe-rows` (both
directions, not just one); (b) applying a `Meal` facet **reduces** the count and
**excludes** a known non-matching entry (assert a specific recipe disappears),
and clearing it restores the full count. A single "toggle changes something"
assertion would survive a mutation that swaps the two views.
**Done when:** 1) Cookbook (signed-in + cold-view) has a working toolbar; 2)
`docs/DESIGN.md:92-96` updated; 3) `npm test` green.
**Validation:** Moderate — hermetic + `@live` cookbook feed toggle.
**CSP:** reuses `.browse-toolbar` styles in `styles.css`; no inline styles.
Intact.
**Stop-point.**

### Phase 9: Cookbook source filter — my recipes / liked (either·or)

**Goal:** On the Cookbook toolbar, filter the feed to my created recipes and/or
my liked recipes (per OQ6 semantics).
**Changes:**
- [ ] `src/social/liked-feed.ts` (new) or extend interactions — load the
  viewer's `liked` interaction records → their recipe strongRefs → recipes.
  **[D2 RESOLVED — build to the concrete signature in Phase 0 D2]:**
  `loadLikedFeed(interactions, {cap=50}) → CachedRecipe[]` = filter empty refs →
  cap (mirror `read.ts:98`'s truncation warn) → per-ref parse `at://…/
  exchange.recipe.recipe/…` + `resolveDidDoc`→pds (cross-PDS) +
  `createRecordReader` (`read.ts:45`) + `cache.put`, each in its own try. All
  primitives verified present against the rebased tree.
- [ ] `src/pages/cookbook.ts` — add the source control (mine / liked / either)
  to the toolbar; swap the feed source accordingly; empty/ signed-out states.
- [ ] `tests` — unit for the liked-feed mapping; e2e for the source toggle.
**Call chain:** Cookbook toolbar source control → feed source swap → render.
**Wiring test:** e2e — selecting "Liked" shows only hearted recipes; "Mine"
shows only created; signed-out hides the control. RED first.
**Depends on:** Phase 8, Phase 0 D2.
**Read-set:** `cookbook.ts`, `interactions.ts`, `social/feed.ts`,
`recipes/{cache,read}.ts`, `identity/did.ts` (the loader primitives).
**Write-set:** new `liked-feed.ts` (`loadLikedFeed`), `cookbook.ts`, tests.
**Shared-state contract:** `@live` reads own `liked` records.
**[Pass 2 — the source control is NOT a uniform filter]:**
- **Mine and All are in-memory filters over the already-loaded authors feed;
  Liked is a separate fetch.** "All" = the loaded `loadAuthorsFeed(authors)`
  (members + you). "Mine" = filter that feed to your own DID (client-side,
  cheap). "Liked" pulls from a **different source** — your `liked` interaction
  records → `loadLikedFeed` (the new by-ref loader, see Verified Assumptions /
  D2) — and can include recipes **not** in the feed (recipes you liked whose
  authors aren't cookbook members). So the three states are not symmetric; Phase
  9 must treat "Liked" as a data-fetch swap, "Mine"/"All" as filters.
- **Liked load is LAZY (OQ12 CONFIRMED).** "All" (the default) = members + your
  published (the authors feed) with **no** liked load. `loadLikedFeed` runs only
  when the user selects the **Liked** filter — so the common Cookbook open stays
  cheap and avoids a cross-PDS call until asked. (This defers OQ6's "your liked in
  All" fetch; it does not change what Liked shows.)
- **Signed-out:** no toolbar at all (Phase 8), so no source control — consistent.
- **Empty states:** signed-in with zero likes → "Liked" shows an empty state
  ("no liked recipes yet"); "Mine" with no published → empty. Add both.
- **Cap:** `loadLikedFeed` caps how many liked refs it resolves/loads (D2) — if
  capped, `log()` what was dropped (no silent truncation).
**Risks:** liked recipes may be others' recipes (cross-PDS load) — the new
by-ref loader resolves each ref's DID→PDS; cap like discovery.
**[Pass 3 — observability (must-not-be-silent), mutation resistance, debugging]:**
- **`loadLikedFeed` must log at the two lossy boundaries** (class (b) —
  dropping *wanted* data), mirroring `feed.ts` (`:52`/`:59`):
  1. **Per-ref cross-PDS failure:** wrap each `resolveDidDoc(did)` /
     `createRecordReader` in a per-ref try so one bad ref doesn't blank the
     feed, and `log.warn('liked-feed', 'ref load failed', {uri, error})` on
     failure (a liked recipe silently vanishing is exactly the cross-PDS bug
     `@live` exists to catch).
  2. **Discovery cap drop:** when the liked-record set exceeds the cap, resolve
     only the cap and `log.warn('liked-feed', 'liked set capped', {total,
     loaded, dropped})` — **no silent truncation.** (`warn` always emits, so
     the drop is visible without `?debug=1`.) An **empty-ref skip**
     (`{uri:'',cid:''}` from `interactions.ts:77`) is normal filtering, not a
     drop → `log.debug` at most.
- **Mutation resistance for the 3-state control** (All/Mine/Liked branch):
  assert the **discriminating** facts so a swapped-branch mutation dies:
  - **Mine** shows a recipe authored by you **and excludes** a known
    member-authored recipe that appears in All.
  - **All** **includes** that member-authored recipe (proves Mine's filter
    actually narrows, not that both are coincidentally equal).
  - **Liked** shows a hearted recipe **and** at least one whose author is **not
    a cookbook member** (the cross-PDS case) — proving it's a separate fetch,
    not a filter over the authors feed.
- **If the liked-feed wiring test stays RED, walk the loader in order:** (a) the
  empty-ref filter isn't dropping *all* refs (log the pre/post count); (b)
  `at://did/exchange.recipe.recipe/rkey` parses to `{did, rkey}` (guard a
  malformed URI); (c) `resolveDidDoc(did)` returns a `pds` (cross-PDS —
  `did.ts:11`), and `createRecordReader({pds, did, rkey})` reads; (d) the cap is
  not `0`; (e) `cache.put` then `renderRecipeList` actually receives the
  `CachedRecipe[]`. Each stage logs, so the console pinpoints the break.
**Done when:** 1) All (members+published, no eager liked) / Mine / Liked
(lazy-loaded) work; 2) empty states render; 3) `npm test` green; 4) `@live`
liked feed lists hearted recipes (incl. a cross-PDS one, and confirm the
per-ref warn fires for a deliberately unresolvable ref).
**Validation:** Broad — hermetic + `@live` (real liked records, cross-PDS load).
Broad is correct: this is the only phase that fetches from a PDS the viewer
doesn't own, so tests alone cannot prove the cross-PDS path — the `@live`
cross-PDS liked recipe is the load-bearing check.
**CSP:** the source control reuses toolbar styles in `styles.css`; the loader is
pure data (no styling). No inline styles, no new remote assets (fetches are
same-lexicon PDS reads over the existing transport). Intact.
**Stop-point.**

### Phase 10: "New Recipe" button → builder page

**Goal:** A "New Recipe" button on the far right of the Cookbook toolbar that
opens the recipe-builder page (OQ2 decides the target/title).
**Changes:**
- [ ] `src/pages/cookbook.ts` — add the New Recipe button, right-aligned on the
  toolbar; navigates to the builder (`editor.html` per OQ2).
- [ ] `editor.html` / `src/pages/editor.ts` — retitle to "New Recipe Builder"
  if OQ2 chooses a rename (else no change).
- [ ] `styles.css` — right-align the button in the toolbar (reuse button
  styles).
**Call chain:** Cookbook toolbar → New Recipe → builder page.
**Wiring test:** e2e — the button is right-aligned on the toolbar and navigates
to the builder page (URL + heading).
**Depends on:** Phase 9.
**Read-set:** `cookbook.ts`, `editor.ts`, `editor.html`, `styles.css`.
**Write-set:** `cookbook.ts`, `editor.html`/`editor.ts` (if retitle), `styles.css`.
**Shared-state contract:** none beyond files.
**Risks:** low — a navigation button.
**[Pass 2 — placement across Cookbook paths]:**
- OQ2 confirmed: **no editor retitle** — Phase 10 is `cookbook.ts` + `styles.css`
  only (drop the `editor.html`/`editor.ts` change item).
- The button lives on the toolbar, which only renders on feed-bearing paths. On
  the **cold-view** (`?did=<someone-else>`) the toolbar shows *someone else's*
  cookbook — a "New Recipe" button there is odd. Show the button only on the
  viewer's **own signed-in** Cookbook, not the cold-view. (Signed-out has no
  toolbar at all.) Mirrors Alchemy, which already has its own `new-recipe`
  button (`mine.ts:36-39`).
**Done when:** 1) button opens the builder from the own signed-in Cookbook; 2)
`npm test` green.
**Validation:** Narrow — hermetic navigation test.
**CSP:** right-align is a `styles.css` rule reusing button styles; the button is
an `<a href="./editor.html">`/`navigate`, no inline styles, same-origin nav.
Intact.
**Stop-point.**

### Phase 11 — split into 11a / 11b / 11c

**[Pass 2 — OQ9 anticipated the split; sizing against the facts forces a 3-way
split, not 2-way.]** The draft `status` field spans **4 files** (`drafts-local.ts`
+ `drafts-sync.ts` + `editor.ts` + `mine.ts`), over the ≤3 target. Splitting the
status work into a data-model phase (11b) and a UI phase (11c) keeps each ≤3
files and puts the data model first (TDD-friendly). Also: **the "New Recipe"
button already exists on `mine.ts:36-39`** (`new-recipe` testid → `./editor.html`)
— so 11a's button work is essentially "confirm it's present," not "add it."

### Phase 11a: Rename "My recipes" → "Alchemy"

**Goal:** The destination reads **Alchemy**; the page gains an "Alchemy" heading;
the existing drafts + New-Recipe + published flow is unchanged.
**Changes:**
- [ ] `src/nav.ts` — rename the `DESTINATIONS` label "My recipes" → "Alchemy"
  (`:67`, ref confirmed post-rebase). **Keep `href:'./mine.html'` and
  `testid:'tab-mine'` and the `/mine\.html$/` `match`** — active-tab matching is
  by **pathname regex** (**[rebase] now `nav.ts:82`**, was `:76`), not label, so
  the route/testid stay and only the visible label changes. **[rebase] Note a 4th
  destination `Reference` was added upstream (`:69-73`)** — leave it untouched.
- [ ] `src/pages/mine.ts` — add a `page-title` heading "Alchemy" (the page has
  **none** today); confirm the existing `new-recipe` button (`:36-39`) and Drafts
  section stay. No new button needed. (`mine.ts` UNCHANGED by the rebase.)
- [ ] **[rebase — NEW stale label]** `src/pages/recipe.ts:245` — the signed-out
  comment pointer "Sign in on **My recipes** to join the conversation." → "…on
  **Alchemy**…". (Added upstream by the comments work; not in the Pass 2 inventory.)
- [ ] Docs — `README.md:35`, `docs/DESIGN.md:148,167,169-171` "My recipes" →
  "Alchemy". **[rebase]** The `DESIGN.md:148` nav list is now "Browse · Cookbook ·
  My recipes · Reference" (Reference added upstream) — rename *My recipes*, keep
  *Reference*.
**Call chain:** nav render → "Alchemy" tab → `mine.html` page (heading + drafts +
existing New Recipe).
**Wiring test:** `tests/e2e/nav.spec.ts` — the tab label reads "Alchemy" and
navigates to `mine.html`; `mine.ts` shows the "Alchemy" heading. RED first.
**Depends on:** Phase 10.
**Read-set:** `nav.ts`, `mine.ts`, nav tests.
**Write-set:** `nav.ts`, `mine.ts` (+ docs).
**Shared-state contract:** none beyond files.
**[Pass 2 — test impact is small, not "repo-wide."]** The `tab-mine` testid +
`./mine.html` href assertions **survive** (kept). Only these change:
- `tests/unit/nav.spec.ts:64` — test *title* "…and My recipes as links" (cosmetic;
  no visible-label text assertion exists today, only href/testid at `:72,:81-82`
  — verify none asserts label text, then it's title-only).
- `tests/e2e/editor.spec.ts:27` — title "drafts appear on My recipes…" (cosmetic).
- `tests/e2e/publish-live.spec.ts:58` (**@live**) — title mentions "My recipes"
  (cosmetic).
Rename the cosmetic titles for clarity; no DOM assertion breaks if `tab-mine` +
route are kept.
**[Pass 3 — doc coverage confirmed + CSP]:** The doc edits (`README.md:35`,
`docs/DESIGN.md:148,167,169-171`) are already a top-level Change checklist item
here — this is the model the other doc-bearing phases (6, 8) were brought up to.
No styling change; a heading uses existing `page-title` class → CSP intact.
**Done when:** 1) tab reads "Alchemy", routes to `mine.html`, page has the
heading; 2) docs updated; 3) `npm test` green.
**Validation:** Narrow-plus — hermetic; confirm no visible-label assertion breaks.
**Stop-point.**

### Phase 11b: Draft `status` data model (widen from the hardcoded literal)

**Goal:** A draft can carry a `status` from a small set; the local store and the
PDS backup persist it. **No UI yet** (11c adds the control + filter).
**Changes:**
- [ ] `src/recipes/drafts-local.ts` — add `status: 'draft'|'cooking'|'ready'`
  (OQ13) to the local `Draft` type (`:8-12`, currently `{id, fields, savedAt}` —
  no status); default to `'draft'` on save when absent (backward-tolerant for
  existing drafts — all legacy records read as `'draft'`).
- [ ] `src/recipes/drafts-sync.ts` — widen `DraftRecord.status` from the literal
  `'draft'` (`:15`) to `'draft'|'cooking'|'ready'`; `draftToRecord` (`:22`) reads
  the local draft's `status` instead of hardcoding `'draft'`. (`published` is NOT
  in this enum — it is derived from publication, not stored on a draft.)
- [ ] `tests/unit` — draft round-trip (local save/load + `draftToRecord`) carries
  the status; legacy status-less drafts default cleanly.
**Call chain:** `drafts.save(draft)` → local `Draft.status` → `draftToRecord` →
`app.arecipe.draft.status` on the PDS.
**Wiring test:** unit — save a draft with a non-default status, reload from the
store and build its record; assert `status` survives both hops. RED first (type
is the literal `'draft'`).
**Depends on:** Phase 11a, **OQ13** (the status value set).
**Read-set:** `drafts-local.ts`, `drafts-sync.ts`, draft tests.
**Write-set:** `drafts-local.ts`, `drafts-sync.ts`, tests.
**Shared-state contract:** IndexedDB `arecipe-drafts` store + `app.arecipe.draft`
PDS records (**PUBLIC by nature** — status is disclosed; no new privacy surface).
**Risks:** existing local drafts + already-synced PDS records have no `status` —
read-tolerate (default), don't error. **Drafts only** — the published recipe
lexicon (`exchange.recipe.recipe`) is untouched.
**[Pass 3 — why the wiring test is a UNIT test here (not an isolation-trap
defect), observability, mutation resistance]:**
- **Unit *is* the wiring test for 11b, and that's correct** — 11b ships **no
  UI** (11c adds the editor control + Alchemy filter). The entry point that
  exists at this phase is the **drafts store's public API**, so the wiring test
  drives the real call chain end-to-end across the persistence hop:
  `drafts.save(draft-with-status)` → local `Draft.status` → reload from the
  store → `draftToRecord` → assert `status` on the built record. That is an
  entry-point test, not an isolated-module test — the isolation trap is "a
  component with only its own unit test that nothing calls," and here the store
  API *is* what 11c will call. The **e2e** entry-point coverage arrives in 11c
  (which `Depends on: 11b`). Flagging so tdd-guardian/pr-reviewer don't misread
  11b's unit-only gate as the wiring gap.
- **Default-migration is silent-by-design (class (a)) — no log.** A legacy
  status-less draft reading as `'draft'` via `status ?? 'draft'` is a normal
  default, not data loss; no `log.warn`. (Contrast Phase 9's cap.)
- **Mutation resistance:** assert **both** edges so a mutation that hardcodes
  `'draft'` again dies: (a) a legacy/absent-status draft round-trips to
  `'draft'` (the default), **and** (b) a draft saved with a **non-default**
  status (`'cooking'`) round-trips as `'cooking'` through both hops — not just
  the default path. Also assert `'published'` is **rejected/absent** from the
  settable enum (OQ13 — it's derived, never stored).
- **If the round-trip test stays RED:** check `draftToRecord` reads
  `draft.status ?? 'draft'` (not the old hardcoded `'draft'` literal at
  `drafts-sync.ts:22`) and that the local `Draft` type widened past the literal
  (`drafts-local.ts:8-12`) so TypeScript accepts `'cooking'`.
**Done when:** 1) status persists local↔PDS with a safe default; 2) `npm test`
green (incl. a `@live` draft-sync check that the status round-trips, reusing
`drafts-live.spec.ts`).
**Validation:** Moderate — hermetic unit + `@live` draft sync round-trip.
**CSP:** no UI/styling in 11b; data-model only. N/A → intact.
**Stop-point.**

### Phase 11c: Alchemy status control + filter (UI)

**Goal:** The editor lets you set a draft's status; Alchemy filters the drafts
list by status.
**Changes:**
- [ ] `src/pages/editor.ts` — add a status control (select/segmented) over
  `draft`/`cooking`/`ready` that writes the draft's `status` on save (uses the
  11b field). Editor sets no status today.
- [ ] `src/pages/mine.ts` — mount a status filter toolbar above the Drafts list;
  filter `drafts.list()` by the selected status (`draft`/`cooking`/`ready`). A
  **`published`** filter bucket, if shown, sources from the **Published section**
  (`mine.ts:80-135`), not from `draft.status` (OQ13 — published is derived).
  (Reuse toolbar/button styles from Phase 7; add a small `styles.css` rule only
  if needed.)
- [ ] `tests` — e2e: set a status in the editor, see it filtered in Alchemy.
**Call chain:** editor status control → `drafts.save` (status) → Alchemy filter
→ filtered Drafts list.
**Wiring test:** e2e — create two drafts with different statuses; the Alchemy
status filter narrows the Drafts list to the selected status. RED first.
**Depends on:** Phase 11b.
**Read-set:** `editor.ts`, `mine.ts`, `drafts-local.ts`, toolbar/`styles.css`.
**Write-set:** `editor.ts`, `mine.ts` (+ `styles.css` only if a new rule is needed).
**Shared-state contract:** local drafts store (read/write, unchanged shape beyond 11b).
**Risks:** the Alchemy filter is **drafts-only**; do not touch the Published
section's data. Freeform authorable tags on published recipes remain a separate,
deferred feature (per OQ9).
**[Pass 3 — mutation resistance + CSP]:** The wiring test already names the right
edge (two drafts, different statuses, filter narrows to the selected one) — keep
it edge-shaped: assert the selected-status draft is **present** and the
other-status draft is **absent** after filtering (both directions), and that
clearing the filter restores both. A one-sided "the ready draft shows" assertion
would survive a mutation that stops excluding non-matching drafts. If a
`published` bucket is surfaced, assert it sources from the Published section, not
`draft.status`. **CSP:** reuse Phase 7 toolbar/button styles; add a `styles.css`
rule only if needed — no inline styles. Intact.
**Done when:** 1) editor sets status, Alchemy filters by it; 2) `npm test` green.
**Validation:** Moderate — hermetic e2e.
**Stop-point (all items complete).**

## Open Questions

- [CONFIRMED: BLOCKING — user, 2026-07-09] **OQ1 — liked recipes surface on the
  Cookbook page; they are part of your cookbook.** No separate "Liked" page.
  Liked recipes belong to the Cookbook corpus (alongside members' recipes and
  your own), and the Phase 9 source filter (mine / liked / all) narrows within
  it. Ties items 1 and 9 together: like is the one collect action, the Cookbook
  is where the collection lives.
- [CONFIRMED: BLOCKING — user, 2026-07-09] **OQ2 — "New Recipe" opens the
  existing `editor.html`** (the current authoring/draft/publish builder). No new
  page. Phase 10 is just the toolbar button + a link to `editor.html`; a page
  retitle is optional and NOT required (skip unless requested), keeping Phase 10
  to `cookbook.ts` + `styles.css`.
- [CONFIRMED: BLOCKING — user, 2026-07-09] **OQ3 — rename "My recipes" → "Alchemy",
  the drafting workspace.** Keep it as a distinct destination (not consolidated
  into Cookbook). Alchemy is where you **create, edit, save, and publish** new
  recipes: it owns the drafts list + authoring flow (today's `mine.ts` +
  `editor.ts`), carries its **own "New Recipe" button**, and gets a **top
  toolbar for tags** (scope in OQ9). The Cookbook "mine" filter stays separate =
  your *published* recipes within the cookbook. New scope → adds Phase 11
  (Alchemy rename + New Recipe button + tag toolbar) and the nav-label change in
  `nav.ts`. Escalated PHASE-GATED → BLOCKING because it renames a top-nav
  destination the other phases reference.
- [CONFIRMED: PHASE-GATED (Phase 4) — user, 2026-07-09] **OQ5 — Hide = inline
  two-step confirm.** Clicking "Hide" swaps the control in place to "Hide? ·
  Confirm / Cancel" — Confirm hides (exclusions.hide), Cancel reverts. No native
  `confirm()`, no modal. Testable in the hermetic tier.
- [CONFIRMED: ADVISORY — user, 2026-07-09] **OQ6 — source control = 3-state
  segmented: All · Mine · Liked.** "All" = the full cookbook (members' recipes +
  your published + your liked) — this is the "both" case; "Mine" = your
  published only; "Liked" = your hearted only. User's "one or the other or both"
  intent: Mine (one) / Liked (other) / All (both). **Pass-2 nuance:** "All" also
  includes members' recipes; if the user later wants "mine + liked *excluding*
  members," add a separate Members toggle or a 4th state — flagged, not built
  now.
- [CONFIRMED: ADVISORY — user, 2026-07-09] **OQ4 — MOVE the cookbook-members
  list to Account only** (remove it from Cookbook). Result: Cookbook = the
  recipe feed + toolbar (members' recipes + mine + liked); Account = who's in
  your cookbook (the members list + explainer + Settings link). Phase 6 extracts
  the members view, mounts it on Account, and **removes** the members mount from
  `cookbook.ts` (`showCookbook` no longer inserts `membersMount`).
- [CONFIRMED: ADVISORY — user, 2026-07-09] **OQ7 — like heart overlays the
  no-meal placeholder in the same top-right spot.** Consistent position whether
  or not the recipe has a photo; the control never moves.
- [CONFIRMED: ADVISORY — user, 2026-07-09] **OQ8 — center the whole `.comments`
  block** (heading + thread + composer) at a readable max-width (so lines don't
  sprawl on wide screens). Not just the composer.
- [CONFIRMED: BLOCKING — user, 2026-07-09] **OQ9 — Alchemy tag toolbar =
  filter drafts by a draft "status" tag.** The user can set a **status** on a
  draft and filter the Alchemy list by it. This rides an existing field: the
  `app.arecipe.draft` record already carries `status` (`drafts-sync.ts:18`,
  today hardcoded `'draft'`). Scope: widen `status` from the literal to a small
  set (values TBD in Pass 2 — e.g. `idea` / `testing` / `ready` / `published`),
  add it to the local `Draft` type (`drafts-local.ts`) + an editor control
  (`editor.ts`) + the Alchemy filter (`mine.ts`). Applies to **drafts only**
  (local-first, PDS-backed), NOT the published recipe lexicon. Likely splits
  Phase 11 → 11a (rename + New Recipe button + drafts list) and 11b (status
  field + editor control + status filter) to keep each ≤ 3 files (Pass 2 sizes
  it). Authorable freeform tags on published recipes remain a separate,
  deferred feature.

**New questions surfaced by Pass 2 (need the user's call):**

- [CONFIRMED: PHASE-GATED (Phase 6) — user, 2026-07-09] **OQ10 — members render
  ONLY on Account; there is no public cookbook cold-view.** The user's routing
  rule: **logged-in users** hit *their own* Cookbook (with whatever toolbar
  settings they left — see OQ11 separate keys); **anonymous/signed-out** visitors
  hit **Browse**; the **Account** page shows the **Bluesky account associations**
  (the members list). Consequences for Phase 6: members are removed from Cookbook
  on **all** paths and live only on Account; the signed-out Cookbook **redirects
  to Browse** (replacing today's `cookbook-signed-out` gate at
  `cookbook.ts:146-164`); the `?did=` cold-view members rendering
  (`cookbook.ts:126-141`) is no longer a members surface, so
  `tests/e2e/cookbook.spec.ts:92-103` (asserts `cookbook-member` on the cold-view)
  is retargeted to the feed / removed. *Note: the anon→Browse redirect is a
  behavior change beyond a pure move; flagged inside Phase 6.*
- [CONFIRMED: PHASE-GATED (Phase 8) — user, 2026-07-09] **OQ11 — Cookbook gets its
  own `cookbook-*` localStorage keys.** Parameterize `createBrowsePrefs(prefix)`
  (`browse-state.ts:133`) so Cookbook persists view/photos/facets independently
  of Browse — a Details/facet choice on one page does not bleed into the other.
  This makes `browse-state.ts` part of Phase 7's write-set.
- [CONFIRMED: PHASE-GATED (Phase 9) — user, 2026-07-09] **OQ12 — the liked load is
  LAZY.** "All" = members + your published (the authors feed); the liked set folds
  in only when the **Liked** filter is engaged. Keeps the common/default Cookbook
  open cheap (no cross-PDS liked load until asked). Does not change OQ6's
  semantics — only defers the liked fetch.
- [CONFIRMED: BLOCKING (before Phase 11b) — user, 2026-07-09] **OQ13 — draft
  status set = `draft` (default) · `cooking` · `ready`; `published` is a
  DERIVED meta-status, not a settable draft status.** A recipe that has been
  published reads as "published" because it *is* published (it lives in the
  Published section) — it is not stored on the draft or chosen in the editor.
  So the settable enum widened in `drafts-sync.ts`/`drafts-local.ts` is
  `draft|cooking|ready`; keeping `draft` as the default means existing local +
  already-synced PDS records (all `'draft'`) stay valid with no migration. The
  Alchemy status filter (11c) may surface a "published" bucket sourced from the
  **Published section**, not from `draft.status`.

## Review Log

### Pass 1: Base plan — 2026-07-09
Built from the user's batched requests across the recipe page (drop saved →
like-only; like heart as image overlay; center + style comments; themed link
color for dark mode; "Hide" on the title line with confirmation), Account
(cookbook-members list), and Cookbook (Browse-style toolbar; my/liked source
filter; New Recipe button → builder). Grounded in the code: interactions model
+ half-wired `saved` (`interactions.ts`); no global anchor color
(`styles.css`); recipe detail + image-overlay precedent (`view.ts`); inline-but-
extractable Browse toolbar (`browse.ts` + `browse-state.ts`); cookbook members +
feed (`cookbook.ts`); editor as the builder. Structured as Phase 0 discovery
(toolbar extraction, liked-feed data, interpretation OQs) → 10 sequential phases
each ≤ 3 files, ordered low-risk-first (link color) and with the toolbar chain
(extract → adopt → filter → button) last. Coupled item 1 (remove saved) to item
9 (Cookbook liked filter) as the single liked-collection story. Preserved the
shipped CSP (styling in `styles.css` only).

**Open questions — all confirmed via one-at-a-time walk-through (2026-07-09).**
Nine total: 4 BLOCKING (OQ1 liked recipes live on Cookbook; OQ2 New Recipe →
existing `editor.html`; OQ3 rename "My recipes" → "Alchemy" drafting workspace;
OQ9 Alchemy tag toolbar = draft `status` filter), 1 PHASE-GATED (OQ5 inline
two-step Hide confirm), 4 ADVISORY (OQ6 All/Mine/Liked segmented; OQ4 members
list MOVED to Account only; OQ7 heart on the no-photo placeholder too; OQ8
center the whole comments block). The walk-through grew the plan: OQ3 added
Phase 11 (Alchemy) + a `nav.ts` label change; OQ9 added a small draft `status`
field (rides the existing `app.arecipe.draft` `status`); OQ4 turned Phase 6 from
also-show into a move (off Cookbook). Developed + committed on branch
`recipe-cookbook-ui` off `027a4f9`, isolated from another plan deploying to
`main`. Ready for Pass 2 (gap analysis) in a fresh context.

### Pass 2: Gap Analysis — 2026-07-09

Verified every file:line claim against the branch (parallel read-only sweep of
`interactions.ts`, `recipe.ts`, `view.ts`, `browse.ts`, `browse-state.ts`,
`cookbook.ts`, `account.ts`, `mine.ts`, `nav.ts`, `editor.ts`, `drafts-local.ts`,
`drafts-sync.ts`, `feed.ts`, `cache.ts`, `read.ts`, `styles.css`, the full
`tests/` tree, `README.md`, `docs/`).

**Found:**
- **Liked-feed loader does not exist (Phase 9 / D2 mis-scoped).** `loadAuthorsFeed`
  (`feed.ts:33`) loads **by author**; there is no by-URI/by-strongRef loader
  anywhere. Phase 9 must **build** a new `loadLikedFeed(interactions)→CachedRecipe[]`
  from the same primitives (`resolveDidDoc`+`createRecordReader`+`createRecipeCache`),
  with cross-PDS DID→PDS resolution per ref, empty-ref filtering (`interactions.ts:77`
  fallback), and a discovery cap. D2 recast from "confirm the path" to "design the
  loader".
- **The source control is not a uniform filter (Phase 9).** Mine/All are
  in-memory filters over the loaded authors feed; Liked is a separate fetch that
  can surface non-member recipes. And OQ6's "All includes your liked" forces a
  liked union into the **default** view → cross-PDS load on every Cookbook open
  (→ OQ12).
- **`summarize` is not cookbook-scoped itself** — it dedupes likers by author DID
  over whatever it's handed; `loadRecipeInteractions` does the scoping. Corrected
  in Verified Assumptions (presentation-only for Phase 3).
- **Documentation Impact was wrong** ("no app docs go stale"). D0 grep found real
  stale prose: `README.md:32-38`, `docs/DESIGN.md:92-96,147-156,148,167,169-171`.
  Rewrote the section and assigned each doc edit to Phases 6/8/11a. (`saved` hits
  are lexicon-level — not stale.)
- **Phase 6 under-extracts.** The members list is *orchestrated* in `showCookbook`
  (`resolveCookbook`→`membersToAuthors`→`renderMembersList` + reach prefs + async);
  Account has none of that. The new module must expose `mountMembersList(...)`
  (resolve+render), and `cookbook.ts` must **keep** `resolveCookbook`/
  `membersToAuthors` because the **feed** depends on them.
- **Cold-view members have no home (Phase 6).** The public `?did=` view renders
  members + a test asserts it; Account can't host arbitrary-DID members. → OQ10.
- **Phase 11 is 4 files → split 3-way**, not 2. The draft `status` field spans
  `drafts-local.ts`+`drafts-sync.ts`+`editor.ts`+`mine.ts`. Split into 11a (rename),
  11b (status data model), 11c (status UI). Also: **the "New Recipe" button already
  exists** on `mine.ts:36-39` — 11a doesn't add it.
- **Nav rename is low-breakage**, not "repo-wide": `tab-mine` testid + `mine.html`
  route are kept (match is by pathname regex), so only 3 cosmetic test *titles*
  change.
- **Phase 2 exact test breakage enumerated:** `unit/social/interactions.spec.ts`
  (type import + 6 assertions) + `e2e/interactions.spec.ts:66`.
- **Toolbar localStorage keys collide** if Cookbook reuses Browse's prefs → OQ11.
- Smaller resolved details folded into phases: Phase 1 global `a{}` is safe
  (all anchors class-scoped); Phase 3 overlay via `querySelector` (no `view.ts`
  change needed) + count rides the overlay + coexists with `.photo-credit`;
  Phase 4 `renderRecipeDetail` has a single caller (safe) + preserve the unhide
  path; Phase 5 is CSS-only (`.comments`/`.comment-compose` DOM already exists);
  Phase 10 drops the editor-retitle item (OQ2) and shows the button only on the
  own signed-in Cookbook.

**Concurrency:**
- No changes to the sequential model — confirmed still required by shared
  write-sets. Re-checked after adding phases: the new 11a/11b/11c chain is
  sequential (`mine.ts` shared by 11a/11c; 11b's data model feeds 11c). Updated
  the spine to `…→10→11a→11b→11c`. No parallel set worth opting into.

**Changed:**
- Verified Assumptions: corrected `summarize` scoping; rewrote the liked-feed
  assumption to record that the loader must be built.
- Documentation Impact: rewritten with real D0 findings mapped to phases.
- Phase 0: D0 marked run (findings folded in); D2 recast as a design task; D3
  narrowed to the new OQs only.
- Phases 1–10: added `[Pass 2]` gap/resolution notes (no reordering, no reasoning
  rewrite).
- Phase 11 → **11a / 11b / 11c** (additive split; anticipated by OQ9).
- Open Questions: added OQ10 (cold-view members), OQ11 (toolbar prefs keys),
  OQ12 (liked-load timing), OQ13 (draft status set).
- Concurrency Map spine updated for the 11-split.

**Confirmed:**
- The nine Pass-1 OQs still hold — not re-walked.
- Phase ordering (low-risk link fix first; toolbar chain 7→8→9→10 last) is sound.
- The image-overlay precedent (`.photo-wrap` is `position:relative` at
  `styles.css:741`; `imageCreditOverlay` already overlays the banner) holds.
- CSP posture intact — every added rule lives in `styles.css`; no inline styles,
  no new remote assets, in any phase.
- `availableFacets`/`matchesFilter` are page-agnostic pure functions over
  `CachedRecipe[]` → cleanly reusable by Cookbook (Phase 8).
- `@live` convention confirmed (title-substring `@live`, `playwright.config.ts:13-14`;
  `LIVE=1 npm run test:live`); Phases 2/6/8/9/11b correctly gate their write-path
  checks on `@live`.

**OQ walk-through (Pass 2, 2026-07-09) — all four new questions CONFIRMED:**
- **OQ10** — user reframed beyond the recommendation: members on **Account only**;
  **anon → Browse** (signed-out Cookbook redirects, replacing the gate); no public
  cookbook cold-view members surface. Propagated into Phase 6 (routing change +
  test retargets; flagged possible 6b split for the redirect).
- **OQ11** — separate `cookbook-*` keys (as recommended). `browse-state.ts` added
  to Phase 7 write-set (`createBrowsePrefs(prefix)`).
- **OQ12** — lazy liked load (as recommended). Phase 9 "All" = members+published;
  liked loads only on the Liked filter.
- **OQ13** — user set the values `draft`/`cooking`/`ready` (chose "cooking" over
  the recommended "testing"); `published` is a **derived** meta-status (not
  stored/settable). Propagated into Phase 11b/11c.
The nine Pass-1 OQs were not re-walked (unchanged, already confirmed).

### Pass 3: Quality Gates — 2026-07-09

Fresh context; plan doc as sole handoff. Analysis only — no production code
written or run. All fixes applied **additively** (`[Pass 3]`-tagged notes, no
phase reorder, no reasoning rewrite). Spot-checked the branch: `package.json`
test scripts, `playwright.config.ts:13-14` `@live` grep-invert, `src/log.ts`
signature + gating, `feed.ts` logging pattern, `cookbook.ts:146` signed-out
gate, `interactions.ts:82` `KINDS` filter, `identity/did.ts:11` `resolveDidDoc`,
redirect idioms — all as Pass 2 recorded; nothing drifted.

**TDD ordering:**
- Confirmed every implementation phase has a wiring test that exercises the
  **entry point** (page/nav/store API), not an isolated module, and states
  RED-first. No isolation-trap defects.
- **Named two legitimate TDD-shape exceptions so tdd-guardian/pr-reviewer don't
  misfire, and so no one manufactures a fake RED:** (1) **Phase 7** is a
  behavior-preserving extraction — its "wiring test" is the *existing*
  `browse.spec` suite held GREEN→GREEN (characterization/regression), not a new
  RED; editing a browse assertion to pass = masking a regression. (2)
  **Phase 11b** ships no UI, so its **unit** round-trip test *is* the
  entry-point wiring test (entry point = the drafts store public API that 11c
  will call); e2e entry-point coverage lands in 11c.
- **Mutation resistance:** added edge/boundary specifications to the branching
  phases so single-point assertions can't survive a one-line mutation —
  Phase 8 (Tiles↔Details both directions; facet excludes a named entry),
  Phase 9 (Mine excludes a member recipe / All includes it / Liked shows a
  non-member cross-PDS recipe), Phase 11b (default *and* non-default status both
  round-trip; `published` rejected), Phase 11c (selected present + other absent,
  both directions). Phase 1/Phase 5 CSS assertions de-brittled: compare computed
  values to a known token-bearing element instead of hardcoding hex/px.

**Observability:**
- Established a cross-phase observability convention on `src/log.ts`
  (`log.<level>(component, message, {data})`; debug/info gated behind `?debug=1`,
  warn/error always emit) and a **two-silence-class** rule:
  *silent-by-design* (dropping expected legacy data — Phase 2 `saved` filter,
  Phase 11b status default → no log) vs *must-not-be-silent* (dropping wanted
  data — Phase 9 cap + per-ref cross-PDS failure → `log.warn`).
- **Phase 9:** named the exact `log.warn('liked-feed', …)` calls for per-ref
  failure and the discovery-cap drop (no silent truncation); empty-ref skip →
  `debug`.
- **Phase 6:** the signed-out→Browse redirect now logs `log.info('cookbook',
  'signed-out → redirecting to Browse')` and uses `location.replace` (no
  back-button loop).
- **Phase 3:** null-banner branch logs `log.warn` so the overlay-mount/no-photo
  path is diagnosable.

**Debugging readiness:**
- Added a concrete "if RED stays red, check X" to every non-obvious phase:
  Phase 2 (second save-mount site), Phase 3 (mount ordering vs
  `replaceChildren`), Phase 4 (two-step state not native `confirm()`), Phase 6
  (redirect fires pre-`mountShell`; test waits for navigation), Phase 7 (testid
  byte-identity + the two re-render seams), Phase 9 (5-stage loader walk), 11b
  (`?? 'draft'` + widened type).

**Validation calibration:**
- Every phase declares a strategy; all calibrated to scope. Confirmed the two
  the prompt flagged: **Phase 9 = Broad** is correct (only phase fetching from a
  PDS the viewer doesn't own — the `@live` cross-PDS liked recipe is
  load-bearing, tests alone can't prove it). **Phase 6 = Moderate** is correct,
  but its behavior-change (anon→Browse redirect) was under-covered in the wiring
  test — **strengthened**: the redirect is now a third RED-first hermetic
  assertion (signed-out needs no creds), so the routing change is fully covered
  in the gate tier and `@live` only exercises the real-graph members render.
- `@live` gate placement (Phases 2/6/8/9/11b) confirmed correct — each is a
  real read/write-a-PDS feature; hermetic tier stays `@live`-free via the
  config grep-invert.

**Concurrency honesty:**
- Map confirmed; sequential plan. Re-walked write-sets after Pass 3 (no files
  moved). Every adjacent phase pair shares a write-set entry or a
  producer→consumer dependency (`styles.css`, `cookbook.ts`, `view.ts`,
  `mine.ts`, `browse-state.ts` chain) → no admissible parallel set under the
  hard rule. No worktrees → no re-entry verification needed.

**Discovery (Phase 0):**
- D1/D2 are concrete (question/probe/success) with `throwaway` dispositions and
  the exemption correctly bounded (no TDD/commit for the probes; RED-first
  starts at Phase 1). Confirmed they are **not** resolvable in a no-code
  planning pass (D1 code-reading, D2 needs `@live`) — deferral to execution's
  stop-point is correct. Added the explicit hand-off: D2 fixes the discovery
  **cap value** and writes it into Phase 9 (Phase 9's cap-drop `log.warn`
  depends on it).

**Coherence:**
- Plan still solves the original problem; no scope creep. File-count ceiling
  made explicit (counts *source* files; tests + cosmetic doc edits ride along) —
  under it every phase is ≤4 source files. Re-checked the phases the prompt
  flagged: **Phase 6** = 3 source (members-view + `cookbook.ts` + `account.ts`);
  kept whole with a **concrete 6b split trigger** replacing "size at execution".
  **Phase 9** = 2 source (`liked-feed.ts` + `cookbook.ts`) + tests. **11a** = 2
  (`nav.ts` + `mine.ts`), **11b** = 2 (`drafts-local.ts` + `drafts-sync.ts`),
  **11c** = 2 (`editor.ts` + `mine.ts`). All within ceiling.
- **CSP guardrail:** added a per-phase CSP confirmation line to every phase.
  Confirmed **no** phase introduces inline `style=`/`.style`/`<style>` or a new
  remote asset — all styling stays in `styles.css`; the one class rename risk
  (toolbar) is avoided by reusing the existing `.browse-toolbar` hook. Posture
  from the security plan preserved.

**Documentation impact:**
- Every doc edit rides the phase that makes it stale (no trailing docs phase).
  **Fixed a gap:** the `docs/DESIGN.md` edits for Phase 6 (`:147-156`) and
  Phase 8 (`:92-96`) lived only in prose/Done-when — **promoted both to explicit
  Change checklist items** so they can't be skipped, matching Phase 11a's model
  (which already listed docs as a change item).

**Confirmed ready:** yes — pending the two already-CONFIRMED BLOCKING items that
gate specific phases (OQ3 nav rename before the phases that reference Alchemy;
OQ13 before Phase 11b), both resolved by the user in Pass 2. No new open
questions surfaced by Pass 3.

### Phase 0 execution + rebase re-grounding — 2026-07-09

**Context.** Before Phase 1, rebased `recipe-cookbook-ui` onto the latest
`origin/main` (`7db0999`) per user request — **+37 commits** landed (the "other
plan" that was deploying to main: recipe versioning, "Did you know?" fun facts,
⛶ Focus mode, Settings fun-facts toggle, a Reference page, dishKey collapse).
The rebase was **mechanically clean** (our branch is plan-doc-only; the 3 plan
commits replayed with zero code conflict). But the upstream changes touched
files the Pass 2 grounding was verified against — `view.ts` (+205),
`recipe.ts` (+165/−63), `styles.css` (+140), `nav.ts`, `read.ts` — so Phase 0
was expanded to re-ground against current reality (Phase 0 is the only phase
allowed to restructure later phases; the Discovery Exemption applied — read-only,
no TDD/commits).

**D1 (toolbar extractable?) — ANSWERED: yes.** `browse.ts` toolbar assembly
(`:49-92`) and the two render seams (`renderCurrent` `:177` / `showCurrent`
`:242`) are intact; the Pass 2 pinned `renderToolbar` shape holds verbatim.
`createBrowsePrefs` (`browse-state.ts:133`) confirmed as `{storage?}`-only with
hardcoded keys `:115-117` → OQ11's `prefix` param is the exact planned change.
Only new wrinkle: `collapseVersions` now runs inside Browse's render seam
(`browse.ts:202`) — stays Browse-specific for Phase 7's behavior-preserving
extraction. Findings folded into Phase 7 + Phase 0 D1.

**D2 (liked-loader design) — ANSWERED with a concrete, code-grounded signature.**
Confirmed no by-URI loader exists; all primitives present: `createRecordReader`
(`read.ts:45`, by-ref cross-PDS), `resolveDidDoc` (`did.ts:11`), `cache.put`
(`cache.ts:79`), `RECIPE_COLLECTION='exchange.recipe.recipe'` (`read.ts:9`).
Full `loadLikedFeed(interactions,{cap=50})` signature + steps written into
Phase 0 D2 and Phase 9. **Bonus precedent:** `createRecipeReader` already ships
the exact no-silent-truncation cap warn (`read.ts:98`) that Phase 9's cap should
mirror. `parseAtUri` is local/unexported (`recipe.ts:60`) → liked-feed needs its
own parse. Findings folded into Phase 0 D2 + Phase 9.

**Rebase re-grounding — what changed (all line refs, no approach changes):**
- **Recipe page is now version-aware via `paintVersion` (`recipe.ts:411-468`)** —
  renders on initial load *and every version flip*. Phases 2–5 operate inside it;
  their container is **`host` (`.version-host`)**, not the outer `content`. The
  Hide button is now inline in `paintVersion` (`:448-460`), replacing the old
  detached `:427` append. Re-mount-per-flip means Phase 2–5 changes re-apply to
  each version automatically. Captured in a new Verified Assumptions entry;
  Phases 3 and 4 got `[Rebase re-grounding]` notes.
- **`renderRecipeDetail` (`view.ts:468`, was `:280`)** now includes a
  `.detail-actions` Focus button (`:481-491`, between banner and title) and a fun-
  facts section (`:512-515`), and takes `{onFocus?, showFunFacts?}`. `.photo-wrap
  --banner` (`:477`), `imageCreditOverlay` (`:176`), `h2.recipe-title` (`:492`).
  Phase 3 overlay + Phase 4 title-row both coexist (distinct rows). VA updated.
- **Save/interactions refs shifted** (interactions.ts itself unchanged):
  `save-button` `:273-275`, render `youSaved` `:296/:301-302`, click `:366`.
  Phase 2 change item + VA updated.
- **Comments refs shifted:** `mountComments` `:113`, `.comments` `:124`,
  `.comment-compose` `:200`, `.comment-text` `:202-204`. Phase 5 stays CSS-only.
- **Two NEW stale "My recipes" labels** the rebase introduced → added to Phase
  11a: `recipe.ts:245` signed-out comment pointer, and `nav.ts` gained a 4th
  **Reference** tab (`:69-73`) so the DESIGN nav-list edit must preserve it. Nav
  match logic moved `:76`→`:82` (label still `:67`).
- **Unchanged by the rebase (grounding fully holds):** `interactions.ts`,
  `cookbook.ts`, `account.ts`, `mine.ts`, `editor.ts`, `drafts-local.ts`,
  `drafts-sync.ts`, `comments-view.ts`, `exclusions.ts`, `browse-state.ts`,
  `feed.ts`, `cache.ts` — so Phases 6, 8, 9, 10, 11a(mine), 11b, 11c grounding on
  those files is intact. `styles.css` early rules mostly stable (`--enamel`
  `:12/:58`, `a.card` `:696`, `.photo-wrap` `:741`, `.editor textarea` `:921-922`,
  `.browse-toolbar` `:409`); still no bare `a{}` rule → Phase 1 holds.

**Net effect on the plan:** no phase added/removed/reordered; no reasoning
rewritten; no approach changed. The rebase shifted line references and added two
coexistence concerns (Focus button, per-version re-mount) and two new stale
labels — all folded into the affected phases. **Phase 0 stop-point reached —
awaiting user review before Phase 1.**
