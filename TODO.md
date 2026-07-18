# arecipe — TODO / backlog

Actionable, not-yet-scheduled items. Feature deferrals with rationale live in
`docs/BUILD-PLAN.md` § Deferred; this file is for tooling/QA follow-ups and
loose ideas a later session can pick up.

## Bugs

- [x] **Loopback (local dev) sessions can't refresh their token except on
      signin.html.** _Resolved 2026-07-16._ The loopback OAuth `client_id` used
      to encode the initiating page's pathname (`buildLoopbackMetadata` →
      `redirect_uri` from `location.pathname`), so a token obtained on
      `signin.html` was bound to signin.html's client and a refresh on any other
      page was rejected with "Token was not issued to this client" — and
      signin.html redirects away once authed, leaving no reachable authed page to
      refresh on. **Fix:** `buildLoopbackMetadata` now enumerates every authed
      page's `redirect_uri` in one **pathname-independent** `client_id`
      (`LOOPBACK_REDIRECT_PATHS`, `signin.html` first as the callback landing +
      `redirect_uris[0]`). The atproto loopback spec permits repeated
      `redirect_uri` params (verified against `@atproto/oauth-types`), so the
      client_id is byte-identical on every page and a token minted during sign-in
      refreshes anywhere. Production/hosted was always unaffected (one fixed
      `client_id` from `client-metadata.json`, asserted byte-identical). The
      `@live` `two-tab-live` / `two-device-read` forceRefresh specs are
      un-`fixme`'d and force the refresh on `mine.html` (a different page than
      signin.html). _Noted 2026-07-10._

## Tooling / QA

- [x] **Per-PR preview deploys.** Every same-repo PR gets a live, read-only
      copy of the built app at `arecipe.app/pr-preview/pr-N/`, torn down on
      close. Plain-git deploy (`scripts/pages-deploy.sh`), no third-party
      actions. _See `docs/PREVIEWS.md`._

- [x] **Evaluate `pwa-check` for PWA validation.** _Evaluated 2026-07-16 →
      **periodic / pre-release, not the hermetic gate.**_ Ran
      `@pwa-today/pwa-check@0.0.7` against the built app: 27 pass, 12 warn, 0
      fail. It statically validates manifest completeness/validity + icon
      reachability + SW handler presence — a real regression class the Playwright
      suite doesn't assert — but it never runs the SW, so it is blind to
      arecipe's actual PWA risk (offline boot, SW nav fallback), which Playwright
      already covers. `--fail-on-warn` is unusable here (10/12 warnings are
      intentional omissions and 8 carry no code, so `--ignore-warn` can't silence
      them). Deterministic; needs a served build + `npx` fetch. Full brief with
      raw findings + a narrow `fail===0`-only gate suggestion for later:
      `docs/sources/PWA-CHECK-EVALUATION.md`. _Noted 2026-07-09 during the
      recipe-cookbook-ui branch._

## Ideas / loose

- [ ] **Give Browse the Cookbook cache-first SWR paint.** Cookbook paints from
      the IndexedDB cache instantly, then revalidates in the background (see
      `src/pages/cookbook.ts` `showFeed` + `readFeedMeta`/`writeFeedMeta`). Browse
      caches records to IndexedDB with offline fallback + a sessionStorage
      back-nav restore, but does NOT do that cache-first-then-revalidate paint —
      a cold Browse load waits on the network. Worth porting the SWR pattern so
      Browse paints stale-then-fresh like Cookbook. Now that Browse paginates at
      50 (`6a3adde`), a lazy/deferred load of later pages could compound the win.
      _Noted 2026-07-10._

- [x] **Cook-search typeahead** — the handle inputs in Browse and add-a-cook
      (meals palette) suggest accounts as you type, via Bluesky's
      `app.bsky.actor.searchActorsTypeahead` (public AppView, CORS-open, no auth).
      Answers the "you have to know someone's exact username" friction without
      indexing 38M accounts client-side. _Shipped — see
      `plans/2026-07-10-2-plan-cook-search-typeahead.md`._

- [ ] **User-guide page(s) for recipe import + Web Share Target.** The UI is
      stable enough now to document accurately (that's the payoff of a stable
      surface — the docs won't rot). Write a cook-facing guide (a `help`/`guide`
      surface, or a section wherever end-user docs land) covering the Alchemy
      "Import from link" flow. Be **honest about the CORS reality** rather than
      overpromising — the facts to encode, all verified in this run:
      - **Import from link** (Alchemy → "Import from link"): paste a recipe URL →
        it tries to read the page directly; most sites block cross-origin reads
        (measured: 7 of 8 popular recipe sites send no permissive CORS header),
        so it usually falls back to a **paste** box — paste the page source **or**
        the visible recipe text. Either way you get a prefilled **local draft**
        that opens in the editor; **nothing publishes** until you hit Publish.
      - **Parse coverage:** schema.org/Recipe JSON-LD (the near-universal case)
        and a plain-text heuristic; a partial import leaves the missing side blank
        (never fabricated); provenance (source link) is attached and shown.
      - **Share to arecipe** (Web Share Target, **installed PWA on
        Android/Chromium only — iOS Safari doesn't support it**): share a recipe
        into arecipe from the phone browser. Sharing **selected recipe text**
        imports with **no fetch at all** (the one path that fully sidesteps CORS)
        — the tip worth leading with; sharing a **bare link** only hands over the
        URL, so it prefills and falls back to paste.
      - The single "own words" etiquette line shown near Publish for imported
        drafts is the natural place to point cooks at attribution norms.
      Source of truth for accuracy: `plans/2026-07-18-1-plan-recipe-import.md`.
      _Noted 2026-07-18 during the recipe-import run._
