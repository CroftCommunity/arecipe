// D13 orchestration — ties discover → fetch → transform → plan → (publish) into
// resumable, re-runnable stages, DRY by default. Every stage is a pure-ish
// function of injected deps (wiki client, ledger, dirs, clock, optional PDS) so
// the whole run is testable with fakes and no network. Produces the RunSummary
// the acceptance criteria require.
import { join } from 'node:path';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import type { Config } from './config.ts';
import { TRANSFORM_VERSION } from './config.ts';
import type { WikiClient } from './http/wiki-client.ts';
import type { Ledger, RecipeRow, RunCounts } from './ledger/ledger.ts';
import { discover, assertBlastRadius, verifyCategoryFlatness, type DiscoveryResult, type FlatnessReport } from './discover.ts';
import { fetchStage, latestRawFor, rawPageIds, type RawRecord } from './fetch.ts';
import { transform } from './transform/transform.ts';
import { irSha256, type RecipeIR } from './ir.ts';
import { sha256 } from './util/hash.ts';
import type { Clock } from './util/clock.ts';
import { buildRecord, deterministicRkey, type RawMeta } from './publish/record.ts';
import { attachEmbeds } from './publish/embed.ts';
import { loadManifest, type ImageTarget } from './images/stage.ts';
import {
  buildPlan, writePlanFiles, applyPlan, assertPlanExists,
  type Plan, type PlanItem, type PdsClient,
} from './publish/publish.ts';
import { canonicalJsonPretty } from './util/canonical-json.ts';

const COLLECTION = 'exchange.recipe.recipe';

export type RunContext = {
  cfg: Config;
  ledger: Ledger;
  client: WikiClient;
  stateDir: string;
  rawDir: string;
  runDir: string;
  runId: string;
  clock: Clock;
  pds?: PdsClient;
  /** Approved rkey→dishKey map (D14). Absent → no dishKeys stamped. The map is
   *  operator-supplied data (reviewed offline); wbsync never derives it. */
  dishKeyMap?: Record<string, string>;
  /** Image cache + manifest dir (D15). Absent → no image embeds. */
  imagesDir?: string;
};

export type RunSummary = {
  runId: string;
  mode: string;
  ownerDecisions: { O1: string; O2: string; O3: string; O4: string };
  corpusSize: number;
  publishable: number;
  skipped: number;
  skippedReasons: Record<string, number>;
  parseFlagFrequency: [string, number][];
  discovery?: {
    new: number; changed: number; unchanged: number; decategorised: number; deleted: number;
    decategorisedTitles: string[]; namespaceId: number;
  };
  flatness?: FlatnessReport;
  wikiRequests: number;
  pdsWrites: number;
  wallMs: number;
  repoRev: string | null;
  planCounts: { create: number; update: number; delete: number };
  enrichment: EnrichmentCounts;
  published: boolean;
};

const iso = (clock: Clock): string => new Date(clock.now()).toISOString();

const metaFromRaw = (raw: RawRecord): RawMeta => ({
  pageid: raw.pageid,
  title: raw.title,
  revid: raw.revid,
  revTimestamp: raw.timestamp,
  retrievedAt: raw.fetchedAt,
});

/** Transform one page's stored raw content and fold the result into the ledger.
 *  Reports whether the IR actually changed vs what the ledger already held — the
 *  local-change axis (axis 2), used by --reparse to republish only what moved. */
const transformPage = (
  ctx: RunContext,
  pageid: number,
): { ir: RecipeIR; raw: RawRecord; changed: boolean } | undefined => {
  const raw = latestRawFor(ctx.rawDir, pageid);
  if (raw === undefined) return undefined;
  const before = ctx.ledger.get(pageid);
  const ir = transform(raw.wikitext, raw.title);
  const hash = irSha256(ir);
  const changed =
    before === undefined || before.ir_sha256 !== hash || before.transform_version !== TRANSFORM_VERSION;
  ctx.ledger.patch(pageid, {
    title: raw.title,
    revid: raw.revid,
    rev_timestamp: raw.timestamp,
    raw_sha256: sha256(raw.wikitext),
    ir_sha256: hash,
    transform_version: TRANSFORM_VERSION,
    status: ir.publishable ? 'active' : 'skipped',
    skip_reason: ir.skipReason ?? null,
    last_seen: iso(ctx.clock),
  });
  return { ir, raw, changed };
};

