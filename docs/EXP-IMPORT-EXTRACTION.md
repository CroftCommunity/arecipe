# EXP-IMPORT-EXTRACTION — how much better can import get, and what gets it there

**Date:** 2026-07-23 · **Branch:** `claude/import-extraction-exp-re1khh` (experiment;
nothing merges to `main` except this findings doc and, since Arm 1 wins, the
follow-up run file `RUN-IMPORT-HARDENING.md`).

---

## Verdict

- **Phase 0 — the CORS ceiling is total on the URL rung.** Of 41 real recipe
  URLs probed, **0 of the 10 reachable recipe documents advertise a browser-usable
  `Access-Control-Allow-Origin`** → a cross-origin `fetch(url,{mode:'cors'})` is
  blocked for **100%** of them. The shared-`text`/paste path is the real import
  surface, exactly as §2 predicted. This is a property of the web, not of the
  parser, and it is unfixable without a proxy (which is a backend).
- **Arm 1 — GO. Ship it.** Deterministic hardening (microdata + RDFa + h-recipe +
  JSON-LD `yield` shapes) lifts the corpus **usable-draft rate from 59% → 94%**
  and converts **6 / 6** structured-but-not-JSON-LD rows the deployed ladder
  misses, at zero model cost and on every device. Wired into the ladder on this
  branch; the ordered follow-up is `RUN-IMPORT-HARDENING.md`.
- **Arm 2 — NO-GO (deferred, not disproven).** Per the §6 kill criterion, Arm 1
  closes most of the gap left after the CORS ceiling, so a desktop-only model + a
  runtime dependency is not justified by the residual. The residual that *does*
  remain (informal-text pastes) is better closed by more **deterministic** text
  hardening — all-devices — than by a desktop-only model. Independently, Arm 2's
  own kill-criteria metrics (rejection rate, usable-draft rate on the residual)
  **cannot be produced in this environment** — Gemini Nano is desktop-Chrome and
  hardware gated — so shipping it would violate its own pre-registered gate. The
  **safety core is built and green regardless** (verbatim gate, 12 tests), so a
  future field run starts with the provenance guarantee already in place.

**Follow-up (share-accuracy pass, 2026-07-23).** Since the main use case is
arecipe as a share target and a share carries **text, not page HTML**, the text
heuristic — not the structured rungs — is what decides share accuracy. It was
hardened for real shared text (strip site chrome, read prose yield/times, keep
ingredient sub-headings, accept informal unlabeled steps, trim trailing junk) and
the OS-provided share **title** is now used as the recipe name. Measured effect:
the informal chat-paste residual now converts, and the structured-DOM extractors
are re-cast as a **precision** layer over the (now much stronger) text path rather
than a coverage flip. Details in `RUN-IMPORT-HARDENING.md`.

CORS is browser-enforced, so — per this repo's own house rule in
`docs/GITHUB-CORS-PROBE.md` — the definitive CORS evidence is either a real-browser
test or the **advertised document headers**; the latter is dispositive for the
*negative* case (no permissive `ACAO` on the document ⇒ the browser blocks the
read, full stop). That is the tier used here, and it is sufficient because the
finding is a ceiling of zeros.

---

## What is measured here vs. what a field run must still measure

This experiment ran inside an automated Claude-Code session. Two of its
measurements are gated by that environment, and the honest scope is stated up
front rather than papered over with invented numbers:

| Measurement | Status here | Why |
| --- | --- | --- |
| Phase 0 fetch outcome + advertised `ACAO` on 41 real URLs | **Measured (real)** | Direct-egress `curl` reads real status + headers; absent `ACAO` is a dispositive browser block. |
| Arm 1 deterministic conversion (usable-draft rate, per-field P/R, per-format delta) | **Measured (real)** | The parser is deterministic and browser-independent; runs identically here and in the browser. |
| Arm 2 verbatim gate + deterministic-first merge behavior | **Measured (real, mock model)** | Pure logic; exercised with a mock `ModelSession`. |
| Arm 2 **live** rejection rate, latency, availability, hardware-satisfaction | **Deferred to a field run** | Chrome's Prompt API / Gemini Nano is desktop-Chrome + hardware gated; not present in this sandbox's Chromium. Fabricating these numbers would defeat the experiment. |
| A 40-page corpus of **scraped live** recipe HTML | **Not collectible here** | The same CORS/bot wall (below) blocks automated collection of page *content*. The parse-quality corpus is therefore representative **fixtures**, honestly labeled; the fetch-outcome corpus is 41 **real URLs**. |

---

## Phase 0 — instrument before improving

### The fetch/CORS probe (real)

