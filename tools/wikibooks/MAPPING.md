# Record mapping & the lexicon gap (D9/D10)

How the wikibooks IR maps onto the **consumed** `exchange.recipe.recipe` record.
Per arecipe policy (`docs/LEXICONS.md`), `exchange.recipe.*` is owned by
recipe.exchange; this run **does not extend that lexicon**. Fields with a lexicon
home are mapped; fields without one ride in **open-world** fields recipe.exchange
ignores. This is the gap report the brief asks for — not papered over.

## Mapped to lexicon fields

| IR | record field | notes |
|----|--------------|-------|
| `title` | `name` | Cookbook: prefix stripped, ≤255 |
| `lead` (or generated) | `text` | required description, ≤3000 |
| `ingredients[].display` | `ingredients[]` | `(optional)` appended when flagged; ≤500 each |
| `procedure` (flattened) | `instructions[]` | substeps kept as `— …` lines; ≤1000 each |
| `summary.yield` / `servings` | `recipeYield` | yield preferred |
| `summary.category` | `recipeCategory` | free text (not a defs token) |
| `summary.cuisine` | `recipeCuisine` | free text |
| `summary.timeMinutesHint` | `totalTime` | ISO-8601 duration |
| provenance | `attribution` → `#attributionWebsite` | name/url/notes (licence + permalink) |
| `revTimestamp` | `createdAt` / `updatedAt` | deterministic → idempotent republish |

## Open-world provenance fields (D9) — top level

`sourceUrl` (reuses the existing arecipe provenance field), `sourcePermalink`,
`sourceRevId`, `sourceHistoryUrl`, `retrievedAt`, `license` `{id, token,
attribution}`.

## Open-world `wikibooks` object — fields with NO lexicon home

`pageid`, `difficulty`, `servings`, `servingsHint`, `image` (filename only —
images out of scope), `origin`, `energy`, `note`, `parseFlags[]`.

**The gap:** `difficulty` and `servings` in particular have no home in
`exchange.recipe.recipe`. RUN-RECIPE-META-STRIP is expected to decide where
servings/difficulty ultimately live; until then they are carried, losslessly, in
`wikibooks.*` so no source signal is dropped. `recipeCategory`/`recipeCuisine`
are free text here, not `exchange.recipe.defs` controlled-vocabulary tokens —
mapping to tokens is deferred (would need a curated crosswalk).

## rkey

`wb-<pageid>` — deterministic, never a TID. Determinism is what makes the
six-month rerun idempotent and a rename an update (same rkey) instead of an
orphan + create.
