// The OCR seam: a photo → text via an injected engine, then the SAME parse
// ladder as a paste. Hermetic — the real (heavy) engine is swapped in behind
// this contract; here a mock stands in.
import { describe, expect, it, vi } from 'vitest';
import { recognizeImage, OCR_GUIDANCE, type OcrEngine } from '../../../src/import/ocr.js';

describe('recognizeImage', () => {
  it('passes the image to the engine and returns the recognized text', async () => {
    const engine: OcrEngine = { recognize: vi.fn(async () => '2 cups flour\n1 tsp salt') };
    const img = new Blob(['bytes'], { type: 'image/png' });
    const text = await recognizeImage(img, engine);
    expect(engine.recognize).toHaveBeenCalledWith(img);
    expect(text).toBe('2 cups flour\n1 tsp salt');
  });

  it('propagates an engine error so the caller can fall back to guidance/paste', async () => {
    const engine: OcrEngine = { recognize: async () => { throw new Error('model unavailable'); } };
    await expect(recognizeImage(new Blob(['x']), engine)).rejects.toThrow('model unavailable');
  });

  it('exposes on-device OCR guidance copy for the no-engine path', () => {
    expect(OCR_GUIDANCE).toMatch(/select text/i);
  });
});
