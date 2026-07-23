// wikibooks corpus dishKey alignment — pure proposal logic (ops tooling).
//   node --test spike/wikibooks-dishkeys/propose.test.mjs
//
// The proposal aligns the staged Wikibooks corpus onto the SAME dishKey keyspace
// the live arecipe.bsky.social records already use, reusing the one canonical
// deriver (spike/import/dishkeys.mjs). It classifies each corpus recipe and
// surfaces only the MERGE decisions (joins-existing + new-corpus groups) for
// human review — singletons need no decision.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildProposal, computeApproved } from './propose.mjs';

const live = [
  { rkey: 'L1', name: 'Classic Moist Banana Bread', dishKey: 'banana-bread' },
  { rkey: 'L2', name: "Grandma's Banana Bread", dishKey: 'banana-bread' },
  { rkey: 'L3', name: 'Bouillabaisse', dishKey: 'bouillabaisse' },
  // a live record missing a stored key — the proposal derives it so the
  // keyspace is complete
  { rkey: 'L4', name: 'Pad Thai', dishKey: null },
];

const corpus = [
  { rkey: 'wb-1', name: 'Banana Bread with Walnuts' }, // derives banana-bread → JOINS live
  { rkey: 'wb-2', name: 'Bouillabaisse' }, // JOINS live
  { rkey: 'wb-3', name: 'Simple Nachos' }, // new-corpus group with wb-4
  { rkey: 'wb-4', name: 'Easy Nachos' }, // new-corpus group with wb-3
  { rkey: 'wb-5', name: 'Injera (Ethiopian Flatbread)' }, // singleton
];

test('a corpus recipe whose derived key matches a live stored key is classified joins-existing', () => {
  const p = buildProposal({ live, corpus });
  const g = p.mergeGroups.find((m) => m.key === 'banana-bread');
  assert.ok(g, 'expected a banana-bread merge group');
  assert.equal(g.kind, 'joins-existing');
  assert.deepEqual(
    g.corpus.map((c) => c.rkey),
    ['wb-1'],
  );
  assert.ok(g.live.includes('Classic Moist Banana Bread'));
});

test('two corpus recipes sharing a derived key with no live counterpart form a new-corpus group', () => {
  const p = buildProposal({ live, corpus });
  const g = p.mergeGroups.find((m) => m.key === 'nachos');
  assert.ok(g, 'expected a nachos merge group');
  assert.equal(g.kind, 'new-corpus');
  assert.equal(g.live.length, 0);
  assert.deepEqual(
    g.corpus.map((c) => c.rkey).sort(),
    ['wb-3', 'wb-4'],
  );
});

test('a corpus recipe with a unique key and no live match is a singleton, not a merge group', () => {
  const p = buildProposal({ live, corpus });
  assert.ok(!p.mergeGroups.some((m) => m.corpus.some((c) => c.rkey === 'wb-5')), 'singleton must not appear in a merge group');
  assert.ok(p.singletons.some((s) => s.rkey === 'wb-5'));
});

test('the proposed map covers every corpus rkey exactly once (singletons + merge members)', () => {
  const p = buildProposal({ live, corpus });
  const keys = Object.keys(p.proposedMap);
  assert.equal(keys.length, corpus.length);
  for (const c of corpus) assert.ok(c.rkey in p.proposedMap, `${c.rkey} missing from proposedMap`);
  assert.equal(p.proposedMap['wb-2'], 'bouillabaisse');
});

test('counts summarise the review load', () => {
  const p = buildProposal({ live, corpus });
  assert.equal(p.counts.corpus, 5);
  assert.equal(p.counts.joinsExisting, 2); // wb-1, wb-2
  assert.equal(p.counts.newGroups, 1); // nachos
  assert.equal(p.counts.singletons, 1); // wb-5
});

test('near-miss detects a specific key that is a prefix-extension of a more general one', () => {
  const p = buildProposal({
    live: [],
    corpus: [
      { rkey: 'a', name: 'Caesar Salad' },
      { rkey: 'b', name: 'Caesar Salad Wrap' },
    ],
  });
  assert.ok(p.nearMiss.some((n) => n.general === 'caesar-salad' && n.specific === 'caesar-salad-wrap'));
});

test('computeApproved keeps all keys when nothing is declined', () => {
  const p = buildProposal({ live, corpus });
  const approved = computeApproved(p, []);
  assert.deepEqual(approved, p.proposedMap);
  assert.equal(approved['wb-2'], 'bouillabaisse');
});

test('computeApproved drops the corpus members of a declined group; singletons + other groups untouched', () => {
  const p = buildProposal({ live, corpus });
  const approved = computeApproved(p, ['nachos']); // decline the new-corpus nachos group
  assert.ok(!('wb-3' in approved), 'declined member dropped');
  assert.ok(!('wb-4' in approved), 'declined member dropped');
  assert.equal(approved['wb-2'], 'bouillabaisse', 'other merge group kept');
  assert.equal(approved['wb-5'], p.proposedMap['wb-5'], 'singleton kept');
});

test('deterministic: same input yields identical output', () => {
  const a = JSON.stringify(buildProposal({ live, corpus }));
  const b = JSON.stringify(buildProposal({ live, corpus }));
  assert.equal(a, b);
});
