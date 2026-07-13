// Device-local sync-state store for the D9 status chip.
import { describe, expect, it } from 'vitest';
import { createSyncStateStore } from '../../../src/publish/github-sync-state.js';

const memStorage = () => {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
};

describe('createSyncStateStore', () => {
  it('defaults to unknown', () => {
    expect(createSyncStateStore({ storage: memStorage() }).load()).toEqual({ status: 'unknown' });
  });

  it('round-trips a terminal state', () => {
    const storage = memStorage();
    const store = createSyncStateStore({ storage });
    store.set({ status: 'synced', at: '2026-07-13T12:00:00.000Z' });
    expect(createSyncStateStore({ storage }).load()).toEqual({
      status: 'synced',
      at: '2026-07-13T12:00:00.000Z',
    });
  });

  it('keeps an error message', () => {
    const storage = memStorage();
    createSyncStateStore({ storage }).set({ status: 'error', message: 'HTTP 500' });
    expect(createSyncStateStore({ storage }).load()).toMatchObject({ status: 'error', message: 'HTTP 500' });
  });

  it('degrades an unknown/corrupt status to unknown', () => {
    const storage = memStorage();
    storage.setItem('arecipe.calendar-sync.v1', JSON.stringify({ status: 'bogus' }));
    expect(createSyncStateStore({ storage }).load().status).toBe('unknown');
  });
});
