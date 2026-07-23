// The in-app OCR opt-out. Default ON; a cook on a weak device can disable it.
import { describe, expect, it } from 'vitest';
import { createOcrPrefs } from '../../../src/import/ocr-prefs.js';

const memStorage = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
};

describe('createOcrPrefs', () => {
  it('is enabled by default (feature available out of the box)', () => {
    expect(createOcrPrefs({ storage: memStorage() }).isEnabled()).toBe(true);
  });

  it('disabling persists and reads back as off', () => {
    const storage = memStorage();
    const prefs = createOcrPrefs({ storage });
    prefs.setEnabled(false);
    expect(prefs.isEnabled()).toBe(false);
    expect(createOcrPrefs({ storage }).isEnabled()).toBe(false); // survives a reload
  });

  it('re-enabling clears the opt-out', () => {
    const storage = memStorage();
    const prefs = createOcrPrefs({ storage });
    prefs.setEnabled(false);
    prefs.setEnabled(true);
    expect(prefs.isEnabled()).toBe(true);
  });

  it('degrades to enabled when storage throws (private mode)', () => {
    const throwing = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
      removeItem: () => { throw new Error('blocked'); },
    };
    expect(createOcrPrefs({ storage: throwing }).isEnabled()).toBe(true);
  });

  it('defaults to the fast model and switches to standard, persisting the choice', () => {
    const storage = memStorage();
    const prefs = createOcrPrefs({ storage });
    expect(prefs.model()).toBe('fast');
    prefs.setModel('standard');
    expect(prefs.model()).toBe('standard');
    expect(createOcrPrefs({ storage }).model()).toBe('standard'); // survives a reload
    prefs.setModel('fast');
    expect(prefs.model()).toBe('fast');
  });
});
