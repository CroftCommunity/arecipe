# Acquire hub — separate "pull in" (0→1) from "build/edit" (1→n)

**Status:** hub frame DONE (2026-07-23); OCR increment NEXT. Builds on the import
share-accuracy hardening (`RUN-IMPORT-HARDENING.md`).

## Landed (hub frame)

`import.html` + `src/pages/import.ts` (registered in `scripts/build.mjs`,
CSP-covered); `src/import/acquire-hub.ts` composes the import engine with
Scan-a-photo (OS-OCR guidance until the in-app handler lands) + Build-from-scratch;
`renderImportPanel` gained opt-in `manualUrl` + `revealPasteInitially`; the share
target was repointed to `import.html`; Alchemy gained the **Import** button and
its inline share panel was removed. Tests: `acquire-hub.spec` (5), panel
affordances (2), `manifest-share-target` (→import.html), `recipe-import` e2e
(repointed + 2 new hub tests), `csp` e2e (import.html added). Full gate green.

## Idea

Alchemy gets an **Import** button next to **New**. It opens a dedicated **Acquire
hub** (`import.html`) offering several ways to derive a recipe from a source; the
**Web Share Target routes here too**. Every path produces a **candidate draft** and
hands off to the *same* editor — the convergence point that already exists
(`drafts.save(fields) → editor.html?draft=`). "New" stays the from-scratch builder.

```
   ┌ paste text / page source ┐
   ├ share target (text/photo) ┤
   ├ from a link (best-effort) ┤ →  EditorFields → draft → editor → publish
   ├ scan a photo → OCR ───────┤    (candidate)      (existing sink)
   └ build from scratch ("New")┘
```

Each source is an adapter that emits `EditorFields`; the hardened text heuristic is
the shared engine (a share/OCR both become "messy text → parse ladder → draft").

## This increment (hub frame)

- New page `import.html` + `src/pages/import.ts`; registered in `scripts/build.mjs`.
- `renderImportPanel` (panel.ts) gains two optional affordances so it can serve a
  manual visit, not just a share: a **manual URL** entry (`From a link`) and
  **reveal-paste-initially**.
- The hub shows path options: **Paste text** (paste box, always available),
  **From a link** (best-effort fetch, honest CORS fallback), **Scan a photo**
  (OCR — laddered; wired in the next increment), **Build from scratch** (→ editor).
- **Share target repointed** from `mine.html` to `import.html`; share params
  auto-run the import on arrival (unchanged behavior, new home).
- Alchemy: add the **Import** button (→ `import.html`); the inline share panel
  moves off Alchemy onto the hub (ends the "share-only, no import button" posture
  by design).

## OCR seam (DONE) + the Tesseract greenlight step (NEXT, sign-off gated)

**Landed — the photo→OCR→draft architecture + UI, engine-injected, TDD:**
`src/import/ocr.ts` (`OcrEngine` contract + `recognizeImage` seam + `OCR_GUIDANCE`);
the hub's **Scan a photo** card now, *with an injected engine*, opens a
camera/file picker (`<input type=file accept=image/* capture=environment>`),
recognizes the photo on device, and drops the text into the paste box for the
cook to eyeball before importing (human-in-the-loop — OCR errs, especially on
handwriting); *without* an engine it degrades to the on-device guidance (use the
phone's own "select text from photo" and share/paste — best mobile handwriting,
zero deps). Rung 1 of the ladder is therefore live today. Tests: `ocr.spec` (3),
`acquire-hub.spec` OCR cases (fill-paste, unreadable-photo, engine-vs-guidance).

**Fetch removed + OCR toggle (DONE, 2026-07-23).** Built-in URL fetch is a
no-go (Phase 0: 0/10 reachable) — removed the "From a link" entry and the bare-
link fetch attempt; a bare shared link now reveals paste with guidance (the link
kept as provenance), no network. A **Settings → Import → "Scan a photo (OCR)"**
toggle (`src/import/ocr-prefs.ts`, default ON) lets a cook on a weak device opt
out; `import.ts` gates the engine on it via the `loadOcrEngine` seam
(`src/import/ocr-engine.ts`, returns undefined until Tesseract lands → guidance).
Tests: `ocr-prefs.spec` (4), settings e2e (toggle), panel/hub/recipe-import specs
updated for no-fetch.

**Real Tesseract engine wired + VERIFIED (DONE, 2026-07-23).**
- `src/import/ocr-engine.ts` `loadOcrEngine` loads the **self-hosted, pre-built**
  Tesseract ESM bundle at runtime (a computed specifier, so esbuild leaves it
  external — bundling the npm *source* mangled the worker handshake). `tesseract.js`
  is a devDependency only, used to source the committed assets.
- **Self-hosted assets** under `assets/ocr/` (~5.8 MB): the ESM bundle (63 KB),
  `worker.min.js` (111 KB), the SIMD-LSTM core `.wasm.js` (3.9 MB, embeds the
  WASM — the raw `.wasm` is not needed), and the **fast** `eng.traineddata.gz`
  (2 MB). `corePath` is pinned to the one shipped variant so Tesseract can't
  feature-detect a variant we don't ship.
- **Lazy on first tap** (not page load) so nothing heavy downloads until "Scan a
  photo" is used, and only when the Settings toggle leaves OCR enabled.
- **CSP relaxation scoped to `import.html`** (`script-src` + `'wasm-unsafe-eval'`,
  `worker-src 'self' blob:`) via `cspFor(html, { wasm })`; every other page stays
  strict. Guarded by `csp.spec.ts`; documented in `docs/SECURITY.md`.
- **Verified end-to-end** by `tests/e2e/ocr-import.spec.ts`: a canvas-rendered
  image is recognized ("2 cups flour") into the paste box under the real CSP,
  hermetically (no network). ~3 s.
- Follow-ups (optional): a standard/handwriting model as an upgrade; local-AI
  structuring (desktop-only, verbatim-gated) as a gap-filler.

## Tests

- `manifest-share-target.spec` → import.html.
- `recipe-import` e2e → import.html; add hub e2e (Import button routes to hub;
  options render; paste + from-link land a draft in the editor).
- panel unit: manual-URL + reveal-paste affordances.

_Outcome recorded at completion._
