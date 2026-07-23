// Shapes of the build-time snapshot files (RUN-BUNDLE-PRECACHE). Emitted by
// scripts/lib/snapshot-core.mjs + build.mjs; consumed by the runtime here. The
// snapshot is a CACHE, never an authority — every field can be stale, and
// nothing may treat a snapshot value as true after live data has arrived.

/** index.json — the minimum for first paint: cook identity + recipe titles +
 * rkeys, nothing else. Full bodies live in the per-cook shards. */
export type SnapshotIndexRecipe = { rkey: string; title: string; shard?: string };
export type SnapshotIndexCook = {
  did: string;
  handle: string;
  displayName: string;
  recipes: SnapshotIndexRecipe[];
};
export type SnapshotIndex = { buildId: string; cooks: SnapshotIndexCook[] };

/** cooks/<did>.json (or <did>.<part>.json when sharded) — full record bodies. */
export type SnapshotShardRecord = { uri: string; cid: string; value: Record<string, unknown> };
export type SnapshotShard = {
  did: string;
  handle: string;
  rev: string;
  cid: string;
  part: number;
  records: SnapshotShardRecord[];
};

/** manifest.json — per-cook rev/cid/sha256, the revalidation baseline. */
export type SnapshotCookManifest = {
  did: string;
  handle: string;
  displayName: string;
  /** Recorded at capture so revalidation is one getLatestCommit per cook. */
  pds: string;
  rev: string;
  cid: string;
  recordCount: number;
  sha256: string;
  capturedAt: string;
  shards: { file: string; sha256: string; recordCount: number }[];
};
export type SnapshotManifest = {
  buildId: string;
  capturedAt: string;
  cooks: SnapshotCookManifest[];
  omitted: { did: string; handle: string; reason: string }[];
};
