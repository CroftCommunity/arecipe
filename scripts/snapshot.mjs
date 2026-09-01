// Build-time snapshot generator CLI (RUN-BUNDLE-PRECACHE, D1). Runs in CI
// BEFORE `npm run build`. Reads snapshot-seed.json (O1), resolves each cook's
// DID to its PDS via plc.directory, captures each repo torn-shard-safely (the
// logic lives in and is unit-tested through scripts/lib/snapshot-core.mjs), and
// writes a staging tree `.snapshot-staging/` that build.mjs stamps with the
// build id and copies into dist/assets/snapshot/<buildId>/.
//
// This file is the network wiring only; all correctness-bearing logic is in the
// tested core. Kept dependency-free (Node global fetch + fs).
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { snapshotCook, serializeShard } from './lib/snapshot-core.mjs';

const STAGING = '.snapshot-staging';
const CONCURRENCY = 4;

/** did:plc / did:web → PDS endpoint from the DID document (mirrors
 * src/identity/did.ts). */
const resolvePds = async (did) => {
  const url = did.startsWith('did:web:')
    ? `https://${did.slice('did:web:'.length)}/.well-known/did.json`
    : `https://plc.directory/${encodeURIComponent(did)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`DID resolve failed (HTTP ${res.status}) for ${did}`);
  const doc = await res.json();
  const svc = (doc.service ?? []).find(
    (s) => s.id === '#atproto_pds' || s.type === 'AtprotoPersonalDataServer',
  );
  if (svc?.serviceEndpoint === undefined) throw new Error(`no #atproto_pds service for ${did}`);
  return { pds: svc.serviceEndpoint };
};

/** Run tasks with a fixed concurrency cap. */
const pool = async (items, limit, worker) => {
  const results = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return results;
};

const main = async () => {
  const seed = JSON.parse(readFileSync('snapshot-seed.json', 'utf8'));
  const collection = seed.recipeCollection ?? 'exchange.recipe.recipe';
  const capturedAt = new Date().toISOString();
  const cooks = [...seed.cooks];
  // The corpus is one more cook, sharded further so first paint never loads it
  // whole (D6). Its rev may be pre-declared in the run's summary.json, but we
  // still verify with getLatestCommit rather than trusting the file.
  if (seed.corpus && seed.corpus.did) {
    cooks.push({ ...seed.corpus, maxRecordsPerShard: seed.corpus.maxRecordsPerShard ?? 250 });
  }

  const outcomes = await pool(cooks, CONCURRENCY, (cook) =>
    snapshotCook({
      fetchImpl: fetch,
      resolveImpl: resolvePds,
      cook: { did: cook.did, handle: cook.handle, displayName: cook.displayName },
      collection,
      capturedAt,
      maxRecordsPerShard: cook.maxRecordsPerShard,
    }),
  );

  rmSync(STAGING, { recursive: true, force: true });
  mkdirSync(`${STAGING}/cooks`, { recursive: true });

  const manifestCooks = [];
  const omitted = [];
  const indexCooks = [];
  for (const out of outcomes) {
    if (!out.ok) {
      omitted.push({ did: out.did, handle: out.handle, reason: out.reason });
      console.warn(`snapshot: omitting ${out.handle} (${out.did}) — ${out.reason}`);
      continue;
    }
    for (const s of out.shards) writeFileSync(`${STAGING}/${s.file}`, serializeShard(s.shard));
    manifestCooks.push(out.manifest);
    indexCooks.push(out.indexCook);
  }

  // buildId is stamped by build.mjs (it owns the version string); staging is
  // build-id-agnostic.
  writeFileSync(`${STAGING}/manifest.json`, JSON.stringify({ capturedAt, cooks: manifestCooks, omitted }));
  writeFileSync(`${STAGING}/index.json`, JSON.stringify({ cooks: indexCooks }));

  const recordTotal = manifestCooks.reduce((n, c) => n + c.recordCount, 0);
  console.log(
    `snapshot: ${manifestCooks.length} cook(s), ${recordTotal} record(s), ${omitted.length} omitted → ${STAGING}/`,
  );
};

main().catch((err) => {
  console.error('snapshot generation failed:', err);
  process.exit(1);
});
