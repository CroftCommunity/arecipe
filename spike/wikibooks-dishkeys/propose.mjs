// wikibooks corpus dishKey alignment — pure proposal logic (ops tooling).
//
// Align the staged Wikibooks corpus onto the SAME dishKey keyspace the live
// arecipe.bsky.social records already use, reusing the ONE canonical deriver
// (spike/import/dishkeys.mjs — legal to import here; this is NOT inside the
// isolated tools/wikibooks/ tree). Nothing is mutated or published: this only
// classifies and proposes.
//
// The deriver is name-based. A live record's STORED dishKey wins (it was
// human-reviewed); we only derive a key for a live record that lacks one, so
// the keyspace we align against is complete.
import { normalizeDishKey } from '../import/dishkeys.mjs';

/**
 * The reviewer's export: the approved rkey->dishKey map. Start from the full
 * default map, then drop every corpus member of a DECLINED merge group (declined
 * = "not the same dish" → those recipes stay standalone, no dishKey). The inline
 * browser script in render.mjs implements this same rule.
 * @param {{proposedMap: Record<string,string>, mergeGroups: {key:string,corpus:{rkey:string}[]}[]}} proposal
 * @param {Iterable<string>} declinedKeys dishKeys of groups the reviewer declined
 */
export const computeApproved = (proposal, declinedKeys) => {
  const declined = new Set(declinedKeys);
  const approved = { ...proposal.proposedMap };
  for (const g of proposal.mergeGroups) {
    if (declined.has(g.key)) for (const c of g.corpus) delete approved[c.rkey];
  }
  return approved;
};

/** Bucket helper: push v onto map[k], creating the array. */
const pushInto = (map, k, v) => {
  const arr = map.get(k);
  if (arr === undefined) map.set(k, [v]);
  else arr.push(v);
};

/**
 * @param {{ live: {rkey?:string,uri?:string,name:string,dishKey?:string|null}[],
 *           corpus: {rkey:string,name:string}[] }} input
 */
export const buildProposal = ({ live, corpus }) => {
  // Live keyspace: stored dishKey preferred, derived only when absent.
  const liveGroups = new Map(); // key -> [name]
  for (const r of live) {
    const key = (r.dishKey ?? '').trim() !== '' ? r.dishKey.trim() : normalizeDishKey(r.name ?? '');
    if (key === '') continue;
    pushInto(liveGroups, key, r.name);
  }

  // Corpus derived keys, keyed by derived dishKey.
  const corpusGroups = new Map(); // key -> [{rkey,name}]
  for (const r of corpus) {
    const key = normalizeDishKey(r.name ?? '');
    pushInto(corpusGroups, key, { rkey: r.rkey, name: r.name });
  }

  // Classify each derived corpus key into one merge decision or singleton.
  const mergeGroups = [];
  const singletons = [];
  const proposedMap = {}; // rkey -> proposed dishKey (the default, pre-review)

  const sortedCorpusKeys = [...corpusGroups.keys()].sort();
  for (const key of sortedCorpusKeys) {
    const members = corpusGroups.get(key);
    const liveMembers = liveGroups.get(key) ?? [];
    if (liveMembers.length > 0) {
      mergeGroups.push({ key, kind: 'joins-existing', live: [...liveMembers], corpus: members });
      for (const m of members) proposedMap[m.rkey] = key;
    } else if (members.length >= 2) {
      mergeGroups.push({ key, kind: 'new-corpus', live: [], corpus: members });
      for (const m of members) proposedMap[m.rkey] = key;
    } else {
      const only = members[0];
      singletons.push({ rkey: only.rkey, name: only.name, key });
      proposedMap[only.rkey] = key;
    }
  }

  // Near-miss: a key K that is `${J}-…` may be a too-specific variant of J.
  // Considered across the whole keyspace (live + corpus) so a corpus variant
  // can flag a merge into a live base dish. Deterministic ordering.
  const allKeys = [...new Set([...liveGroups.keys(), ...corpusGroups.keys()])].sort();
  const nearMiss = [];
  for (const specific of allKeys) {
    for (const general of allKeys) {
      if (specific !== general && specific.startsWith(`${general}-`)) nearMiss.push({ specific, general });
    }
  }

  const joinsExisting = mergeGroups.filter((m) => m.kind === 'joins-existing').reduce((a, m) => a + m.corpus.length, 0);
  const newGroups = mergeGroups.filter((m) => m.kind === 'new-corpus').length;

  return {
    counts: {
      corpus: corpus.length,
      live: live.length,
      distinctCorpusKeys: corpusGroups.size,
      joinsExisting,
      newGroups,
      singletons: singletons.length,
      mergeGroups: mergeGroups.length,
      nearMiss: nearMiss.length,
    },
    mergeGroups,
    singletons,
    nearMiss,
    proposedMap,
  };
};
