// Token provider (plan D1). Contracts:
//  - no raw-token readback method exists (UI can never render it)
//  - remember:false persists nothing; remember:true persists + survives reload
//  - authorizedFetch attaches Authorization on the remembered path, and defers
//    to the SW (no header) on the secure path
//  - clear() wipes storage and the SW
import { describe, expect, it, vi } from 'vitest';
import { createTokenProvider, type SwTokenChannel } from '../../../src/publish/github-token.js';

const memStorage = () => {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
};

const fakeSw = (): SwTokenChannel & { held: string | null } => {
  const box = { held: null as string | null };
  return {
    held: box.held,
    set: vi.fn(async (t: string) => {
      box.held = t;
    }),
    clear: vi.fn(async () => {
      box.held = null;
    }),
    has: vi.fn(async () => box.held !== null),
  } as SwTokenChannel & { held: string | null };
};

const recordingFetch = () => {
  const calls: { auth: string | null }[] = [];
  const fn = ((_input: unknown, init?: RequestInit): Promise<Response> => {
    calls.push({ auth: new Headers(init?.headers).get('Authorization') });
    return Promise.resolve(new Response('ok'));
  }) as unknown as typeof fetch;
  return { fn, calls };
};

describe('createTokenProvider', () => {
  it('exposes no raw-token readback', () => {
    const provider = createTokenProvider({ storage: memStorage() });
    expect(Object.keys(provider)).not.toContain('get');
    expect(Object.keys(provider)).not.toContain('token');
  });

  it('remember:false persists nothing but hands the token to the SW', async () => {
    const storage = memStorage();
    const sw = fakeSw();
    const provider = createTokenProvider({ storage, sw });
    await provider.set('ghp_secret', { remember: false });
    expect(storage.map.size).toBe(0);
    expect(sw.set).toHaveBeenCalledWith('ghp_secret');
    expect(await provider.hasToken()).toBe(true); // SW holds it
  });

  it('remember:true persists and survives a fresh provider', async () => {
    const storage = memStorage();
    await createTokenProvider({ storage, sw: fakeSw() }).set('ghp_secret', { remember: true });
    expect(storage.map.size).toBe(1);
    expect(await createTokenProvider({ storage }).hasToken()).toBe(true);
  });

  it('authorizedFetch attaches Authorization on the remembered path', async () => {
    const storage = memStorage();
    const { fn, calls } = recordingFetch();
    const provider = createTokenProvider({ storage, fetchFn: fn });
    await provider.set('ghp_secret', { remember: true });
    await provider.authorizedFetch('https://api.github.com/x');
    expect(calls[0]?.auth).toBe('Bearer ghp_secret');
  });

  it('authorizedFetch sends no header on the secure path (SW injects)', async () => {
    const { fn, calls } = recordingFetch();
    const provider = createTokenProvider({ storage: memStorage(), sw: fakeSw(), fetchFn: fn });
    await provider.set('ghp_secret', { remember: false });
    await provider.authorizedFetch('https://api.github.com/x');
    expect(calls[0]?.auth).toBeNull();
  });

  it('clear() wipes storage and the SW', async () => {
    const storage = memStorage();
    const sw = fakeSw();
    const provider = createTokenProvider({ storage, sw });
    await provider.set('ghp_secret', { remember: true });
    await provider.clear();
    expect(storage.map.size).toBe(0);
    expect(sw.clear).toHaveBeenCalled();
    expect(await provider.hasToken()).toBe(false);
  });
});
