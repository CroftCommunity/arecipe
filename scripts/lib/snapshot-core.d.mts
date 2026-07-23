// Types for scripts/lib/snapshot-core.mjs (the build-time snapshot generator
// core is plain JS so Node runs it without a compile step; this declaration lets
// the vitest suite and build.mjs consumers typecheck the import). Mirrors the
// md-to-html.d.mts precedent.

/** Minimal fetch the generator uses (url + .ok/.status/.json) — narrower than
 * the DOM `fetch` so fakes need not implement the whole overloaded signature. */
export type FetchLike = (url: string) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export type SnapshotRecord = { uri: string; cid: string; value: Record<string, unknown> };

export type Cook = { did: string; handle: string; displayName?: string };

export type Shard = {
  did: string;
  handle: string;
  rev: string;
  cid: string;
  part: number;
  records: SnapshotRecord[];
};

export type ShardFile = { file: string; shard: Shard; sha256: string; recordCount: number };

export type CookManifest = {
  did: string;
  handle: string;
  displayName: string;
  rev: string;
  cid: string;
  recordCount: number;
  sha256: string;
  capturedAt: string;
  shards: { file: string; sha256: string; recordCount: number }[];
};

export type IndexRecipe = { rkey: string; title: string; shard?: string };
export type IndexCook = { did: string; handle: string; displayName: string; recipes: IndexRecipe[] };

export type SnapshotCookOk = { ok: true; did: string; manifest: CookManifest; shards: ShardFile[]; indexCook: IndexCook };
export type SnapshotCookErr = { ok: false; did: string; handle: string; reason: string };

export type Capture = { rev: string; cid: string; records: SnapshotRecord[]; attempts: number };

export function sha256Hex(input: string | unknown): string;
export function serializeShard(shard: Shard): string;
export function getLatestCommit(
  fetchImpl: FetchLike,
  pds: string,
  did: string,
): Promise<{ rev: string; cid: string }>;
export function listAllRecords(
  fetchImpl: FetchLike,
  pds: string,
  did: string,
  collection: string,
): Promise<SnapshotRecord[]>;
export function captureCook(opts: {
  fetchImpl: FetchLike;
  pds: string;
  did: string;
  collection: string;
  maxAttempts?: number;
}): Promise<Capture>;
export function shardRecords(records: SnapshotRecord[], maxPerShard: number): SnapshotRecord[][];
export function snapshotCook(opts: {
  fetchImpl: FetchLike;
  resolveImpl: (did: string) => Promise<{ pds: string }>;
  cook: Cook;
  collection: string;
  capturedAt: string;
  maxAttempts?: number;
  maxRecordsPerShard?: number;
}): Promise<SnapshotCookOk | SnapshotCookErr>;
