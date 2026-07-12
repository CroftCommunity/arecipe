# Per-PR previews

Every pull request against `main` gets a **live, throwaway copy of the built
app** at:

```
https://arecipe.app/pr-preview/pr-<N>/
```

`rossjrw/pr-preview-action` comments the link on the PR when the preview is
ready, redeploys it on every push, and deletes it when the PR closes. It's meant
for reviewing and refining a change against the real, built PWA — not a mock.

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
| `ci.yml` → `deploy` | push to `main` (after the hermetic gate passes) | Publishes `dist/` to the **root** of `gh-pages` with `clean-exclude: pr-preview/` so it never wipes live previews. |
| `preview.yml` → `preview` | `pull_request` (opened/reopened/synchronize/closed) | Builds `dist/` and deploys it to `gh-pages:/pr-preview/pr-<N>/`; removes that directory on close. |

Both jobs use the concurrency group `gh-pages` so their `git push`es to the
branch serialize instead of racing.

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

None of the above is in code — they're repository settings a maintainer applies
once. After them, open a PR from a branch in this repo and watch for the preview
comment.

## Supply-chain: pinned actions

Every action these workflows call — first-party (`actions/checkout`,
`actions/setup-node`) and third-party (`JamesIves/github-pages-deploy-action`,
`rossjrw/pr-preview-action`) — is pinned to a full **commit SHA**, not a movable
tag, with the human-readable version in a trailing comment:

```yaml
- uses: rossjrw/pr-preview-action@ffa7509e91a3ec8dfc2e5536c4d5c1acdf7a6de9 # v1.8.1
```

A tag like `@v1` is a pointer its maintainer can silently repoint at new code;
since these actions run with `contents: write` (and pr-preview-action with
`pull-requests: write`), a repointed tag would execute untrusted code with write
access to the repo and the site. A commit SHA can't be moved, so CI runs exactly
the code that was reviewed. `.github/dependabot.yml` keeps the pins current by
opening a weekly PR that bumps the SHA and its version comment together, so
pinning doesn't become a staleness trap. This follows GitHub's own Actions
hardening guidance and OWASP CI/CD recommendations.

## Teardown / troubleshooting

- A preview lingering after a PR closed means the `closed` run didn't reach the
  action — re-run the `preview` workflow on that PR, or delete
  `pr-preview/pr-<N>/` from the `gh-pages` branch by hand.
- Previews not appearing at all is almost always step 2 or 3 above not applied,
  or the PR coming from a fork (previews are same-repo only by design).
