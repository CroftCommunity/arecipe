# Phase 0 — Discovery findings (2026-09-09)

Plan: `plans/2026-08-12-1-plan-ingredient-normalization-and-substitutions.md`.
No production code written. Committed beside this file: `census-top200.csv`
(top-200 names with cumulative share), `census-summary.json`, `reference-pairs.csv`.
NOT committed (throwaway, regenerable from the live snapshot in minutes): the
full 16,321-row `census-names.csv`, the multi-word / head-phrase CSVs, the
MiniSearch bench JSON, and the census/bench scripts — the method is described
inline wherever a number is cited. Corpus = the live snapshot at the time
(`2026.09.09-20eda6c`), fetched from `assets/snapshot/<version>/`.

## Headline: the corpus is 14× larger than the plan assumes

The plan's Problem Statement says "~289 records". The live snapshot the site
serves (`build-info.json` → `2026.09.09-20eda6c`) holds **4,113 records** across
4 cooks: `arecipe.bsky.social` 4,041 (the Wikibooks corpus), `daffl.xyz` 37,
`recipe.exchange` 32, `rdur.dev` 3. That is **35,274 ingredient lines**. The
`search.ts` header comment ("hundreds, maybe low thousands") and the
recipe-loading-perf plan (2026-08-11, "4,041 records") already reflect this; the
ingredient plan does not. Every sizing statement in Phases 1–2 (review effort,
descriptor list, coverage floor) needs re-basing on these numbers.

---

## 1. Ingredient census

**Parser:** `parseIngredient` at `src/recipes/shopping-list.ts:157`;
`ParsedIngredient` at `:22`. Field read: `value.ingredients: string[]`
(`src/recipes/read.ts:13` lists it as REQUIRED; confirmed on real records —
every one of the 4,113 records has a non-empty array).

**Corpus:** live snapshot, all 4 shards fetched from
`assets/snapshot/2026.09.09-20eda6c/{index,manifest}.json` + `cooks/<did>.json`
(one shard per cook; `recipes[].shard` is unset on every index entry, so
`cookShardPath` is the path for all four).

| Measure | Value |
|---|---|
| Records | 4,113 (0 without ingredients) |
| Ingredient lines | 35,274 |
| Parsed (usable name) | 35,270 — 4 `unparsed` (`""`, `""`, `½ tsp`, `6 Tbsp`) |
| Lines with a qty | 28,714 (81%) |
| Lines with a recognized unit | 20,238 (57%) |
| **Distinct normalized names** | **16,321** |
| Singleton names (count = 1) | 13,907 (85% of names) |
| Multi-word names | 15,964 names; 82.8% of lines |
| Share of lines in top-100 / 200 / 500 / 1000 / 2000 names | 31.6% / **38.0%** / **46.0%** / 51.9% / 58.2% |

Files: `census-names.csv` (all 16,321 names, count, word count, one raw sample),
`census-top200.csv` (with cumulative share), `census-multiword.csv`,
`census-descriptor-firstwords.csv`, `census-head-lastwords.csv`,
`census-summary.json`.

Top 20 raw names: salt 1460 · water 536 · olive oil 447 · egg 427 ·
**salt to taste 346** · butter 302 · sugar 275 · pepper 262 · vegetable oil 248 ·
white granulated sugar 227 · milk 214 · all-purpose flour 213 · black pepper 213 ·
flour 213 · baking powder 200 · vanilla extract 155 · **cloves garlic, minced 138** ·
oil 135 · lemon juice 133 · freshly-ground black pepper 131.

### Why coverage is so low — the raw `name` is not a key

`normalizeName` (`shopping-list.ts:134`) lowercases, collapses whitespace, and
plural-folds the LAST word. It does **not** split on commas, strip parentheticals,
drop leading `of`, or strip trailing `to taste`. So the census `name` is really
"the whole tail of the line". Evidence, all in the top 40:
`salt to taste` (346) and `salt, to taste` (115) and `of salt` (86) are three
names for salt; `cloves garlic, minced` (138), `cloves of garlic, minced` (105),
`cloves garlic` (60), `minced garlic` (78) are four names for garlic;
`bay leave` (77) vs `bay leaf` (74) is a plural-fold bug (`leaves` → `leave`).

