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
  (`'liked'|'saved'`), a recipe `strongRef`, `createdAt`
  (`interactions.ts:16-52`). `summarize` computes a deduped cookbook-scoped
  `likeCount` + `youLiked`/`youSaved` (`:111-123`). Add/remove =
  `createRecord`/`deleteRecord` (`:155-201`). Confirmed by reading the file.
- **A "liked recipes" feed is buildable from own records.** `listInteractionsFor`
  can read the viewer's own repo filtered to `kind:'liked'`
  (`interactions.ts:55-85`); each record holds the recipe `strongRef` (uri+cid),
  so the liked-recipes feed = load those recipe URIs. (Phase 0 D2 confirms the
  load path + caching reuse.) Confirmed by reading; the batch-load path is the
  discovery item.
- **Save is half-wired.** Recipe page renders a save toggle (`recipe.ts:272`,
  `:300`, `:365`); no view lists saved recipes (`mine.ts` = Drafts only).
  Confirmed by grep — no `Saved` view anywhere in `src/`.
- **No global anchor color.** `styles.css` has no `a{color}` rule (only
  `a.card` at :696); `.comment-author` (`comments-view.ts:31`) sets no color →
  UA blue. `.provenance-author`/`.nav-auth` use `--enamel` (`:337`, `:194`).
  `--enamel` has light (`#175e54`) + dark (`#5cb3a1`) variants. Confirmed.
- **Recipe detail structure.** `renderRecipeDetail` (`view.ts:280`): banner
  (`.photo-wrap--banner`, with an overlay credit) → `h2.recipe-title` (`:293`)
  → chips → lede → attribution → columns → provenance. The Hide button is
  appended by `recipe.ts:427` far below (after revision-check note). Confirmed.
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

- No app docs (`README.md`, `docs/*.md`) reference the specific functions/pages
  being changed in a way that goes stale (grep before Phase 1 to confirm —
  recorded as a Phase 0 step). `docs/DESIGN.md` describes the Browse toolbar and
  trust-surface generally; if the toolbar becomes shared or Cookbook gains it,
  add a one-line note in the phase that lands it (Phase 8).
- New source modules (shared toolbar, shared members-view, liked-feed helper)
  are code, not docs; no doc index lists them.
- **Phase 0 D0:** `grep -rn` the touched symbols/pages across `README.md`,
  `docs/`, and other skills to confirm the above; record findings here.

## Concurrency Map

Sequential spine: **Phase 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10.**

- Nearly every phase writes `styles.css` and/or `src/recipes/view.ts` and/or a
  page file, and phases 7→8→9→10 form a hard chain (extract toolbar → Cookbook
  adopts it → filter uses it → button sits on it). So sequential is **required
  by the write-sets**, not merely chosen.
- Candidate parallelism considered and rejected: the link-color fix (Phase 1)
  is genuinely independent (only `styles.css` + maybe one class), and the
  Account members extraction (Phase 6) is largely disjoint from the recipe
  cluster — but both touch `styles.css`, and running a fleet here isn't worth
  the worktree/merge overhead for ~10 small edits by one executor. Default
  sequential; revisit only if the user wants parallel execution.
- All sequential → no worktrees, no re-entry-verification fields.

## Phases

**Cross-phase conventions:** TDD — tests-first for behavior (RED before GREEN,
watch it fail); the hermetic Playwright/vitest tier (over the built `dist`) is
the gate; `@live` (real-PDS) only where the write path is the feature (likes,
liked-feed). CSP stays intact — styling in `styles.css` only, no inline styles.
Every phase commits when green; the plan doc's status is synced per phase.

### Phase 0: Discovery

**Goal:** Resolve the reusability/data unknowns and confirm the interpretation
open questions before committing to the toolbar/liked-feed phases.

- [ ] **D0: Documentation + reference grep.** `grep -rn` the touched pages and
      symbols (recipe/cookbook/account, `renderMembersList`, `saved`, toolbar)
      across `README.md`, `docs/`, and `.claude/`. **Success:** the
      Documentation Impact section reflects real findings. **Disposition:**
      findings → plan.
- [ ] **D1: Is the Browse toolbar cleanly extractable?** Read `browse.ts`
      end-to-end + `browse-state.ts`. Determine the exact inputs a shared
      `renderToolbar` needs (state, facets, callbacks) and what stays
      page-specific. **Success:** a concrete extraction shape (signature + which
      state is shared vs injected) written into Phase 7. **Disposition:**
      throwaway notes.
