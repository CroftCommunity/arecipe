// Signed releases Phase 3 (RED first): the shared release config — a tiny
// IndexedDB record readable by BOTH the page and the service worker
// (localStorage is invisible to a SW, which is why this is IDB). Device-local
// by construction: it lives in this browser's storage and never touches the
// PDS (acceptance 5).
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createReleaseConfig } from '../../../src/release/config.js';

const fresh = () => createReleaseConfig({ dbName: `t-${Math.random()}` });

describe('createReleaseConfig', () => {
  it('defaults: install-only-verified ON, no pin, nothing verified yet', async () => {
    const cfg = await fresh().load();
    expect(cfg.requireVerified).toBe(true); // D5: ON by default
    expect(cfg.lockedVersion).toBeUndefined(); // D4: pin OFF by default
    expect(cfg.lastVerifiedVersion).toBeUndefined();
    expect(cfg.verdict).toBeUndefined();
  });

  it('save patches and load round-trips', async () => {
    const store = fresh();
    await store.save({ lockedVersion: '2026.07.16-abc' });
    await store.save({
      verdict: { state: 'verified', version: '2026.07.16-abc', checkedAt: 't' },
      lastVerifiedVersion: '2026.07.16-abc',
    });
    const cfg = await store.load();
    expect(cfg.lockedVersion).toBe('2026.07.16-abc');
    expect(cfg.lastVerifiedVersion).toBe('2026.07.16-abc');
    expect(cfg.verdict?.state).toBe('verified');
    expect(cfg.requireVerified).toBe(true); // untouched by the patches
  });

  it('clears a field when the patch sets it undefined (unpin)', async () => {
    const store = fresh();
    await store.save({ lockedVersion: 'v1' });
    await store.save({ lockedVersion: undefined });
    expect((await store.load()).lockedVersion).toBeUndefined();
  });

  it('requireVerified can be turned off and back on', async () => {
    const store = fresh();
    await store.save({ requireVerified: false });
    expect((await store.load()).requireVerified).toBe(false);
    await store.save({ requireVerified: true });
    expect((await store.load()).requireVerified).toBe(true);
  });

  it('two stores over different dbs are independent (device-local, no roaming)', async () => {
    const a = fresh();
    const b = fresh();
    await a.save({ lockedVersion: 'pinned-on-a' });
    expect((await b.load()).lockedVersion).toBeUndefined();
  });
});
