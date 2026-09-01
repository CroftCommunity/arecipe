import type { Corpus } from '../corpus/generate.ts';
import { pageSeq } from './edges.ts';

// First-order (bigram) flow model estimated from the aggregate. This is exactly
// what you can rebuild from a full set of edge counters plus an entry counter:
// no ordering beyond adjacency, no session identity. We then ask how faithfully
// this reconstructs the true distribution of whole journeys at each length.

export interface FirstOrderModel {
  entry: Map<string, number>; // p(first page)
  trans: Map<string, Map<string, number>>; // p(to | from)
}

export function firstOrderModel(corpus: Corpus): FirstOrderModel {
  const entryCount = new Map<string, number>();
  const transCount = new Map<string, Map<string, number>>();

  for (const s of corpus.sessions) {
    const pages = pageSeq(s.events);
    if (pages.length === 0) continue;
    entryCount.set(pages[0]!, (entryCount.get(pages[0]!) ?? 0) + 1);
    for (let i = 0; i + 1 < pages.length; i++) {
      const from = pages[i]!;
      const to = pages[i + 1]!;
      let row = transCount.get(from);
      if (!row) transCount.set(from, (row = new Map()));
      row.set(to, (row.get(to) ?? 0) + 1);
    }
  }

  const entryTotal = [...entryCount.values()].reduce((a, b) => a + b, 0);
  const entry = new Map<string, number>();
  for (const [k, v] of entryCount) entry.set(k, v / entryTotal);

  const trans = new Map<string, Map<string, number>>();
  for (const [from, row] of transCount) {
    const rowTotal = [...row.values()].reduce((a, b) => a + b, 0);
    const probs = new Map<string, number>();
    for (const [to, c] of row) probs.set(to, c / rowTotal);
    trans.set(from, probs);
  }
  return { entry, trans };
}

function predictedPathProb(model: FirstOrderModel, path: string[]): number {
  let p = model.entry.get(path[0]!) ?? 0;
  for (let i = 0; i + 1 < path.length; i++) {
    p *= model.trans.get(path[i]!)?.get(path[i + 1]!) ?? 0;
  }
  return p;
}

/** Total-variation distance between two distributions given as maps over a shared key set. */
function tvd(actual: Map<string, number>, predicted: Map<string, number>): number {
  const aTotal = [...actual.values()].reduce((a, b) => a + b, 0) || 1;
  const pTotal = [...predicted.values()].reduce((a, b) => a + b, 0) || 1;
  let sum = 0;
  for (const key of actual.keys()) {
    const a = (actual.get(key) ?? 0) / aTotal;
    const p = (predicted.get(key) ?? 0) / pTotal;
    sum += Math.abs(a - p);
  }
  return 0.5 * sum;
}

export interface DivergenceRow {
  lengthClass: '2' | '3' | '4+';
  paths: number; // distinct paths in the class
  sessions: number; // sessions contributing
  tvd: number; // session-weighted within-length TVD
}

/**
 * For each exact path length L>=2, compute the TVD between the true distribution
 * over length-L journeys and the first-order model's prediction (conditioned on
 * L, so the independent length draw cancels and only FLOW fidelity is measured).
 * Report grouped as 2 / 3 / 4+.
 */
export function divergenceByLength(corpus: Corpus): DivergenceRow[] {
  const model = firstOrderModel(corpus);

  // Bucket actual paths by exact length.
  const byLen = new Map<number, Map<string, number>>();
  for (const s of corpus.sessions) {
    const pages = pageSeq(s.events);
    if (pages.length < 2) continue;
    let m = byLen.get(pages.length);
    if (!m) byLen.set(pages.length, (m = new Map()));
    const key = pages.join('>');
    m.set(key, (m.get(key) ?? 0) + 1);
  }

  // Per exact length: distinct paths, session count, TVD.
  const perLen = new Map<number, { paths: number; sessions: number; tvd: number }>();
  for (const [len, actual] of byLen) {
    const predicted = new Map<string, number>();
    for (const key of actual.keys()) {
      predicted.set(key, predictedPathProb(model, key.split('>')));
    }
    const sessions = [...actual.values()].reduce((a, b) => a + b, 0);
    perLen.set(len, { paths: actual.size, sessions, tvd: tvd(actual, predicted) });
  }

  function classRow(cls: '2' | '3' | '4+', lens: number[]): DivergenceRow {
    let paths = 0;
    let sessions = 0;
    let weighted = 0;
    for (const len of lens) {
      const p = perLen.get(len);
      if (!p) continue;
      paths += p.paths;
      sessions += p.sessions;
      weighted += p.tvd * p.sessions;
    }
    return { lengthClass: cls, paths, sessions, tvd: sessions ? weighted / sessions : 0 };
  }

  const longLens = [...perLen.keys()].filter((l) => l >= 4).sort((a, b) => a - b);
  return [classRow('2', [2]), classRow('3', [3]), classRow('4+', longLens)];
}
