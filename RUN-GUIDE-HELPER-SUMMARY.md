# RUN-GUIDE-HELPER — summary

A question box on the user guide: type a question, get ranked **deep links** to
the exact section that answers it, and land there scrolled-in and highlighted.
The deep link is the product; prose is decoration. This run shipped **Layer A +
Layer B** (deterministic lexical retrieval + curated phrasings). Layer C (model
assist) was **gated out** — see §4.

---

## 0. Phase 0 — re-ground (findings)

Probed before any code; contradictions with the run's stated design are called
out as findings.

- **Guide source & rendered location.** The guide's source is
  `src/pages/user-guide-view.ts` — a **DOM builder** (`GUIDE_ENTRIES` +
  `renderUserGuide()`), not Markdown. `user-guide.html` is a static shell that
  mounts the rendered content client-side via `src/pages/user-guide.ts`. **There
  is no Markdown source and no pre-rendered HTML body file.**
- **Heading & anchor convention.** Each entry renders as
  `<section class="guide-entry" id="{testid}">` with one `<h3>` title; the TOC
  links `#{testid}`. Anchors are the **hardcoded `testid` literals**
  (`guide-entry-bluesky`, …).
- **Anchor stability — already satisfied.** Because anchors are hardcoded string
  constants (not slugified from titles or derived from order/content), they are
  **byte-stable across rebuilds**. → **Phase 2's "fix anchor stability first"
  task was NOT needed** and was skipped. (Contrast: `scripts/md-to-html.mjs`
  `slugify()` derives ids from heading text for the agents page — the guide does
  not do this.)
- **MiniSearch reuse.** `src/recipes/search.ts` configures MiniSearch with
  `prefix + fuzzy + per-field boost` and an empty-query identity guard. The
  *pattern* is reused; the *config* is recipe-specific (CachedRecipe docs, dish
  collapse). The guide gets its own small module with a **score threshold**
  (D4) that recipe search has no need for.
- **Build asset registration.** `scripts/build.mjs` writes generated files
  straight into `dist/` and bakes a `__PRECACHE__` list into the service worker.
  CSP `connect-src 'self'` would allow a same-origin index fetch. The guide index
  is written to `dist/guide-index.json` at build time.
- **Question-box placement.** Top of the guide page — between the intro line and
  the topic index — so "type a question" precedes "scan the list."
