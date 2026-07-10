# arecipe — TODO / backlog

Actionable, not-yet-scheduled items. Feature deferrals with rationale live in
`docs/BUILD-PLAN.md` § Deferred; this file is for tooling/QA follow-ups and
loose ideas a later session can pick up.

## Bugs

- [ ] **Loopback (local dev) sessions can't refresh their token except on
      signin.html.** The loopback OAuth `client_id` encodes the initiating
      page's pathname (`src/auth/oauth-client.ts` `buildLoopbackMetadata` →
      `redirect_uri` from `location.pathname`), so a token obtained on
      `signin.html` is bound to signin.html's client. A token refresh on any
      other page (`mine.html`, `account.html`, `cookbook.html`) is rejected with
      "Token was not issued to this client" — and signin.html redirects away once
      authed, so there is no reachable authed page that can refresh. Impact:
      **local dev only** — once the access token expires, refresh fails across
      pages. Production/hosted is unaffected (one fixed `client_id` from
      `client-metadata.json`, shared by all pages). Surfaced by the `@live`
      `two-tab-live` / `two-device-read` forceRefresh specs (marked `test.fixme`
      until fixed). Fix direction: a stable loopback `client_id` across pages —
      e.g. pin the loopback `redirect_uri` to one canonical page, or register all
      page redirect_uris under a single client. _Noted 2026-07-10._

## Tooling / QA

- [ ] **Evaluate `pwa-check` for PWA validation.**
      <https://github.com/pwa-today/pwa-check> — run it against arecipe's PWA
      surface (manifest, service worker, offline boot, installability) and see
      whether it belongs in the hermetic gate or as a periodic check. arecipe is
      a zero-backend PWA (SW precache, offline reads, install), so an automated
      PWA validator could catch manifest/SW regressions the current Playwright
      suite doesn't. _Noted 2026-07-09 during the recipe-cookbook-ui branch._

## Ideas / loose

- [x] **Cook-search typeahead** — the handle inputs in Browse and add-a-cook
      (meals palette) suggest accounts as you type, via Bluesky's
      `app.bsky.actor.searchActorsTypeahead` (public AppView, CORS-open, no auth).
      Answers the "you have to know someone's exact username" friction without
      indexing 38M accounts client-side. _Shipped — see
      `plans/2026-07-10-2-plan-cook-search-typeahead.md`._
