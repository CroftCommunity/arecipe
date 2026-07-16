# RUN-FOLLOW-THROUGH — run summary

Cook-follows hardening + live proof + loopback refresh fix (+ pwa-check brief).
Branch `claude/cook-follows-hardening-live-d6qvnj`. Plan:
`plans/2026-07-16-1-plan-follow-through.md`. Four parts; the hermetic gate
(`npm test` — lint · typecheck · unit · build · e2e, `@live` excluded) is green
at every part boundary.

## Headline

- **Part 1** — published marker (`publishedRkey`) + reconciling mirror +
  adopt-first publish. An unfollow made on another device is pruned locally on
  one signed-in load and never re-offered; publish is idempotent (no duplicate
  records). ✅ shipped, gate green.
- **Part 2** — `@live` cookFollow round-trip spec authored (follow → public
  `listRecords` → unfollow), discharging the "novel `app.arecipe.*` behaves like
  `mealPlan`" assumption. ✅ spec shipped; **live execution blocked here** (no
  creds — see FINDING F1).
- **Part 3** — stable loopback `client_id` (multi-redirect enumeration).
  Local-dev refresh works on every authed page; both forceRefresh specs
  un-`fixme`'d; hosted metadata byte-identical. ✅ shipped, gate green.
- **Part 4** — `pwa-check` evaluated → **periodic / pre-release, not the gate**.
  ✅ brief shipped (`docs/sources/PWA-CHECK-EVALUATION.md`).

## Gate results per part boundary

| Part | lint | typecheck | unit | build | e2e (hermetic) |
|------|------|-----------|------|-------|-----------------|
| baseline | ✓ | ✓ | 489 | ✓ | 174 |
| Part 1 | ✓ | ✓ | **504** | ✓ | **175** |
| Part 2 | ✓ | ✓ | 504 | ✓ | 175 (+1 `@live` spec, excluded) |
| Part 3 | ✓ | ✓ | **507** | ✓ | 175 |
| Part 4 | ✓ | ✓ | 507 | ✓ | 175 (docs only) |

(Playwright ran against the pre-installed Chromium under `/opt/pw-browsers` via a
throwaway config per CLAUDE.md — not committed.)

## Part 1 — published marker + reconciling mirror + adopt-first publish

**Red → green.** RED first (13 failing):
- `cook-follows-local.spec.ts` — `markPublished` upsert / no-op-on-absent-DID /
  idempotent / round-trip / pre-marker parse / add-never-clobbers-marker
  (`local.markPublished is not a function`).
- `cook-follows-pds.spec.ts` — mirror stamps rkeys / prunes marked-absent /
  leaves unmarked / re-stamps rotated rkey; `publishCookFollow` adopts / creates
  / dedupes double-publish (`publishCookFollow is not a function`, and
  `expected undefined to be 'r1'`).
- `cookbook-members-view.spec.ts` — offer lists only unmarked rows; a
  remotely-unfollowed row is pruned from list + offer.

GREEN after implementing D1–D4:
- `LocalCookFollow.publishedRkey?` + `markPublished` upsert; the local read
  filter carries the optional marker through and still parses pre-marker stores.
- `mirrorCookFollowsDown` reconciling: stamp every PDS rkey, prune marked rows
  absent from the PDS, leave unmarked rows alone.
- `publishCookFollow` adopt-first (adopt existing subject's rkey, else create +
  stamp).
- `cookbook-members-view` drives the D6 offer + unfollow-deletes-record off the
  marker (dropped the parallel `publishedDids` set); follow stamps the rkey
  immediately; publish-all uses adopt-first.

Then e2e: `cook-follows.spec.ts` gains a Browse guard that a `publishedRkey`-
marked row is inert to the zero-auth local read (merges into the default feed,
zero PDS writes). 175 e2e green.

**Acceptance 1 (prune on one signed-in load, never re-offered)** is proven
hermetically by the members-view wiring test "prunes a remotely-unfollowed row
from the list AND the offer" — injected agent + routed `listRecords`, i.e. the
repo's designated hermetic seam for signed-in Account (see FINDING F2 on why
this is not a browser e2e). **Acceptance 2 (idempotent publish)** is proven by
the pds "double publish yields exactly one record" + "adopts an existing record"
tests.

