// The zero-auth landing hint + the "signed in since" stamp it carries.
// Behaviors:
// - activating the hint stamps the first-seen time ONCE (later boots keep it)
// - deactivating clears both the hint and the stamp
// - getSessionSince() is defensive: null when absent, corrupt, or storage throws
import { describe, expect, it } from 'vitest';
import {
  getSessionSince,
  hasSessionHint,
  setSessionHint,
} from '../../../src/auth/session-hint.js';

const memStorage = () => {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
};

describe('setSessionHint / hasSessionHint', () => {
  it('sets and clears the hint flag', () => {
    const storage = memStorage();
    setSessionHint(true, storage);
    expect(hasSessionHint(storage)).toBe(true);
    setSessionHint(false, storage);
    expect(hasSessionHint(storage)).toBe(false);
  });

  it('never throws when storage is blocked (private mode)', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    expect(() => setSessionHint(true, broken)).not.toThrow();
    expect(hasSessionHint(broken)).toBe(false);
    expect(getSessionSince(broken)).toBeNull();
  });
});

describe('getSessionSince', () => {
  it('stamps the first activation and preserves it across later boots', () => {
    const storage = memStorage();
    setSessionHint(true, storage);
    const first = getSessionSince(storage);
    expect(first).not.toBeNull();
    // A later boot with the session still live must NOT reset the stamp.
    storage.map.set('arecipe-session-since', '2026-07-01T12:00:00.000Z');
    setSessionHint(true, storage);
    expect(getSessionSince(storage)?.toISOString()).toBe('2026-07-01T12:00:00.000Z');
  });

  it('is null when signed out, and sign-out clears an existing stamp', () => {
    const storage = memStorage();
    expect(getSessionSince(storage)).toBeNull();
    setSessionHint(true, storage);
    expect(getSessionSince(storage)).not.toBeNull();
    setSessionHint(false, storage);
    expect(getSessionSince(storage)).toBeNull();
    expect(storage.map.has('arecipe-session-since')).toBe(false);
  });

  it('is null on a corrupt stamp instead of an Invalid Date', () => {
    const storage = memStorage();
    storage.map.set('arecipe-session-since', 'not-a-date');
    expect(getSessionSince(storage)).toBeNull();
  });
});
