# Red-team experiments — verified installs (2026-09-14)

Hand-run browser experiments behind `plans/2026-09-14-red-team-verified-installs.md`.
Not part of the gate. Each script drives the repo's pinned Playwright engines
(Chromium, Firefox, WebKit from `~/Library/Caches/ms-playwright`) against a
throwaway origin on 127.0.0.1 and prints one JSON row per engine; the rows the
report cites are copied verbatim into `results/`.

```
npm ci                      # once, in this worktree
node tests/red-team/e1-restart-activates-waiting.mjs
node tests/red-team/e2-register-different-url.mjs
node tests/red-team/e3-clear-site-data.mjs
node tests/red-team/e4-subpath-page-owns-root.mjs
node tests/red-team/e5-service-worker-header-split.mjs
npm run build && node tests/red-team/e6-real-dist-revalidate-poison.mjs
node tests/red-team/e7-bfcache.mjs
```

Phone runs (`device/`, 2026-09-21) reach the same harness origin from a connected
Android device through `adb reverse`, which makes `http://127.0.0.1:<port>` a secure
context on the phone. `f2-phone-restart.mjs <serial> chrome` drives Chrome over its
DevTools socket; `f2-phone-restart-beacon.mjs <serial> <package>` is for a browser whose
DevTools switch is off (Samsung Internet ships that way): the page posts its own state
to the origin (`?beacon=1`) and runs `reg.update()` itself (`?update=1`). Both use
`am force-stop` as the stand-in for the OS killing the browser. Claim the phone in
`CroftC/.coordination/claims/testbed--<resource>.md` first.

`harness.mjs` is the shared origin: a page that registers a worker and reports
its lifecycle state, and a worker that stamps the launch navigation with its own
version so "which worker served this launch" is observable before page code runs.
E6 alone runs against the real `dist/`.
