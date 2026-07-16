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

- [ ] **Evaluate `pwa-check` for PWA validation.**
      <https://github.com/pwa-today/pwa-check> — run it against arecipe's PWA
      surface (manifest, service worker, offline boot, installability) and see
      whether it belongs in the hermetic gate or as a periodic check. arecipe is
      a zero-backend PWA (SW precache, offline reads, install), so an automated
      PWA validator could catch manifest/SW regressions the current Playwright
      suite doesn't. _Noted 2026-07-09 during the recipe-cookbook-ui branch._

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
