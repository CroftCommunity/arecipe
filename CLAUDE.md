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

**Node version — run `nvm use` first.** `.nvmrc` pins Node to the same major CI
uses; `tests/unit/toolchain-pin.spec.ts` fails if the two ever drift, so bumping
one means bumping the other. Running the suite on a newer Node produces failures
that have nothing to do with your change: on Node 25,
`tests/unit/social/cookbook-members-view.spec.ts` fails 7 tests with
`localStorage.clear is not a function`, because Node 25 ships a global
`localStorage` that shadows happy-dom's and is a stub without `--localstorage-file`.
**If a spec fails on a DOM global you never touched, check `node --version`
before debugging the test.**

**Playwright browser — do this BEFORE your first e2e run.** This environment
ships Chromium under `/opt/pw-browsers`, but the npm-pinned Playwright usually
expects a *different* build number, so a stock `npm run test:e2e` fails with
`browserType.launch: Executable doesn't exist at /opt/pw-browsers/…`. The
tell-tale is **every test failing at once** — that's this, not your code. Do
NOT run `playwright install` (no network for the download) and do not start
debugging test code until you've ruled this out.

Fix: write this throwaway config once, run e2e through it, and `rm` it before
committing (never commit it):

```bash
cat > pw-local.config.ts <<'EOF'
// Throwaway local config (NOT committed): points Playwright at the
// environment's installed Chromium (build pin mismatch).
import { defineConfig } from '@playwright/test';
import base from './playwright.config.ts';

export default defineConfig(base, {
  use: {
    ...base.use,
    launchOptions: { executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' },
  },
});
EOF
npx playwright test --config=pw-local.config.ts --reporter=line
```

If `/opt/pw-browsers` holds a different build than `chromium-1194`, adjust the
path (`ls /opt/pw-browsers`). The config must live in the repo root — module
resolution for `@playwright/test` fails from a temp dir outside it. This means
`npm run test` (the full gate) will fail at its e2e step in this environment;
run the other sub-gates directly and use the config above for e2e.

## Conventions

- **TDD first, always.** Write the tests before the implementation — unit
  (vitest) for model/pure logic, hermetic e2e for page wiring, an `@live` spec
  when the behavior touches a real PDS — and confirm they are RED before making
  them green. A behavior change starts by rewriting the test that pins the old
  behavior. No implementation lands without a failing test that demanded it.
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
- **Changelog trailers.** The `/changelog` page is generated at build time from
  opt-in `Changelog:` commit trailers (`scripts/build.mjs` → `dist/changelog.json`;
  pure logic in `scripts/changelog.mjs`). **If a commit changes what a cook sees
  or can do, add a trailer**; internal-only commits (refactors, tests, deps, CI,
  docs) omit it — absence is normal.
  - Form: `Changelog(added|changed|fixed|removed): <one line>`. A bare
    `Changelog: …` defaults to `changed`. Repeat the trailer for multiple
    user-facing changes in one commit.
  - **Write it in the user's voice** — present tense, benefit-first, no jargon,
    one line. Good: `Changelog(added): Added a shopping list you can check off as
    you cook`. Bad (dev-voice, don't): `Changelog: impl ShoppingListStore redb
    projection`.
  - **Squash caveat:** PRs squash-merge to `main`, so the trailer must be in the
    **final squash commit message** (edit the PR's squash body), not only in an
    intermediate commit — otherwise it won't reach `main`'s history.
  - **Backlog / durability:** entries that aren't derivable from a trailer
    (pre-convention history) live in `changelog.seed.json` (hand-authored); the
    build unions + dedupes it with the git-derived entries. `npm run changelog:bake`
    folds the current derived entries into that seed to make them permanent (they
    survive a history rewrite). Prefer a trailer for new changes; use the seed for
    backlog.

## Previews on a PR — and the agent gotcha

A same-repo PR against `main` can get a live, read-only copy of the built app at
`https://arecipe.app/pr-preview/pr-<N>/`, deployed by
`.github/workflows/preview.yml`. Full details: `docs/PREVIEWS.md`.

**When to bother.** A preview is for changes with a **user-visible UI/UX
surface** — new/changed pages, layout, styling, components, flows, copy. When a
PR touches that (`src/pages/*`, `src/recipes/view.ts`/`present.ts`, `*.html`,
`styles.css`, and the like), deploy a preview and share the link so the change
can be eyeballed against the real, built PWA. **Skip it** for changes with no
visual surface — docs, CI/workflows, tests, pure refactors, model/sync logic —
where a preview shows nothing a reviewer couldn't get from the diff. If in
doubt, ask whether a preview would help before spending the deploy.

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
   (The `workflow_dispatch` trigger is on `main` as of PR #8, so this is live.)

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

**Clean up when the PR is done — this is on you.** A preview lives in the
`gh-pages` branch and does NOT belong there once the PR merges or closes. The
automatic `closed`-event teardown is unreliable for an agent-driven flow (the
same token-suppression rule that blocks the initial deploy can block the
teardown), so **do not assume it fired** — after you merge or close a PR you
deployed a preview for, confirm the preview is gone and remove it if it isn't:

1. **Preferred — dispatch the teardown** (trusted path, updates the sticky
   comment): dispatch `preview.yml` against `main` with
   `inputs: { pr: "<N>", teardown: true }` (GitHub MCP: `actions_run_trigger` →
   `run_workflow`, `workflow_id: preview.yml`, `ref: main`).
2. **Manual fallback** (writes `gh-pages` directly — get the user's OK per the
   branch-safety rule, and reset `user.name`/`user.email` afterward as above):

   ```
   bash scripts/pages-deploy.sh pr-preview/pr-<N> --remove "remove preview PR #<N> (merged)"
   ```

**Confirm** the teardown: `curl -sI https://arecipe.app/pr-preview/pr-<N>/` →
`404` (and the base site still `200`). A `--remove` that reports "no changes to
publish" means it was already gone — that's success, not an error.
