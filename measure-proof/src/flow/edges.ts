import type { Corpus } from '../corpus/generate.ts';
import type { Registry } from '../registry/types.ts';

/** Ordered page sequence of a session. */
export function pageSeq(events: { kind: string; page?: string }[]): string[] {
  return events.filter((e) => e.kind === 'page').map((e) => (e as { page: string }).page);
}

/** Map "from->to" → declared nav metric name, built from the registry edges. */
export function declaredEdgeMap(reg: Registry): Map<string, string> {
  const m = new Map<string, string>();
  for (const metric of reg.metrics) {
    if (metric.type === 'edge' && metric.from && metric.to) {
      m.set(`${metric.from}->${metric.to}`, metric.name);
    }
  }
  return m;
}

export interface EdgeCounts {
  /** name(nav_*) → count, declared edges only. */
  counters: Record<string, number>;
  /** Total undeclared transitions — volume, no identity. */
  other: number;
  /** All consecutive page pairs across the population. */
  total: number;
}

/**
 * Run the corpus through the declared edge counters. Declared transitions
 * increment their nav counter; everything else increments a single `other`
 * scalar. Crucially, `other` never records WHICH transition it was — it is
 * volume without identity. That is the design property under test.
 */
export function countEdges(corpus: Corpus, reg: Registry): EdgeCounts {
  const declared = declaredEdgeMap(reg);
  const counters: Record<string, number> = {};
  for (const name of declared.values()) counters[name] = 0;
  let other = 0;
  let total = 0;

  for (const s of corpus.sessions) {
    const pages = pageSeq(s.events);
    for (let i = 0; i + 1 < pages.length; i++) {
      total++;
      const key = `${pages[i]}->${pages[i + 1]}`;
      const name = declared.get(key);
      if (name) counters[name]!++;
      else other++;
    }
  }
  return { counters, other, total };
}

/** Bigram (first-order) edge multiset of a set of paths: "from->to" → count. */
export function edgeMultiset(paths: string[][]): Record<string, number> {
  const m: Record<string, number> = {};
  for (const path of paths) {
    for (let i = 0; i + 1 < path.length; i++) {
      const key = `${path[i]}->${path[i + 1]}`;
      m[key] = (m[key] ?? 0) + 1;
    }
  }
  return m;
}
