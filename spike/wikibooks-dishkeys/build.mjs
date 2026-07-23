// wikibooks corpus dishKey alignment — build the proposal + review page.
//
//   node spike/wikibooks-dishkeys/build.mjs [--plan <plan.json>] [--out <dir>]
//                                           [--handle arecipe.bsky.social]
//                                           [--live-cache <ndjson>]
//
// I/O shell only. The pure logic lives in propose.mjs / render.mjs (tested).
// Loads the live keyspace from the publish account and the staged corpus names
// from wbsync's plan.json, then writes proposal.json + review.html. No writes to
// any PDS, no mutation of records — this is the review artifact for Option 1.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildProposal } from './propose.mjs';
import { renderReviewHtml } from './render.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const arecipeRoot = resolve(here, '..', '..');

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const HANDLE = arg('--handle', 'arecipe.bsky.social');
const OUT_DIR = resolve(arg('--out', join(here, 'out')));
const LIVE_CACHE = arg('--live-cache', undefined);

/** Newest tools/wikibooks/runs/<runId>/plan.json unless overridden. */
const findLatestPlan = () => {
  const runsDir = join(arecipeRoot, 'tools', 'wikibooks', 'runs');
  if (!existsSync(runsDir)) throw new Error(`no runs dir at ${runsDir} — run wbsync first`);
  const runs = readdirSync(runsDir).sort();
  for (let i = runs.length - 1; i >= 0; i--) {
    const p = join(runsDir, runs[i], 'plan.json');
    if (existsSync(p)) return p;
  }
  throw new Error(`no plan.json under ${runsDir} — run \`wbsync plan\` or \`wbsync run\` first`);
};

const loadCorpus = (planPath) => {
  const plan = JSON.parse(readFileSync(planPath, 'utf8'));
  const items = plan.items ?? [];
  return items
    .filter((i) => i.action === 'create' || i.action === 'update')
    .map((i) => ({ rkey: i.rkey, name: i.value?.name ?? '' }));
};

const resolveRepo = async (handle) => {
  const did = (
    await (await fetch(`https://bsky.social/xrpc/com.atproto.identity.resolveHandle?handle=${handle}`)).json()
  ).did;
  if (!did) throw new Error(`could not resolve handle ${handle}`);
  const doc = await (await fetch(`https://plc.directory/${did}`)).json();
  const svc = (doc.service ?? []).find((s) => /pds|PersonalDataServer/i.test(s.type ?? ''));
  if (!svc) throw new Error(`no PDS endpoint in DID doc for ${did}`);
  return { did, pds: svc.serviceEndpoint };
};

const fetchLive = async (handle) => {
  const { did, pds } = await resolveRepo(handle);
  const out = [];
  let cursor;
  do {
    const url = new URL(`${pds}/xrpc/com.atproto.repo.listRecords`);
    url.searchParams.set('repo', did);
    url.searchParams.set('collection', 'exchange.recipe.recipe');
    url.searchParams.set('limit', '100');
    if (cursor) url.searchParams.set('cursor', cursor);
    const body = await (await fetch(url)).json();
    for (const r of body.records ?? []) {
      const v = r.value ?? {};
      out.push({ rkey: r.uri.split('/').pop(), name: v.name ?? '', dishKey: v.dishKey ?? null });
    }
    cursor = body.cursor;
  } while (cursor);
  return out;
};

const loadLiveCache = (path) =>
  readFileSync(path, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l))
    .map((r) => ({ rkey: r.rkey, name: r.name ?? '', dishKey: r.dishKey ?? null }));

const main = async () => {
  const planPath = arg('--plan', undefined) ?? findLatestPlan();
  const corpus = loadCorpus(planPath);
  const live = LIVE_CACHE ? loadLiveCache(LIVE_CACHE) : await fetchLive(HANDLE);

  const proposal = buildProposal({ live, corpus });
  const html = renderReviewHtml(proposal, {
    target: HANDLE,
    generatedAtNote: `Corpus: ${corpus.length} recipes from ${planPath.replace(arecipeRoot + '/', '')} · live keyspace: ${live.length} records from ${HANDLE}. dishKey deriver: spike/import/dishkeys.mjs (single source).`,
  });

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, 'proposal.json'), JSON.stringify(proposal, null, 2) + '\n');
  writeFileSync(join(OUT_DIR, 'review.html'), html);

  const c = proposal.counts;
  process.stdout.write(
    `dishKey alignment proposal written:\n` +
      `  ${join(OUT_DIR, 'review.html')}\n` +
      `  ${join(OUT_DIR, 'proposal.json')}\n\n` +
      `corpus ${c.corpus} · live ${c.live}\n` +
      `merge decisions to review: ${c.mergeGroups} groups ` +
      `(${c.joinsExisting} recipes join existing live groups · ${c.newGroups} new corpus groups)\n` +
      `singletons (auto-keyed, no decision): ${c.singletons}\n` +
      `near-miss candidates: ${c.nearMiss}\n`,
  );
};

main().catch((e) => {
  process.stderr.write(`${e.stack ?? e}\n`);
  process.exit(1);
});
