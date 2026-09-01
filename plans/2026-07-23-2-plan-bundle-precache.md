# Plan — RUN-BUNDLE-PRECACHE (build-time snapshot + rev-revalidation)

Dated 2026-07-23. Ship a build-time snapshot of the mostly-static cook list and
recipe index inside the release bundle, render from it instantly on first load,
and revalidate against each PDS by repo revision so an unchanged repo costs one
tiny request and zero record fetches.

## Owner decisions (adopted defaults)

- **O1 — seed source:** a committed `snapshot-seed.json` at the repo root (the
  spec's "simplest answer, keeps CI hermetic"). It mirrors `STARTER_AUTHORS` in
  `src/recipes/starter.ts` and adds an optional `corpus` block for the future
  Wikibooks tenant. `snapshot-seed.json` is the single canonical input to the
  generator.
- **O2 — cross-session debounce N:** 60 minutes (spec's suggested default). The
  app's explicit refresh control (`force: true`) always bypasses it.

## Architecture

Two halves, split by trust boundary and by where they run.

### Build-time (Node/CI, plain JS — hermetic-testable)

- `scripts/lib/snapshot-core.mjs` — pure, fetch-injectable functions:
  `getLatestCommit`, `listAllRecords`, torn-shard-safe `captureCook`,
  `snapshotCook`, `shardRecords` (corpus), `serializeShard` + `sha256Hex`.
- `scripts/snapshot.mjs` — CLI: reads `snapshot-seed.json`, resolves each DID
  to its PDS via `plc.directory`, captures each cook with bounded concurrency,
  writes a staging tree `.snapshot-staging/` (gitignored).
- `scripts/build.mjs` — after the version is known, emits
  `dist/assets/snapshot/<buildId>/{manifest.json,index.json,cooks/*.json}` from
  the staging tree (or a valid empty skeleton when staging is absent, so the
  build never breaks and the gate/tests stay hermetic), enforces the gzipped
  `index.json` size ceiling, bakes `__SNAPSHOT_BUILD__` into the page bundles,
  and adds the snapshot files to the SW precache list.

The generator runs in CI *before* the bundle build; `build.mjs` (no network)
places the snapshot at the versioned path and owns the size gate. Because the
snapshot lands under `assets/` it is copied by the existing recursive `cpSync`
and is therefore inside the same artifact the release signing (Phase 11, spec)
will sign — see the run summary's signed-release finding.

### Runtime (TypeScript, `src/snapshot/`)

- `types.ts` — snapshot file shapes.
- `paths.ts` — `snapshotBuildId()` (`__SNAPSHOT_BUILD__`), path builders.
- `load.ts` (D2) — `loadSnapshotIndex` / `loadCookShard`, corrupt-tolerant
  (returns null + logs once; never a blank screen).
- `sync.ts` (D3) — `getLatestCommit` for the client.
- `store.ts` (D3/D5) — IndexedDB `arecipe-snapshot`, deltas + `lastRevalidatedAt`
  keyed by `buildId | did`, so a build change never mixes generations.
- `revalidate.ts` (D3/D4) — per-cook rev check, concurrency cap 4, debounce,
  `force` bypass, identity live-wins, dead-repo removal; keeps snapshot on error.
- `purge.ts` (D5) — `snapshotDirsToPurge(cachedUrls, keepBuildIds)` pure fn,
  called from `sw.ts` activate; pin-safe (keep set includes any pinned builds).

Boot integration is additive in `src/pages/browse.ts`: render from the snapshot
index first (zero network), then run the existing feed load as revalidation.

## TDD order (red first each)

D1 core → D1 build gate/presence → D2 load + boot e2e → D3 revalidate → D4
identity → D5 purge/pin + SW e2e → D6 corpus sharding → D7 measurement.

## Out of scope (per spec §10)

`getRepo?since=` CAR diff, offline authoring, image/blob precache, SSR, changing
reset/refresh iconography.

## Outcome

Recorded in `RUN-BUNDLE-PRECACHE-SUMMARY.md` (O1/O2 at top; measurement table).
