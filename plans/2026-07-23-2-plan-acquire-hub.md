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

## Next increment (OCR, laddered — recorded)

- **Scan a photo**, two rungs: (1) accept OS-OCR'd text via share/paste (zero
  deps, best mobile handwriting); (2) in-app camera → **Tesseract.js** (WASM,
  **code-split** onto the hub only, CSP `wasm-unsafe-eval` + worker) for a raw
  image file with no OS text-select. Output is a *candidate* draft → editor.
- Local-AI structuring (desktop-only, verbatim-gated — Arm 2 infra already built)
  as an optional gap-filler; degrade honestly on mobile.

## Tests

- `manifest-share-target.spec` → import.html.
- `recipe-import` e2e → import.html; add hub e2e (Import button routes to hub;
  options render; paste + from-link land a draft in the editor).
- panel unit: manual-URL + reveal-paste affordances.

_Outcome recorded at completion._