Name length: 6,067 lines are 1 word, 10,136 are 2 words, 6,701 are 3; a long
tail runs to 93 words (the corpus has narrative "ingredient" lines).

**Naive head-phrase experiment** (`census-head.ts`: take text before the first
comma/semicolon/dash, strip `(...)`/`[...]`, drop leading `of|a|an|the`, drop
trailing `to taste|as needed|optional|divided|for garnish`, then
`normalizeIngredientName`):

| | Distinct | Singletons | top-200 | top-500 | top-1000 | top-2000 |
|---|---|---|---|---|---|---|
| raw `name` | 16,321 | 13,907 | 38.0% | 46.0% | 51.9% | 58.2% |
| head phrase | 9,882 | 7,515 | **51.4%** | **62.2%** | 69.7% | 76.6% |

Even a real head-noun split leaves the top-500 at ~62%. The residual is the
descriptor layer the plan already anticipates (`large onion` 161, `medium onion`
129, `unsalted butter` 189, `ground cinnamon` 127 …) plus **count/container
words the parser does not know as units**: first words of multi-word names
include `cloves` 480, `can` 282, `ea.` 243, `slices` 127, and parenthetical metric
conversions `(1`, `(240`, `(120`, `(60` (~670 lines — Wikibooks lines shaped like
`1 cup (240 ml) milk`).

**Consequence for Phase 2's "≥90%" coverage floor:** it is not reachable by
alias lookup over `parseIngredient(...).name`. The resolver needs, in order: a
head-phrase split (comma / parenthetical / trailing-phrase), a count-unit
vocabulary (`clove(s)`, `can`, `slice(s)`, `ea.`, `stick`, `sprig`, `bunch`,
`package`, `pinch` is already a unit), THEN the descriptor split, THEN alias
lookup. Recommend the M1 floor be stated as **coverage of LINES by weight**
(top-N-by-frequency), with 90% requiring a vocabulary in the ~2,000–3,000 key
range after descriptor stripping — or lower the floor to a measured 75–80% for
M1 and let the GATE decide. Re-measure after Phase 2's split exists; the
head-phrase numbers above are the honest ceiling of a comma-split alone.

### Descriptor seed lists (from `census-descriptor-firstwords.csv`)

Top first words of multi-word names, by line count — the taxonomy's raw
material. Variety-ish: `ground` 899, `white` 490, `dried` 396, `black` 365,
`red` 288, `whole` 238, `green` 229, `all-purpose` 242, `unsalted` 151,
`granulated` 160, `brown` 125, `smoked` (49 as "smoked paprika"). Quality/size:
`large` 703, `fresh` 542, `medium` 371, `small` 297. Prep: `chopped` 365,
`minced` 189, `grated` 186, `freshly-ground` 185. Trailing prep words (last-word
list): `chopped` 1220, `diced` 502, `minced` 470, `sliced` 389, `beaten` 134,
`(optional)` 872, `taste` 988. The plan's "~100–200 words" estimate looks right
for the taxonomy itself.

### Spike batches and fixtures — how much they add

- `spike/import/*.json` (14 batch files with `recipes[]` or top-level maps):
  284 recipes, 2,052 lines, 1,234 distinct names, of which **27 are not in the
  live corpus** (and those 27 are HTML-entity/`&#039;` noise or malformed lines,
  e.g. `[other ingredients from the missing page 1 …]`). Effectively a subset.
- `tests/fixtures/atproto/*.json` (starter feed fixtures): 10 records, 46 lines,
  34 names, 3 not in live (`feta`, `bean`, `greens`). Negligible.
- `tests/fixtures/shopping/ingredient-lines.json` is the parser contract (66
  cases), not corpus.

**Use the live snapshot as the census source for Phase 1**, not the spike
batches the plan names.

---

## 2. Compound-line frequency

Case-insensitive, over the 35,274 live lines:

| Pattern | Lines | Share | Examples |
|---|---|---|---|
| ` or ` | **2,597** | 7.4% | `2 1/2 cups bread flour or all-purpose flour` · `2 tablespoons oil or butter` · `1/3 cup plain yogurt, buttermilk, or sour cream` · `1 cup pecans or walnuts` · `8 g / 1/4 cup honey or agave syrup` |
| ` and ` | **1,289** | 3.7% | `salt and pepper (to taste)` · `2 sticks butter, chilled and cubed` · `8 ounces white mushrooms, cleaned and thinly sliced` · `reserved celery and onions` · `1 kg chicken, preferably in 16 pieces, and a couple of drumsticks` |
| `juice of` | 72 | 0.2% | `Juice of ½ lemon` · `Juice of 1 lemon` · `Juice of 4 lemons` · `juice of ½ lemon or lime` · `Freshly squeezed juice of 1 lemon` |
| `zest of` | 26 | 0.1% | `Zest of 1 large lemon` · `Zest of 1 clementine` · `Grated zest of 1 orange` · `Zest of a lemon or grated ginger` |
| any of the four | 3,838 | 10.9% | |
| (context) contains `,` | 7,477 | 21.2% | |
| (context) contains `(` | 7,358 | 20.9% | |
| (context) `juiced` / `zested` | 107 | 0.3% | |

Reading: ` or ` is dominated by **alternatives** (author-supplied substitutions —
useful seed data for Phase 4, not a split problem), and most ` and ` hits are
prep phrases after a comma (`chilled and cubed`), not two ingredients. True
two-ingredient lines (`salt and pepper`, `reserved celery and onions`) are a
minority of the 1,289. `juice of` / `zest of` are tiny (98 lines). **Phase 5
should not move earlier**; the comma/parenthetical split (21% of lines each) is
the split that matters and it belongs in Phase 2's head-phrase step, not Phase 5.

---

## 3. Parser seam check

`ParsedIngredient` (`src/recipes/shopping-list.ts:22-28`):
`{ raw; name; qty?; unit?: CanonicalUnit; unparsed? }`. `name` is exposed cleanly
and `normalizeIngredientName` (`:144`) is public, so downstream keying can call
either. Verdict: **the seam exists, but `name` is a normalized TAIL, not a
head noun** — the matcher needs things the parser does not provide:

1. **No head/descriptor boundary.** `normalizeName` (`:134-139`) folds the last
   word only and explicitly does no descriptor stripping (comment at `:131-133`:
   "No descriptor stripping (v1)"). Everything after a comma or inside
   parentheses stays in `name` (`cloves garlic, minced`, `(240 ml) milk`). The
   matcher must own the split; the plan's Phase 2 pipeline
   (`parseIngredient → descriptor split → lookup`) is right but the split must
   also handle commas, parentheticals, leading `of`, and trailing `to taste` —
   not just descriptor words.
2. **No count/container unit.** `CanonicalUnit` (`:31`) covers 10 measure units.
   `clove(s)`, `can`, `slice(s)`, `ea.`, `stick`, `sprig`, `bunch`, `package`,
   `head` fall into `name` (≈1,100+ lines by first word). Either the parser
   grows a `countUnit?` field (a parser change, gated by its fixture table) or
   the matcher strips them. Recommend the matcher strips (keeps the parser's
   shopping-list contract untouched).
3. **Plural fold is last-word-only and irregular-blind.** `bay leaves` → `bay
   leave` (77) vs `bay leaf` (74); `halves`, `loaves`, `knives` fold the same way.
   Either extend `foldWord` (`:122`) via its fixture table, or key on aliases
   (`bay leave` → `bay leaf`) in the vocabulary. Aliases are the cheaper, honest
   route given "surfaced, never invented".
4. **No field for "the parser's `name` minus stripped prep"** — expected; that is
   the `Resolution` type Phase 2 defines. Nothing else is missing: `raw` is
   preserved verbatim for display, `qty`/`unit` are separable for Phase 4's
   ratio rules.

---

## 4. MiniSearch field cost

