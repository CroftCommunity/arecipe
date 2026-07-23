import { Rng } from './rng.ts';
import {
  ENTRY,
  FEATURES,
  GEO,
  type Geo,
  type Page,
  TIMINGS,
  TRANSITIONS,
} from './sitemap.ts';

// ── Ground-truth corpus types ───────────────────────────────────────────────
// A session is an ORDERED sequence of events tied to a device identity. This is
// the oracle. In the real system none of the ordering/device/timestamp detail
// ever leaves the device — here it exists only so experiments can score what the
// counter design recovers against what actually happened.

export type PageEvent = { kind: 'page'; page: Page; t: number };
export type FeatureEvent = {
  kind: 'feature';
  name: string;
  page: Page;
  label: string;
  t: number;
};
export type TimingEvent = {
  kind: 'timing';
  name: string;
  page: Page;
  ms: number;
  t: number;
};
export type CorpusEvent = PageEvent | FeatureEvent | TimingEvent;

export interface Session {
  id: number;
  /** Ground-truth device identity (the re-linkage oracle for E3). */
  deviceId: string;
  geo: Geo;
  /** Simulated source IP the transport would expose to a naive receiver. */
  ip: string;
  /** ms since an arbitrary epoch; monotonic within the corpus (E3 ordering oracle). */
  startedAt: number;
  events: CorpusEvent[];
}

export interface Corpus {
  meta: {
    seed: number;
    profile: Profile;
    sessions: number;
    devices: number;
    generatedWith: string;
  };
  sessions: Session[];
}

export type Profile = 'small' | 'medium';

export interface CorpusOptions {
  seed: number;
  profile: Profile;
  /** Explicit session count overrides the profile's sampled size. */
  sessions?: number;
  /** Path-length distribution as integer-weighted lengths. */
  pathLengths?: { len: number; weight: number }[];
}

// Profile session-count ranges are STAND-INS (owner supplies real monthly
// numbers later). small ≈ personal site; medium ≈ order 50k/month.
const PROFILE_RANGE: Record<Profile, [number, number]> = {
  small: [100, 1000],
  medium: [40_000, 60_000],
};

// Default path-length distribution — most sessions are short, a tail runs long.
const DEFAULT_PATH_LENGTHS = [
  { len: 1, weight: 12 },
  { len: 2, weight: 30 },
  { len: 3, weight: 26 },
  { len: 4, weight: 16 },
  { len: 5, weight: 9 },
  { len: 6, weight: 5 },
  { len: 8, weight: 2 },
];

// Roughly one device per ~2.5 sessions (returning users). Stand-in.
const SESSIONS_PER_DEVICE = 2.5;

function nextPage(rng: Rng, from: Page): Page {
  const opts = TRANSITIONS[from];
  const idx = rng.weighted(opts.map((o) => o.weight));
  return opts[idx]!.to;
}

function buildEvents(rng: Rng, pathLen: number): CorpusEvent[] {
  const events: CorpusEvent[] = [];
  let t = 0;
  // Entry page.
  const entryIdx = rng.weighted(ENTRY.map((e) => e.weight));
  let page: Page = ENTRY[entryIdx]!.page;

  for (let step = 0; step < pathLen; step++) {
    t += rng.int(200, 4000);
    events.push({ kind: 'page', page, t });

    // Timings on this page (coarse ms).
    for (const name of TIMINGS[page]) {
      if (rng.next() < 0.7) {
        events.push({ kind: 'timing', name, page, ms: rng.int(80, 2500), t: t + 1 });
      }
    }
    // Feature touches on this page.
    for (const f of FEATURES[page]) {
      if (rng.next() < 0.28) {
        t += rng.int(300, 5000);
        events.push({ kind: 'feature', name: f.name, page, label: f.label, t });
      }
    }
    if (step < pathLen - 1) page = nextPage(rng, page);
  }
  return events;
}

function sampleSessionCount(rng: Rng, profile: Profile): number {
  const [lo, hi] = PROFILE_RANGE[profile];
  return rng.int(lo, hi);
}

export function generateCorpus(opts: CorpusOptions): Corpus {
  const rng = new Rng(opts.seed);
  const count = opts.sessions ?? sampleSessionCount(rng, opts.profile);
  const lengths = opts.pathLengths ?? DEFAULT_PATH_LENGTHS;
  const lengthWeights = lengths.map((l) => l.weight);

  const deviceCount = Math.max(1, Math.round(count / SESSIONS_PER_DEVICE));

  const sessions: Session[] = [];
  let clock = 1_700_000_000_000; // fixed epoch — no wall clock
  for (let i = 0; i < count; i++) {
    // Device assignment: pick from a fixed device pool so re-linkage is possible.
    const deviceNum = rng.int(0, deviceCount - 1);
    const deviceId = `dev-${deviceNum.toString(36).padStart(4, '0')}`;
    const geo = GEO[rng.int(0, GEO.length - 1)]!;
    // A device sticks to a subnet; last octet varies (DHCP churn).
    const subnet = deviceNum % 254;
    const ip = `10.${(deviceNum >> 8) % 254}.${subnet}.${rng.int(1, 254)}`;

    clock += rng.int(1000, 90_000);
    const pathLen = lengths[rng.weighted(lengthWeights)]!.len;
    sessions.push({
      id: i,
      deviceId,
      geo,
      ip,
      startedAt: clock,
      events: buildEvents(rng, pathLen),
    });
  }

  const devices = new Set(sessions.map((s) => s.deviceId)).size;
  return {
    meta: {
      seed: opts.seed,
      profile: opts.profile,
      sessions: count,
      devices,
      generatedWith: 'measure-proof/corpus@E0',
    },
    sessions,
  };
}

/**
 * Stable, canonical serialisation for byte-identical comparison. Keys are
 * emitted in a fixed order so two runs of the same seed compare equal as strings.
 */
export function serializeCorpus(c: Corpus): string {
  return JSON.stringify(c);
}
