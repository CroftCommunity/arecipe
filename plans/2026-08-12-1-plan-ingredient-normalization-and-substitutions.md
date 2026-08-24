# Ingredient normalization + hybrid substitution engine

**Status:** 📋 Planned (2026-08-12). Supersedes the direct-regex matching approach
in PR #87; that PR's UI surface may be reusable — Phase 0 decides.

Mostly-deterministic hybrid: a build-time reviewed canonical ingredient
vocabulary (the `dishKey` pattern applied to ingredients), a runtime matcher
whose deterministic layers are authoritative, a local correction overlay
(the `exclusions.ts` overlay idiom), and an OPTIONAL closed-set embedding
fallback behind a decision gate. Powers both search-by-ingredient and
descriptor-aware substitutions.

## Outcome Summary

| Phase | Outcome | Commit | Note |
|-------|---------|--------|------|
| 0 Discovery | ⏳ | | Census + PR #87 disposition + seam checks |
| 1 Vocabulary build tool (M1) | ⏳ | | `build-ingredientkeys.mjs` + human review |
| 2 Matcher pure core (M1 exit) | ⏳ | | `ingredient-key.ts`: descriptor split + alias lookup |
| 3 Search by ingredient (M2) | ⏳ | | Canonical field in MiniSearch |
| 4 Substitution engine (M2 exit) | ⏳ | | Rules keyed on `key`, variety overrides |
| 5 Compound-line split | ⏳ | | "salt and pepper", "juice of 1 lemon" |
| 6 Correction overlay (M3 exit) | ⏳ | | Local KB: confirm/correct + export for promotion |
| GATE | ⏳ | | Proceed to M4 only if overlay telemetry demands it |
| 7 Vocab embeddings asset (M4) | ⏳ | | Build-time vectors, static asset |
| 8 Runtime fuzzy tier (M4 exit) | ⏳ | | Worker + quantized MiniLM, closed-set, labeled |
| 9 PDS alias records | roadmap | | Community corrections; re-plan before execution |

## Problem Statement

