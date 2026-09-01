# RUN-WIKIBOOKS-CORPUS — run summary

A local CLI (`wbsync`) that pulls the en.wikibooks Cookbook recipe corpus into a
structured local representation, computes intelligent deltas across long gaps,
and publishes arecipe-consumable `exchange.recipe.recipe` records into a PDS.
Lives at **`tools/wikibooks/`**, self-contained, **zero runtime dependencies**
(Node builtins only). Run the suite: `cd tools/wikibooks && npm test`.

## Owner decisions (restated with answers)

| # | Decision | Answer |
|---|----------|--------|
| **O1** | New repo vs `tools/wikibooks/` in arecipe | **`tools/wikibooks/` in arecipe.** Enforced isolation: a self-contained subproject with **zero runtime deps** (no atproto SDK, no wikitext lib, no native SQLite — `node:sqlite`, `node:crypto`, `fetch`, plain-HTTP XRPC). `tests/o1-isolation.test.ts` proves every import is a `node:` builtin or stays in-tool, the tool declares no runtime deps, `scripts/build.mjs` never references `tools/`, and arecipe `src/` never imports the tool. |
| **O2** | Licence identifier + attribution | **CC BY-SA 4.0** (`licenseCreativeCommonsBySa`), attribution "Wikibooks Cookbook contributors, CC BY-SA 4.0 (older revisions in the page history remain CC BY-SA 3.0)". Config-driven (`WIKIBOOKS_LICENSE_*`); present on every record; **absence blocks publish**. |
| **O3** | ShareAlike propagation | **(c) fork-on-edit** (spec's recommendation). Only the record shape needs to support it; provenance + licence fields ride forward on every record so a derivative can carry lineage. |
| **O4** | Publish account handle/hosting | **`cookbook.arecipe.app`** (config `WIKIBOOKS_PUBLISH_HANDLE`). Service URL + app password are unset → `--publish` is refused until provisioned. Dry-run + plans need none of it. |

## Acceptance checklist

1. **Every deliverable D1–D13 has a failing test in its history and a passing test now.** ✅ (red→green log below.)
2. **`wbsync run` twice with no upstream change → zero PDS writes on the second pass, request count stated.** ✅ `d13-run.test.ts` "run twice … ZERO PDS writes" (`planCounts {0,0,0}`, `pdsWrites 0`, `wikiRequests` reported).
3. **Rename / decategorisation / deletion / parser-version bump each produce correct, distinct behaviour, proven by test.** ✅ rename→update-same-rkey (D2, D13); decategorised-vs-deleted split (D3, D13); parser bump→republish with zero wiki requests (D2, D13 `--reparse`).
4. **5% blast-radius guard aborts before any write.** ✅ `d13-run.test.ts` "aborts BEFORE any PDS write" (`pds.calls.length === 0`); threshold edges in `d3-discover.test.ts`.
5. **`STAND-INS.md` complete.** ✅ `tools/wikibooks/STAND-INS.md`.
6. **Run summary reports corpus size, publishable/skipped (grouped reasons), parseFlag frequency, wiki+PDS request counts, wall time, repo rev.** ✅ `executeRun` writes `runs/<runid>/summary.json`; shape asserted by `d13-run.test.ts`.
7. **O1–O4 restated at the top of the summary.** ✅ above, and in every `summary.json` (`ownerDecisions`).

## Test inventory (106 tests: 105 pass, 1 live-gated skip; tsc strict clean)

| File | Deliverable | Tests |
|------|-------------|-------|
| `o1-isolation.test.ts` | O1 isolation guard | 4 |
| `d1-etiquette.test.ts` | D1 wiki etiquette | 7 |
| `d2-ledger.test.ts` | D2 ledger + change axes | 7 |
| `d3-discover.test.ts` | D3 discovery | 11 |
| `d4-fetch.test.ts` | D4 fetch stage | 4 |
| `d5-d8-transform.test.ts` | D5–D8 targeted | 18 |
| `d5-d8-snapshots.test.ts` | D5–D8 fixtures (31 real pages) | 33 |
| `d9-provenance.test.ts` | D9 provenance/licence | 6 |
| `d10-d11-publish.test.ts` | D10–D11 publish | 6 |
| `d13-run.test.ts` | D13 acceptance (end-to-end) | 6 |
| `d13-cli.test.ts` | D13 CLI refusal/exit codes | 3 |
| `d12-live-smoke.test.ts` | D12 live smoke (WIKIBOOKS_LIVE=1) | 1 (skipped by default) |

The suite makes **no network requests** except D12, gated behind `WIKIBOOKS_LIVE=1`
and skipped by default. D12 was run once against the real API during development
and passed (three named pages → publishable IR, namespace VERIFY = 102).

## Red → green order (representative failing output quoted)

Every deliverable started with a failing test (fixtures/tests before implementation).

- **O1** RED: `tests/o1-isolation.test.ts` written before scaffold. GREEN: 4/4.
- **D1** RED: `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '…/src/http/transport.ts'` (then `SyntaxError [ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX]: TypeScript parameter property is not supported in strip-only mode`). GREEN: 7/7.
- **D2** RED: `Cannot find module '…/src/ledger/ledger.ts'`. GREEN: 7/7.
- **D3** RED: `Cannot find module '…/src/http/wiki-client.ts'`; then `not ok 7 - discovery NEVER calls list=recentchanges` (source-grep caught my own explanatory comments — refined to strip comments). GREEN: 11/11.
- **D4** RED: `Cannot find module '…/src/fetch.ts'`. GREEN: 4/4.
- **D5–D8** RED: `Cannot find module '…/src/transform/transform.ts'`; snapshot suite `# pass 1 # fail 32` (no snapshots). Two real bugs fixed red→green: grouped ingredients under `=== Brownie ===` sub-headings, and `=== Procedure ===` (level 3) being swallowed into a `== Ingredients ==` region — both fixed by keyword-aware `regions()`. GREEN: 18 targeted + 33 snapshot.
- **D9** RED: `Cannot find module '…/src/publish/record.ts'`. GREEN: 6/6.
- **D10–D11** RED: `Cannot find module '…/src/publish/publish.ts'`. GREEN: 6/6.
- **D12** live boundary added; verified once live (passed).
- **D13** RED: acceptance `not ok 3 … blast-radius guard: 2 of 30 … (6.7%), over the 5% threshold` (the guard correctly fired; test corpus resized to 45 so 2 vanished = 4.4% stays under). GREEN: 6 run + 3 CLI.

## Corpus shape (from the 31 committed real fixtures)

- 30 / 31 publishable; 1 skipped (`afghan-bread` — ingredients live in a
  `{|wikitable|}`, flagged not lost, fails the completeness gate).
- parseFlag frequency (transform of the fixtures): `procedure-prose`,
  `ingredients-prose`, `template-stripped`, `image-unresolved`, `table`,
  `template-in-value`, `difficulty-out-of-range` — nothing is ever silently
  dropped; unmodeled prose and stripped templates become flags.
- Live VERIFY: Cookbook namespace resolved to **102** (matches the cached
  assumption). Category-flatness check + recursive-walk fallback implemented.

## Design guarantees held

- **Three hard-separated stages.** `transform/` has no network import; its
  purity + determinism are tested (byte-identical IR for identical bytes).
- **No `list=recentchanges`** anywhere in discovery — the six-month-gap
  constraint has a test named for it.
- **Ledger keyed by pageid**, never title → renames are updates, not
  delete+create. Two change axes (upstream revid / local transform_version +
  ir_sha256); only the upstream axis spends a wiki request.
- **rkey `wb-<pageid>`** deterministic → idempotent six-month rerun.
- **Dry-run is the default**; `--publish` requires a plan produced in the same
  run; creates/updates apply before retractions; sequential idempotent
  `putRecord` makes resume safe; `published_repo_rev` captured for
  RUN-BUNDLE-PRECACHE.

## Blocking / follow-ups

- **O4 hosting**: `cookbook.arecipe.app` service + app password must be
  provisioned before a real `--publish`. Until then publish is refused (by
  design). The `HttpPdsClient` is real but untested (publish stays dry per D12) —
  registered in STAND-INS.
- **Lexicon gap** (`MAPPING.md`): `difficulty` / `servings` have no home in
  `exchange.recipe.recipe`; carried losslessly under the open-world `wikibooks.*`
  object pending RUN-RECIPE-META-STRIP. `recipeCategory` / `recipeCuisine` are
  free text, not `exchange.recipe.defs` tokens (crosswalk deferred).
- **Images out of scope** (D9): infobox image stored as a filename only, flagged
  `image-unresolved`.
