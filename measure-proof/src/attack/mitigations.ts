import type { Corpus } from '../corpus/generate.ts';
import type { Registry } from '../registry/types.ts';
import { buildNaiveStore, type NaiveStore, type Observable } from './store.ts';

// The five mitigations from the directive, applied so each can be toggled
// independently and re-scored. `jitterMs` acts at store-build time (it changes
// arrival order); the rest are write-time transforms of the stored record.
export interface Mitigations {
  /** jittered flush schedule (0 = fixed prompt cadence). */
  jitterMs: number;
  /** IP discarded/truncated at the receiver before any write. Coarse geo is still derived first. */
  dropIp: boolean;
  /** coarse time bucketing of the receipt timestamp (ms; 0 = keep fine). */
  coarseTimeMs: number;
  /** minimum-count suppression at write time: drop counters below this count. */
  minCount: number;
}

export const NAIVE: Mitigations = { jitterMs: 0, dropIp: false, coarseTimeMs: 0, minCount: 0 };

export function buildScenario(
  corpus: Corpus,
  reg: Registry,
  mit: Mitigations,
  seed = 99,
): NaiveStore {
  const store = buildNaiveStore(corpus, reg, { jitterMs: mit.jitterMs, seed });
  const obs: Observable[] = store.obs.map((o) => {
    const next: Observable = { ...o, counts: { ...o.counts } };
    if (mit.dropIp) next.ip = null;
    if (mit.coarseTimeMs > 0) {
      next.receiptTs = Math.floor(o.receiptTs / mit.coarseTimeMs) * mit.coarseTimeMs;
    }
    if (mit.minCount > 0) {
      const kept: Record<string, number> = {};
      for (const [k, v] of Object.entries(next.counts)) if (v >= mit.minCount) kept[k] = v;
      next.counts = kept;
    }
    return next;
  });
  return { obs, oracle: store.oracle };
}
