# arecipe — TODO / backlog

Actionable, not-yet-scheduled items. Feature deferrals with rationale live in
`docs/BUILD-PLAN.md` § Deferred; this file is for tooling/QA follow-ups and
loose ideas a later session can pick up.

## Tooling / QA

- [ ] **Evaluate `pwa-check` for PWA validation.**
      <https://github.com/pwa-today/pwa-check> — run it against arecipe's PWA
      surface (manifest, service worker, offline boot, installability) and see
      whether it belongs in the hermetic gate or as a periodic check. arecipe is
      a zero-backend PWA (SW precache, offline reads, install), so an automated
      PWA validator could catch manifest/SW regressions the current Playwright
      suite doesn't. _Noted 2026-07-09 during the recipe-cookbook-ui branch._