Harness: `tools/import-experiment/cors-probe.sh` over
`tools/import-experiment/corpus/urls.tsv` (41 real recipe URLs across big sites,
blogs, microdata/RDFa/h-recipe-era sites, non-English, aggregators, a JS-rendered
page, a consent wall, and open sources). For each URL it records — via **direct
egress** (`--noproxy`, required because the session's agent proxy would otherwise
answer with its own status, same as the GitHub CORS probe) with
`Origin: https://arecipe.app` — the real HTTP status, the advertised
`Access-Control-Allow-Origin`, and the content type. Raw results:
`tools/import-experiment/corpus/cors-probe.tsv`.

| Outcome | Count | Meaning for the URL rung |
| --- | ---: | --- |
| Reachable `2xx` | 10 | fetch would return a body… |
| &nbsp;&nbsp;…of which advertise a usable `ACAO` | **0** | **…but the browser blocks the cross-origin read** |
| &nbsp;&nbsp;…of which send **no** `ACAO` | 10 | blocked |
| Redirect `3xx` | 6 | resolves to same-origin story |
| Bot-blocked `403/402/429` | 15 | no body reaches any automated client at all |
| `404` (stale probe slug — our guess, not site behavior) | 9 | excluded from the CORS ratio |
| `5xx` | 1 | transient |

**Headline: CORS pass rate on reachable recipe documents = 0 / 10 = 0%.** The
single `Access-Control-Allow-Origin: *` seen in the whole run was on
minimalistbaker's **404 error page** (a CDN default), not a recipe. Every actual
`200` recipe document — food.com, tasteofhome, loveandlemons, pinchofyum,
gimmesomeoven, thewoksoflife, 101cookbooks, giallozafferano, wikibooks — sent
**no** `ACAO`.

Two independent walls therefore cap the URL rung: **CORS** (even a perfectly
reachable page can't be read cross-origin) and **bot-blocking** (37% of the list
never returns a body to any non-browser client). The first is the permanent one:
it holds even for a real user's browser with real cookies. **Conclusion (matches
§2): the URL rung converts ≈nothing in-browser; the paste / shared-`text` path is
the import surface, and all downstream effort should aim there.**

### The parse-quality corpus (representative fixtures)

Because the same wall blocks automated collection of page *content*, the
parse-quality corpus is 20 **representative fixtures** in
`tests/fixtures/import/`, one per format/category in §2's taxonomy, each with
hand-keyed gold. This is labeled honestly as fixtures, not scraped pages — but the
measurement run against them is fully real, because the parser is deterministic
and behaves identically in Node and in the browser. Corpus + gold + the two
ladders live in `tests/unit/import/corpus-report.spec.ts`; the generated table is
`tools/import-experiment/corpus/conversion-report.md`.

---

## Arm 1 — harden the deterministic path

Added, each test-first (RED→GREEN), all pure and operating on the same inert
`Document` the JSON-LD rung already consumes:

- **`src/import/recipe-dom.ts`** — three new rungs: schema.org **microdata**
  (`itemscope`/`itemprop`, with nested-scope exclusion so an embedded Review/Person
  can't leak in), **RDFa** (`vocab`/`typeof`/`property`, incl. prefixed
  `schema:` properties), and the **h-recipe microformat** (v2 `p-`/`e-` classes
  and legacy v1). Wired into `src/import/acquire.ts` between JSON-LD and the text
  heuristic.
- **`src/import/recipe-jsonld.ts`** — `recipeYield` now also reads the legacy
  `yield` key and a `QuantitativeValue` object (`{value, unitText}`).

### Conversion (measured, scorable rows)

| | Deployed ladder | Arm 1 ladder |
| --- | ---: | ---: |
| **Usable-draft rate** | **59%** | **94%** |
| Rows converted that the deployed ladder misses | — | **6** |

Per-field precision / recall (the §5 metric):

| field | deployed P/R | Arm 1 P/R |
| --- | --- | --- |
| name | 88% / 88% | 94% / 94% |
| ingredients | 94% / 94% | **100% / 100%** |
| instructions | 59% / 59% | **94% / 94%** |
| recipeYield | 88% / 88% | **100% / 100%** |

### Per-item conversion delta (orders the follow-up run file)

Every structured-but-not-JSON-LD row is converted; nothing regresses. This is the
ordering `RUN-IMPORT-HARDENING.md` uses.

| Arm 1 item | corpus rows converted |
| --- | ---: |
| Microdata extraction (incl. nested-scope exclusion) | 3 (microdata, nested-scope, fr) |
| h-recipe microformat (v2 + v1) | 2 |
| RDFa extraction | 1 |
| JSON-LD `yield`-shape hardening (`yield` key, QuantitativeValue) | field-level (yield P/R 88%→100%) |

The 9 JSON-LD rows were already usable on both ladders (delta 0) — expected, since
Google's rich-results program pushed the big sites onto JSON-LD; hardening those
shapes is maintenance, not conversion.

---

## The residual after Arm 1 (what Arm 2 was proposed for)

Three corpus rows remain not-usable after Arm 1, plus one paste row:

