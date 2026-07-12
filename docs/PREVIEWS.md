# Per-PR previews

> **Status: live.** Serving from `gh-pages` at `arecipe.app`; validated
> end-to-end (deploy → live URL → sticky comment → teardown) via PR #4 on
> 2026-07-12.

Every pull request against `main` gets a **live, throwaway copy of the built
app** at:

```
https://arecipe.app/pr-preview/pr-<N>/
```

A workflow builds the PR, deploys it to that subdirectory, and posts a sticky
comment with the link (updated on every push, flipped to "removed" on close).
It's meant for reviewing and refining a change against the real, built PWA — not
a mock. The deploy is plain git and the comment is `actions/github-script`; no
third-party action runs (see *Supply-chain* below).

## Why this is safe and why it just works

- **Read-only by construction.** `authModeFor()` (`src/auth/oauth-client.ts`)
  offers sign-in only on the production origin (`https://arecipe.app`, root) or
  on loopback. A preview served from a `/pr-preview/pr-N/` path is neither the
  production client's registered origin nor loopback for OAuth purposes, so the
  app runs in read-only mode: no live sign-in, no writes to real accounts.
  Reviewers exercise the real read paths (public, CORS-open AppView + PDS) with
  nothing at stake.
- **Subdirectory-clean bundle.** Every asset path in the app is relative
  (`./…`), `manifest.webmanifest` uses `"scope": "./"`, and the service worker
  registers against its own directory (`./sw.js`, precache list all `./…`). The
  bundle therefore runs from a subdirectory with **no base-URL rewriting** — the
  same `dist/` that ships to production is what a preview serves.
- **Fork PRs get no preview.** The workflow guards on
  `head.repo.full_name == github.repository`, so only trusted, same-repo
  branches are ever built with write access. A fork PR is skipped cleanly.

## How it's wired

Two workflows share the `gh-pages` branch:

| Workflow | Trigger | What it does |
| --- | --- | --- |
| `ci.yml` → `deploy` | push to `main` (after the hermetic gate passes) | Publishes `dist/` to the **root** of `gh-pages`, preserving `pr-preview/` so it never wipes live previews. |
| `preview.yml` → `preview` | `pull_request` (opened/reopened/synchronize/closed) | Builds `dist/` and deploys it to `gh-pages:/pr-preview/pr-<N>/`, comments the URL on the PR, and removes the directory on close. |

Both jobs use the concurrency group `gh-pages` so their `git push`es to the
branch serialize instead of racing.

Both the production deploy and the preview deploy/teardown run through one small
script — **`scripts/pages-deploy.sh`** — which materialises `gh-pages` in a
private worktree, replaces just the target subtree (`root`, preserving
`pr-preview/`; or a single `pr-preview/pr-N`), and pushes with a rebase-retry.
The preview URL comment is posted (and updated in place) by `actions/github-script`.

The custom domain (`CNAME=arecipe.app`) lives at the **root** of `gh-pages`,
written there by the production deploy (the build copies `CNAME` into `dist`).
Because the domain covers the whole Pages site, previews are reachable under it
at `/pr-preview/pr-N/`. The preview build strips its own `dist/CNAME` so nothing
in the preview subtree claims the domain.

**Jekyll is disabled.** A branch-served Pages site runs Jekyll by default (the
old Actions/artifact source did not), which would reprocess this pre-built SPA.
The build emits `dist/.nojekyll`, so the production deploy lands `.nojekyll` at
the `gh-pages` root and the whole site — previews included — is served verbatim.

## One-time setup

These are GitHub **repository settings** — they can't be committed, so a repo
admin applies them once. Do them in this order:

1. **Seed `gh-pages` first.** Merge the change that adds these workflows to
   `main`. The `deploy` job runs and creates `gh-pages` with the full site +
   root `CNAME`. (If you switch the Pages source before this first deploy
   exists, the site 404s until the branch has content.)
2. **Point Pages at the branch.** Settings → **Pages** → *Build and deployment*
   → **Source: Deploy from a branch** → Branch **`gh-pages`**, folder **`/
   (root)`**. This replaces the previous "GitHub Actions" source. Confirm the
   custom domain still reads `arecipe.app`.
3. **Allow workflows to write.** Settings → Actions → General → **Workflow
   permissions** → *Read and write permissions*. (The workflows also request
   `contents: write` explicitly, but an org-level "read-only" default would
   otherwise cap them.)
4. **Let `gh-pages` deploy the environment.** The old Actions/artifact source
   left a `github-pages` environment that may restrict deployments to `main`.
   With the branch source, Pages' own builder deploys from `gh-pages`, so if the
   Pages build errors with *"not allowed to deploy … due to environment
   protection rules,"* go to Settings → Environments → **github-pages** →
   *Deployment branches* and allow `gh-pages` (or remove the restriction).
5. **(Recommended) Auto-delete merged branches.** Settings → General → *Pull
   Requests* → **Automatically delete head branches**. Merging a PR fires the
   `closed` event that tears its preview down, and this also removes the now-dead
   head branch so it doesn't accumulate. Optional, but keeps the branch list
   clean; it's a repo setting, so it can't be committed.

None of the above is in code — they're repository settings a maintainer applies
once. After them, open a PR from a branch in this repo and watch for the preview
comment.

## Supply-chain: no third-party actions

The deploy runs with `contents: write` and the comment step with
`pull-requests: write`, so any action that runs here holds real write access to
the repo and the published site. Rather than trust an individually-maintained
action with that, the deploy is **plain git** (`scripts/pages-deploy.sh`) and
the only actions used are **GitHub's own first-party** ones:

- `actions/checkout`
- `actions/setup-node`
- `actions/github-script` (posts the preview-URL comment)

(An earlier revision used `JamesIves/github-pages-deploy-action` and
`rossjrw/pr-preview-action` — the latter a composite action that itself calls
the former. Both were replaced by the ~90-line script, which does only what this
repo needs and is auditable in one file.)

Even the first-party actions are pinned to a full **commit SHA**, not a movable
tag, with the version in a trailing comment:

```yaml
- uses: actions/github-script@f28e40c7f34bde8b3046d885e986cb6290c5673b # v7.1.0
```

A tag like `@v7` is a pointer its maintainer can repoint at new code; a commit
SHA can't be moved, so CI runs exactly the reviewed code. `.github/dependabot.yml`
opens a weekly PR that bumps each SHA and its version comment together, so
pinning doesn't become a staleness trap. This follows GitHub's own Actions
hardening guidance and OWASP CI/CD recommendations.

## Teardown / troubleshooting

- A preview lingering after a PR closed means the `closed` run didn't reach the
  action — re-run the `preview` workflow on that PR, or delete
  `pr-preview/pr-<N>/` from the `gh-pages` branch by hand.
- Previews not appearing at all is almost always step 2 or 3 above not applied,
  or the PR coming from a fork (previews are same-repo only by design).
