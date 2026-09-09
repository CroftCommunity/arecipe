// snapshot-refresh guard (recipe-count discrepancy plan, Part 2). A scheduled
// refresh rebuilds the site with a NEW version string, and a new version makes
// every client refetch the whole snapshot (docs/CI-TROUBLESHOOTING.md). So a
// refresh must deploy only when a seed cook's repo actually moved — comparing
// the freshly captured manifest against the one the live site serves — and
// must refuse when the capture LOST a cook, since deploying it would drop that
// cook from the live snapshot in the name of freshness.
import { describe, expect, it } from 'vitest';
import { snapshotDrift } from '../../../scripts/snapshot-drift.mjs';

const manifest = (cooks: { did: string; rev: string }[]) => ({ cooks });
const a = { did: 'did:plc:a', rev: 'r1' };
const b = { did: 'did:plc:b', rev: 'r2' };

describe('snapshotDrift', () => {
  it('reports no change when every captured rev matches the live manifest', () => {
    expect(snapshotDrift({ captured: manifest([a, b]), live: manifest([a, b]) })).toEqual({
      changed: false,
      moved: [],
      dropped: [],
    });
  });

  it('reports a moved cook with both revs when its repo advanced', () => {
    const out = snapshotDrift({ captured: manifest([{ ...a, rev: 'r9' }, b]), live: manifest([a, b]) });
    expect(out.changed).toBe(true);
    expect(out.moved).toEqual([{ did: 'did:plc:a', from: 'r1', to: 'r9' }]);
    expect(out.dropped).toEqual([]);
  });

  it('treats a cook new to the capture (added to the seed) as a change', () => {
    const out = snapshotDrift({ captured: manifest([a, b]), live: manifest([a]) });
    expect(out.changed).toBe(true);
    expect(out.moved).toEqual([{ did: 'did:plc:b', from: null, to: 'r2' }]);
  });

  it('names a cook the capture lost, so the caller can refuse to deploy it', () => {
    const out = snapshotDrift({ captured: manifest([a]), live: manifest([a, b]) });
    expect(out.dropped).toEqual(['did:plc:b']);
    expect(out.changed).toBe(false); // nothing moved; the drop is the finding
  });
});
