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
| 0 Discovery | ✅ 2026-09-09 | | `runs/ingredient-normalization/PHASE0-FINDINGS.md` — corpus is 4,113 records / 35,274 lines (14× the plan's premise); #87: reuse shell, discard engine — **owner decision pending** |
| 1 Vocabulary build tool (M1) | ✅ 2026-09-09 (review open) | | `scripts/build-ingredientkeys.mjs` over the census fixture → `src/recipes/ingredientkeys.json` (1,052 keys) + `runs/ingredient-normalization/REVIEW.md`; `_meta.reviewed` flips true when the owner has read the report |
| 2 Matcher pure core (M1 exit) | ✅ 2026-09-09 | | `src/recipes/ingredient-key.ts`: head-phrase split → count-unit strip → descriptor peel → most-specific-first lookup; coverage **82.4%** by line weight, floor 75% pinned in `ingredient-key-coverage.spec.ts` |
| 3 Search by ingredient (M2) | ✅ 2026-09-09 | | `ingredientKeys` indexed beside raw text (boost 3) + whole-query canonicalization as an OR branch, so both directions reach; build-cost band pinned (< 3 s at 4k, measured ~0.4 s) |
| 4 Substitution engine (M2 exit) | ✅ 2026-09-09 | | `src/recipes/substitutions.ts`: cook rules keyed (+variety scope) rewrite lines; the 7 reference rows are suggestions; #87's shell reused, its regex engine discarded |
| 5 Compound-line split | ✅ 2026-09-14 | | `resolveLine`: derived forms ("juice of 1 lemon" → lemon juice), coordination without a quantity ("salt and pepper" → two parts), alternatives ("broth or water" → primary + fallbacks, shared-noun borrow); whole-first, never two guesses. Coverage 82.5% → **85.9%** |
| 5b Mined alternatives | ✅ 2026-09-14 | | `scripts/mine-alternatives.mjs` → `substitutions-mined.json`: 58 "X or Y" pairs (≥3 lines) as corpus-sourced suggestions beside the 7 reference rows |
| 6 Correction overlay (M3 exit) | ✅ 2026-09-09 | | `ingredient-aliases-local.ts` (device-local, keyed on the unmatched name); resolver method `overlay` first; "?" affordance on the recipe page picks an existing key; Settings exports the seed-alias block |
| GATE | decision 2026-09-14 | | Owner chose to build M4 ahead of overlay telemetry; the gate's evidence question (does the alias table suffice?) stays open and is re-asked at the M4 exit — see § DECISION GATE |
| 7 Vocab embeddings asset (M4) | ✅ 2026-09-14 (as lexical) | | No embeddings asset: the closed set is the vocabulary's keys + aliases, trigram-indexed at runtime in memory (`ingredient-fuzzy.ts`) — the MiniLM path is blocked by the CSP gate (no `wasm-unsafe-eval`) and a 23 MB model |
| 8 Runtime fuzzy tier (M4 exit) | ✅ 2026-09-14 | | Closed-set, thresholded (0.75), labeled `fuzzy` with score; last after every deterministic path; provisional swaps; the “≈ closest match?” confirm flows to the overlay. Coverage 86.7% → **89.1%**; precision 90%/85% in the bands ≥ threshold, 55% just below — battle-tested on the corpus (`FUZZY-EVAL.md`) |
| 9 PDS alias records | ✅ 2026-09-14 | | Re-planned and built: `plans/2026-09-14-plan-community-ingredient-aliases.md` — `app.arecipe.ingredientAlias` records, adopt-first publish / reconciling pull on the Account page, build-time candidates from trusted accounts (`--aliases-from`) |

## Problem Statement

Substitution matching via direct regex over raw ingredient text (PR #87) is
naive: it re-solves parsing badly and cannot handle descriptor semantics
("smoked paprika" vs "paprika" vs "ground cinnamon"). Separately, we want
search-by-ingredient. Both need the same missing layer: canonical ingredient
identity across recipes.

The corpus (~289 records when this was written; **4,113 records / 35,274 ingredient
lines by the 2026-09-09 census** — see Phase 0 findings) is small
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

### Phase 0 findings (2026-09-09)

Full report with method and tables: `runs/ingredient-normalization/PHASE0-FINDINGS.md`.
What it changes in this plan:

- **Sizing.** The live snapshot holds **4,113 records / 35,274 ingredient
  lines** (4,041 are the Wikibooks cook), not ~289. `spike/import` and the
  starter fixtures are subsets of it (27 spike-only names, all entity noise);
  **Phase 1's census source is the live snapshot**, not the spike batches.
- **Census.** 16,321 distinct `parseIngredient(...).name` values, 13,907
  singletons. Top-200 covers **38.0%** of lines, top-500 **46.0%**. The raw
  `name` is a normalized *tail*, not a head noun: `normalizeName` folds only the
  last word and keeps everything after commas/parentheses, so `salt to taste`,
  `salt, to taste`, `of salt` are three names. A naive head-phrase split (before
  the first comma, strip parentheticals, leading `of`, trailing `to taste`)
  lifts top-200/500 to **51.4% / 62.2%** and cuts names to 9,882.
- **Phase 2 pipeline gains two mandatory steps** before the descriptor split:
  a **head-phrase split** (comma / parenthetical / leading `of` / trailing
  phrase) and a **count-unit strip** (`clove(s)` 480 lines, `can` 282, `ea.`
  243, `slice(s)` 127, plus ~670 Wikibooks-style `(240 ml)` conversions). The
  irregular-plural fold (`bay leaves` → `bay leave` 77 vs `bay leaf` 74) is
  handled by vocabulary aliases, not a parser change.
- **Coverage floor.** ≥90% is not reachable by alias lookup over `.name`. State
  the floor as coverage of *lines by weight*; propose **75–80% for M1**, with
  90% moved to the GATE and re-measured once Phase 2's split exists.
- **Compound lines.** ` or ` 2,597 (7.4%) — mostly author-supplied
  alternatives, i.e. **Phase 4 seed data**, not a split problem; ` and ` 1,289
  (3.7%) — mostly prep phrases after a comma; `juice of` 72 and `zest of` 26.
  **Phase 5 stays last**; the split that matters is the comma/parenthetical one
  (21% of lines each) and it belongs in Phase 2.
- **Parser seam.** `name` and `normalizeIngredientName` are exposed cleanly.
  Missing for a matcher: the head/descriptor boundary, count units, irregular
  plurals — all owned by the matcher (or aliases), keeping the parser's
  shopping-list contract untouched.
- **MiniSearch.** No numeric rebuild band is recorded anywhere; the "milliseconds"
  header predates the 4k corpus and the perf plan already made the build lazy.
  Measured at 4,113 records: **332 ms** as-is, **394 ms** with one extra
  stored+indexed field (+19%; 20.8 → 26.2 ms at 289). Phase 3 should carry
  canonical *keys* (a few tokens per recipe, smaller than the measured fake)
  and add a numeric band test.
- **Reference charts.** 3 `pairs` tables / 26 rows import cleanly without DOM,
  but only the `substitutions` table (**7 rows**, prose with embedded
  quantities) is substitution seed; the rest are unit equivalences. Phase 4's
  seed = those 7 hand-parsed + the mined ` or ` alternatives.
- **PR #87 disposition — recommended: reuse the UI shell, discard the engine,
  do not merge as-is.** The engine (`applyLineSubstitution`/`substituteLines`,
  ~40 lines of raw whole-word regex that never calls `parseIngredient`) is what
  this plan supersedes. The shell (~70% of the diff: the `shopping-prefs` store
  extension, the Account "Substitutions ⇄" block with test ids, the recipe-page
  "Apply ⇄" toggle and `<del>`/`<span>` render with the "never a no-op control"
  rule, `meals.ts` default-on wiring, CSS, three hermetic e2e specs) is exactly
  Phase 4's surface, TDD'd, and still mergeable. Change the stored rule shape
  from free-text `{from, to}` to key-based *before* it lands, so no migration
  follows. Plan: Phase 4 cherry-picks the shell from
  `claude/recipe-substitutions-ie4xd5`, drops the engine and its tests, then
  closes #87 with a pointer. **Decision 2026-09-09 (owner): build the vocabulary
  approach up front and land the best version; reuse #87's shell in Phase 4,
  discard its engine.**

## Milestone M1 — Canonical vocabulary exists

**Exit:** a reviewed `ingredientkeys.json` ships as a static asset, and a pure
matcher module resolves corpus ingredient lines to keys with measured coverage.

### Phase 1 — `scripts/build-ingredientkeys.mjs` (was planned for `spike/import/`)

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

**As built (2026-09-09).** The tool lives in `scripts/`, not `spike/import/`,
because its grouping logic IS the runtime resolver's `canonicalHead`
(`src/recipes/ingredient-vocab-build.ts` → `ingredient-key.ts`, bundled with
esbuild at run time): `spike/` is non-production and cannot import the TS core,
and a proposal grouped by a second implementation of the split would drift from
how the app reads a line. The seed is data (`scripts/ingredient-vocab-seed.json`):
the descriptor taxonomy, `seedAliases` (synonyms the census cannot discover —
scallion ← green onion), and `seedKeys` (descriptor-bearing forms that are their
own ingredient — sweet potato is not a potato variety). Seeds claim lines through
the resolver itself, most-specific-first; the first draft folded an alias by its
stripped head and "sweet pepper" swallowed every plain pepper line — caught by the
review report, pinned by a test. Input is the committed census fixture
(`tests/fixtures/ingredients/census-lines.json`, every distinct raw line with its
count); `--snapshot <dir>` rebuilds it from a fresh capture. Line floor 3 → 1,052
keys, 82.4% coverage; floor 2 would add ~600 keys for +3.4 points. Output ships
with `_meta.reviewed: false` until the owner has read `REVIEW.md` (promotion
candidates, alias merges, tail).

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
  (was "propose ≥90%"; Phase 0 measured 38% raw / 62% after a head-phrase split
  at top-500 — see findings: state it by line weight, propose 75–80% for M1,
  90% at the GATE). This number is the M1 metric and
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

**As built (2026-09-09).** `searchDocOf` adds `ingredientKeys` (first-seen,
de-duplicated canonical keys of the record's lines; unmatched lines add nothing),
indexed at the `ingredients` boost. Query side: when the WHOLE query resolves to
a key that is not its own words ("green onion" → `scallion`, "garbanzo beans" →
`chickpea`), the key is searched exactly in the keys field as an OR-alternative
to the literal AND query — a recipe that says "scallions" is found by "green
onion". Multi-term queries are untouched. Unit: 9 cases (`search-ingredient-
keys.spec.ts`), e2e: "garbanzo" finds the fixture recipe that only says
"chickpeas". Cost: the vocabulary (9 KB gz) now rides the browse and cookbook
entries; page budget is 24 KB gz per entry.

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

**As built (2026-09-09).** `src/recipes/substitutions.ts` (pure, 12 cases RED
first). Two kinds of rule, one lookup through the resolver:

- A **cook rule** is typed as text on the Account page and stored by canonical
  KEY — `keyCookSubstitution` resolves "ground hamburger" to `ground beef`, and
  "smoked paprika" to `paprika` scoped to variety `smoked`. Text the vocabulary
  does not know is **refused with words** (a rule keyed on nothing could never
  match; never a no-op control). A rule REWRITES a matching line in place — the
  span replaced is the matched head plus the contiguous peeled words the key
  itself carries or the rule scopes, so a bare `paprika` rule keeps "smoked" and
  a `{paprika, smoked}` rule replaces both; quantity, unit and prep stay; the
  line's plural is followed ("2 green onions" → "2 leeks"). A variety-scoped
  rule wins over a bare one. "flour" never touches "bread flour" (its own key).
- The **reference chart's 7 rows** are extracted mechanically (`REFERENCE_
  SECTIONS`, one source, two surfaces) and keyed through the vocabulary — a test
  says every row resolves. They are **suggestions** beside a line ("⇄ or: 2
  tablespoons flour", title "For 1 tablespoon cornstarch"), never a rewrite, and
  a cook swap wins over a suggestion. Nobody scales a ratio.
- The shopping list applies cook swaps only, through a pure `substitute`
  transform injected into `resolveShoppingList` (the core stays vocabulary-free).
- Store shape (`shopping-prefs`): `{ from, fromKey, variety?, to }`, de-duped by
  key + scope; a stored row with no key (the never-shipped free-text shape) is
  dropped on load. #87's Account block, recipe-page "Apply ⇄" toggle and
  `<del>`/`<span>` render, meals default-on wiring, CSS and three e2e flows were
  cherry-picked and re-pointed; `applyLineSubstitution` / `substituteLines`
  (raw regex) and their tests were discarded. Default-on shopping list, opt-in
  recipe page: kept as the product decision.

### Phase 5 — Compound-line split

- Pre-resolver split rules in the parser layer: coordinated ingredients
  ("salt and pepper") and derived-form phrasings ("juice of 1 lemon", "zest
  of…"). Conservative list from Phase 0 frequencies; unsplittable lines resolve
  unmatched rather than wrongly. TDD from census examples.

**As built (2026-09-14).** In the resolver, not the parser (the shopping-list
parser's contract stays untouched). `resolveLine(raw)` returns `{ parts,
joiner? }`; `resolveIngredient` is its first part. Order: the WHOLE head is
tried first (a known compound like a seeded "sweet and sour sauce" is never
split); only an unmatched head is examined for a coordinator. `and` splits only
when the line has NO quantity (a quantity binds one ingredient: "2 cups flour
and sugar" stays one unknown head); `or` splits always, the first piece is what
the author uses and the rest are their alternatives; a one-word first piece
borrows the tail of a multi-word second when that names a key ("chicken or
vegetable broth" → chicken broth, vegetable broth; "butter or olive oil"
borrows nothing). A line none of whose pieces resolve stays unmatched as a
whole. Derived forms rewrite before the split: "juice of 1 lemon" → "lemon
juice", "grated zest of 1 orange" → "orange zest". Consumers: search indexes
every resolved part; the "?" affordance treats a line with any resolved part as
known; swaps apply to the primary. **The build tool groups by the same parts**
(`lineHeads`), which removed 57 compound keys the first vocabulary had grown
("butter or margarine", "salt and pepper", …) — those were why the census's
"or" lines had looked unsplittable. Coverage by line weight went 82.5% → 85.9%.

### Phase 5b — Mined alternatives (added 2026-09-14)

The corpus's "X or Y" lines are substitutions real cooks wrote, keyed to real
recipes — a far larger seed than the reference chart's seven rows. `src/recipes/
alternatives-mine.ts` (pure, TDD) pairs each "or" line's primary with every
later resolved part, summed by line weight, directed as written;
`scripts/mine-alternatives.mjs` writes pairs over a floor (3 lines) to
`src/recipes/substitutions-mined.json` and a review report
(`runs/ingredient-normalization/ALTERNATIVES.md`). `curatedSubstitutions` merges
them beside the reference rows, labeled `source: 'corpus'` with their weight;
the recipe page shows "⇄ or: margarine" with the title "65 recipes list margarine
as an alternative to butter". Generated, never hand-edited: a wrong pair is a
vocabulary problem (two things folded into one key), fixed in the seed.

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

**As built (2026-09-09).** `src/recipes/ingredient-aliases-local.ts` mirrors the
exclusions overlay: localStorage, defensive, empty leaves no key behind. One
deviation from the bullet above, recorded: entries are keyed on the **unmatched
NAME** the resolver reported (`full`, the identity-bearing form: "freeze-dried
strawberry"), not the raw line — one confirmation covers every line that reads
the same once quantity and prep come off, and a parser change that alters the
split leaves an entry unconsulted, never wrong (the orphaning the raw-line idea
guarded against). `resolveIngredient(raw, vocab, { overlay })` consults the
overlay first, by `full`, and answers `method: 'overlay'` (overlay > baseline >
unmatched); substitutions and search take the same `overlay`, so a confirmed
line swaps and is found like any other. Recipe page: a line the app does not
know carries a "?" (44 px); it opens an inline picker over a datalist of EXISTING
keys — free text is refused with words — and confirming repaints the section
(the ⇄ toggle can appear because the line now resolves). Settings: "Ingredient
corrections (N)", collapsed, rows with Remove, "Copy for the vocabulary"
(clipboard, the `seedAliases` block ready to merge into the seed) and Clear.
Unit: 6 store cases, 4 resolver, 1 substitutions, 1 search, 3 view — RED first;
e2e: the confirm flow persists across a reload; the settings section lists,
exports, removes.

## DECISION GATE — is M4 warranted?

**Re-asked at the M4 exit (2026-09-14), with the evidence the gate wanted:** the
tier costs nothing (no dependency, no CSP change, ~3 KB, ~1 ms per unmatched
line) and adds 830 lines of coverage at 90%–85% precision, every one of them
labeled and one tap from a confirmation. Kept. The question the gate asked about
the *embedding* tier — is a 23 MB model and a CSP relaxation warranted? — is
answered no for now: the remaining 3859 unmatched lines are mostly
narrative, dish names and non-ingredients (see `FUZZY-EVAL.md` § still unmatched),
which no similarity measure should resolve. Revisit only if the overlay's
export shows cooks correcting the same *semantic* misses repeatedly.


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

**As built (2026-09-14) — lexical, not MiniLM, and why.** `docs/SECURITY.md`
and its gated CSP test forbid `wasm-unsafe-eval`, which an ONNX runtime needs;
the quantized model is a 23 MB download and `onnxruntime-web` a 142 MB dev
dependency whose model must be fetched at build time (no network in CI). Before
paying any of that, the tail was measured: a character-trigram cosine over the
vocabulary's keys + aliases alone reached the plan's 90% aspiration region. So
`src/recipes/ingredient-fuzzy.ts` is the tier: trigram cosine, plus a word-by-
word typo path (same word count, every pair within one edit — two for long
words — so "tumeric" and "chiken stock" match while "chocolate milk" vs "milk
chocolate" and "medium-size lemon" vs "…onion" do not), plus a negation guard
("iodised" never picks "non-iodised"). Closed-set by construction, threshold
**0.75**, labeled `method: 'fuzzy'` with its score. The resolver runs it
LAST — after overlay, exact, alias and coordination — and only when a page asks
(`{ fuzzy: true }`): the recipe page, where the cook can confirm; never the
build tool, the coverage metric, search or the shopping list. On the recipe
page a fuzzy line's "?" reads "≈ turmeric?" with the picker prefilled, and a
swap on such a line is visibly provisional (italic, "⇄ ≈") until confirmed.

**Battle-tested on the corpus** (`scripts/eval-fuzzy.mjs` →
`runs/ingredient-normalization/FUZZY-EVAL.md`; floors pinned in
`tests/unit/recipes/ingredient-fuzzy-corpus.spec.ts`): coverage by line weight
86.7% deterministic → **89.1%** with the tier; on a judged sample of 160 real
unmatched names (`tests/fixtures/ingredients/fuzzy-judged.json`, 40 per band,
semantic right/wrong — judged by the building session, spot-check it),
precision is 90% at ≥0.85 and 85% at 0.75–0.85, falling to 55% in the band
just below the threshold — the cut is earned by the data, not chosen. Recall
over realistic perturbations of the 300 most-used known lines (a swapped letter
pair, a dropped letter, a stray unit, trailing prep) is ≥ 80% on every kind,
much of it through the deterministic paths the hygiene pass added the same day
(front measure words, stray numbers, markup, trailing prep — which also raised
deterministic coverage 85.9% → 86.7%). The suite also surfaced judged wrongs in
the top bands that are VOCABULARY problems (junk keys like `clove garlic`,
`non-iodised salt`, `powder`) — listed for the review, not patched in the matcher.

## Phase 9 — PDS alias records (roadmap; re-plan before execution)

Publish confirmed aliases as open-world records on the cook's PDS; build step
harvests and aggregates across cooks with provenance; human review before any
promotion into the shipped baseline remains the quality gate. Shape TBD —
re-confirm against the interactions/follows record patterns at planning time.