export type DiscoverOutput = { discovery: DiscoveryResult; flatness: FlatnessReport };

/** Stage: discover. Verifies namespace, enumerates, sweeps, classifies, resolves
 *  vanished, checks flatness, and updates last_seen/first_seen on the ledger. */
export const stageDiscover = async (ctx: RunContext): Promise<DiscoverOutput> => {
  const discovery = await discover(ctx.client, ctx.ledger, ctx.cfg);
  const flatness = await verifyCategoryFlatness(
    ctx.client,
    discovery.newPages.length + discovery.changed.length + discovery.unchanged.length,
  );
  const now = iso(ctx.clock);
  for (const p of [...discovery.newPages, ...discovery.changed, ...discovery.unchanged]) {
    const existing = ctx.ledger.get(p.pageid);
    ctx.ledger.patch(p.pageid, {
      title: p.title,
      revid: existing?.revid ?? 0,
      first_seen: existing?.first_seen ?? now,
      last_seen: now,
    });
  }
  return { discovery, flatness };
};

/** Stage: fetch new + changed content into raw/. */
export const stageFetch = async (ctx: RunContext, discovery: DiscoveryResult): Promise<number> => {
  const ids = [...discovery.newPages, ...discovery.changed].map((p) => p.pageid);
  const res = await fetchStage(ctx.client, ids, { rawDir: ctx.rawDir, runDir: ctx.runDir, clock: ctx.clock });
  return res.pagesWritten;
};

/** Stage: transform. Normal mode transforms new+changed; --reparse (network-off)
 *  re-transforms EVERY stored raw page — the local-change axis alone. */
export const stageTransform = (
  ctx: RunContext,
  targets: number[],
): { transformed: number; changed: number[] } => {
  let transformed = 0;
  const changed: number[] = [];
  for (const pageid of targets) {
    const res = transformPage(ctx, pageid);
    if (res === undefined) continue;
    transformed++;
    if (res.changed) changed.push(pageid);
  }
  return { transformed, changed };
};

/** Build the publish plan from the ledger + discovery classification. */
export const stagePlan = (ctx: RunContext, discovery: DiscoveryResult | undefined, reparseTargets?: number[]): Plan => {
  const items: PlanItem[] = [];
  const now = iso(ctx.clock);

  const upsertItem = (pageid: number): void => {
    const raw = latestRawFor(ctx.rawDir, pageid);
    const row = ctx.ledger.get(pageid);
    if (raw === undefined || row === undefined) return;
    if (row.status !== 'active') return; // skipped/half-recipes never publish
    const ir = transform(raw.wikitext, raw.title);
    if (!ir.publishable) return;
    const dishKey = ctx.dishKeyMap?.[deterministicRkey(pageid)];
    const { rkey, record } = buildRecord(ir, metaFromRaw(raw), ctx.cfg, { dishKey });
    const alreadyPublished = row.published_at !== null && row.record_rkey !== null;
    items.push({ action: alreadyPublished ? 'update' : 'create', pageid, rkey, collection: COLLECTION, value: record });
  };

  if (discovery !== undefined) {
    for (const p of [...discovery.newPages, ...discovery.changed]) upsertItem(p.pageid);
    for (const pageid of [...discovery.decategorised, ...discovery.deleted]) {
      const row = ctx.ledger.get(pageid);
      if (row?.record_rkey != null && row.published_at != null) {
        const reason = discovery.deleted.includes(pageid) ? 'deleted' : 'decategorised';
        items.push({ action: 'delete', pageid, rkey: row.record_rkey, collection: COLLECTION, reason });
      }
      ctx.ledger.patch(pageid, {
        title: row?.title ?? String(pageid),
        revid: row?.revid ?? 0,
        status: discovery.deleted.includes(pageid) ? 'deleted' : 'decategorised',
        last_seen: now,
      });
    }
  }
  // Local-change axis: pages whose re-transform differs from the ledger even
  // though the wiki did not move (parser bump). Republish (update) only.
  for (const pageid of reparseTargets ?? []) {
    const row = ctx.ledger.get(pageid);
    if (row === undefined || row.status !== 'active') continue;
    if (items.some((it) => it.pageid === pageid)) continue;
    upsertItem(pageid);
  }
  return buildPlan(items, { runId: ctx.runId });
};

