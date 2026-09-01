// D5: snapshot purge on service-worker activate. On activate we purge snapshot
// directories for build ids other than the active one, so old snapshots don't
// accumulate in the Cache API. THE LOAD-BEARING CASE (written before the purge
// code): a version-pinned install must keep its own snapshot — the purge must
// NOT delete the pinned build's directory. Modelled as a keep-set: the active
// build plus any pinned builds are kept; everything else is purged.
import { describe, expect, it } from 'vitest';
import { snapshotDirsToPurge } from '../../../src/snapshot/purge.js';

const url = (build: string, file = 'index.json') => `https://arecipe.app/assets/snapshot/${build}/${file}`;

describe('snapshotDirsToPurge', () => {
  it('purges snapshot files whose build id is not in the keep set', () => {
    const cached = [url('build-A'), url('build-A', 'cooks/did.json'), url('build-B'), url('build-C', 'manifest.json')];
    const purge = snapshotDirsToPurge(cached, ['build-A']);
    expect(purge.sort()).toEqual([url('build-B'), url('build-C', 'manifest.json')].sort());
  });

  it('with a pin active (pinned build in the keep set) purges nothing of the pinned build', () => {
    const cached = [url('active'), url('active', 'cooks/x.json'), url('pinned'), url('pinned', 'manifest.json')];
    // Keep set = active build + the pinned build → nothing from either is purged.
    expect(snapshotDirsToPurge(cached, ['active', 'pinned'])).toEqual([]);
  });

  it('never touches non-snapshot cache entries', () => {
    const cached = ['https://arecipe.app/', 'https://arecipe.app/browse-abc.js', 'https://arecipe.app/assets/icons/icon-192.png'];
    expect(snapshotDirsToPurge(cached, ['whatever'])).toEqual([]);
  });

  it('keeps the active build’s own snapshot', () => {
    const cached = [url('active'), url('active', 'cooks/a.json'), url('active', 'manifest.json')];
    expect(snapshotDirsToPurge(cached, ['active'])).toEqual([]);
  });
});
