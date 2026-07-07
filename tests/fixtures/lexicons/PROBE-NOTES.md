# D4 probe capture — 2026-07-07

Lexicon JSON fetched from `https://recipe.exchange/lexicons/<nsid>.json`
(HTTP 200, application/json) for: recipe, collection, defs, profile.

Canonical resolution ALSO works: `_lexicon.recipe.exchange` DNS TXT →
`did=did:plc:4cx7ts7lqgjtsfquo53qo3sz` → PDS
`poisonpie.us-west.host.bsky.network` → `com.atproto.repo.getRecord`
`com.atproto.lexicon.schema/exchange.recipe.recipe` (HTTP 200; captured as
`canonical-lexicon.schema-record-*.json`).

## exchange.recipe.recipe field map (defs.main.record)

- type `record`, key **`tid`** (declared)
- **required:** name, text, ingredients, instructions, createdAt, updatedAt
- name: string maxLen=255 · text: string maxLen=3000
- ingredients: string[] · instructions: string[]
- attribution: union · embed: ref → #imagesEmbed (blob images)
- prepTime/cookTime/totalTime, recipeYield, recipeCategory, recipeCuisine,
  cookingMethod: string · nutrition: object · suitableForDiet/keywords:
  string[] · createdAt/updatedAt: string (datetime)
- langs: string[] maxLen=3 — **website-only** (not yet in the canonical
  PDS record; only diff between the two sources; optional field)

## Discrepancies observed (spec-vs-practice)

1. **Website lexicon vs canonical record skew:** website adds `langs`;
   otherwise byte-identical structure. Treat the website as the leading
   edge; open-world validation makes the skew harmless.
2. **`key: tid` is declared but not practiced:** real recipe.exchange
   records use 26-char ULIDs as rkeys (e.g. `01JQJ5RW51ZVEW72XN6GSRWC8D`),
   not 13-char TIDs. PDSs don't enforce the declared key type. Phase 6
   decision: match practice (ULID) or spec (TID) when arecipe writes —
   flagged in the plan.