export type EnrichmentCounts = {
  diet: number; recipeCategory: number; recipeCuisine: number;
  keywords: number; nutrition: number; cookingMethod: number; dishKey: number; embed: number;
};

/** How many planned (create/update) records carry each enriched field (D15). */
export const enrichmentCounts = (items: PlanItem[]): EnrichmentCounts => {
  const c: EnrichmentCounts = { diet: 0, recipeCategory: 0, recipeCuisine: 0, keywords: 0, nutrition: 0, cookingMethod: 0, dishKey: 0, embed: 0 };
  for (const it of items) {
    if (it.action === 'delete') continue;
    const v = it.value;
    if (v.suitableForDiet !== undefined && v.suitableForDiet.length > 0) c.diet++;
    if (v.recipeCategory !== undefined) c.recipeCategory++;
    if (v.recipeCuisine !== undefined) c.recipeCuisine++;
    if (v.keywords !== undefined && v.keywords.length > 0) c.keywords++;
    if (v.nutrition !== undefined) c.nutrition++;
    if (v.cookingMethod !== undefined) c.cookingMethod++;
    if (v.dishKey !== undefined) c.dishKey++;
    if (v.embed !== undefined) c.embed++;
  }
  return c;
};

/** Publishable pages that carry an infobox image → image-stage targets (D15). */
export const imageTargets = (ctx: RunContext): ImageTarget[] => {
  const out: ImageTarget[] = [];
  for (const pageid of rawPageIds(ctx.rawDir)) {
    const raw = latestRawFor(ctx.rawDir, pageid);
    if (raw === undefined) continue;
    const ir = transform(raw.wikitext, raw.title);
    if (!ir.publishable || ir.summary.image === undefined) continue;
    out.push({ pageid, filename: ir.summary.image, alt: ir.title });
  }
  return out;
};

/** Apply a plan and fold publish results back into the ledger. */
export const stagePublish = async (ctx: RunContext, plan: Plan): Promise<string | null> => {
  if (ctx.pds === undefined) throw new Error('publish requested but no PDS client configured');
  assertPlanExists(ctx.runDir);
  const repo = ctx.cfg.publish?.handle ?? 'self';
  // D15 images: upload cached renditions and attach embeds before applying the
  // plan, so each putRecord carries its image. Idempotent — items already
  // embedded are skipped. Only runs when a manifest + an uploadBlob-capable PDS
  // are present.
  if (ctx.imagesDir !== undefined && typeof ctx.pds.uploadBlob === 'function') {
    const manifest = loadManifest(ctx.imagesDir);
    const uploader = { uploadBlob: ctx.pds.uploadBlob.bind(ctx.pds) };
    const r = await attachEmbeds(plan.items, { manifest, imagesDir: ctx.imagesDir, pds: uploader, readFile: (p) => readFileSync(p), log: (m) => process.stderr.write(`${m}\n`) });
    process.stderr.write(`images: ${r.uploaded} uploaded · ${r.reused} reused · ${r.skipped} already embedded · ${r.failed} failed\n`);
  }
  const result = await applyPlan(ctx.pds, repo, plan, ctx.runDir);
  const now = iso(ctx.clock);
  for (const it of plan.items) {
    if (it.action === 'delete') {
      ctx.ledger.patch(it.pageid, {
        title: ctx.ledger.get(it.pageid)?.title ?? String(it.pageid),
        revid: ctx.ledger.get(it.pageid)?.revid ?? 0,
        record_rkey: null,
        record_cid: null,
      });
    } else {
      ctx.ledger.patch(it.pageid, {
        title: it.value.name,
        revid: it.value.sourceRevId,
        record_rkey: it.rkey,
        published_at: now,
        published_repo_rev: result.commitRev,
      });
    }
  }
  return result.commitRev;
};

