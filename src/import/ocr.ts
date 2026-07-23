// Photo → text (OCR) seam for the Acquire hub. All local: an OCR engine turns a
// photo of a recipe (a card, a cookbook page, a screenshot) into plain text,
// which then runs the SAME parse ladder as a paste/share — landing a candidate
// draft the cook reviews in the editor. Nothing is posted automatically.
//
// The engine is an INJECTED interface, not a hard dependency, for two reasons:
// (1) it keeps this module and its tests hermetic; (2) the real engine is heavy
// (Tesseract.js ships multi-MB WASM + language data and needs a self-hosted
// asset set plus a CSP relaxation on import.html) — a deliberate, sign-off-gated
// addition (see plans/2026-07-23-2-plan-acquire-hub.md). Until an engine is
// wired, the hub degrades honestly to the on-device route: use the phone's own
// "select text from photo" and share/paste it (best mobile handwriting, zero deps).

/** An OCR engine: a photo → recognized plain text. The real engine loads lazily
 *  and off the hub's critical path; this contract is all the hub depends on. */
export type OcrEngine = {
  recognize: (image: Blob) => Promise<string>;
};

/** Copy shown by "Scan a photo" when no in-app engine is wired: the on-device,
 *  zero-dependency route that works today (and handles handwriting best). */
export const OCR_GUIDANCE =
  'Take a photo of the recipe, then use your phone’s “select text” on the image and share that here — or paste it below.';

/** Recognize an image to text. Thin by design: the value is in the engine and in
 *  the parse ladder that consumes the text; this is the seam between them. Errors
 *  from the engine propagate so the caller can fall back to the guidance/paste. */
export const recognizeImage = (image: Blob, engine: OcrEngine): Promise<string> =>
  engine.recognize(image);