- [ ] **D2: Can we build a "liked recipes" feed from own records?** Confirm
      `listInteractionsFor(ownRepo, kind:'liked')` returns the recipe strongRefs
      and that the existing recipe-load/cache path can batch-load them for a
      feed (reuse `renderRecipeList`). Note rate/cap behavior. **Success:** a
      confirmed data path for Phase 9 (+ whether it needs `@live` to verify).
      **Disposition:** throwaway probe.
- [ ] **D3: Confirm the interpretation OQs** (OQ1/OQ2/OQ3/OQ5/OQ6) with the
      user — these change phase structure. **Success:** each resolved in Open
      Questions. **Disposition:** N/A (decisions).

**Read-set:** `src/pages/{browse,cookbook,account,recipe,editor,mine}.ts`,
`src/recipes/{view,browse-state,exclusions}.ts`, `src/social/{interactions,
cookbook,comments-view}.ts`, `styles.css`.
**Write-set:** throwaway probe notes; no production files.
**Shared-state contract:** read-only exploration; `@live` probe for D2 reuses
one session if run.
**Done when:** D0-D2 answered with evidence; D3 OQs confirmed by the user.
**Validation:** Discovery (Exemption applies).
**Stop-point — report; user confirms OQs before Phase 1.**

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
**Done when:** 1) links are enamel in both themes; 2) `npm test` green incl. the
new contrast assertion.
**Validation:** Narrow-plus — visual check in both themes + full e2e regression.
**Stop-point.**

### Phase 2: Remove "saved"; like is the only interaction

**Goal:** No save toggle anywhere; `liked` is the single interaction kind.
**Changes:**
- [ ] `src/social/interactions.ts` — remove `'saved'` from `InteractionKind`
  and `KINDS`; drop `youSaved` from `summarize`; keep read-tolerance for any
  legacy `saved` records (ignored, not errored).
- [ ] `src/pages/recipe.ts` — remove `saveBtn` + its toggle wiring
  (`:272`, `:300-302`, `:365`); keep like + count.
- [ ] `tests/unit` + `tests/e2e` — update interactions unit tests and the
  `interactions*.spec` to drop save; assert like-only behavior.
**Call chain:** recipe page → `mountInteractions` → like only.
**Wiring test:** e2e recipe interactions: like toggles + count; **no**
save-button present (`save-button` testid absent). RED first (button exists).
**Depends on:** Phase 1.
**Read-set:** `interactions.ts`, `recipe.ts`, interaction tests.
**Write-set:** `interactions.ts`, `recipe.ts`, tests.
**Shared-state contract:** `@live` like write path unchanged; save write removed.
**Risks:** unit tests asserting `youSaved`/`KINDS` length — update them.
**Done when:** 1) recipe page shows like only, save gone; 2) `npm test` green;
3) `@live` like still writes/removes.
**Validation:** Moderate — hermetic + a like `@live` toggle.
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
**Done when:** 1) heart overlays the image top-right and toggles; 2) `npm test`
green.
**Validation:** Moderate — hermetic + visual both themes + placeholder case.
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
**Done when:** 1) Hide is inline-right of the title, confirms before hiding;
2) `npm test` green incl. the confirm flow.
**Validation:** Moderate — hermetic + manual narrow-screen check.
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
**Risks:** centering the whole comments block vs just the composer — confirm
intent in Phase 0 (OQ8 lightweight).
**Done when:** 1) comments centered + composer styled in both themes; 2)
`npm test` green.
**Validation:** Narrow-plus — visual both themes + e2e.
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
**Call chain:** account page (signed in) → shared members view → list renders;
cookbook page → feed only (no members).
**Wiring test:** e2e — signed-in Account shows `cookbook-members` (explainer +
Settings link); Cookbook no longer renders `cookbook-members`. RED first
(Account has none; Cookbook still has it).
**Depends on:** Phase 5.
**Read-set:** `cookbook.ts`, `account.ts`, `social/cookbook.ts`.
**Write-set:** new shared module, `cookbook.ts`, `account.ts`.
**Shared-state contract:** reach prefs read (same as Cookbook today).
**Risks:** any test asserting members on Cookbook must move to Account; Account
signed-out state (members absent) — handle.
**Done when:** 1) Account shows the list signed-in, Cookbook shows none; 2)
`npm test` green; 3) `@live` signed-in Account renders members.
**Validation:** Moderate — hermetic + `@live` signed-in render.
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
**Read-set:** `browse.ts`, `browse-state.ts`, `view.ts`.
**Write-set:** new `toolbar.ts`, `browse.ts`.
**Shared-state contract:** `createBrowsePrefs` localStorage (unchanged).
**Risks:** subtle Browse regressions — the full `browse.spec` is the guard.
**Done when:** 1) Browse works identically via the shared toolbar; 2) `npm test`
green (browse suite unchanged).
**Validation:** Moderate — hermetic; Browse is the highest-regression-risk here.
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
**Call chain:** Cookbook → shared toolbar → filtered/toggled cookbook feed.
**Wiring test:** e2e cookbook — toggle Tiles/Details changes the feed render;
a facet filter narrows it; count reflects.
**Depends on:** Phase 7.
**Read-set:** `cookbook.ts`, `browse-state.ts`, `toolbar.ts`, `styles.css`.
**Write-set:** `cookbook.ts`, `styles.css`.
**Shared-state contract:** cookbook view prefs (localStorage) — decide shared
vs separate key from Browse (Phase 0/OQ).
**Risks:** facet availability differs for the cookbook feed — derive from its
own entries.
**Done when:** 1) Cookbook has a working toolbar; 2) `npm test` green.
**Validation:** Moderate — hermetic + `@live` cookbook feed toggle.
**Stop-point.**

