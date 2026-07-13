# CLAUDE.md — notes for agents working in this repo

arecipe is a zero-backend recipe-sharing **SPA/PWA on the AT Protocol** (atproto).
No server: all data lives in the user's PDS repo or in the browser. Vanilla
TypeScript + esbuild, one static HTML shell per destination, no framework.

## The gate

One command runs the full check the same way CI does:

```
npm run test          # lint · typecheck (src + tests) · unit (vitest) · build · e2e (playwright)
```

Sub-parts: `npm run lint`, `npm run typecheck`, `npm run test:unit`, `npm run build`,
`npm run test:e2e`. `@live` e2e (real PDS, credentials) run only via `npm run test:live`.

**Playwright browser:** this environment ships Chromium under `/opt/pw-browsers`
but the npm-pinned Playwright may expect a different build. If `test:e2e` errors
with "Executable doesn't exist", point it at the installed binary rather than
running `playwright install`:

```
# find it: ls /opt/pw-browsers  (e.g. chromium-1194/chrome-linux/chrome)
# then run with a throwaway config that sets use.launchOptions.executablePath,
# or export the path — do NOT commit that config.
```

## Conventions

- **Open-world atproto reads.** Boundary validators (`src/recipes/*`,
  `read.ts`) tolerate and preserve unknown fields; only missing/mistyped
  **required** fields fail loud. Match that posture in new record code.
- **Mobile-first, tap-first.** Touch is the primary interaction; pointer/drag is
  an additive desktop enhancement. `tests/e2e/mobile-fit.spec.ts` guards against
  horizontal overflow at 320/360/390px — run it after any layout change.
- **Lexicons** are owned/tracked in `docs/LEXICONS.md`; app-owned NSIDs are
  `app.arecipe.*`. Update that doc when a record shape changes.
- **Plans.** Non-trivial features get a dated plan doc in `plans/` (see existing
  ones); record the outcome when done.

## Previews on a PR — and the agent gotcha

Every same-repo PR against `main` is meant to get a live, read-only copy of the
built app at `https://arecipe.app/pr-preview/pr-<N>/`, deployed by
`.github/workflows/preview.yml`. Full details: `docs/PREVIEWS.md`.

**The gotcha:** when you open a PR **programmatically** (the GitHub MCP /
`create_pull_request`, i.e. an app/bot token), GitHub does **not** start the
`pull_request`-triggered workflows for it — so `preview.yml` never fires and no
preview appears. Pushing more commits doesn't help (`synchronize` is suppressed
the same way; only `ci.yml`, which also listens on `push`, re-runs). This is a
GitHub security rule, not a bug in this repo.

To get a preview for an agent-opened PR, do **one** of these:

1. **Dispatch the preview workflow** (preferred — uses the trusted CI path, posts
   the sticky comment, keeps auto-teardown). `workflow_dispatch` is exempt from
   the suppression rule. Dispatch `preview.yml` against **`main`** with input
   `pr=<N>`; the workflow reads that PR, checks out its head, builds, and
   deploys. Via the GitHub MCP: `mcp__github__actions_run_trigger` →
   `run_workflow`, `workflow_id: preview.yml`, `ref: main`, `inputs: { pr: "<N>" }`.
   **Caveat:** this only works once `preview.yml` with the `workflow_dispatch`
   trigger is merged to `main`.

2. **Ask a human to close + reopen the PR** (or push a commit from their machine).
   A human-initiated `pull_request` event fires the workflow normally.

3. **Manual fallback** (works today, before the dispatch trigger is on `main`):
   build and push the preview subtree with the repo's own script. This writes to
   the **`gh-pages` branch** — a different branch, so get the user's explicit OK
   first (see the branch-safety rule you were given).

   ```
   npm ci && npm run build && rm -f dist/CNAME
   bash scripts/pages-deploy.sh pr-preview/pr-<N> dist "preview PR #<N> ($(git rev-parse HEAD))"
   ```

   The script restores nothing — it sets the repo git identity to
   `github-actions[bot]`; reset `user.name`/`user.email` afterward. A manual
   deploy posts **no** sticky comment and does **not** auto-tear-down on close;
   remove it with `bash scripts/pages-deploy.sh pr-preview/pr-<N> --remove "…"`.

**Verify** either way by polling the URL until it serves (Pages takes ~30–90s):
`curl -sI https://arecipe.app/pr-preview/pr-<N>/` → `200`.
