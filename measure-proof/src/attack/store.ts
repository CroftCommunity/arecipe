import type { Corpus, Session } from '../corpus/generate.ts';
import { Rng } from '../corpus/rng.ts';
import { declaredEdgeMap } from '../flow/edges.ts';
import type { Registry } from '../registry/types.ts';

// The NAIVE receiver — the whole point of E3. It stores each flush exactly as a
// careless implementation would: the wire payload PLUS everything the transport
// hands it (source IP, receipt timestamp, arrival order). Coarse geo is derived
// from the IP at ingest. The attacker reads ONLY these observable fields; the
// ground-truth device identity and true session order are kept separate as the
// scoring oracle.

export interface Observable {
  seq: number; // arrival order at the receiver
  receiptTs: number; // receipt timestamp (fine unless coarsened)
  ip: string | null; // source IP (null once the IP-drop mitigation is on)
  geo: string; // coarse region derived from IP at ingest, then retained
  period: string;
  counts: Record<string, number>; // the wire bag (declared counters + `other`)
}

export interface Oracle {
  device: string; // true device identity
  order: number; // true session start time (ordering oracle)
}

export interface NaiveStore {
  obs: Observable[];
  oracle: Oracle[]; // parallel to obs by index
}

/** Counter bag for a session: declared page/feature/timing/edge counters + `other`. */
export function sessionCounts(session: Session, reg: Registry): Record<string, number> {
  const declaredEdges = declaredEdgeMap(reg);
  const counts: Record<string, number> = {};
  const bump = (k: string) => (counts[k] = (counts[k] ?? 0) + 1);
  const pages: string[] = [];
  for (const e of session.events) {
    if (e.kind === 'page') {
      bump(`page_${e.page}`);
      pages.push(e.page);
    } else if (e.kind === 'feature') {
      bump(`feat_${e.name}`);
    } else if (e.kind === 'timing') {
      if (e.name === 'load_ms') bump(`time_${e.page}_load`);
      else if (e.name === 'first_result_ms') bump(`time_${e.page}_first_result`);
    }
  }
  for (let i = 0; i + 1 < pages.length; i++) {
    const name = declaredEdges.get(`${pages[i]}->${pages[i + 1]}`);
    bump(name ?? 'other');
  }
  return counts;
}

function sessionEnd(session: Session): number {
  let maxT = 0;
  for (const e of session.events) if (e.t > maxT) maxT = e.t;
  return session.startedAt + maxT;
}

const IP_TO_GEO = ['eu-west', 'eu-north', 'us-east', 'us-west', 'apac'];

/**
 * Build the naive store: one flush per session (the realistic pagehide-flush
 * model — E5). `jitterMs > 0` models a jittered flush schedule; 0 is prompt
 * fixed-cadence flushing where arrival order tracks session order.
 */
export function buildNaiveStore(
  corpus: Corpus,
  reg: Registry,
  opts: { jitterMs: number; seed?: number },
): NaiveStore {
  const rng = new Rng(opts.seed ?? 99);
  const rows = corpus.sessions.map((s) => {
    const baseline = sessionEnd(s) + 300; // fixed transport delay
    const receiptTs = baseline + (opts.jitterMs > 0 ? rng.int(0, opts.jitterMs) : 0);
    // Attacker geolocates the IP to a region; here derive it deterministically.
    const geoIdx = (s.ip.split('.').reduce((a, b) => a + Number(b), 0)) % IP_TO_GEO.length;
    return {
      obs: {
        seq: 0,
        receiptTs,
        ip: s.ip,
        geo: IP_TO_GEO[geoIdx]!,
        period: '2026-07',
        counts: sessionCounts(s, reg),
      } as Observable,
      oracle: { device: s.deviceId, order: s.startedAt } as Oracle,
    };
  });
  // Arrival order = sort by receiptTs (jitter scrambles this away from session order).
  rows.sort((a, b) => a.obs.receiptTs - b.obs.receiptTs);
  rows.forEach((r, i) => (r.obs.seq = i));
  return { obs: rows.map((r) => r.obs), oracle: rows.map((r) => r.oracle) };
}