### Phase 9: Cookbook source filter — my recipes / liked (either·or)

**Goal:** On the Cookbook toolbar, filter the feed to my created recipes and/or
my liked recipes (per OQ6 semantics).
**Changes:**
- [ ] `src/social/liked-feed.ts` (new) or extend interactions — load the
  viewer's `liked` interaction records → their recipe strongRefs → recipes
  (reuse the recipe cache/load path from Phase 0 D2).
- [ ] `src/pages/cookbook.ts` — add the source control (mine / liked / either)
  to the toolbar; swap the feed source accordingly; empty/ signed-out states.
- [ ] `tests` — unit for the liked-feed mapping; e2e for the source toggle.
**Call chain:** Cookbook toolbar source control → feed source swap → render.
**Wiring test:** e2e — selecting "Liked" shows only hearted recipes; "Mine"
shows only created; signed-out hides the control. RED first.
**Depends on:** Phase 8, Phase 0 D2.
**Read-set:** `cookbook.ts`, `interactions.ts`, recipe load path.
**Write-set:** new `liked-feed.ts`, `cookbook.ts`, tests.
**Shared-state contract:** `@live` reads own `liked` records.
**Risks:** liked recipes may be others' recipes (cross-PDS load) — reuse the
resolve/load path; cap like discovery.
**Done when:** 1) mine/liked/either filter works; 2) `npm test` green; 3)
`@live` liked feed lists hearted recipes.
**Validation:** Broad — hermetic + `@live` (real liked records, cross-PDS load).
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
**Done when:** 1) button opens the builder; 2) `npm test` green.
**Validation:** Narrow — hermetic navigation test.
**Stop-point.**

### Phase 11: "My recipes" → "Alchemy" (drafting workspace)

**Goal:** Rename the My-recipes destination to **Alchemy** — the create/edit/
save/publish workspace — with its own New Recipe button and a top tag toolbar
(tag scope per OQ9).
**Changes:**
- [ ] `src/nav.ts` — rename the `DESTINATIONS` label "My recipes" → "Alchemy"
  (keep `mine.html` as the file/route unless a rename is requested; the tab
  label + match are what change). Update `tab-mine` testid usage if renamed.
- [ ] `src/pages/mine.ts` — retitle the page to "Alchemy"; add a **New Recipe**
  button (→ `editor.html`, same target as Cookbook's, OQ2); keep the Drafts
  list + create/edit/save/publish flow; mount the tag toolbar (OQ9).
- [ ] `styles.css` — toolbar/button layout on the page (reuse toolbar/button
  styles from Phase 7).
**Call chain:** Alchemy tab → drafts + New Recipe (→ editor) + tag toolbar.
**Wiring test:** e2e — the nav tab reads "Alchemy"; the page shows Drafts + a
New Recipe button that navigates to the builder; the tag toolbar renders.
RED first (tab still says "My recipes").
**Depends on:** Phase 10 (shared New-Recipe button pattern), OQ9 (tags).
**Read-set:** `nav.ts`, `mine.ts`, `editor.ts`, `toolbar.ts`, `styles.css`.
**Write-set:** `nav.ts`, `mine.ts`, `styles.css`.
**Shared-state contract:** local drafts store (unchanged).
**Risks:** nav tests assert the "My recipes" label/testid across pages — update
them repo-wide; the tag toolbar depends on OQ9's answer (may split into its own
phase if tags need a new recipe field).
**Done when:** 1) the tab is "Alchemy" with drafts + New Recipe + tag toolbar;
2) `npm test` green.
**Validation:** Moderate — hermetic; nav-label regression across pages.
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
