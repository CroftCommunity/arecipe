# Run-follow-through — cook-follows hardening + live proof + loopback refresh fix

**Status:** ✅ **Done 2026-07-16** on branch
`claude/cook-follows-hardening-live-d6qvnj`. All four parts shipped; the hermetic
gate (`npm test`) is green at every part boundary (final: lint · typecheck · 507
unit · build · 175 e2e). Live-tier execution (Parts 2/3's `@live` specs) is
blocked here for lack of `BSKY_TEST_*` creds — specs are authored to convention
and verified to skip cleanly under `LIVE=1`; their green awaits a credentialed
`npm run test:live`. See `RUN-FOLLOW-THROUGH-SUMMARY.md` for red→green evidence,
the D6 probe answer, and FINDINGS F1–F3. Closes the two audited residuals of
the cook-follows run (reviewed 2026-07-15), fixes the one open TODO.md bug that
keeps two `@live` specs `fixme`d, and clears the `pwa-check` evaluation item.
Four parts; the gate (`npm test`) is green at every part boundary. Run summary
lives in `RUN-FOLLOW-THROUGH-SUMMARY.md` at the repo root.

## Problem statement

Four independently-shippable changes:

- **Part 1 — published marker + reconciling mirror + adopt-first publish.**
  Teach the device-local cook-follows store which follows are already published
  (have a PDS `app.arecipe.cookFollow` record). With that marker the mirror can
  prune remote unfollows made on another device, and the D6 publish offer can
  never resurrect an unfollow.
- **Part 2 — `@live` cookFollow round-trip.** Prove the signed-in
  follow → public `listRecords` → unfollow path against the real PDS, clearing
  the recorded assumption that a novel `app.arecipe.*` collection behaves like
  `mealPlan` on a live PDS.
- **Part 3 — stable loopback `client_id`.** One loopback `client_id` across all
  authed pages so local-dev token refresh works everywhere, un-`fixme`ing the
  `two-tab-live` / `two-device-read` forceRefresh specs.
- **Part 4 — `pwa-check` brief.** Read-and-report: evaluate `pwa-check` for the
  gate; recommend gate / periodic / skip with evidence.

**Explicitly NOT in this run:** the Browse cache-first SWR paint (TODO.md
"Ideas") — the natural next run, deferred (D8) so it isn't scope-crept here.

## Phase 0 — re-grounding against main (verified 2026-07-16)

Re-ground of §2 of the run file against the current branch (`main` @ `94ab9e9`,
the cook-follows + toolbar merge). No drift from the run file's grounding — the
locked decisions stand. Confirmed:

- `src/social/cook-follows-local.ts`: `LocalCookFollow = { did, handle }`, key
  `cook-follows`, ops `list/has/add/remove`; `add` is idempotent by DID and
  first-write-wins (never overwrites an existing row). The read filter keeps
  only rows with string `did` + `handle`; **extra fields are dropped on read**
  (the filter reconstructs nothing beyond the two typed fields — see below).
- `src/social/cook-follows-pds.ts`: `COOK_FOLLOW_COLLECTION`, `followCook`,
  `unfollowCook`, `listCookFollows` (one page, `limit=100`),
  `mirrorCookFollowsDown` — **add-only** (stores bare DID as the handle
  placeholder).
- `src/social/cookbook-members-view.ts`: the only importer of the pds module;
  mounts the add panel, members list, and D6 `publish-offer`. Tracks
  `publishedDids: Set<string>` in the closure (from the `listCookFollows` read),
  drives the offer + the unfollow-deletes-record decision.
- `src/auth/oauth-client.ts` `buildLoopbackMetadata(location)`: derives the
  single `redirect_uri` from `location.pathname`, baking the initiating page
  into the loopback `client_id`. Hosted mode is one fixed
  `client-metadata.json`, unaffected. `two-tab-live.spec.ts:28` /
  `two-device-read.spec.ts:38` carry `test.fixme` → TODO.md.
- TODO.md carries the loopback bug entry and the `pwa-check` evaluation item.

**Phase 0 FINDING (grounding correction, not a locked-decision change).** §2 of
the run file says the local read filter "extra fields survive round-trip
untyped." That is **false on main**: `read()` filters to rows that *have* string
`did`+`handle` but returns the original row objects, so extra fields on a row do
survive a read — **but `add` only ever writes `{ did, handle }`** (it spreads
nothing), and mirror/publish build fresh `{ did, handle }` rows. So today no
extra field is ever *written*. D1's `publishedRkey` therefore needs both a new
write op (`markPublished`, upsert) **and** a widened read filter that preserves
the optional field. Recorded; adapts the implementation detail, not D1.

**Phase 0 [verify-in-run] — D6 loopback multi-redirect probe.** **Answer: YES.**
Loopback `client_id`s may carry repeated `redirect_uri` query params.
`@atproto/oauth-types` `safeParseOAuthLoopbackClientIdQueryString` collects
every `redirect_uri` param into a `redirect_uris[]` array, and
`atprotoLoopbackClientMetadata(clientId)` returns metadata with that full array
(verified empirically: a 3-`redirect_uri` client_id parses to a 3-element
`redirect_uris`, `redirect_uris[0]` = the first). `@atproto/oauth-client`
`authorize()` and `exchangeCode()` both default to `redirect_uris[0]`, and
`BrowserOAuthClient.findRedirectUrl()` matches the callback page against the
list. **Chosen direction:** enumerate the app's authed-page redirect_uris in one
stable `client_id`, **signin.html first** (the sole callback landing page).

## Locked decisions

D1–D8 as given in the run file. Key resolutions:

- **D1/D2/D3/D4 (Part 1).** `LocalCookFollow` gains optional
  `publishedRkey?: string`. New op `markPublished(did, rkey)` upserts on an
  existing row (no-op if the DID is absent). Mirror becomes reconciling: stamp
  every PDS record's rkey, **prune** any marked local row whose rkey is gone
  from the PDS list, leave unmarked (local-only) rows untouched. Publish is
  adopt-first: check the fresh PDS list for the subject and adopt its rkey if a
  record exists, else createRecord + stamp — idempotent under double-tap and
  migrates pre-marker rows.
- **D5 (Part 2).** One `@live` spec `cook-follows-live.spec.ts`: signed-in
  follow of a fixture DID → public `listRecords` shows exactly one record with
  that subject → unfollow → none. Guaranteed cleanup (`purgeCollection` in
  `finally`); skips cleanly without creds. Clears the LEXICONS assumption.
- **D6 (Part 3).** Multi-redirect enumeration (probe = YES, above). `client_id`
  byte-identical across pathnames; hosted metadata byte-identical (unit-pinned).
  Remove both `test.fixme`; update TODO.md.
- **D7 (Part 4).** `docs/sources/PWA-CHECK-EVALUATION.md` (matching the repo's
  `docs/sources/*` brief convention): command, version, raw findings, then the
  gate/periodic/skip recommendation with reasoning. Tick the TODO.md item.
- **D8 deferred:** Browse SWR paint (next run); handle resolution for
  mirrored-down bare-DID rows; `listRecords` pagination past 100 follows (noted
  as a known bound in a code comment).

## Live-execution constraint (FINDING, recorded up front)

This run's environment has **no `.env` and no `BSKY_TEST_*` credentials**, so the
`@live` tier (Parts 2 and 3's live specs) **cannot be executed here** — those
specs `test.skip` without creds, exactly as designed for CI. The live specs are
authored to convention with guaranteed cleanup and correct gating; their live
green must be produced in an environment that carries the test-account creds.
The hermetic gate (`npm test`, which excludes `@live`) is green throughout.

## Parts / phases

1. **Marker + mirror + publish** — RED unit (local marker round-trip/upsert/
   pre-marker parse; pds mirror stamp+prune+leave, publish adopt/create/dedupe;
   members-view offer-only-unmarked + pruned-row-gone), GREEN D1–D4, then e2e
   prune-on-load.
2. **`@live` round-trip** — author `cook-follows-live.spec.ts` (D5); flip the
   LEXICONS assumption wording.
3. **Loopback `client_id`** — RED unit (stable across pathnames; hosted
   byte-identical; enumeration shape), GREEN multi-redirect impl, remove both
   `test.fixme`, update TODO.md.
4. **`pwa-check` brief** — read-and-report; tick TODO.md.

## Run summary

See `RUN-FOLLOW-THROUGH-SUMMARY.md` (updated at completion; Status here flipped
to ✅ then).
