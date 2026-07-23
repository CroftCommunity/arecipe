// D11 — delta application. Dry-run is the DEFAULT: writePlanFiles produces
// runs/<runid>/plan.json (+ a human summary) with zero PDS writes. Publishing
// needs an explicit --publish AND a plan produced in the same run
// (assertPlanExists). Order: creates/updates first, retractions last, so a
// mid-run failure never leaves the corpus with holes. Sequential putRecord
// (idempotent) + apply-progress make resume safe — no SDK, no applyWrites
// dependency (the pinned "SDK" here is zero-dep raw XRPC; see MAPPING.md).
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalJsonPretty } from '../util/canonical-json.ts';
import type { RecipeRecord } from './record.ts';

export type PlanItem =
  | { action: 'create'; pageid: number; rkey: string; collection: string; value: RecipeRecord }
  | { action: 'update'; pageid: number; rkey: string; collection: string; value: RecipeRecord }
  | { action: 'delete'; pageid: number; rkey: string; collection: string; reason: 'decategorised' | 'deleted' };

export type Plan = {
  runId: string;
  items: PlanItem[];
  counts: { create: number; update: number; delete: number };
  samples: { rkey: string; action: string; name?: string; reason?: string }[];
};

export type PdsWrite =
  | { action: 'create' | 'update'; collection: string; rkey: string; value: RecipeRecord }
  | { action: 'delete'; collection: string; rkey: string };

export type PdsClient = {
  putRecord(
    repo: string,
    collection: string,
    rkey: string,
    value: RecipeRecord,
  ): Promise<{ cid: string; uri: string }>;
  deleteRecord(repo: string, collection: string, rkey: string): Promise<void>;
  currentRev(repo: string): Promise<string>;
  /** Upload raw image bytes, returning the blob ref (D15 images). Optional so
   *  existing fakes need not implement it. */
  uploadBlob?(bytes: Uint8Array, mimeType: string): Promise<import('./record.ts').BlobRef>;
};

export const buildPlan = (items: PlanItem[], opts: { runId: string }): Plan => {
  const counts = { create: 0, update: 0, delete: 0 };
  for (const it of items) counts[it.action]++;
  const samples = items.slice(0, 3).map((it) =>
    it.action === 'delete'
      ? { rkey: it.rkey, action: it.action, reason: it.reason }
      : { rkey: it.rkey, action: it.action, name: it.value.name },
  );
  return { runId: opts.runId, items, counts, samples };
};

/** Ordered writes: creates + updates first, deletes last. */
export const planToWrites = (plan: Plan): PdsWrite[] => {
  const writes: PdsWrite[] = [];
  for (const it of plan.items) {
    if (it.action !== 'delete') {
      writes.push({ action: it.action, collection: it.collection, rkey: it.rkey, value: it.value });
    }
  }
  for (const it of plan.items) {
    if (it.action === 'delete') writes.push({ action: 'delete', collection: it.collection, rkey: it.rkey });
  }
  return writes;
};

const humanSummary = (plan: Plan): string => {
  const lines: string[] = [];
  lines.push(`Plan for run ${plan.runId}`);
  lines.push(`  creates:    ${plan.counts.create}`);
  lines.push(`  updates:    ${plan.counts.update}`);
  lines.push(`  retractions:${plan.counts.delete}`);
  lines.push('');
  lines.push('Sampled operations:');
  for (const s of plan.samples) {
    lines.push(`  ${s.action.padEnd(7)} ${s.rkey}  ${s.name ?? s.reason ?? ''}`);
  }
  return lines.join('\n') + '\n';
};

export const writePlanFiles = (runDir: string, plan: Plan): void => {
  mkdirSync(runDir, { recursive: true });
  writeFileSync(join(runDir, 'plan.json'), canonicalJsonPretty(plan) + '\n');
  writeFileSync(join(runDir, 'summary.txt'), humanSummary(plan));
};

export class NoPlanError extends Error {
  constructor(runDir: string) {
    super(
      `refusing to publish: no plan.json in ${runDir}. Run a plan/dry-run first — ` +
        `--publish applies a plan produced in the same run, never an unseen diff.`,
    );
    this.name = 'NoPlanError';
  }
}

/** Guard for --publish: a plan must exist for this run. */
export const assertPlanExists = (runDir: string): void => {
  if (!existsSync(join(runDir, 'plan.json'))) throw new NoPlanError(runDir);
};

type ApplyProgress = { done: string[] };
const applyProgressPath = (runDir: string): string => join(runDir, 'apply-progress.json');

const readApplyProgress = (runDir: string): ApplyProgress => {
  const p = applyProgressPath(runDir);
  if (!existsSync(p)) return { done: [] };
  try {
    return { done: (JSON.parse(readFileSync(p, 'utf8')) as ApplyProgress).done ?? [] };
  } catch {
    return { done: [] };
  }
};

const writeMoved = (runDir: string, done: string[]): void => {
  mkdirSync(runDir, { recursive: true });
  writeFileSync(applyProgressPath(runDir), JSON.stringify({ done }, null, 2));
};

const writeKey = (w: PdsWrite): string => `${w.action}:${w.rkey}`;

export type ApplyResult = { commitRev: string; applied: number };

/**
 * Apply a plan to the PDS. Writes are applied in order (creates/updates first,
 * deletes last), each recorded in apply-progress.json immediately after it lands,
 * so a mid-run failure resumes without re-sending applied writes. putRecord is
 * idempotent, so even a re-sent write would be harmless.
 */
export const applyPlan = async (
  pds: PdsClient,
  repo: string,
  plan: Plan,
  runDir: string,
): Promise<ApplyResult> => {
  const writes = planToWrites(plan);
  const progress = readApplyProgress(runDir);
  const done = new Set(progress.done);
  let applied = done.size;
  for (const w of writes) {
    const key = writeKey(w);
    if (done.has(key)) continue;
    if (w.action === 'delete') await pds.deleteRecord(repo, w.collection, w.rkey);
    else await pds.putRecord(repo, w.collection, w.rkey, w.value);
    done.add(key);
    applied++;
    writeMoved(runDir, [...done]);
  }
  const commitRev = await pds.currentRev(repo);
  return { commitRev, applied };
};
