// D10/D11 — record mapping idempotency + delta application. Dry-run is the
// DEFAULT: publishing needs an explicit --publish AND a plan produced in the same
// run. Creates/updates apply before retractions so a mid-run failure never leaves
// holes. Sequential putRecord (idempotent) makes resume safe.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildPlan,
  planToWrites,
  writePlanFiles,
  applyPlan,
  assertPlanExists,
  NoPlanError,
  type PlanItem,
  type PdsClient,
} from '../src/publish/publish.ts';
import type { RecipeRecord } from '../src/publish/record.ts';

const scratch = () => mkdtempSync(join(tmpdir(), 'wbpub-'));

const rec = (name: string): RecipeRecord => ({
  $type: 'exchange.recipe.recipe',
  name,
  text: 'x',
  ingredients: ['a'],
  instructions: ['b'],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  sourceUrl: 'https://en.wikibooks.org/wiki/Cookbook:X',
  sourcePermalink: 'https://en.wikibooks.org/w/index.php?oldid=1',
  sourceRevId: 1,
  sourceHistoryUrl: 'https://en.wikibooks.org/w/index.php?title=Cookbook:X&action=history',
  retrievedAt: '2026-07-23T00:00:00Z',
  license: { id: 'CC-BY-SA-4.0', token: 'licenseCreativeCommonsBySa', attribution: 'x' },
  wikibooks: { pageid: 1, parseFlags: [] },
});

const sampleItems = (): PlanItem[] => [
  { action: 'create', pageid: 1, rkey: 'wb-1', collection: 'exchange.recipe.recipe', value: rec('One') },
  { action: 'update', pageid: 2, rkey: 'wb-2', collection: 'exchange.recipe.recipe', value: rec('Two') },
  { action: 'delete', pageid: 3, rkey: 'wb-3', collection: 'exchange.recipe.recipe', reason: 'decategorised' },
  { action: 'delete', pageid: 4, rkey: 'wb-4', collection: 'exchange.recipe.recipe', reason: 'deleted' },
];

type Call = { kind: 'put' | 'delete'; rkey: string };

const makeFakePds = (throwAfter?: number): { pds: PdsClient; calls: Call[] } => {
  const calls: Call[] = [];
  let rev = 0;
  const pds: PdsClient = {
    async putRecord(_repo, _collection, rkey) {
      if (throwAfter !== undefined && calls.length >= throwAfter) throw new Error('simulated PDS failure');
      calls.push({ kind: 'put', rkey });
      rev++;
      return { cid: `cid-${rkey}`, uri: `at://repo/${rkey}` };
    },
    async deleteRecord(_repo, _collection, rkey) {
      if (throwAfter !== undefined && calls.length >= throwAfter) throw new Error('simulated PDS failure');
      calls.push({ kind: 'delete', rkey });
      rev++;
    },
    async currentRev() {
      return `rev-${rev}`;
    },
  };
  return { pds, calls };
};

test('buildPlan tallies counts and samples up to three diffs', () => {
  const plan = buildPlan(sampleItems(), { runId: 'r1' });
  assert.deepEqual(plan.counts, { create: 1, update: 1, delete: 2 });
  assert.ok(plan.samples.length <= 3 && plan.samples.length >= 1);
});

test('planToWrites orders creates/updates BEFORE retractions', () => {
  const writes = planToWrites(buildPlan(sampleItems(), { runId: 'r1' }));
  const actions = writes.map((w) => w.action);
  const lastNonDelete = actions.lastIndexOf('create') > actions.lastIndexOf('update')
    ? actions.lastIndexOf('create')
    : actions.lastIndexOf('update');
  const firstDelete = actions.indexOf('delete');
  assert.ok(lastNonDelete < firstDelete, 'all creates/updates precede any delete');
});

test('dry run writes plan.json + a human summary and performs ZERO PDS writes', () => {
  const runDir = join(scratch(), 'runs', 'r1');
  const plan = buildPlan(sampleItems(), { runId: 'r1' });
  writePlanFiles(runDir, plan);
  assert.ok(existsSync(join(runDir, 'plan.json')));
  assert.ok(existsSync(join(runDir, 'summary.txt')));
  const onDisk = JSON.parse(readFileSync(join(runDir, 'plan.json'), 'utf8'));
  assert.deepEqual(onDisk.counts, { create: 1, update: 1, delete: 2 });
  // The plan is exactly the ledger diff we handed in — no more, no less.
  assert.deepEqual(onDisk.items.map((i: PlanItem) => [i.action, i.rkey]), [
    ['create', 'wb-1'], ['update', 'wb-2'], ['delete', 'wb-3'], ['delete', 'wb-4'],
  ]);
});

test('applyPlan applies creates/updates then deletes, and records the commit rev', async () => {
  const runDir = join(scratch(), 'runs', 'r1');
  const plan = buildPlan(sampleItems(), { runId: 'r1' });
  writePlanFiles(runDir, plan);
  const { pds, calls } = makeFakePds();
  const res = await applyPlan(pds, 'did:example:cook', plan, runDir);
  assert.deepEqual(calls, [
    { kind: 'put', rkey: 'wb-1' },
    { kind: 'put', rkey: 'wb-2' },
    { kind: 'delete', rkey: 'wb-3' },
    { kind: 'delete', rkey: 'wb-4' },
  ]);
  assert.match(res.commitRev, /^rev-/);
  assert.equal(res.applied, 4);
});

test('--publish is refused unless a plan was produced this run', () => {
  const runDir = join(scratch(), 'runs', 'r1');
  assert.throws(() => assertPlanExists(runDir), NoPlanError);
  writePlanFiles(runDir, buildPlan(sampleItems(), { runId: 'r1' }));
  assert.doesNotThrow(() => assertPlanExists(runDir));
});

test('a mid-run PDS failure resumes without duplicating already-applied creates', async () => {
  const runDir = join(scratch(), 'runs', 'r1');
  const plan = buildPlan(sampleItems(), { runId: 'r1' });
  writePlanFiles(runDir, plan);

  // First attempt fails after 2 writes (wb-1, wb-2 applied).
  const first = makeFakePds(2);
  await assert.rejects(applyPlan(first.pds, 'did:example:cook', plan, runDir), /simulated PDS failure/);
  assert.deepEqual(first.calls.map((c) => c.rkey), ['wb-1', 'wb-2']);

  // Resume: the two applied creates/updates must NOT be re-sent.
  const second = makeFakePds();
  const res = await applyPlan(second.pds, 'did:example:cook', plan, runDir);
  assert.deepEqual(second.calls.map((c) => c.rkey), ['wb-3', 'wb-4'], 'only the un-applied writes replay');
  assert.equal(res.applied, 4, 'total applied across both attempts');
});