Substitution matching via direct regex over raw ingredient text (PR #87) is
naive: it re-solves parsing badly and cannot handle descriptor semantics
("smoked paprika" vs "paprika" vs "ground cinnamon"). Separately, we want
search-by-ingredient. Both need the same missing layer: canonical ingredient
identity across recipes.

The corpus (~289 records, low-thousands ceiling per `search.ts`) is small
enough to normalize at build time with human review — the proven
`build-dishkeys.mjs` workflow. But arecipe is open-world AT Protocol: recipes
arrive from other cooks' PDSs at runtime, so a runtime matcher over the shipped
vocabulary is also required. Corrections the matcher cannot make
deterministically become a local knowledge base that feeds back into the
shipped baseline at build review.

## Constraints (load-bearing)

- **No backend.** Everything is build-time assets + client code.
- **Deterministic layers are authoritative.** The fuzzy tier (if built) is a
  closed-set selector over existing keys — it can never invent an ingredient,
  only mispick one, bounded by a threshold. Its output is always labeled.
- **TDD without exception.** Failing test before production code, every phase.
- **Pure cores stay pure.** New matcher/engine modules: no DOM, no `src/auth/`
  imports, defensive open-world reads (the `read.ts`/`model.ts` posture).
- **Reuse, don't reimplement.** `parseIngredient` / `normalizeIngredientName`
  (`src/recipes/shopping-list.ts`) are the parsing seam. The overlay store
  mirrors `exclusions.ts`. Seed substitution data comes from the pairs tables
  in `src/pages/reference-view.ts`.
- **Bundle discipline.** Vocabulary JSON rides the normal bundle (few KB).
  Embedding vectors and the ONNX model (Phases 7–8) are lazy, SW
  cache-on-demand, and OUT of the precache manifest.

---

## Phase 0 — Discovery (no production code)

`[verify-in-run]` items; record findings before Phase 1:

- **PR #87 disposition.** Diff the PR branch against main. Identify: where the
  engine lives, what UI surface it added, what (if anything) survives this
  plan. Decision recorded here: reuse UI shell / start clean.
- **Ingredient census.** Throwaway script: run `parseIngredient` over every
  ingredient line in the corpus (starter feed fixtures + `spike/import`
  batches). Output: distinct normalized names with frequencies, top-200 by
  count, and every multi-word name (descriptor candidates). This sizes
  Phase 1's review and seeds the descriptor word lists.
- **Parser seam check.** Confirm `ParsedIngredient` exposes the normalized
  name cleanly for downstream keying; note any fields the matcher needs that
  don't exist (expected: none).
- **Compound-line frequency.** From the census, count lines matching
  " and ", " or ", "juice of", "zest of" — sizes Phase 5 and decides whether
  it moves earlier.
- **MiniSearch field cost.** Confirm adding one stored+indexed field to
  `SearchDoc` (`src/recipes/search.ts`) keeps whole-index rebuild in the
  documented milliseconds band at corpus scale.
- **Reference chart extraction.** Confirm the `kind: 'pairs'` tables in
  `reference-view.ts` are mechanically extractable as substitution seed rows.

## Milestone M1 — Canonical vocabulary exists

**Exit:** a reviewed `ingredientkeys.json` ships as a static asset, and a pure
matcher module resolves corpus ingredient lines to keys with measured coverage.

### Phase 1 — `spike/import/build-ingredientkeys.mjs`

Sibling of `build-dishkeys.mjs`, same workflow: auto-propose, human review,
commit the reviewed map.

- Input: census from Phase 0. Output: `ingredientkeys.json` —
  `{ keys: { [key]: { aliases: string[] } }, descriptors: { variety: string[],
  prep: string[], quality: string[] } }` plus `_meta` counts, mirroring the
  dishkeys `_meta` style.
- Descriptor taxonomy is data, not code: **variety** changes identity and
  substitution behavior (smoked, dark, ground-vs-stick); **prep** (chopped,
  minced, beaten, sifted) and **quality/size** (large, fresh, ripe) do not.
  Expected scale ~100–200 words total, seeded from the census multi-word names.
- TDD on the proposal logic (grouping, alias folding) with census fixtures.
- **Human review checkpoint before commit** — the single quality gate, as with
  dishkeys. Groups reviewed, not rubber-stamped.

### Phase 2 — `src/recipes/ingredient-key.ts` (pure core)

- `resolveIngredient(raw: string, vocab): Resolution` where `Resolution` is
  `{ key, variety?, prep?, method: 'exact' | 'alias' } | { method: 'unmatched',
  name }`. Pipeline: `parseIngredient` → descriptor split against the taxonomy
  → exact/alias lookup. First match wins; unmatched stays unmatched, loudly —
  the parser's "surfaced, never invented" posture.
- TDD: fixtures drawn from the real census, including the descriptor cases
  ("smoked paprika" → `{ key: 'paprika', variety: 'smoked' }`, "2 large eggs,
  beaten" → `{ key: 'egg', prep: 'beaten' }`), plurals, unit noise.
- Coverage test: resolver over the full corpus census asserts a floor
  (propose ≥90%; tune to Phase 0 findings). This number is the M1 metric and
  the later GATE input.

## Milestone M2 — User-visible features on the deterministic core

**Exit:** searching an ingredient finds recipes that phrase it differently, and
the recipe page offers descriptor-aware substitutions from the curated table.

### Phase 3 — Search by ingredient

- Add `ingredientKeys: string` (space-joined canonical keys) to `SearchDoc`;
  index + boost alongside `ingredients`. Raw text stays indexed — canonical
  field adds recall, never replaces.
- e2e: recipe listing "smoked paprika" is found by query "paprika"; "green
  onion" recipe found by "scallion" (alias path).

### Phase 4 — Substitution engine + surface

- `src/recipes/substitutions.ts` (pure core): rules keyed on canonical `key`,
  optional variety-scoped overrides, each rule carrying ratio text and context
  flags where known (e.g. egg-as-binder vs egg-as-leavening). Seed rows
  extracted from the reference-view pairs tables; the reference page keeps
  rendering the same data — one source, two surfaces.
- Lookup: exact `{key, variety}` rule wins over bare `key` rule. No rule → no
  suggestion. Never generate a ratio.
- UI (per Phase 0's PR #87 disposition): substitution affordance on the recipe
  page's ingredient lines, only where a rule resolves. e2e on a fixture recipe.

### Phase 5 — Compound-line split

- Pre-resolver split rules in the parser layer: coordinated ingredients
  ("salt and pepper") and derived-form phrasings ("juice of 1 lemon", "zest
  of…"). Conservative list from Phase 0 frequencies; unsplittable lines resolve
  unmatched rather than wrongly. TDD from census examples.

## Milestone M3 — Correction knowledge base

**Exit:** a user correction permanently converts an unmatched string into a
deterministic hit on that device, and corrections export for baseline
promotion.

### Phase 6 — Local overlay + confirmation loop

- `src/recipes/ingredient-aliases-local.ts`, mirroring the `exclusions.ts`
  overlay idiom and the `*-local` store shape. Entries: `{ raw, key,
  confirmedAt }` — keyed on the RAW string, so parser improvements can't
  orphan them. Precedence: overlay > shipped baseline > unmatched.
- Resolver gains `method: 'overlay'`; overlay hits never re-enter any fuzzy
  path.
- UI: unmatched (and later fuzzy-labeled) ingredient lines get a lightweight
  "is this X?" confirm/correct affordance picking from existing keys only.
- Export: settings-adjacent "export ingredient corrections" producing the JSON
  block to paste into `ingredientkeys.json` aliases at next build review —
  the manual promotion path. (PDS-published community aliases = Phase 9,
  roadmap.)

## DECISION GATE — is M4 warranted?

After M3 has real usage: if overlay volume is low and coverage (M1 metric,
re-measured on live feed data) holds, **stop here** — the alias table is
keeping up and the system is fully deterministic. Proceed to M4 only if
unmatched-rate telemetry shows sustained gaps the alias workflow can't close.
Building M4 without this evidence is scope creep.

## Milestone M4 — Closed-set fuzzy fallback (optional)

**Exit:** unseen strings resolve to existing keys with labeled provenance;
zero impact on initial load; feeds Phase 6's confirmation loop.

### Phase 7 — Build-time vocabulary embeddings

- Build script embeds every key + alias with all-MiniLM-L6-v2 (384-dim);
  vectors ship as a static binary/JSON asset (few hundred entries ≈ a few
  hundred KB fp32; quantize if it matters). Regenerated whenever
  `ingredientkeys.json` changes; a freshness test pins that coupling.

### Phase 8 — Runtime fuzzy tier

- Web Worker + Transformers.js, quantized ONNX MiniLM (~23MB). Lazy-loaded on
  first fall-through only; SW caches on demand; NOT in precache. WASM/CPU path
  (no WebGPU dependency — one short string per lookup is cheap).
- Closed-set only: cosine against the shipped vectors, accept above threshold
  (tune on held-out census pairs), else unmatched. `method: 'fuzzy'` renders
  the "closest match" label; substitutions from fuzzy resolutions are visibly
  provisional; confirmations flow into the Phase 6 overlay, shrinking this
  tier over time.
- TDD: worker protocol and threshold logic unit-tested with precomputed
  vectors (no model download in hermetic CI); one @live-style tier exercises
  the real model.

## Phase 9 — PDS alias records (roadmap; re-plan before execution)

Publish confirmed aliases as open-world records on the cook's PDS; build step
harvests and aggregates across cooks with provenance; human review before any
promotion into the shipped baseline remains the quality gate. Shape TBD —
re-confirm against the interactions/follows record patterns at planning time.