## Part 2 — @live cookFollow round-trip

`tests/e2e/cook-follows-live.spec.ts` (D5): purge → sign in → follow a
non-starter cook (`bsky.app`, so the merged member resolves to the `added`
source and gets the per-row unfollow) through the Account add panel → public
`listRecords` on the test account shows exactly one record with that subject →
per-row unfollow → `listRecords` shows none. Guaranteed cleanup: a whole-
collection purge (hard-scoped to `TEST_DID`) runs before AND in a `finally`
after. Skips cleanly without `BSKY_TEST_*` creds; excluded from the hermetic
gate; runs under `npm run test:live`.

Verified here: the spec typechecks, is **excluded** from the hermetic run (0
tests), and under `LIVE=1` is **discovered and skips cleanly** (no creds).
`docs/LEXICONS.md` updated to point the cookFollow row at this live harness and
note the reconciling-mirror + marker behavior.

**The listRecords evidence that clears the assumption must come from a
credentialed run** — see FINDING F1.

## Part 3 — loopback client_id

**[verify-in-run] D6 probe — ANSWER: YES.** Loopback `client_id`s may carry
repeated `redirect_uri` params. Verified against the installed
`@atproto/oauth-types`: `safeParseOAuthLoopbackClientIdQueryString` collects
every `redirect_uri` into a `redirect_uris[]` array, and
`atprotoLoopbackClientMetadata(clientId)` returns metadata with the full array
(empirical check: a 3-`redirect_uri` client_id → 3-element `redirect_uris`,
`redirect_uris[0]` = the first). `@atproto/oauth-client` `authorize()` and
`exchangeCode()` both default to `redirect_uris[0]`, and
`BrowserOAuthClient.findRedirectUrl()` matches the callback page against the
list.

**Chosen direction:** enumerate every authed page's `redirect_uri`
(`LOOPBACK_REDIRECT_PATHS` — signin, account, cookbook, editor, meals, mine,
recipe; the boot.ts importers) in ONE pathname-independent `client_id`,
**signin.html first** (sole callback landing + `redirect_uris[0]`).

**Red → green.** RED (2 failing): `buildLoopbackMetadata` client_id identical
across pathnames; enumeration shape with signin-first (`expected [...signin] to
deeply equal ArrayContaining{...}`). GREEN after rewriting `buildLoopbackMetadata`
to enumerate the fixed path list into a stable client_id (pathname now accepted
but ignored). Hosted metadata asserted byte-identical (`redirect_uris` still the
single `/signin.html`, client_id still the metadata URL). Both `@live`
`two-tab-live` / `two-device-read` forceRefresh specs **un-`fixme`'d** (they force
the refresh on `mine.html`, a different page than signin.html — exactly the case
that used to fail); comments refreshed. TODO.md bug marked resolved with the
chosen direction. `oauth-client.spec.ts`: 14 green.

Verified here: under `LIVE=1` the two refresh specs are discovered and **skip**
(no creds) rather than being `fixme`'d — they will RUN with creds. Their live
green must come from a credentialed run (FINDING F1).

## Part 4 — pwa-check brief

