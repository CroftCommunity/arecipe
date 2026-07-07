import { describe, expect, it } from 'vitest';
import { shellTitle } from '../../src/shell.js';

describe('shellTitle', () => {
  it('renders the empty state at zero recipes', () => {
    expect(shellTitle(0)).toBe('arecipe — no recipes yet');
  });

  it('renders the count above zero', () => {
    expect(shellTitle(1)).toBe('arecipe — 1 recipes');
    expect(shellTitle(12)).toBe('arecipe — 12 recipes');
  });
});