- **FINDING (contradiction with D1/Phase-1 framing).** D1 and the Phase-1 test
  descriptions assume a **hierarchical Markdown guide** ("walks the user guide
  source", "nested headings produce breadcrumb chains", "section text excludes
  child section text"). The real guide is a **flat list of 15 sibling sections**,
  each a single `<h3>` — so breadcrumbs are shallow (`["User guide"]`) and
  "excludes child text" is trivially satisfied on the real guide. The indexer is
  written **generically** (it walks headings h1–h6, builds breadcrumb chains, and
  excludes child-section text) and those behaviours are exercised by **fixtures**;
  the real guide exercises only the flat case. A future nested guide indexes
  correctly with no change.

---

## 1. Architecture as shipped

Three modules + one build step, all deriving the index from the **same code** at
build time and runtime, so the index cannot drift from the guide:

- `src/guide/model.ts` — `GuideSection`, `buildGuideIndex(root)` (the pure
  heading-walk), `collectAnchorIds`, `assertValidAnchors` (D2 gate),
  `serializeGuideIndex` (deterministic).
- `src/guide/search.ts` — `createGuideSearch(sections)` (MiniSearch, threshold,
  stable ordering), plus the **Layer C guard** `validateLayerCAnchors` /
  `fuseLayerC` (D5) as a pure invariant so Layer C cannot be bolted on wrongly.
- `src/guide/question-box.ts` — `mountGuideHelper` (deep-link results / no-match
  state) and `wireGuideHighlight` (highlight-on-arrival).
- `scripts/build-guide-index.mjs` — bundles the guide with esbuild, renders it
  under happy-dom, builds + **validates** the index (D2), and emits
  `dist/guide-index.json` (deterministic). Wired into `scripts/build.mjs`.

**Runtime index source:** the app rebuilds the index from the **live guide DOM**
on the guide page (no fetch, offline-trivial, drift-proof). The build-time
`guide-index.json` is the generated artifact + D2 gate target + a
machine-readable help index; both derivations call the *same* `buildGuideIndex`
on the *same* rendered guide, so they are identical by construction.

---

## 2. TDD — RED then GREEN per phase

### Phase 1 (RED) — tests written first
`tests/unit/guide/{model,search,question-box,build-index}.spec.ts`,
`tests/e2e/guide-helper.spec.ts`, `tests/unit/guide/questions.fixture.ts`.

```
$ npx vitest run tests/unit/guide
Error: Failed to resolve import "../../../src/guide/model.js" … Does the file exist?
 Test Files  3 failed (3)
      Tests  no tests
```
RED confirmed: the tests demand modules that do not yet exist.

### Phase 2 (GREEN) — Layer A implemented
`model.ts`, `search.ts`, `question-box.ts`, build gate, question-box UI +
highlight-on-arrival, CSS. Order followed §3 (anchor stability skipped — already
stable). Measured:

```
$ npx vitest run tests/unit/guide
 Test Files  3 passed (3)
      Tests  23 passed (23)
[guide-helper] top-1 22/25, top-3 25/25
```
- **Top-1: 22/25 (88%). Top-3: 25/25 (100%).** Threshold **4.5** (off-topic
  fixture queries ≤ 3.8; every marked answer ≥ 7.2; terse "password" = 4.9).

### Phase 3 (Layer B) — curated phrasings
Added 3–6 hand-written question phrasings per section (`GUIDE_PHRASINGS` in
`user-guide-view.ts`, rendered as `data-phrasings`, read by `buildGuideIndex`).
The added vocabulary initially created an off-topic false positive
("train my dog to sit" → 12.5 via **prefix** `sit`→`site`). Fixed by
length-gating expansion: `prefix` only for terms > 3 chars, `fuzzy` only for
terms > 5 chars. Re-measured:

```
$ npx vitest run tests/unit/guide
 Test Files  4 passed (4)
      Tests  26 passed (26)
[guide-helper] top-1 22/25, top-3 25/25
```
- **Top-1: 22/25 (88%). Top-3: 25/25 (100%)** — held. Threshold lowered to
  **3.5** (off-topic fixture queries now ≤ 1.8: "dog"→0, "bitcoin"→1.8,
  gibberish→0; every marked answer ≥ 12.8; terse "password" = 4.9).
- **Layer B delta on this fixture: none in the top-1/top-3 counts** (top-3 was
  already saturated at 100%). Its value is (a) sharper separation of off-topic
  queries and (b) recall for the many real alternate phrasings the 25-question
  fixture doesn't enumerate. Recorded honestly rather than inflated by copying
  fixtures into phrasings — the two sets are disjoint.
- **The 3 top-1 misses are genuine semantic near-ties, each landing the correct
  section at rank 2** (so all are inside the top-3 the user sees):
  1. `"how do I stop seeing cuisines I dislike"` → hide (14) vs **filters** (13)
  2. `"how do I share a single recipe with someone"` → cookbook (182) vs share (68) vs **open-recipe** (48)
  3. `"where do I find measurement conversions"` → browse (15) vs **reference** (14)

### Phase 5 (GREEN) — full gate
```
$ npm run lint          → clean (0 problems)
$ npm run typecheck     → clean
$ npm run test:unit     → 90 files, 902 tests passed
$ npm run build         → OK; writes dist/guide-index.json (D2 gate ran)
$ npx playwright test   → 238 passed   (via the local Chromium config; see CLAUDE.md)
```
(`npm run test` runs e2e through the npm-pinned Playwright, which mismatches this
environment's Chromium build — a documented environment quirk, not a code
failure. e2e was run through the throwaway local config and then removed,
un-committed, per CLAUDE.md.)

---

## 3. Acceptance criteria

1. **Index generated from the guide; build fails on an invalid anchor.** ✓
   `buildGuideIndex` walks the rendered guide; `assertValidAnchors` throws in the
   build (D2). `model.spec.ts` proves both the accept and the throw.
2. **Deterministic build.** ✓ `serializeGuideIndex` is byte-identical across
   rebuilds (`model.spec.ts` + `build-index.spec.ts`).
3. **Retrieval quality measured against a committed 25-question fixture.** ✓
   `questions.fixture.ts` + `search.spec.ts` (top-1 22/25, top-3 25/25).
4. **Every result is a working deep link that lands and highlights.** ✓
   Results are `<a href="#anchor">`; `wireGuideHighlight` scrolls + flashes the
   target (`guide-helper.spec.ts` e2e clicks a result and asserts URL +
   in-viewport + `.guide-target`).
5. **No-match is an explicit state with a route onward.** ✓ Below threshold the
   helper renders the no-match card with a link to `#guide-toc`; it never
   improvises (`question-box.spec.ts`, `search.spec.ts`).
6. **A model citing an unknown anchor is rejected wholesale.** ✓ `fuseLayerC`
   drops the whole response and returns Layer A results (`search.spec.ts`).
7. **Works with no model; says nothing about it.** ✓ Layer A/B need no model; no
   "AI unavailable" copy (`question-box.spec.ts`, `guide-helper.spec.ts`).
8. **No query leaves the device or is persisted.** ✓ See §5 grep.

---

## 4. Layer C gate decision — **do not build Layer C**

**Decision: stop at Layer B.** Reasoning:

- **Top-3 is 100%** on the committed fixture: the answering section is *always*
  among the results the user sees. Since results are **links the user scans**
  (not a single generated answer), a correct link at rank 2 is a working
  deliverable — the deep link is the product.
- The 3 top-1 misses are genuine semantic ambiguities ("stop seeing … dislike"
  reads like *Hide*; "share a single recipe" collides with *share the whole
  cookbook*) — the kind of case where a shifting model verdict would trade one
  near-tie for another, not a systemic recall gap.
- Layer C's costs (a shipped embedding vector file, a runtime model dependency,
  a generative-summary surface that must be constrained under D5/D7) buy little
  against a 100%-top-3, zero-dependency helper that works on **every** device.
  The run's own stated preference: "A help system that needs no model on any
  device is the better outcome, not a lesser one."