- **`paste-message`** — an informal recipe pasted from a chat: lowercase, no
  `Method`/`Ingredients` headings, unlabeled step lines. The conservative text
  heuristic (which needs a heading or a numbered run) declines it. **This is the
  one genuinely-addressable residual, and it is a deterministic-text problem**, not
  a structured-data one — fixable on all devices by loosening the heuristic, no
  model required.
- **`prose-blog`** — a recipe told entirely in narrative prose, no list, no
  structure. Extracting it means *composing* structure the source doesn't contain
  — precisely what the verbatim invariant forbids.
- **`consent-wall`** / **`js-rendered`** — the fetched/pasted HTML contains no
  recipe at all (a cookie notice; an un-hydrated shell). No extractor, model or
  otherwise, can read what isn't there; this is the render/consent ceiling, a
  sibling of the CORS ceiling.

So the residual splits into (a) informal text → **deterministic text hardening**,
and (b) genuine ceilings → **no extractor helps**. Neither is a case for a
desktop-only model.

---

## Arm 2 — constrained model extraction (built, gated, deferred)

Built test-first and green, with a **mock** model:

- **`src/import/verbatim.ts`** — THE safety core (§8's "most important code"). Every
  extracted ingredient/instruction must appear verbatim (whitespace-normalized) in
  the source; any span that does not rejects the **whole** extraction. 12 tests:
  exact, whitespace-normalized, absent, substring-of-a-different-field, empty
  extraction, empty source, and the wholesale-rejection contract.
- **`src/import/model-extract.ts`** — Chrome Prompt-API wrapper: a
  `responseConstraint` JSON Schema pinning output to the recipe field shape, a
  SELECT-don't-compose prompt, the verbatim gate, and `mergeDeterministicFirst`
  (deterministic always wins; the model fills only empty fields, never overwrites
  a found one). 8 tests, incl. wholesale rejection when even one of several spans
  is fabricated, and deterministic-first merge leaving a found field untouched.

**Why it does not ship now:**

1. **§6 kill criterion (met).** Arm 1 closes most of the post-CORS gap (59%→94%).
   A desktop-only code path + model dependency needs a real remaining problem; the
   remaining problem (informal-text pastes) is deterministic and all-devices.
2. **Its own metrics are unmeasurable here.** Rejection rate, usable-draft rate on
   the residual, cold availability latency, per-source latency, and how many test
   machines satisfy the Prompt API's hardware bar all require the live API on real
   desktop hardware. This sandbox's Chromium has no Gemini Nano. Per §6, Arm 2 may
   not ship without those numbers clearing the pre-registered thresholds — so it
   cannot ship from here on principle, not just on preference.

**Pre-registered Arm 2 gate for the field run (unchanged from §6), if it is ever
run:** verbatim rejection rate > 20% ⇒ fail (the model is writing, not selecting);
usable-draft rate on the residual < 50% ⇒ fail; and **no Arm 2 result may be used
to argue for relaxing the verbatim invariant** — if the invariant is what caps
quality, the answer is that this approach does not work here. The verbatim gate is
already built so that a field run measures the real thing.

---

## Go / No-go (against §6, fixed before results)

| Arm | Decision | Basis |
| --- | --- | --- |
| **Phase 0** | Finding recorded | CORS ceiling = 0/10 reachable; paste/shared-text is the surface. |
| **Arm 1** | **GO — ship** | 59%→94% usable, 6/6 structured rows converted, zero model cost, all devices. → `RUN-IMPORT-HARDENING.md`. |
| **Arm 2** | **NO-GO — defer** | Arm 1 closes the post-CORS gap (§6); residual is deterministic-text, not model-shaped; live gate metrics unmeasurable here. Safety core kept. |

## Deliverables produced

- This document.
- `RUN-IMPORT-HARDENING.md` (Arm 1 wins) — ordered by the conversion delta above,
  fixtures committed under `tests/fixtures/import/`.
- Code: `src/import/recipe-dom.ts`, `src/import/verbatim.ts`,
  `src/import/model-extract.ts`, `src/import/score.ts`; JSON-LD yield hardening;
  ladder wiring in `src/import/acquire.ts`.
- Tests: `verbatim.spec.ts` (12), `score.spec.ts` (17), `recipe-dom.spec.ts` (11),
  `model-extract.spec.ts` (8), `corpus-report.spec.ts` (3), JSON-LD yield (2).
- Harness/data: `tools/import-experiment/` (probe script, 41-URL list, raw probe
  TSV, generated conversion report).

## Reproduce

```
# Phase 0 fetch/CORS probe (needs direct egress):
bash tools/import-experiment/cors-probe.sh > tools/import-experiment/corpus/cors-probe.tsv

# Arm 1 conversion report + per-field P/R:
EMIT_REPORT=1 npx vitest run tests/unit/import/corpus-report.spec.ts

# Safety core + all import unit tests:
npx vitest run tests/unit/import
```