`SearchDoc` at `src/recipes/search.ts:34-44` (5 indexed text fields at `:77`,
3 stored-only meta hints at `:106`). The only documented band is qualitative:
the header comment (`:3`) says "a whole-index rebuild is milliseconds", written
for "hundreds, maybe low thousands" of records; the 2026-08-11 perf plan then
found the eager build at 4k records "costs real time" and made the build lazy
(first non-empty query) — pinned by `tests/unit/recipes/search.spec.ts:148-181`.
**No numeric millisecond band is recorded anywhere** (plans, tests, comments).

Measured (Node v22.23.2, median of 5, real corpus, `bench-minisearch*.json`).
(b) adds one stored+indexed field `ingredientKeys` = the parsed names joined by
`\n`, produced by running `parseIngredient` per line inside the build.

| | (a) as-is | (b) +ingredientKeys | Δ |
|---|---|---|---|
| 4,113 records — index build only (docs pre-extracted) | **332 ms** | **394 ms** | +19% |
| 4,113 — `ensureIndex` equivalent (extract docs + build) | 345 ms | 446 ms | +29% |
| of which `parseIngredient` over 35,270 lines | — | 32 ms | |
| 289-record sample (plan's assumed scale) | 20.8 ms | 26.2 ms | +26% |
| Query (`garlic` / `chicken lemon` / …), median | 1.3 ms | 0.5 ms | same hits |
| Doc payload (JSON) | 4.98 MB | 5.87 MB | +18% |

Verdict: at the plan's assumed scale both variants are comfortably
"milliseconds" (21 → 26 ms). At the REAL scale neither is — the as-is build is
already ~330 ms and (b) adds ~60–100 ms on the build that is already deferred to
first query. **(b) stays within the same band as (a)** because there is no
numeric band to leave; the perf plan's lazy-build decision already absorbs it.
Two notes for Phase 3: (i) the field should carry canonical KEYS (a few tokens per
recipe), not the joined raw names used in this fake — the real field will be
smaller than (b); (ii) the +32 ms parse cost should not be paid inside the index
build if the keys are already computed for the substitution surface — compute
once per entry and reuse. Recommend Phase 3 record a numeric band in
`search.spec.ts` (e.g. "index build ≤ 1.5× the as-is build at 4k") so the next
field addition has a gate.

---

## 5. Reference chart extraction

`src/pages/reference-view.ts`: `PairTable` interface at `:19-22`
(`{ kind: 'pairs'; rows: readonly (readonly [string, string])[] }`), data in
`REFERENCE_SECTIONS` (`:40`, exported). Rendering (`renderPairTable`, `:187`)
is separate from the data, and the data has no DOM dependency, so the arrays
import cleanly outside the browser (`pairs.ts` did exactly that).

Inventory: 5 sections; **3 pairs tables, 26 rows**: `weights-and-measures`
(2 tables: 9 + 10 rows — unit equivalences, NOT substitutions) and
`substitutions` (1 table, **7 rows** — the only substitution seed). The other 3
sections are `grid` (can sizes, two roasting charts). Full CSV:
`reference-pairs.csv`.

5-row sample of the `substitutions` table (left = right):

| for | use |
|---|---|
| 1 tablespoon cornstarch (for thickening) | 2 tablespoons flour |
| 1 cup sifted all-purpose flour | 1 cup plus 2 tablespoons sifted cake flour |
| 1 square chocolate (1 ounce) | 3 tablespoons cocoa plus 1 tablespoon butter |
| 1 teaspoon baking powder | 1/4 teaspoon baking soda plus 1/2 teaspoon cream of tartar |
| 1 cup milk | 1/2 cup evaporated milk plus 1/2 cup water |

Verdict: **mechanically extractable, yes — but it is 7 rows, and they are
free-text prose with quantities embedded** (`plus`, `into which … has been
mixed`, `may also be used`). Each row parses to `{ fromKey, fromQty, toParts[]
}` only with a hand-written per-row schema; the two weights tables are unit
ratios (useful to Phase 4's scaling, not substitution). Phase 4's seed table
will need hand-authoring beyond these 7; the corpus's 2,597 ` or ` lines are a
much larger seed (`bread flour or all-purpose flour`, `pecans or walnuts`,
`plain yogurt, buttermilk, or sour cream`) and are already keyed to real recipes.

---

## 6. PR #87 disposition input

`gh pr view 87`: "Ingredient substitutions (⇄) on recipe pages and shopping
list", branch `claude/recipe-substitutions-ie4xd5`, opened 2026-08-11, 1 commit,
+709/−18, state OPEN, **mergeable: MERGEABLE** against current main (29 commits
on main since its base `d35505ef`; only `meals.ts` and `styles.css` touched
once each in that window). Files (14): plan doc, `src/pages/{account,meals,
recipe}.ts`, `src/recipes/{shopping-list,shopping-prefs,view}.ts`, `styles.css`,
3 e2e specs, 3 unit specs. Full diff: `pr87.diff`.

### Where the engine lives (superseded by this plan)

- `src/recipes/shopping-list.ts` +41: `type Substitution = { from; to }`,
  `applyLineSubstitution(raw, subs)` — first-match, whole-word case-insensitive
  regex `\bfrom\b` over the RAW line, string-replaces `to` in place;
  `substituteLines(lines, subs)`; `resolveShoppingList(..., substitutions = [])`
  applies it before aggregation. This is exactly the "direct regex over raw
  text" the plan's Problem Statement names. It never calls `parseIngredient`.
- The unit tests for those three (`tests/unit/recipes/shopping-list.spec.ts`
  +66) pin regex behavior (`milk` ⊄ `buttermilk`) and go with the engine.

### The UI shell (potentially reusable)

- **Store** — `src/recipes/shopping-prefs.ts` +~65: `substitutions:
  Substitution[]` + `alwaysApplySubstitutions: boolean` on `ShoppingPrefs`;
  `normalizeSubstitutions` (trim, drop half-rows, de-dupe by `from`);
  defensive `toSubstitutions` reader; legacy-record tolerance; `isEmpty` clears
  the key. Device-local `localStorage` key `shopping-prefs`. Tests in
  `shopping-prefs.spec.ts` +~50.
- **Account page** — `src/pages/account.ts` +~90: "Substitutions ⇄" block
  inside the Shopping-list section: chip list (`data-testid`
  `substitutions-list`, `substitution-chip`), from/to inputs
  (`substitution-from`, `substitution-to`, Enter commits), Add
  (`substitution-add`), ✕ remove, "Always apply" checkbox
  (`substitutions-always`). Reuses the existing `staples-input` /
  `staple-chip-remove` / `staples-add` classes.
- **Recipe page** — `src/recipes/view.ts` +~60: `RenderOptions.substitutions` +
  `applySubstitutions`; an "Apply ⇄" checkbox (`apply-substitutions`) rendered
  ONLY when a sub matches a line ("never a no-op control"); matched lines render
  `<del class="ingredient-original">` + `<span class="ingredient-sub">⇄ …</span>`
  in `li.ingredient-substituted`; toggling repaints `.ingredient-list-host`.
  `src/pages/recipe.ts` +6 reads the store and passes both options. Unit tests
  in `view.spec.ts` +46 (4 cases).
- **Shopping list** — `src/pages/meals.ts` +6: loads `substitutions` from
  prefs and passes to `resolveShoppingList` (default-ON there, opt-in on
  recipe).
- **CSS** — `styles.css` +52: `.subs-list`, `.sub-chip{,-from,-arrow,-to}`,
  `.subs-add-row`, `.subs-always-row`, `.sub-toggle`,
  `.ingredient-substituted .ingredient-original` (opacity .55) /
  `.ingredient-sub` (600 weight).
- **E2E** — 3 hermetic specs (account persist, recipe opt-in + always-apply,
  shopping-list default-on + clipboard) seeded via `localStorage.setItem(
  'shopping-prefs', …)`.
- Symbol decision: `⇄` monochrome, matching ⧉ ⚑ ⛶.

### Engine vs shell split

| Part | Verdict |
|---|---|
| `applyLineSubstitution` / `substituteLines` / regex matching + their unit tests | **Engine — superseded.** Replace with `resolveIngredient` key match (Phase 2) + rules keyed on `key` (Phase 4). |
| `resolveShoppingList(..., substitutions)` seam (apply before aggregation) | Shape survives; the applied function changes. |
| `Substitution = { from: string; to: string }` free-text pair | **Superseded in shape** — Phase 4 wants `{ fromKey, toKey, variety?, ratio? }` and user rows should resolve through the vocabulary, not raw strings. The store's "de-dupe by `from`" becomes de-dupe by resolved key. |
| `shopping-prefs` store extension + legacy tolerance + tests | **Reusable pattern**, fields renamed/re-shaped. This IS the `exclusions.ts`-style overlay the plan's Phase 6 wants for user corrections; the PR proves the store can carry it. |
| Account "Substitutions ⇄" authoring block + test ids | **Reusable as-is for the user-authored rules surface**; Phase 4 adds curated-table rules on top, which this block does not show. Inputs should become vocabulary-aware (typeahead over keys) later. |
| Recipe-page "Apply ⇄" toggle, `<del>`/`<span>` line render, `ingredient-list-host` repaint, "never a no-op control" rule | **Reusable.** The render only needs `LineSubstitution { original, substituted }`-shaped input; Phase 4's engine can produce that. Descriptor-aware output ("paprika → smoked paprika keeps `smoked`") is a content change, not a DOM change. |
| Default-on shopping list vs opt-in recipe page (product decision) | **Reusable decision**; record it in the plan. |
| CSS + e2e specs | Reusable; e2e seed shape changes with the store shape. |

### Recommendation: **reuse the UI shell, discard the engine — but do not merge #87 as-is.**

Reasons:

1. The shell is ~70% of the diff (store, account block, recipe toggle, meals
   wiring, CSS, e2e) and is exactly the surface Phase 4 needs; it was TDD'd and
   is still MERGEABLE with zero drift on 5 of its 7 source files. Rebuilding it
   would reproduce the same DOM.
2. The engine is ~40 lines plus ~66 lines of tests and is the thing this plan
   exists to replace. Merging it first would ship raw-regex matching to cooks
   (`flour` → also rewrites `bread flour`; `pepper` → `bell pepper`), then Phase
   4 would have to change user-visible behavior and migrate stored `{from,to}`
   strings to keys.
3. The store shape is the one thing worth changing BEFORE any of it lands:
   stored free-text `from` cannot be re-keyed later without a migration. Land
   the shell in Phase 4 with the key-based rule shape from day one.

Concretely for Phase 4: cherry-pick the shell files from
`claude/recipe-substitutions-ie4xd5` (`account.ts`, `view.ts` render + toggle,
`recipe.ts`, `meals.ts`, `styles.css`, the three e2e specs, the
`shopping-prefs` store pattern), drop `applyLineSubstitution`/`substituteLines`
and their tests, and re-point the render at the Phase 2/4 resolver. Leave #87
open and un-commented until Phase 4 picks it up; then close it with a pointer
to the landing commit. Do not merge.

---

## What changes in the plan as a result

- Problem Statement: "~289 records" → 4,113 records / 35,274 lines, and the
  census source is the live snapshot, not `spike/import`.
- Phase 1: review scale is ~2,000–3,000 candidate keys after head-phrase +
  descriptor stripping (not "a few hundred"); 9,882 head phrases with 7,515
  singletons is the input pile. Keep the human-review checkpoint but budget it.
- Phase 2: the pipeline gains a mandatory **head-phrase split** (comma,
  parenthetical, leading `of`, trailing `to taste`) and a **count-unit strip**
  before the descriptor split. Coverage floor: measure by line weight; propose
  75–80% for M1 with the 90% aspiration moved to the GATE.
- Phase 3: the extra field costs +19% build at 4k (already lazy); add a numeric
  band test.
- Phase 4: seed = 7 hand-parsed reference rows + mined ` or ` alternatives
  (2,597 lines); reuse #87's shell with a key-based rule shape.
- Phase 5: stays last; `juice of`/`zest of` are 98 lines total, ` and `
  two-ingredient lines are a minority of 1,289.
- Parser: file the `bay leaves` → `bay leave` fold as a shopping-list TODO
  (fixture-table change), independent of this plan.
