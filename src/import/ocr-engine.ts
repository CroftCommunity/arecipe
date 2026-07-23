// Loader for the in-app OCR engine (Tesseract.js), the single seam the hub and
// its toggle are wired around. The engine is HEAVY and fully self-hosted (the
// default CDN is CSP-forbidden): worker + WASM core + eng.traineddata all live
// under assets/ocr/ and are served same-origin. Tesseract compiles WebAssembly,
// so import.html carries a relaxed CSP (wasm-unsafe-eval + a worker source) —
// scoped to that one page; see scripts/build.mjs and docs/SECURITY.md.
//
// tesseract.js is loaded via dynamic import() so it code-splits into its own
// chunk, fetched only when OCR is actually used (and only when the Settings
// toggle leaves it enabled) — never on the hub's or any other page's critical
// path. All of it is local: no network beyond the same-origin asset fetches.

import { log } from '../log.js';
import type { OcrEngine } from './ocr.js';

/** The slice of a Tesseract worker we use — injectable so `makeOcrEngine` is
 *  unit-testable without the real (heavy, browser-only) worker. */
export type RecognizeWorker = {
  recognize: (image: Blob) => Promise<{ data: { text: string } }>;
  terminate?: () => Promise<unknown>;
};

/** Wrap a recognize-capable worker as the hub's `OcrEngine` (image → text). */
export const makeOcrEngine = (worker: RecognizeWorker): OcrEngine => ({
  recognize: async (image) => {
    const { data } = await worker.recognize(image);
    return data.text;
  },
});

const OCR_ASSETS = './assets/ocr/';

/** The self-hosted, PRE-BUILT Tesseract.js ESM bundle. We load this at runtime
 *  rather than `import 'tesseract.js'` from source: esbuild-bundling the source
 *  mangles it (the worker handshake breaks). The specifier is assembled at
 *  runtime so esbuild leaves it as an external dynamic import, resolved
 *  same-origin against the page. */
const ENGINE_URL = `${OCR_ASSETS}tesseract.esm.min.js`;

type TesseractApi = {
  createWorker: (
    lang: string,
    oem: number,
    opts: { workerPath: string; corePath: string; langPath: string; gzip: boolean },
  ) => Promise<RecognizeWorker>;
};
// The prebuilt ESM bundle exposes the API as its DEFAULT export.
type TesseractModule = { default?: TesseractApi } & Partial<TesseractApi>;

/** Construct the Tesseract-backed engine, or undefined if it can't load (old
 *  browser, blocked WASM, missing assets) — the caller then shows guidance. */
export const loadOcrEngine = async (): Promise<OcrEngine | undefined> => {
  try {
    const spec = ENGINE_URL; // variable ⇒ esbuild keeps it external (not bundled)
    const mod = (await import(/* @vite-ignore */ spec)) as TesseractModule;
    const api = mod.default ?? mod;
    if (api.createWorker === undefined) throw new Error('tesseract createWorker missing');
    // OEM 1 = LSTM; all paths are same-origin (self-hosted, CSP connect-src 'self').
    const worker = await api.createWorker('eng', 1, {
      workerPath: `${OCR_ASSETS}worker.min.js`,
      // Pin the core to the ONE self-hosted variant (SIMD-LSTM: broad modern
      // support, good perf) — a directory would let Tesseract feature-detect and
      // request a variant we don't ship.
      corePath: `${OCR_ASSETS}tesseract-core-simd-lstm.wasm.js`,
      langPath: OCR_ASSETS,
      gzip: true,
    });
    return makeOcrEngine(worker);
  } catch (err) {
    log.warn('import', 'OCR engine unavailable', { error: String(err) });
    return undefined;
  }
};
