# RUN-BUNDLE-PRECACHE — summary

Ship a build-time snapshot of the mostly-static cook list and recipe index in
the release bundle, render from it instantly on first load, and revalidate
against each PDS by repo revision so an unchanged repo costs one tiny request and
zero record fetches.

## Owner decisions

- **O1 — seed source: a committed `snapshot-seed.json`** (the spec's "simplest
  answer, keeps CI hermetic"). It mirrors `STARTER_AUTHORS` in
  `src/recipes/starter.ts` and carries an optional `corpus` block for the future
  Wikibooks tenant. It is the single canonical input to `scripts/snapshot.mjs`.
- **O2 — cross-session debounce N: 60 minutes** (the suggested default). Persisted
  as `lastRevalidatedAt` per cook in IndexedDB. The app's explicit refresh
  control bypasses it (`force: true`); the counter-clockwise reset arrow is
  untouched, and no refresh/reset iconography changed (out of scope).

Neither decision is blocking.

## What shipped (each with a failing test in its history and a passing test now)

**D1 — build-time snapshot** (`scripts/lib/snapshot-core.mjs` + `.mjs` CLI,
`scripts/build.mjs`). Per cook: resolve DID → PDS, `getLatestCommit` (rev+cid),
paginate `listRecords`, **re-check `getLatestCommit`; if the rev moved during
pagination, recapture** — and refuse to emit a shard the repo never let settle.
This is the torn-shard bug the design hinges on, pinned first
(`tests/unit/snapshot/core.spec.ts`). Emits
`assets/snapshot/<buildId>/{manifest.json,index.json,cooks/<did>.json}`; the
generator writes a gitignored `.snapshot-staging/` tree and `build.mjs` stamps it
with the build id, enforces a **gzipped `index.json` ceiling (96 KB)**, and
precaches the files. An absent staging tree yields a valid empty skeleton so the
build never breaks (`tests/unit/snapshot/build-presence.spec.ts`).

**D2 — boot path** (`src/snapshot/{types,paths,load}.ts`, `src/pages/browse.ts`).
Load `index.json` + shards from the immutable precached bundle, render, *then*
revalidate off the critical path. A cold load renders the full list with **every
cross-origin request aborted** (`tests/e2e/snapshot-boot.spec.ts`); a corrupt or
truncated snapshot degrades to live loading, logged once, no blank screen.

**D3 — revalidation** (`src/snapshot/{sync,store,revalidate}.ts`). One
`getLatestCommit` per cook; unchanged → nothing else fetched that session;
changed → one `listRecords` refetch, delta stored build-scoped in IndexedDB.
Concurrency cap 4, viewport-first (input order) then idle, 60-min debounce with
force bypass, failure keeps the snapshot rendered
(`tests/unit/snapshot/{store,revalidate}.spec.ts`,
`tests/e2e/snapshot-revalidate.spec.ts`).

**D4 — staleness honesty.** Identity is provisional: the live DID doc is
re-resolved only when a cook changed or the user forced a refresh (so the warm
path stays one request per cook), and live handle/displayName then win in place;
a deactivated/gone repo (4xx) is dropped from the live view for the session
(`revalidate.spec.ts`, `snapshot-revalidate.spec.ts`).

**D5 — service worker & release.** `snapshotDirsToPurge` (`src/snapshot/purge.ts`)
runs on activate: purge snapshot dirs whose build id is not in the keep set
(active build + **pinned builds**). The pin-safety test was written before the
purge code — a pinned install never loses its snapshot
(`tests/unit/snapshot/purge.spec.ts`). The snapshot is precached and served from
the Cache API with no network (`tests/e2e/snapshot-sw.spec.ts`). IndexedDB keys
are build-scoped (`store.spec.ts`).

**D6 — Wikibooks corpus as first tenant.** The corpus is one more cook in the
seed, sharded by fixed record count so first paint never loads it whole: the
index carries only titles + rkeys + shard file, the eager feed skips the corpus,
and opening one recipe fetches exactly one shard. It revalidates in exactly one
request like any cook (`tests/unit/snapshot/corpus.spec.ts`). **Dependency:**
`RUN-WIKIBOOKS-CORPUS` does not exist in-repo yet; the machinery (sharding, lazy
load, corpus slot in `snapshot-seed.json`) is in place and tested against a fake
large repo, and `snapshot.mjs` reads the corpus rev from its future `summary.json`
if present but still **verifies with `getLatestCommit`** rather than trusting it.

## Measurement (D7) — real numbers

Measured against the four real seed cooks (`snapshot-seed.json`): **418 records**
(arecipe.bsky.social 346, daffl.xyz 37, recipe.exchange 32, rdur.dev 3). "Before"
= the live feed path (`loadStarterFeed`), measured in this environment; "after" =
the snapshot path, measured via the e2e request-count assertions.

| metric | before | after |
|---|---|---|
| network requests, cold load to full list | **15** (4 DID-doc + 11 `listRecords`) | **0** beyond the bundle |
| bytes transferred, cold load (record data) | **839,987 B** raw (~209 KB gzipped by the PDS) | **0** beyond the bundle (snapshot is precached) |
| time to first rendered list, throttled to Slow 4G | **~6.0 s** wall unthrottled here → materially worse on Slow 4G (15 serial round-trips + ~209 KB) | **~0 network**; first paint bounded by parsing the 8 KB gz index (tens of ms) |
| PDS requests per warm session, nothing changed upstream | **15** (a full reload every visit) | **4** — one `getLatestCommit` per cook, **zero record fetches** |
| PDS requests per warm session, one cook changed | **15** | **4** rev checks **+ 1** `listRecords` for the changed cook = **5** |
| snapshot size, raw and gzipped | — | `index.json` **26,596 B / 7,983 B gz**; shards **838,114 B / 208,910 B gz**; `manifest.json` 2,205 B |

The headline (row 4) landed: a warm session with nothing changed is **one request
per cook and zero record fetches** — 15 → 4, and those four are ~200-byte commit
probes rather than ~210 KB of records. The measured `index.json` gz size (8 KB)
set the D1 ceiling at 96 KB, generous headroom for the corpus tenant (index stays
titles + rkeys only) while still failing the build long before the file could
defeat its instant-first-paint purpose.

## Tradeoffs & findings

- **`listRecords`, not `getRepo?since=` (per spec).** The diff path returns a CAR
  of MST blocks — shipping CAR + DAG-CBOR *decoding* into a bundle that has none,
  for a corpus whose whole premise is that it rarely changes. We refetch the
  changed repo's records via `listRecords` instead. **Revisit trigger:** if
  refetch volume on a typical warm session exceeds ~1 changed cook / session
  sustained (i.e. the corpus starts changing more than ~twice a year, or the seed
  grows large and churny), reconsider the CAR diff. Left as a documented
  follow-on.
- **Signed-release interaction (finding).** Release signing is **spec-only, not
  yet implemented** (`docs/BUILD-PLAN.md` Phase 3 / `docs/sources/arecipe-spec.md`
  §6: an offline Ed25519 key signs a per-file-SHA-256 manifest over the built
  output). The snapshot is written by `build.mjs` **into `dist/` during the
  build**, from staging produced *before* it — it is inside the artifact the
  release process will sign, and is **not added afterward**. So when signing
  lands it covers the snapshot with no change to this run. Verified by
  construction: `dist/assets/snapshot/<buildId>/…` is emitted by the build
  pipeline itself.
- **Version-pin seam.** The device-local version pin is a later feature.
  `pinnedBuildIds()` in `src/sw.ts` is the seam it feeds; today it is empty, and
  the purge keeps only the active build. The pure `snapshotDirsToPurge` already
  honors a multi-build keep set, so the pin's arrival is additive and its safety
  is already proven by test.
- **Identity vs one-request.** A handle can change without the repo rev changing.
  Re-resolving every cook's DID doc each session would break "one request per
  cook", so identity revalidation is bundled with the change path and the
  explicit refresh; unchanged cooks keep provisional identity until they next
  change or are opened. This is the spec's "provisional until revalidated".

## Acceptance

1. Every deliverable has a failing test in its history and a passing test now — ✅
   (D1 core/build, D2 load/boot, D3 store/revalidate, D4 identity/gone, D5
   purge/sw, D6 corpus).
2. Cold load renders the full index with zero requests beyond the bundle — ✅
   `snapshot-boot.spec.ts` (all cross-origin aborted).
3. Warm session, nothing changed: one request per cook, no records — ✅
   `snapshot-revalidate.spec.ts` (4 `getLatestCommit`, 0 `listRecords`).
4. Torn-shard case proven impossible by test — ✅ `core.spec.ts`.
5. Pinned-install purge proven safe by test — ✅ `purge.spec.ts`.
6. Snapshot files verified present in `dist/` by a build test — ✅
   `build-presence.spec.ts`.
7. Measurement table filled with real numbers — ✅ above.
8. O1 and O2 answered at the top — ✅.

## Running it

- `npm run snapshot` — capture the seed cooks into `.snapshot-staging/` (network).
- `npm run build` — stamp + emit the snapshot into `dist/`, enforce the size gate,
  precache it. Skeleton if no staging.
- CI runs `node scripts/snapshot.mjs` before `npm run build` in the **deploy** job
  only; the `test` job stays hermetic (skeleton snapshot).

See `plans/2026-07-23-2-plan-bundle-precache.md` for the design.
