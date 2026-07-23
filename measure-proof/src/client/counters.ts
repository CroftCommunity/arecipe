import type { MetricMeta } from '../registry/generate.ts';

// The counter client, as the generator would emit it. It keeps named counters
// (never logs) and, crucially, honors each metric's `expires` at RUNTIME from the
// bundled metadata — with no network and no server contact. A stale cached bundle
// therefore stops emitting a retired metric on its own, the moment the device
// clock passes the expiry (E6). `today` is injected so the proof stays
// deterministic and offline; the real client reads the device clock.

export class CounterClient {
  readonly #meta: Record<string, MetricMeta>;
  readonly #today: string;
  readonly #counts = new Map<string, number>();
  readonly #suppressed = new Set<string>();

  constructor(meta: Record<string, MetricMeta>, opts: { today: string }) {
    this.#meta = meta;
    this.#today = opts.today;
  }

  emit(name: string): void {
    const meta = this.#meta[name];
    if (!meta) {
      // Undeclared counters are caught at build time by the typed-call gate (E1);
      // at runtime an unknown name is simply never recorded.
      this.#suppressed.add(name);
      return;
    }
    // Runtime expiry: ISO dates compare correctly as strings.
    if (meta.expires < this.#today) {
      this.#suppressed.add(name);
      return;
    }
    this.#counts.set(name, (this.#counts.get(name) ?? 0) + 1);
  }

  wasSuppressed(name: string): boolean {
    return this.#suppressed.has(name);
  }

  counts(): Record<string, number> {
    return Object.fromEntries(this.#counts);
  }
}
