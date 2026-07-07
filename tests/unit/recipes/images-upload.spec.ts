// Phase 7: image prep logic (the pure parts — the canvas re-encode itself is
// exercised by the @live upload test). Behaviors:
// - fitWithin caps the longest edge, preserving aspect ratio, never upscales
// - input validation fails loud: non-images rejected by type, oversized
//   inputs rejected by the client cap (naming the limit)
import { describe, expect, it } from 'vitest';
import { fitWithin, MAX_INPUT_BYTES, validateImageInput } from '../../../src/recipes/images-upload.js';

describe('fitWithin', () => {
  it('caps the longest edge and preserves aspect', () => {
    expect(fitWithin(4000, 3000, 2048)).toEqual({ width: 2048, height: 1536 });
    expect(fitWithin(3000, 4000, 2048)).toEqual({ width: 1536, height: 2048 });
  });

  it('never upscales', () => {
    expect(fitWithin(800, 600, 2048)).toEqual({ width: 800, height: 600 });
  });
});

describe('validateImageInput', () => {
  it('accepts normal images', () => {
    expect(() => validateImageInput({ type: 'image/jpeg', size: 4_000_000 })).not.toThrow();
    expect(() => validateImageInput({ type: 'image/png', size: 500_000 })).not.toThrow();
  });

  it('rejects non-image files by type', () => {
    expect(() => validateImageInput({ type: 'application/pdf', size: 1000 })).toThrow(/image/i);
  });

  it('rejects oversized inputs, naming the cap', () => {
    expect(() => validateImageInput({ type: 'image/jpeg', size: MAX_INPUT_BYTES + 1 })).toThrow(
      /20 MB/,
    );
  });
});
