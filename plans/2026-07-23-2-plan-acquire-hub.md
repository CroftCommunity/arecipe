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

**NEXT — wire the real in-app engine (Tesseract.js). Deliberately NOT done
autonomously; needs explicit sign-off because it is a sensitive, hard-to-reverse
change (the experiment brief says "no CSP change, no dependency"):**
- Add `tesseract.js` (1.7 MB JS wrapper) as a dep; a small
  `src/import/ocr-tesseract.ts` adapter implements `OcrEngine`, **lazy-loaded via
  dynamic import** so it code-splits onto the hub only.
- **Self-host the assets** (strict CSP forbids the default CDN): one WASM core
  variant (~3–4 MB) + the worker + `eng.traineddata` (~4 MB "fast" / ~11 MB
  standard) committed under `assets/` and pointed at via `corePath`/`workerPath`/
  `langPath`. Real weight for a lean PWA (bundles today are 3–40 KB) — a size call
  for the owner.
- **CSP relaxation on `import.html` only**: `script-src` needs `wasm-unsafe-eval`
  and a worker (`worker-src 'self' blob:`); note it in `docs/SECURITY.md`.
- Verify real OCR in a browser (headless Chromium OCR is heavy/slow) as a
  follow-up check.
- Local-AI structuring (desktop-only, verbatim-gated — Arm 2 infra already built)
  remains an optional later gap-filler; degrade honestly on mobile.

## Tests

- `manifest-share-target.spec` → import.html.
- `recipe-import` e2e → import.html; add hub e2e (Import button routes to hub;
  options render; paste + from-link land a draft in the editor).
- panel unit: manual-URL + reveal-paste affordances.

_Outcome recorded at completion._