Ran `npx @pwa-today/pwa-check@0.0.7 --insecure-localhost http://127.0.0.1:4173/`
against the served build: **27 pass, 12 warn, 0 fail**, deterministic
(byte-identical across runs). It statically validates manifest
completeness/validity + icon reachability + SW handler presence (a regression
class the Playwright suite doesn't assert) but never runs the SW, so it is blind
to arecipe's actual PWA risk (offline boot, SW nav fallback) that Playwright
already covers — the two are complementary. `--fail-on-warn` is unusable (10/12
warnings are intentional omissions; only 4 carry a code, so `--ignore-warn`
can't silence the other 8).

**Verdict: periodic / pre-release, not the hermetic gate.** Full brief with raw
findings and a narrow `summary.fail===0`-only gate suggestion for a later run:
`docs/sources/PWA-CHECK-EVALUATION.md`. TODO.md item ticked.

## FINDINGS

- **F1 — live tier not executable in this environment.** No `.env` /
  `BSKY_TEST_*` creds here, so the `@live` tier cannot run. The three live specs
  touched this run (`cook-follows-live`, `two-tab-live`, `two-device-read`) are
  authored/updated to convention with guaranteed cleanup and correct gating, and
  were verified to **skip cleanly** under `LIVE=1`; their green (Part 2's
  listRecords evidence; Part 3's cross-page refresh proof) must be produced in a
  credentialed environment via `npm run test:live`. The hermetic gate is green
  throughout. This does not block Parts 1/3's hermetic acceptance, but it is why
  acceptance criteria 3 and the live half of 4 are "spec-ready, awaiting a
  credentialed run" rather than "observed green here."
- **F2 — no hermetic signed-in Account e2e seam (Part 1 e2e adaptation).** The
  run file asked for the prune to be shown via an e2e on Account load. The repo
  has **no hermetic signed-in browser path** — the only sign-in is `@live`
  (confirmed: `two-device-read` is the sole non-`*-live*` file that signs in, and
  it's `@live`-tagged). `mountMembersList`'s injectable agent is the repo's
  designated hermetic seam for signed-in Account, so the prune-on-load acceptance
  is covered there (injected agent + routed `listRecords`) exactly as an e2e
  would, and the Browse e2e instead guards that the new marker is inert to the
  zero-auth read. A true browser-level signed-in prune belongs to the `@live`
  tier. Locked decisions unchanged.
- **F3 — grounding correction (local read filter).** §2 of the run file said the
  local store's extra fields "survive round-trip untyped." On main the read
  filter returned rows but `add` only ever wrote `{did, handle}`, so no extra
  field was ever written. D1 therefore needed both a new write op
  (`markPublished`) and a marker-preserving read filter — implemented; D1 itself
  unchanged.

## Files touched

- **Part 1:** `src/social/cook-follows-local.ts`, `src/social/cook-follows-pds.ts`,
  `src/social/cookbook-members-view.ts`; tests
  `tests/unit/social/cook-follows-local.spec.ts`,
  `tests/unit/social/cook-follows-pds.spec.ts`,
  `tests/unit/social/cookbook-members-view.spec.ts`,
  `tests/e2e/cook-follows.spec.ts`.
- **Part 2:** `tests/e2e/cook-follows-live.spec.ts` (new), `docs/LEXICONS.md`.
- **Part 3:** `src/auth/oauth-client.ts`, `tests/unit/auth/oauth-client.spec.ts`,
  `tests/e2e/two-tab-live.spec.ts`, `tests/e2e/two-device-read.spec.ts`,
  `TODO.md`.
- **Part 4:** `docs/sources/PWA-CHECK-EVALUATION.md` (new), `TODO.md`.
- **Plan/summary:** `plans/2026-07-16-1-plan-follow-through.md` (new), this file.

## Acceptance criteria

1. Unfollow-on-another-device disappears locally after one signed-in load, never
   re-offered — ✅ hermetic (members-view wiring test, injected agent + routed
   listRecords); browser-level is `@live` (F2).
2. Publish idempotent (double-tap + pre-marker migration → one record) — ✅
   hermetic (pds adopt/dedupe tests).
3. Live follow/unfollow round-trip proves the assumption — ⏳ spec-ready
   (`cook-follows-live.spec.ts`), awaiting a credentialed `npm run test:live`
   (F1); LEXICONS points at the harness.
4. Local-dev refresh works on every authed page; two live specs un-`fixme`'d;
   hosted metadata byte-identical — ✅ implementation + hosted byte-identical
   unit-pinned + specs un-`fixme`'d and skipping cleanly; the live cross-page
   refresh run awaits creds (F1).
5. pwa-check recommendation with evidence exists in docs — ✅
   (`docs/sources/PWA-CHECK-EVALUATION.md`).
6. Browse bundle still ships zero auth code; gate green at every boundary — ✅
   (`nav.spec` bundle guard green each part; full gate green each boundary).