The **Layer C contract is still locked** in code (`validateLayerCAnchors`,
`fuseLayerC`, tested by `search.spec.ts`) so that if the owner later disagrees,
Layer C can only be added in a way that cannot invent a destination (D5) and
must render its summary below the links (D7). **This gate is owner-overridable.**

---

## 5. No telemetry (D8)

The query is read once and handed to the in-memory searcher — nothing else.

```
$ grep -rn "console\.|fetch(|localStorage|sessionStorage|XMLHttpRequest|beacon|log\." src/guide/
(no matches)

$ grep -rn "input.value|query" src/guide/question-box.ts
93:    const query = input.value;          # read from the field
94:    if (query.trim() === '') return;     # empty-guard
95:    const found = searcher.search(query);# → in-memory MiniSearch, on-device
```

No logging, no network, no persistence, no off-device transmission anywhere in
`src/guide/`.

---

## 6. Files

**Added**
- `src/guide/model.ts`, `src/guide/search.ts`, `src/guide/question-box.ts`,
  `src/guide/build-entry.ts`
- `scripts/build-guide-index.mjs`, `scripts/build-guide-index.d.mts`
- `tests/unit/guide/{model,search,question-box,build-index}.spec.ts`,
  `tests/unit/guide/questions.fixture.ts`
- `tests/e2e/guide-helper.spec.ts`
- `RUN-GUIDE-HELPER-SUMMARY.md`

**Modified**
- `src/pages/user-guide-view.ts` — helper slot; `GUIDE_PHRASINGS` (Layer B);
  `data-phrasings` on each entry.
- `src/pages/user-guide.ts` — mount the helper; wire highlight-on-arrival.
- `scripts/build.mjs` — generate + write `dist/guide-index.json` with the D2 gate.
- `styles.css` — question-box, result-card, and landing-highlight styles
  (mobile-first; reduced-motion honored; mobile-fit at 320/360/390 verified).

**Out of scope (unchanged), per §5 of the run brief:** questions about the
user's own data, conversational follow-up, feedback widgets, and edits to the
guide's content. Gaps the fixture exposed (the "share" overload; "cuisines I
dislike" reading as Hide) are recorded here for a separate writing pass, not
patched in this run.
