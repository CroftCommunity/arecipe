import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseRegistry, generateClientSource } from '../../src/registry/index.ts';
import { BEACON_LIMIT, chunkFlush, fitsInBeacon, payloadBytes } from '../../src/client/flush.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');

describe('E5 — no-unload-listeners invariant', () => {
  const sources = [
    readFileSync(join(root, 'harness', 'client.js'), 'utf8'),
    readFileSync(join(root, 'harness', 'sw.js'), 'utf8'),
    generateClientSource(parseRegistry(readFileSync(join(root, 'registry', 'metrics.yaml'), 'utf8'))),
  ];

  it('no-unload-listeners', () => {
    for (const src of sources) {
      // No `unload`/`beforeunload` event registration anywhere in the client.
      expect(/addEventListener\(\s*['"]unload['"]/.test(src)).toBe(false);
      expect(/addEventListener\(\s*['"]beforeunload['"]/.test(src)).toBe(false);
      expect(/onunload/.test(src)).toBe(false);
      expect(/onbeforeunload/.test(src)).toBe(false);
    }
  });

  it('the client flushes on the bfcache-safe events (visibilitychange, pagehide)', () => {
    const client = readFileSync(join(root, 'harness', 'client.js'), 'utf8');
    expect(client).toMatch(/visibilitychange/);
    expect(client).toMatch(/pagehide/);
    expect(client).toMatch(/sendBeacon/);
  });
});

describe('E5 — 64 KiB sendBeacon ceiling behaviour', () => {
  it('a registry-sized bag is nowhere near the 64 KiB cap (one beacon)', () => {
    const counts: Record<string, number> = {};
    for (let i = 0; i < 40; i++) counts[`counter_${i}`] = i * 3;
    const chunks = chunkFlush(counts, '2026-07');
    expect(chunks.length).toBe(1);
    expect(payloadBytes(chunks[0]!)).toBeLessThan(2_000);
  });

  it('a pathological cardinality is CHUNKED (chosen behaviour), each chunk ≤ 64 KiB', () => {
    const counts: Record<string, number> = {};
    for (let i = 0; i < 20_000; i++) counts[`nav_page_${i}__to__page_${i + 1}`] = i;
    const whole = { v: 1 as const, period: '2026-07', counts };
    expect(fitsInBeacon(whole)).toBe(false); // would exceed the cap
    const chunks = chunkFlush(counts, '2026-07');
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(payloadBytes(c)).toBeLessThanOrEqual(BEACON_LIMIT);
    // Chunking preserves every counter (no silent drop).
    const merged: Record<string, number> = {};
    for (const c of chunks) Object.assign(merged, c.counts);
    expect(Object.keys(merged).length).toBe(20_000);
  });
});
