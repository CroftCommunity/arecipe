# Troubleshooting CI, deploys, and GitHub outages

Written after the 2026-08-06 Actions/Pages outage, where several hours were
spent distinguishing "our code is broken" from "GitHub is broken." The checks
below are ordered so the cheap, high-yield ones come first.

**The rule this doc exists to enforce:** before debugging a red check, confirm
it is a *test failure* and not a *cancellation*. They look identical in
`gh pr checks`.

## 1. Is it us, or is it GitHub?

The status page lags reality in both directions — it stayed on `major_outage`
for hours after runs had started dispatching again. Treat it as a hint, then
test empirically.

```bash
# Component status
curl -s https://www.githubstatus.com/api/v2/components.json | python3 -c "
import json,sys
for c in json.load(sys.stdin)['components']:
    if c['name'] in ('Actions','Pages','API Requests','Webhooks','Git Operations'):
        print(f\"  {c['name']:<16} {c['status']}\")"

# Open incidents
curl -s https://www.githubstatus.com/api/v2/incidents/unresolved.json | python3 -c "
import json,sys
d=json.load(sys.stdin)['incidents']
print('  none' if not d else '\n'.join(f\"  {i['name']} — {i['status']}\" for i in d[:3]))"
```

**The empirical test beats the status page.** Re-run one job; if it reaches
`queued` rather than erroring, dispatch is working regardless of what the page
says:

```bash
gh run rerun <run-id>
gh run list --branch <branch> --limit 3
```

## 2. Red check: failure or cancellation?

`gh pr checks` reports a cancelled job as **`fail`**. That is the single most
misleading signal during an outage. Always confirm the job conclusion:

```bash
gh api repos/CroftCommunity/arecipe/actions/runs/<run-id>/jobs \
  --jq '.jobs[] | "JOB \(.name) = \(.conclusion)"'
```

- `cancelled` → infrastructure. Nothing to debug; re-run it.
- `failure` → real. Get the log: `gh run view <run-id> --log-failed`.

**Duration is a fast tell.** A healthy `test` job on this repo runs ~3 minutes.
Anything sitting at ~15 minutes and then dying is a timeout or cancellation, not
an assertion failure.

Re-running a cancelled run **clears its red mark from the PR**, so a PR can go
from `UNSTABLE` back to `CLEAN` once the genuine run is the only one left.

## 3. Waiting for checks without fooling yourself

Do **not** poll for checks in a `pending` state. Before any check registers, the
list is *empty* — which contains nothing pending, so a naive wait exits
immediately and reports "no checks" as though it were a verdict:

```bash
# WRONG — exits instantly when no checks exist yet
until [ -z "$(gh pr checks $PR | awk -F'\t' '$2=="pending"')" ]; do sleep 20; done
```

Wait on a **run's status** reaching `completed` instead, which distinguishes
"not started" from "finished":

```bash
until [ "$(gh run view <run-id> --json status -q .status)" = "completed" ]; do sleep 20; done
gh run view <run-id> --json status,conclusion -q '.status+" / "+.conclusion'
```

## 4. Post-outage verification: did the deploy actually land?

A merge to `main` triggers `ci.yml`'s `deploy` job. During an outage that job may
queue for hours, so the site can lag `main` without anything looking wrong.

```bash
# Did a deploy run at all?
gh run list --branch main --limit 4

# Does the deployed build match local main?
git rev-parse --short HEAD
curl -s https://arecipe.app/build-info.json | head -c 120
```

The build stamp is `YYYY.MM.DD-<short-sha>`; if its SHA is behind `main`, the
deploy has not landed yet.

### Snapshot freshness (the check that is easy to forget)

The build-time snapshot records each cook's repo `rev`. If a repo has been
written to since the deploy, every client refetches that cook's **whole** record
set on next load — ~10 MB for the Wikibooks corpus. This is invisible from the
build stamp alone.

```bash
BUILD=$(curl -s https://arecipe.app/sw.js | grep -oE 'assets/snapshot/[^/]+/' | head -1 | cut -d/ -f3)
curl -s "https://arecipe.app/assets/snapshot/$BUILD/manifest.json" | python3 -c "
import json,sys
for c in json.load(sys.stdin)['cooks']: print(f\"  {c['handle']:<28} snapshot rev {c['rev']}\")"

# Compare against live (corpus account shown; repeat per cook as needed)
python3 -c "
import json,urllib.request
u='https://phellinus.us-west.host.bsky.network/xrpc/com.atproto.sync.getLatestCommit?did=did:plc:spfl4xaktvvchr2cqp2r2xvp'
print('  live corpus rev:', json.load(urllib.request.urlopen(u))['rev'])"
```

Revs equal → clients read the snapshot and fetch nothing. Revs differ → they are
paying a full refetch until the next deploy re-captures. **A new deploy is the
fix**, and any push to `main` does it.

## 5. Images look broken but the app works

Images come from `cdn.bsky.app` (`src/recipes/present.ts:71`), which is
**cross-origin**. `src/sw.ts` returns early on all cross-origin requests, so
images are the one part of the app with **no service-worker cache and no offline
story** — they live only in the browser HTTP cache (`max-age=604800`).

That produces a distinctive asymmetry: on a flaky or offline connection the
shell, pages and recipe text all render from the SW cache while images fail, and
`view.ts` swaps each failure for the brand placeholder. It reads as "the site
works but images are gone."

Before assuming a regression, check the CDN directly:

```bash
curl -sI "https://cdn.bsky.app/img/feed_thumbnail/plain/<did>/<cid>@jpeg" | head -1
```

Note that `loading="lazy"` plus browse's 50-item window means only the images
near the viewport are ever requested — a low request count is correct, not a
bug. Closing the cache gap is planned; see
`plans/2026-08-06-2-plan-snapshot-sharding-and-image-cache.md`.

## 6. Local vs CI disagreement

When a test passes in one place and fails in the other, suspect the environment
before the code. Two real instances from this repo:

- **Node version.** CI pins Node 22; a local checkout on Node 25 fails 7 tests
  in `tests/unit/social/cookbook-members-view.spec.ts`, because Node 25 ships a
  global `localStorage` that shadows happy-dom's. `.nvmrc` pins the major and
  `tests/unit/toolchain-pin.spec.ts` fails if it drifts from the workflows —
  run `nvm use` (or equivalent) first.
- **Machine speed.** `nav.spec.ts` asserted `toHaveURL(/plan\.html$/)` while
  `plan.html` rewrites its URL to `?start=…` about 25 ms after mount. The
  assertion passed only when its first poll beat the rewrite — true on CI's
  slower runner, false on a fast dev machine. Fixed in #76; the lesson is that a
  `$`-anchored URL assertion against a page that mutates its own query string is
  a race, not a check.

Both are the same shape: something pinned on one side and unpinned on the other.
