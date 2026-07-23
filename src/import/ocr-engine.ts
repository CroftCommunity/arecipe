// Loader for the in-app OCR engine. This is the single seam where the heavy,
// self-hosted engine (Tesseract.js: a lazy dynamic import of the wrapper + a
// self-hosted WASM core, worker, and eng.traineddata, plus a CSP relaxation on
// import.html) will be constructed — see plans/2026-07-23-2-plan-acquire-hub.md.
//
// Until that sign-off-gated engine lands, this returns undefined, so "Scan a
// photo" degrades to the on-device (OS OCR + share) guidance. Keeping the loader
// here means enabling real OCR is a localized change (return a Tesseract-backed
// OcrEngine) and the toggle/gating around it is already wired and tested.

import type { OcrEngine } from './ocr.js';

/** Construct the in-app OCR engine, or undefined when none is available. Async so
 *  the real engine can be dynamically imported (code-split, off the hub's
 *  critical path) when it is wired. */
export const loadOcrEngine = async (): Promise<OcrEngine | undefined> => {
  // TODO(ocr): return a Tesseract-backed OcrEngine here once the dependency,
  // self-hosted assets, and import.html CSP relaxation are signed off.
  return undefined;
};
