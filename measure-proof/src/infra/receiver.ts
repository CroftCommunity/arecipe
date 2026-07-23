import type { WirePayload } from '../client/store.ts';

// A logical model of the canonical SQLite receiver, just enough to exercise the
// destroy/restore drill invariant (E7). `replicate()` stands in for Litestream
// pushing WAL up to a point; `restore()` rebuilds from that replicated snapshot.
// STAND-IN: this is not real SQLite/Litestream/R2 — it models the invariant that
// matters (committed-before-replication data survives; the at-risk window is the
// unreplicated tail, and its loss is bounded and explicit, never silent).

type PeriodCounts = Record<string, Record<string, number>>; // period → name → count

export interface ReceiverSnapshot {
  replicatedAt: number; // ingest sequence number captured by the last replication
  data: PeriodCounts;
}

export class ReceiverStore {
  #data: PeriodCounts = {};
  #seq = 0;
  #lastReplicated: ReceiverSnapshot = { replicatedAt: 0, data: {} };

  ingest(payload: WirePayload): void {
    this.#seq++;
    const period = (this.#data[payload.period] ??= {});
    for (const [name, count] of Object.entries(payload.counts)) {
      period[name] = (period[name] ?? 0) + count;
    }
  }

  /** Litestream has pushed WAL up to the current sequence — capture that point. */
  replicate(): ReceiverSnapshot {
    this.#lastReplicated = {
      replicatedAt: this.#seq,
      data: structuredClone(this.#data),
    };
    return this.#lastReplicated;
  }

  total(period: string, name: string): number {
    return this.#data[period]?.[name] ?? 0;
  }

  /** Rebuild a fresh box from a replicated snapshot after the old one is destroyed. */
  static restore(snapshot: ReceiverSnapshot): ReceiverStore {
    const store = new ReceiverStore();
    store.#data = structuredClone(snapshot.data);
    store.#seq = snapshot.replicatedAt;
    store.#lastReplicated = snapshot;
    return store;
  }
}
