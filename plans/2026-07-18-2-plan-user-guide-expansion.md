# Plan: user-guide expansion — narrative entries + staged screenshots

**Date:** 2026-07-18 · **Status:** DONE (this run)

## Ask

Build out `user-guide.html` beyond the single share-to-import entry: more
demonstration of features and workflow, in the narrative voice of `agents.md`
(prose that explains what a thing is *for*) rather than terse how-to steps.
Screenshots wanted. Topics requested: the Bluesky tie-in in plain English at
the top; Browse and what it's for; adding a cook; filtering with a note on
taste and diet settings; Cookbook likewise; sharing a recipe; sharing the
entire cookbook; opening a recipe; focus mode; the reference icon; fun facts
with a link to disable; hide recipe and its purpose; comments; then meals —
weeks, publishing, shopping lists. Also: note for later that a dedicated
"Why Bluesky?" page is wanted (linkable from sibling Croft projects, e.g.
Croft.img) — recorded in `TODO.md` § Ideas.

## Shape

- **Content stays a pure DOM builder** (`src/pages/user-guide-view.ts`,
  unit-tested in happy-dom). Fifteen ordered `GUIDE_ENTRIES`, each with a TOC
  anchor (`nav.guide-toc`, chip links). The Bluesky explainer leads; the
  original share-to-import walkthrough survives verbatim as one entry.
- **Honest claims are pinned by tests** (`tests/unit/pages/user-guide-view.spec.ts`):
  no-server / your-account / public framing; follows and hides are
  device-local; preference-excluded recipes are *hidden, not flagged*;
  comments are cookbook-scoped; shopping aggregation "never guesses";
  settings links point where the setting actually lives.
- **Screenshots are regenerable, not hand-made.** `tools/guide-shots.mjs`
  serves `dist/`, stages every network origin (plc.directory, PDS, image CDN)
  with routed records carrying REAL dag-cbor CIDs (so the integrity check
  passes — no "ALTERED?" stamps), and captures nine JPEGs into
  `assets/guide/` at phone width (planner at 720px). Dish photos are pinned
  freely-licensed Wikimedia Commons files; their artist/license/source ride
  in each record's image `credit`, so the app's own attribution overlay is
  visible in the shots. Rerun after any visual change:
  `npm run build && node tools/guide-shots.mjs` (env
  `GUIDE_SHOTS_EXECUTABLE` for a non-pinned Chromium).
- **e2e** (`tests/e2e/user-guide.spec.ts`): TOC anchor navigation works, and
  every guide `<img>` loads with `naturalWidth > 0` — a missing/miscopied
  asset fails the gate instead of shipping a broken image.
- **CSS**: `.guide-toc` chip list; `.guide-shot` fluid images capped at
  420px with mono captions (mobile-fit still guards 320/360/390px).

## Outcome

All gates green: lint · typecheck · 818 unit · build · 218 e2e. Guide bundle
3K→18K (7K gz); `assets/guide/` adds ~1.4 MB of JPEG (lazy-loaded).
Follow-ups left in TODO: the dedicated "Why Bluesky?" page.
