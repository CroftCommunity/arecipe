# Remove the recipe-import feature (import.html) entirely

**Date:** 2026-07-23
**Status:** done (2026-07-23)

## Problem statement

The "Import a recipe" surface (`import.html` — the Acquire hub) did not work out
in practice. The headline capability, **"Scan a photo" OCR** (Tesseract.js WASM,
switchable fast/standard traineddata), failed to produce usable results under
either model. The paste-text parse ladder and the Web Share Target were built
around the same hub, and the whole surface adds real cost: a code-split page, a
scoped **CSP relaxation** (`wasm-unsafe-eval` + `worker-src blob:` on
`import.html` only), a Settings section, a user-guide entry, and a large test
footprint. The owner has decided to remove the feature in full.

## Approach

Delete the entire import surface and everything that exists only to serve it,
while preserving the two things that merely *live next to* it:

1. **`src/import/provenance.ts` survives** — it is a pure DOM builder for the
   editor's "Imported from <host>" line + "own words" etiquette note, reachable
   independently of import via `editor.ts` `?edit=` on any record that carries
   `sourceUrl` (e.g. a wikibooks-corpus record). It relocates to
   `src/recipes/provenance.ts` (test moves alongside).
2. **`editor.html` / recipe authoring survives** — "Build from scratch" was just
   a link to `editor.html`; "New recipe" reaches the editor from Cookbook and
   Alchemy directly. Authoring is untouched.

Removed:
- Shell: `import.html`
- Page: `src/pages/import.ts`
- Modules: all of `src/import/` **except** `provenance.ts` (relocated) — i.e.
  `acquire-hub.ts`, `acquire.ts`, `panel.ts`, `ocr.ts`, `ocr-engine.ts`,
  `ocr-prefs.ts`, `share-target.ts`, `model-extract.ts` (the dormant Chrome
  Prompt API / Gemini Nano experiment — the repo's only real LLM code),
  `verbatim.ts`, `recipe-jsonld.ts`, `recipe-dom.ts`, `recipe-text.ts`,
  `score.ts`, `sanitize.ts`, `to-fields.ts`.
- Build: `import` from `PAGES`, `'import.html'` from `HTML` (drops it from SW
  precache automatically), and the **entire `wasm` CSP relaxation machinery** in
  `scripts/build.mjs` (now dead — no page needs WASM).
- Manifest: the `share_target` block (pointed at `import.html`).
- Nav: the "Import" button on the Alchemy page (`mine.ts`); "New" stays.
- Settings: the "Import" section (OCR on/off + model select) in `settings.ts`.
- User guide: the `shareEntry` ("Import a recipe by sharing it to arecipe") in
  `user-guide-view.ts` and its `GUIDE_ENTRIES` registration.
- Docs: `docs/EXP-IMPORT-EXTRACTION.md`, `RUN-IMPORT-HARDENING.md`; the
  `import.html` OCR/WASM relaxation section in `docs/SECURITY.md`; trim the
  import-mechanism prose on the `sourceUrl` row in `docs/LEXICONS.md` (the field
  stays — it is open-world provenance, still carried by corpus records).
- Tests: delete `tests/unit/import/*` (move `provenance.spec.ts` →
  `tests/unit/recipes/`), delete `tests/e2e/recipe-import.spec.ts` and
  `tests/e2e/ocr-import.spec.ts`; edit `tests/e2e/csp.spec.ts` (drop
  `import.html` from the doc list + the OCR special-case), `tests/e2e/settings.spec.ts`
  (drop the two OCR tests, keep Cookbook/Hidden), and the guide tests
  (`tests/unit/guide/questions.fixture.ts`, `tests/unit/pages/user-guide-view.spec.ts`,
  `tests/e2e/user-guide.spec.ts`) that assert the share/import walkthrough.

Order (keep the tree green): relocate `provenance` first → delete import code +
page + shell → update build/manifest/nav/settings/guide → update/delete tests →
docs → run the gate.

## Reasoning

- **Why delete rather than hide:** the feature's cost is structural (a CSP
  relaxation weakens the site-wide no-eval/no-wasm posture, and the page + module
  tree + tests are ongoing maintenance). A dark-launch/hide leaves all of that in
  place for a feature the owner has judged a failure. Removing it also lets the
  build reassert a **uniform strict CSP** across every page — a security win, not
  just cleanup.
- **Why `provenance.ts` and `editor.html` stay:** they are not part of the import
  surface. `sourceUrl` is an open-world record field (documented in
  `docs/LEXICONS.md`) written by `buildRecipeRecord` and rendered by the editor
  for *any* record that carries it; the wikibooks corpus produces such records.
  Deleting the provenance renderer would silently drop a valid, tested surface.
- **Why the guide entry goes:** leaving a user-guide section that walks through a
  removed feature is a documentation bug — it tells cooks to use a Share flow that
  no longer exists.
- **TDD-on-removal posture:** tests that pin the old behavior are removed with the
  code; where a surface changes shape but survives (Settings, the guide, CSP),
  the spec is edited to pin the new (feature-absent) behavior, and the gate must
  be green before commit.

## Outcome

Removed 2026-07-23. `import.html`, `src/pages/import.ts`, and all of `src/import/`
(except `provenance.ts`, relocated to `src/recipes/provenance.ts`) are gone, along
with the Alchemy "Import" button, the Settings OCR section, the manifest
`share_target`, the user-guide share entry, and the whole `wasm` CSP relaxation
machinery in `scripts/build.mjs`. Recipe authoring is unaffected (editor.html /
"New"), and the editor still renders the provenance line for any record carrying
`sourceUrl`.

Gate: lint clean, typecheck clean, build clean (15 pages, no `import`), **e2e 268
passed**, unit 978 passed. The only unit failures (7) are pre-existing and
unrelated — `tests/unit/social/cookbook-members-view.spec.ts` fails in isolation
with `localStorage.clear is not a function`, and that file is not in this diff.

Security note: dropping the OCR WASM relaxation means **every page now carries the
same strict CSP** (`script-src 'self'` + inline-script hashes; no `wasm-unsafe-eval`,
no `worker-src blob:`). `tests/e2e/csp.spec.ts` was tightened to assert this
uniformly rather than special-casing `import.html`.
