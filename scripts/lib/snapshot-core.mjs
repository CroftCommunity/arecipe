// Build-time snapshot generator core (RUN-BUNDLE-PRECACHE, D1). Pure and
// fetch-injectable so the generator is unit-testable against a fake PDS with no
// network. `scripts/snapshot.mjs` wires these to Node's global fetch + a real
// plc.directory resolver; the vitest suite (tests/unit/snapshot/core.spec.ts)
// wires them to a fake.
//
// The load-bearing correctness property is TORN-SHARD PREVENTION: a repo can
// commit while we paginate listRecords, producing a shard captured across a
// commit boundary. If we then pair that torn shard with the newer rev, the app
// compares revs at runtime, sees "unchanged", and never notices the shard is
// wrong. So captureCook re-checks getLatestCommit after the listing and REDOES
// the whole capture if the rev moved — and refuses to emit a shard at all if the
// repo never settles within the retry budget.

import { createHash } from 'node:crypto';

/** sha256 hex of a string (or JSON of a value). */
export const sha256Hex = (input) =>
  createHash('sha256')
    .update(typeof input === 'string' ? input : JSON.stringify(input))
    .digest('hex');

/** Canonical shard bytes for hashing + writing. The manifest sha256 is computed
 * over exactly this string, and the shard file is written from exactly this
 * string, so the two can never drift. */
export const serializeShard = (shard) => JSON.stringify(shard);

/** com.atproto.sync.getLatestCommit → { rev, cid }. One tiny request; the whole
 * revalidation premise rests on this returning a string we can compare. */
export const getLatestCommit = async (fetchImpl, pds, did) => {
  const url = `${pds}/xrpc/com.atproto.sync.getLatestCommit?did=${encodeURIComponent(did)}`;
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`getLatestCommit failed (HTTP ${res.status}) for ${did}`);
  const body = await res.json();
  if (typeof body.rev !== 'string') throw new Error(`getLatestCommit returned no rev for ${did}`);
  return { rev: body.rev, cid: typeof body.cid === 'string' ? body.cid : '' };
};

/** Page com.atproto.repo.listRecords over the whole collection (cursor to the
 * end), mirroring src/recipes/read.ts. Runaway backstop at MAX_PAGES. */
export const listAllRecords = async (fetchImpl, pds, did, collection) => {
  const records = [];
  let cursor;
  let pages = 0;
  const MAX_PAGES = 1000;
  do {
    const params = new URLSearchParams({ repo: did, collection, limit: '100' });
    if (cursor !== undefined) params.set('cursor', cursor);
    const res = await fetchImpl(`${pds}/xrpc/com.atproto.repo.listRecords?${params.toString()}`);
    if (!res.ok) throw new Error(`listRecords failed (HTTP ${res.status}) for ${did}`);
    const body = await res.json();
    for (const r of body.records ?? []) records.push({ uri: r.uri, cid: r.cid, value: r.value });
    pages += 1;
    cursor = (body.records ?? []).length > 0 ? body.cursor : undefined;
    if (cursor !== undefined && pages >= MAX_PAGES) cursor = undefined;
  } while (cursor !== undefined);
  return records;
};

/** Torn-shard-safe capture: getLatestCommit → list → getLatestCommit; if the rev
 * moved during the listing the shard is torn — retry the whole capture. Returns
 * { rev, cid, records, attempts } on a clean pass; throws (emit nothing) if the
 * repo keeps committing past the retry budget. */
export const captureCook = async ({ fetchImpl, pds, did, collection, maxAttempts = 3 }) => {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const before = await getLatestCommit(fetchImpl, pds, did);
    const records = await listAllRecords(fetchImpl, pds, did, collection);
    const after = await getLatestCommit(fetchImpl, pds, did);
    if (after.rev === before.rev) {
      return { rev: before.rev, cid: before.cid, records, attempts: attempt };
    }
    // Torn: the repo committed during pagination. Discard and recapture.
  }
  throw new Error(
    `repo ${did} kept committing during capture (${maxAttempts} attempts) — not writing a torn shard`,
  );
};

/** Split records into fixed-size chunks (corpus sharding, D6). A count <= size
 * yields a single chunk, so the common one-file-per-cook case is unchanged. */
export const shardRecords = (records, maxPerShard) => {
  if (!Number.isFinite(maxPerShard) || maxPerShard <= 0 || records.length <= maxPerShard) {
    return [records];
  }
  const chunks = [];
  for (let i = 0; i < records.length; i += maxPerShard) chunks.push(records.slice(i, i + maxPerShard));
  return chunks;
};

/** A recipe's rkey is the last AT-URI segment (see src/recipes/read.ts). */
const rkeyOf = (uri) => uri.split('/').pop() ?? '';
const titleOf = (value) => (typeof value?.name === 'string' ? value.name : '');

/**
 * Snapshot one cook end to end. Returns:
 *   { ok: true, did, manifest, shards, indexCook }  — capture succeeded
 *   { ok: false, did, handle, reason }              — omitted, reason recorded
 * `manifest` is the per-cook manifest entry; `shards` is [{ file, shard, sha256,
 * recordCount }]; `indexCook` carries identity + { rkey, title, shard? } only.
 * A cook whose PDS is unreachable is OMITTED (ok:false) rather than failing the
 * whole build.
 */
export const snapshotCook = async ({
  fetchImpl,
  resolveImpl,
  cook,
  collection,
  capturedAt,
  maxAttempts = 3,
  maxRecordsPerShard,
}) => {
  try {
    const { pds } = await resolveImpl(cook.did);
    const cap = await captureCook({ fetchImpl, pds, did: cook.did, collection, maxAttempts });
    const chunks = shardRecords(cap.records, maxRecordsPerShard ?? Infinity);
    const multi = chunks.length > 1;
    const shards = chunks.map((chunk, i) => {
      const file = multi ? `cooks/${cook.did}.${i}.json` : `cooks/${cook.did}.json`;
      const shard = { did: cook.did, handle: cook.handle, rev: cap.rev, cid: cap.cid, part: i, records: chunk };
      return { file, shard, sha256: sha256Hex(serializeShard(shard)), recordCount: chunk.length };
    });
    const manifest = {
      did: cook.did,
      handle: cook.handle,
      displayName: cook.displayName ?? cook.handle,
      // The PDS is recorded so runtime revalidation is ONE getLatestCommit per
      // cook — no DID re-resolution on the happy path. It is re-resolved only if
      // that request fails (the PDS moved).
      pds,
      rev: cap.rev,
      cid: cap.cid,
      recordCount: cap.records.length,
      // Whole-cook sha256 over the concatenation of shard hashes (stable, and a
      // single value even when sharded); per-shard hashes live in `shards`.
      sha256: sha256Hex(shards.map((s) => s.sha256).join('')),
      capturedAt,
      shards: shards.map((s) => ({ file: s.file, sha256: s.sha256, recordCount: s.recordCount })),
    };
    const indexCook = {
      did: cook.did,
      handle: cook.handle,
      displayName: cook.displayName ?? cook.handle,
      recipes: shards.flatMap((s) =>
        s.shard.records.map((r) => {
          const entry = { rkey: rkeyOf(r.uri), title: titleOf(r.value) };
          if (multi) entry.shard = s.file;
          return entry;
        }),
      ),
    };
    return { ok: true, did: cook.did, manifest, shards, indexCook };
  } catch (err) {
    return { ok: false, did: cook.did, handle: cook.handle, reason: err?.message ?? String(err) };
  }
};
