import type { WirePayload } from './store.ts';

// sendBeacon caps queued data at 64 KiB. The client must decide — deliberately,
// not accidentally — what to do when a flush would exceed that. Here: chunk the
// counter bag into multiple payloads each under the cap. In practice a
// registry-bounded bag (tens of counters) never approaches 64 KiB; chunking is
// the tested fallback for a pathological cardinality.

export const BEACON_LIMIT = 65_536;

export function payloadBytes(payload: WirePayload): number {
  return Buffer.byteLength(JSON.stringify(payload), 'utf8');
}

export function fitsInBeacon(payload: WirePayload, maxBytes = BEACON_LIMIT): boolean {
  return payloadBytes(payload) <= maxBytes;
}

/**
 * Split a counter bag into one or more wire payloads, each ≤ maxBytes. Chosen
 * behavior: chunk (never silently drop). A single flush is returned unchanged if
 * it already fits.
 */
export function chunkFlush(
  counts: Record<string, number>,
  period: string,
  maxBytes = BEACON_LIMIT,
): WirePayload[] {
  const whole: WirePayload = { v: 1, period, counts };
  if (fitsInBeacon(whole, maxBytes)) return [whole];

  const names = Object.keys(counts);
  const chunks: WirePayload[] = [];
  // Track the byte size incrementally (O(n)) rather than re-serialising the
  // growing object each step. `base` is the empty-bag envelope; each entry adds
  // its `"name":value,` bytes (the trailing comma is a safe over-count).
  const base = payloadBytes({ v: 1, period, counts: {} });
  let current: Record<string, number> = {};
  let running = base;
  for (const name of names) {
    const entryBytes = Buffer.byteLength(JSON.stringify(name), 'utf8') + 1 +
      String(counts[name]!).length + 1;
    if (Object.keys(current).length > 0 && running + entryBytes > maxBytes) {
      chunks.push({ v: 1, period, counts: current });
      current = {};
      running = base;
    }
    current[name] = counts[name]!;
    running += entryBytes;
  }
  if (Object.keys(current).length > 0) chunks.push({ v: 1, period, counts: current });
  return chunks;
}
