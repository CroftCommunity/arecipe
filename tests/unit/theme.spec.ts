// Phase 5c: theme mode logic. Behaviors:
// - modes cycle auto → light → dark → auto (one-tap toggle)
// - auto resolves via the system preference; explicit modes ignore it
// - each mode has a distinct glyph + label for the toggle button
import { describe, expect, it } from 'vitest';
import { cycleMode, modeGlyph, resolveTheme } from '../../src/theme.js';

describe('cycleMode', () => {
  it('cycles auto → light → dark → auto', () => {
    expect(cycleMode('auto')).toBe('light');
    expect(cycleMode('light')).toBe('dark');
    expect(cycleMode('dark')).toBe('auto');
  });
});

describe('resolveTheme', () => {
  it.each([
    ['auto', true, 'dark'],
    ['auto', false, 'light'],
    ['light', true, 'light'],
    ['light', false, 'light'],
    ['dark', true, 'dark'],
    ['dark', false, 'dark'],
  ] as const)('mode %s with prefersDark=%s → %s', (mode, prefersDark, expected) => {
    expect(resolveTheme(mode, prefersDark)).toBe(expected);
  });
});

describe('modeGlyph', () => {
  it('gives each mode a distinct glyph', () => {
    const glyphs = new Set([modeGlyph('auto'), modeGlyph('light'), modeGlyph('dark')]);
    expect(glyphs.size).toBe(3);
  });
});