const skipReasonHistogram = (ledger: Ledger): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const row of ledger.allWithStatus('skipped')) {
    const reason = row.skip_reason ?? 'unknown';
    out[reason] = (out[reason] ?? 0) + 1;
  }
  return out;
};

const parseFlagFrequency = (ctx: RunContext): [string, number][] => {
  const freq = new Map<string, number>();
  for (const pageid of rawPageIds(ctx.rawDir)) {
    const raw = latestRawFor(ctx.rawDir, pageid);
    if (raw === undefined) continue;
    for (const f of transform(raw.wikitext, raw.title).parseFlags) {
      freq.set(f.code, (freq.get(f.code) ?? 0) + 1);
    }
  }
  return [...freq.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
};

export type ExecuteOptions = { publish: boolean; reparse: boolean };

/** The full `wbsync run`. Dry by default; --publish applies the plan. */
export const executeRun = async (ctx: RunContext, opts: ExecuteOptions): Promise<RunSummary> => {
  const start = ctx.clock.now();
  const led = ctx.ledger;
  const runNumId = led.startRun(opts.reparse ? 'reparse' : opts.publish ? 'run(publish)' : 'run');

  let discovery: DiscoveryResult | undefined;
  let flatness: FlatnessReport | undefined;
  let reparseTargets: number[] | undefined;

  if (opts.reparse) {
    // Local-change axis alone — network stays off. Republish only pages whose
    // re-transform actually differs from the ledger.
    const { changed } = stageTransform(ctx, rawPageIds(ctx.rawDir));
    reparseTargets = changed;
  } else {
    const out = await stageDiscover(ctx);
    discovery = out.discovery;
    flatness = out.flatness;
    // Blast-radius guard BEFORE any fetch or PDS write.
    assertBlastRadius(discovery.vanishedCount, discovery.activeLedgerCount);
    await stageFetch(ctx, discovery);
    stageTransform(ctx, [...discovery.newPages, ...discovery.changed].map((p) => p.pageid));
  }

  const plan = stagePlan(ctx, discovery, reparseTargets);
  writePlanFiles(ctx.runDir, plan);

  let repoRev: string | null = null;
  let published = false;
  if (opts.publish) {
    repoRev = await stagePublish(ctx, plan);
    published = true;
  }

  const counts: RunCounts = {
    new: discovery?.newPages.length ?? 0,
    changed: discovery?.changed.length ?? 0,
    unchanged: discovery?.unchanged.length ?? 0,
    decategorised: discovery?.decategorised.length ?? 0,
    deleted: discovery?.deleted.length ?? 0,
    skipped: led.allWithStatus('skipped').length,
  };
  const pdsWrites = plan.counts.create + plan.counts.update + (published ? plan.counts.delete : 0);
  led.finishRun(runNumId, { counts, wikiRequests: ctx.client.requestCount, pdsWrites: published ? pdsWrites : 0 });

  const allRows = led.all();
  const decatTitles = (discovery?.decategorised ?? []).map((id) => led.get(id)?.title ?? String(id));

  const summary: RunSummary = {
    runId: ctx.runId,
    mode: opts.reparse ? 'reparse' : opts.publish ? 'run(publish)' : 'run(dry)',
    ownerDecisions: {
      O1: 'tools/wikibooks/ inside arecipe (isolated, zero runtime deps)',
      O2: `${ctx.cfg.license?.id ?? 'UNSET — BLOCKS PUBLISH'} (${ctx.cfg.license?.attribution ?? ''})`,
      O3: '(c) fork-on-edit — record shape carries provenance forward',
      O4: ctx.cfg.publish?.handle ?? 'arecipe.bsky.social (service/app-password unset → publish blocked)',
    },
    corpusSize: allRows.length,
    publishable: allRows.filter((r) => r.status === 'active').length,
    skipped: allRows.filter((r) => r.status === 'skipped').length,
    skippedReasons: skipReasonHistogram(led),
    parseFlagFrequency: parseFlagFrequency(ctx),
    wikiRequests: ctx.client.requestCount,
    pdsWrites: published ? pdsWrites : 0,
    wallMs: ctx.clock.now() - start,
    repoRev,
    planCounts: plan.counts,
    enrichment: enrichmentCounts(plan.items),
    published,
  };
  if (discovery !== undefined) {
    summary.discovery = {
      new: counts.new, changed: counts.changed, unchanged: counts.unchanged,
      decategorised: counts.decategorised, deleted: counts.deleted,
      decategorisedTitles: decatTitles, namespaceId: discovery.namespaceId,
    };
  }
  if (flatness !== undefined) summary.flatness = flatness;

  mkdirSync(ctx.runDir, { recursive: true });
  writeFileSync(join(ctx.runDir, 'summary.json'), canonicalJsonPretty(summary) + '\n');
  return summary;
};

/** Human-readable run report (stdout + the run summary file consumer). */
export const renderSummary = (s: RunSummary): string => {
  const L: string[] = [];
  L.push(`wbsync ${s.mode} — run ${s.runId}`);
  L.push('');
  L.push('Owner decisions:');
  L.push(`  O1 ${s.ownerDecisions.O1}`);
  L.push(`  O2 ${s.ownerDecisions.O2}`);
  L.push(`  O3 ${s.ownerDecisions.O3}`);
  L.push(`  O4 ${s.ownerDecisions.O4}`);
  L.push('');
  if (s.discovery) {
    L.push(
      `Discovery (ns ${s.discovery.namespaceId}): new ${s.discovery.new} · changed ${s.discovery.changed} · ` +
        `unchanged ${s.discovery.unchanged} · decategorised ${s.discovery.decategorised} · deleted ${s.discovery.deleted}`,
    );
    for (const t of s.discovery.decategorisedTitles) L.push(`  ⚠ decategorised: ${t}`);
  }
  if (s.flatness) L.push(`Flatness: ${s.flatness.note}`);
  L.push('');
  L.push(`Corpus ${s.corpusSize} · publishable ${s.publishable} · skipped ${s.skipped}`);
  if (Object.keys(s.skippedReasons).length > 0) {
    L.push('Skipped by reason:');
    for (const [r, n] of Object.entries(s.skippedReasons).sort((a, b) => b[1] - a[1])) L.push(`  ${n}× ${r}`);
  }
  if (s.parseFlagFrequency.length > 0) {
    L.push('parseFlag frequency:');
    for (const [code, n] of s.parseFlagFrequency) L.push(`  ${n}× ${code}`);
  }
  L.push('');
  L.push(`Plan: +${s.planCounts.create} create · ~${s.planCounts.update} update · -${s.planCounts.delete} retract`);
  const e = s.enrichment;
  L.push(
    `Enrichment (of planned): diet ${e.diet} · category ${e.recipeCategory} · cuisine ${e.recipeCuisine} · ` +
      `keywords ${e.keywords} · nutrition ${e.nutrition} · cookingMethod ${e.cookingMethod} · dishKey ${e.dishKey} · images ${e.embed}`,
  );
  L.push(`Wiki requests ${s.wikiRequests} · PDS writes ${s.pdsWrites} · wall ${s.wallMs}ms`);
  L.push(`Repo rev: ${s.repoRev ?? '(dry run — nothing published)'}`);
  return L.join('\n') + '\n';
};
