// Tile media-variant decision (RUN-EMPTY-TILE-CHIP, Phase 1.1). A pure,
// DOM-free function so the layout rule is pinned regardless of test env: a
// pictureless tile becomes an inline chip when the grid is single-column, and
// keeps a media zone ("band") when it is multi-column; a tile WITH a picture
// is always a photo.
import { describe, expect, it } from 'vitest';
import { tileMediaVariant } from '../../../src/recipes/tile-variant.js';

describe('tileMediaVariant', () => {
  it('has image, single column → photo', () => {
    expect(tileMediaVariant({ hasImage: true, columns: 1 })).toBe('photo');
  });

  it('has image, multi column → photo', () => {
    expect(tileMediaVariant({ hasImage: true, columns: 3 })).toBe('photo');
  });

  it('no image, single column → chip', () => {
    expect(tileMediaVariant({ hasImage: false, columns: 1 })).toBe('chip');
  });

  it('no image, multi column → band', () => {
    expect(tileMediaVariant({ hasImage: false, columns: 2 })).toBe('band');
  });
});
