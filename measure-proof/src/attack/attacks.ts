import type { NaiveStore, Observable } from './store.ts';

const c2 = (n: number): number => (n * (n - 1)) / 2;

/** Counters present in fewer than `maxFrac` of flushes — the identifying rarities. */
export function rareCounters(obs: Observable[], maxFrac: number): Set<string> {
  const freq = new Map<string, number>();
  for (const o of obs) for (const k of Object.keys(o.counts)) freq.set(k, (freq.get(k) ?? 0) + 1);
  const limit = maxFrac * obs.length;
  const rare = new Set<string>();
  for (const [k, f] of freq) if (f > 0 && f < limit) rare.add(k);
  return rare;
}

function linkageKey(o: Observable, rare: Set<string>): string {
  // Finest available quasi-identifier: raw IP /24 if present, else coarse geo +
  // the record's rare-counter signature (the attacker's best fallback).
  if (o.ip) return 'ip:' + o.ip.split('.').slice(0, 3).join('.');
  const sig = Object.keys(o.counts)
    .filter((k) => rare.has(k))
    .sort()
    .join(',');
  return `geo:${o.geo}|sig:${sig || '∅'}`;
}

export interface LinkScore {
  precision: number;
  recall: number;
  f1: number;
  clusters: number;
}

/** A1 — group flushes belonging to the same device. Pairwise precision/recall vs the oracle. */
export function a1Relink(store: NaiveStore, rareFrac = 0.05): LinkScore {
  const rare = rareCounters(store.obs, rareFrac);
  const clusters = new Map<string, number[]>();
  store.obs.forEach((o, i) => {
    const k = linkageKey(o, rare);
    (clusters.get(k) ?? clusters.set(k, []).get(k)!).push(i);
  });

  let tp = 0;
  let tpFp = 0;
  for (const idxs of clusters.values()) {
    tpFp += c2(idxs.length);
    const byDev = new Map<string, number>();
    for (const i of idxs) {
      const d = store.oracle[i]!.device;
      byDev.set(d, (byDev.get(d) ?? 0) + 1);
    }
    for (const cnt of byDev.values()) tp += c2(cnt);
  }
  const byDevTotal = new Map<string, number>();
  for (const o of store.oracle) byDevTotal.set(o.device, (byDevTotal.get(o.device) ?? 0) + 1);
  let tpFn = 0;
  for (const cnt of byDevTotal.values()) tpFn += c2(cnt);

  const precision = tpFp > 0 ? tp / tpFp : 1;
  const recall = tpFn > 0 ? tp / tpFn : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  return { precision, recall, f1, clusters: clusters.size };
}

/**
 * A2 — given flushes linked to a device (oracle grouping, to isolate ordering
 * ability), recover session order from observed signals. Score = fraction of
 * adjacent pairs ordered correctly vs true session order. 0.5 ≈ chance.
 */
export function a2Reorder(store: NaiveStore): { accuracy: number; devicesScored: number } {
  const byDev = new Map<string, number[]>();
  store.oracle.forEach((o, i) => {
    (byDev.get(o.device) ?? byDev.set(o.device, []).get(o.device)!).push(i);
  });
  let correct = 0;
  let total = 0;
  let devicesScored = 0;
  for (const idxs of byDev.values()) {
    if (idxs.length < 2) continue;
    devicesScored++;
    // Observed order: receipt timestamp, then arrival seq as tiebreak.
    const observed = [...idxs].sort((a, b) => {
      const o = store.obs[a]!.receiptTs - store.obs[b]!.receiptTs;
      return o !== 0 ? o : store.obs[a]!.seq - store.obs[b]!.seq;
    });
    for (let i = 0; i + 1 < observed.length; i++) {
      const a = observed[i]!;
      const b = observed[i + 1]!;
      total++;
      if (store.oracle[a]!.order <= store.oracle[b]!.order) correct++;
    }
  }
  return { accuracy: total > 0 ? correct / total : 0, devicesScored };
}

export interface SingleOutResult {
  minCombo: number; // smallest number of dimensions that isolates any one contributor
  isolableAtMin: number; // records whose MINIMAL isolating combo has size == minCombo
  totalIsolable: number; // records isolable by some combo of size <= maxK (monotone in available dims)
  fractionIsolable: number;
  example: string[]; // an isolating predicate
}

/**
 * A3 — smallest combination of dimensions (coarse geo, rare-counter presence,
 * coarse time bucket) that isolates exactly one contributor.
 */
export function a3SingleOut(
  store: NaiveStore,
  opts: { rareFrac?: number; timeBucketMs?: number } = {},
): SingleOutResult {
  const rare = rareCounters(store.obs, opts.rareFrac ?? 0.05);
  const timeBucketMs = opts.timeBucketMs ?? 3_600_000; // 1h dimension granularity

  const featsOf = (o: Observable): string[] => {
    const f = [`geo=${o.geo}`, `tb=${Math.floor(o.receiptTs / timeBucketMs)}`];
    for (const k of Object.keys(o.counts)) if (rare.has(k)) f.push(`has=${k}`);
    return f;
  };

  // Index: feature → record indices matching it.
  const matchIdx = new Map<string, Set<number>>();
  const recFeats = store.obs.map(featsOf);
  recFeats.forEach((fs, i) => {
    for (const f of fs) (matchIdx.get(f) ?? matchIdx.set(f, new Set()).get(f)!).add(i);
  });

  const intersect = (feats: string[]): number => {
    let acc: Set<number> | null = null;
    for (const f of feats) {
      const s = matchIdx.get(f)!;
      if (acc === null) {
        acc = new Set(s);
      } else {
        const next = new Set<number>();
        for (const x of acc) if (s.has(x)) next.add(x);
        acc = next;
      }
      if (acc.size === 0) break;
    }
    return acc ? acc.size : 0;
  };

  const combos = (arr: string[], k: number): string[][] => {
    if (k === 0) return [[]];
    if (k > arr.length) return [];
    const [head, ...rest] = arr;
    return [
      ...combos(rest, k - 1).map((c) => [head!, ...c]),
      ...combos(rest, k),
    ];
  };

  const maxK = 3;
  // For each record, the size of its SMALLEST isolating combo (Infinity if none ≤ maxK).
  const perRecMinK: number[] = recFeats.map(() => Infinity);
  const perRecExample: (string[] | null)[] = recFeats.map(() => null);
  for (let i = 0; i < recFeats.length; i++) {
    for (let k = 1; k <= maxK; k++) {
      let found: string[] | null = null;
      for (const c of combos(recFeats[i]!, k)) {
        if (intersect(c) === 1) {
          found = c;
          break;
        }
      }
      if (found) {
        perRecMinK[i] = k;
        perRecExample[i] = found;
        break;
      }
    }
  }

  const minCombo = Math.min(...perRecMinK);
  const isolableAtMin = perRecMinK.filter((k) => k === minCombo).length;
  const totalIsolable = perRecMinK.filter((k) => k <= maxK).length;
  const exIdx = perRecMinK.findIndex((k) => k === minCombo);
  const example = exIdx >= 0 ? perRecExample[exIdx]! : [];
  return {
    minCombo: Number.isFinite(minCombo) ? minCombo : 0,
    isolableAtMin,
    totalIsolable,
    fractionIsolable: totalIsolable / (recFeats.length || 1),
    example,
  };
}
