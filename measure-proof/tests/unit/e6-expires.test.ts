import { describe, expect, it } from 'vitest';
import { buildMeta, lintExpired, parseRegistry } from '../../src/registry/index.ts';
import { CounterClient } from '../../src/client/counters.ts';

// A registry with one live and one already-retired metric. `retired_one` expired
// on 2026-07-22; the run date is 2026-07-23.
const YAML = `
metrics:
  live_one:
    type: feature
    description: still live
    expires: 2027-01-01
    disclosure: "a live feature was used"
  retired_one:
    type: feature
    description: retired yesterday
    expires: 2026-07-22
    disclosure: "a retired feature was used"
`;

describe('E6 — expires honored at runtime in the generated client', () => {
  it('does not increment an expired metric — no network, no server contact', () => {
    const reg = parseRegistry(YAML);
    const client = new CounterClient(buildMeta(reg), { today: '2026-07-23' });
    client.emit('live_one');
    client.emit('retired_one'); // expired → must be a no-op
    client.emit('live_one');
    client.emit('retired_one'); // expired → must be a no-op
    // The retired counter never appears in the bag at all.
    expect(client.counts()).toEqual({ live_one: 2 });
    expect(client.wasSuppressed('retired_one')).toBe(true);
  });

  it('build-time lint flags the expired metric; strict mode would fail the build', () => {
    const reg = parseRegistry(YAML);
    const lint = lintExpired(reg, '2026-07-23');
    expect(lint.expired).toEqual(['retired_one']);
    expect(lint.warnings[0]).toMatch(/retired_one/);
    // Same registry, an earlier build date: nothing expired yet.
    expect(lintExpired(reg, '2026-07-01').expired).toEqual([]);
  });

  it('stale-service-worker case: advancing the clock past expiry stops emission with NO bundle change', () => {
    const reg = parseRegistry(YAML);
    const meta = buildMeta(reg); // the "cached bundle" — identical in both clients
    // Old clock, before expiry: the retired metric still emits.
    const before = new CounterClient(meta, { today: '2026-07-20' });
    before.emit('retired_one');
    expect(before.counts()).toEqual({ retired_one: 1 });
    // Same bundle, clock advanced past expiry: emission stops. No server involved.
    const after = new CounterClient(meta, { today: '2026-07-23' });
    after.emit('retired_one');
    expect(after.counts()).toEqual({});
  });
});
