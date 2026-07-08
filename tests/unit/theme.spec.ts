// Phase 5c theming, revised: a clean 2-state toggle that always visibly
// flips (the 3-state auto/light/dark cycle had a dead click — "auto" and
// "light" look identical on a light-mode OS). First load still follows the
// system; the first tap flips whatever you currently see.
import { describe, expect, it } from 'vitest';
import { nextTheme, resolveInitial, toggleGlyph } from '../../src/theme.js';

describe('resolveInitial', () => {
  it('an explicit stored choice wins over the system preference', () => {
    expect(resolveInitial('dark', false)).toBe('dark');
    expect(resolveInitial('light', true)).toBe('light');
  });

  it('no stored choice follows prefers-color-scheme', () => {
    expect(resolveInitial(null, true)).toBe('dark');
    expect(resolveInitial(null, false)).toBe('light');
  });
});

describe('nextTheme', () => {
  it('always flips the currently shown theme', () => {
    expect(nextTheme('light')).toBe('dark');
    expect(nextTheme('dark')).toBe('light');
  });
});

describe('toggleGlyph', () => {
  it('offers what the tap will switch TO', () => {
    // Currently light → the button offers dark (moon); vice versa.
    expect(toggleGlyph('light')).not.toBe(toggleGlyph('dark'));
  });
});
