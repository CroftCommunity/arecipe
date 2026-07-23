import { type Corpus, generateCorpus } from '../corpus/generate.ts';

// E8 — the rounding question, answered with numbers, not an argument.
//
// CNIL's recommended technical measure for anonymous statistics is to round
// counts to the nearest ten. The cost is the "dead-feature signal": once a
// lightly-used feature and a genuinely-unused one both round to 0, you can no
// longer tell which views are dead. This module measures exactly how much of
// that signal rounding destroys at each traffic level.

/** Round n to the nearest `step` (nearest-ten by default). */
export function roundTo(n: number, step: number): number {
  return Math.round(n / step) * step;
}

// Declared-but-unused features: counters the app declares to answer "is anyone
// using this?" but that receive zero traffic. STAND-IN — a real deployment's
// dead set is owner-supplied; here they model the genuinely-zero case the
// corpus's always-touched features cannot.
export const DEAD_FEATURES = [
  'feat_print',
  'feat_export_pdf',
  'feat_scale_batch',
  'feat_nutrition',
  'feat_voice_read',
] as const;

/**
 * Page + feature counters across the corpus, with the declared-dead features
 * included at their true count of 0. This is the universe of "which views /
 * features are used" that the owner reads.
 */
export function pageFeatureCounts(
  corpus: Corpus,
  deadNames: readonly string[] = DEAD_FEATURES,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const name of deadNames) counts[name] = 0;
  for (const s of corpus.sessions) {
    for (const e of s.events) {
      if (e.kind === 'page') {
        const k = `page_${e.page}`;
        counts[k] = (counts[k] ?? 0) + 1;
      } else if (e.kind === 'feature') {
        const k = `feat_${e.name}`;
        counts[k] = (counts[k] ?? 0) + 1;
      }
    }
  }
  return counts;
}

export interface RoundingAnalysis {
  total: number;
  /** Counters with a true count of 0. */
  dead: number;
  /** Live counters (true>0) whose rounded value is 0 (true count 1..step/2-1). */
  aliveRoundingToZero: number;
  /** Live counters that round clear of 0 (distinguishable from dead). */
  aliveDistinguishable: number;
  /**
   * The dead-feature signal is DESTROYED when at least one dead counter and at
   * least one live counter share the rounded value 0 — 0 no longer means "dead".
   */
  signalDestroyed: boolean;
}

export function analyzeRounding(
  counts: Record<string, number>,
  deadNames: readonly string[],
  step: number,
): RoundingAnalysis {
  const dead = new Set(deadNames);
  let deadCount = 0;
  let aliveRoundingToZero = 0;
  let aliveDistinguishable = 0;
  for (const [name, c] of Object.entries(counts)) {
    if (c === 0 || dead.has(name)) {
      deadCount++;
      continue;
    }
    if (roundTo(c, step) === 0) aliveRoundingToZero++;
    else aliveDistinguishable++;
  }
  return {
    total: Object.keys(counts).length,
    dead: deadCount,
    aliveRoundingToZero,
    aliveDistinguishable,
    signalDestroyed: deadCount > 0 && aliveRoundingToZero > 0,
  };
}

export interface ThresholdRow {
  sessions: number;
  aliveRoundingToZero: number;
  signalDestroyed: boolean;
}

export interface ThresholdResult {
  threshold: number; // smallest swept session count with the signal intact
  sweep: ThresholdRow[];
}

/**
 * Sweep session counts and find the smallest at which no live feature rounds to
 * 0 — i.e. every used feature clears the nearest-ten floor and 0 uniquely means
 * dead again.
 */
export function thresholdSessions(
  seed: number,
  deadNames: readonly string[],
  step: number,
): ThresholdResult {
  const sizes = [200, 400, 800, 1600, 3200, 6400, 12800, 25600, 51200];
  const sweep: ThresholdRow[] = [];
  let threshold = Infinity;
  for (const sessions of sizes) {
    const corpus = generateCorpus({ seed, profile: 'small', sessions });
    const a = analyzeRounding(pageFeatureCounts(corpus, deadNames), deadNames, step);
    const row = {
      sessions,
      aliveRoundingToZero: a.aliveRoundingToZero,
      signalDestroyed: a.signalDestroyed,
    };
    sweep.push(row);
    if (!row.signalDestroyed && threshold === Infinity) threshold = sessions;
  }
  return { threshold, sweep };
}
