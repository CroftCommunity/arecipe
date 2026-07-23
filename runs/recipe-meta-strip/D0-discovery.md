# D0 — Discovery gate (RUN-RECIPE-META-STRIP)

_Run: `recipe-meta-strip` · branch `claude/recipe-metadata-strip-dksgyo` · 2026-07-23_

This report answers the three D0 questions **before any lexicon or record change**, then
records the path branch and the owner decisions (O1, O2) it gates on. Source of truth is
the locally-held schema-of-record `tests/fixtures/lexicons/exchange.recipe.recipe.json`
(the D4 capture; `docs/LEXICONS.md` and `tests/fixtures/lexicons/PROBE-NOTES.md` govern the
`exchange.recipe.*` surface) plus the shipping render code.

---

## Q1 — Does `exchange.recipe.recipe` already define servings, yield, or difficulty? Under what names and types?

| Concept | Upstream field | Verbatim definition |
|---|---|---|
| **Yield / servings** | `recipeYield` — **present** | `"recipeYield": { "type": "string", "description": "Number of servings or yield" }` |
| **Servings** (dedicated) | — **absent** | No dedicated `servings` field. `recipeYield` is the single free-text field carrying both concepts (its own description says "Number of servings **or** yield"). |
| **Difficulty** | — **absent** | No `difficulty` field anywhere in the record. |

`recipeYield` is a **free-text string** (no `format`, no `knownValues`), so it already
holds the `{{Recipe summary}}` shapes faithfully: `"1-2"`, `"4 burgers"`, `"4"`. Typing it
as a number would be lossy — this is why the D1 model keeps `display` authoritative.

## Q2 — How is the existing prep time represented today: structured minutes, or free text?

**Structured — ISO-8601 duration strings**, three separate fields. Verbatim:

```json
"prepTime":  { "type": "string", "format": "duration", "description": "Time required for preparation" },
"cookTime":  { "type": "string", "format": "duration", "description": "Time required for cooking" },
"totalTime": { "type": "string", "format": "duration", "description": "Total time required" }
```

They are stored/parsed as `PT#H#M#S` (e.g. `PT1H35M`). Conversion helpers already exist:
`isoDurationToMinutes` / `minutesToIso` (`src/recipes/write.ts`) and the display formatter
`formatDuration` (`src/recipes/present.ts`, `"PT1H35M" → "1 h 35 m"`; `PT0S`/absent →
`null`). The editor collects `prepMinutes` / `totalMinutes` and writes them back as ISO.

**Consequence for the strip:** ISO durations cannot represent the corpus's free-text times
like `"about an hour"`. So the time row's parser must accept free text (D1) even though the
structured upstream path yields display+hint straight from the ISO value.

## Q3 — What does the recipe page currently render for time, and where does it sit relative to the image?

- Renderer: `chipsEl(value)` in `src/recipes/view.ts` — `formatDuration(value.totalTime)`
  wrapped as a single `<span class="chip">` inside `<span class="chips">`. Only `totalTime`
  is surfaced; `prepTime`/`cookTime` are not shown on the detail. `null` (absent/`PT0S`) →
  no chip element at all.
- Placement in `renderRecipeDetail`: the DOM order is
  **`.photo-wrap--banner` (image) → `.detail-actions` (Focus) → `.recipe-title-row` (title)
  → `.chips` (the time chip) → `.lede` → …**. The time chip therefore sits **below the
  title**, detached from the image — it does **not** hang off the image bottom.

The new three-row strip attaches directly to the bottom of the image banner (no gap, shared
outer radius) and replaces the lone time chip's role on the recipe page.

---

## Path branch

Per-field, this is a **mixed** result:

- **Serves — Path A.** Read the upstream free-text `recipeYield`. No lexicon change.
- **Time — Path A.** Read the upstream ISO `totalTime` (falling back to `prepTime`). No
  lexicon change. The free-text time parser (D1) additionally supports an arecipe-authored
  free-text time source for corpus rows ISO can't hold (`"about an hour"`).
- **Difficulty — Path B.** No upstream field exists. Per §2 the options are B1 (propose
  upstream, blocks), B2 (`app.arecipe.recipeMeta` sidecar), B3 (open-world optional field
  on records arecipe authors). **Recommendation: B3 now, B1 in parallel** — the immediate
  consumer is the Wikibooks corpus, which arecipe authors and controls; an open-world field
  on a record you author is within the protocol grain and matches the existing extension
  surface already documented in `docs/LEXICONS.md` ("arecipe open-world extension fields on
  `exchange.recipe.recipe`": `dishKey`, `versionLabel`, `funFacts`, `sourceUrl`, …). It adds
  no NSID and needs no read-time join.

**We do not, and will not, amend `exchange.recipe.recipe`.** B3 layers a read-defensive
open-world field only; recipe.exchange ignores it (proven open-world-safe by the D1 probe,
`docs/LEXICONS.md`).

### O1 — owner decision (gates everything past D0 on Path B) — **ANSWERED 2026-07-23**

**Decision: B3 now**, with a TODO filed to pursue **B1** (propose `difficulty` upstream to
recipe.exchange) as the path toward an eventual **B2**-quality answer (a shape that also
covers recipes authored by other apps). This run implements B3: an open-world optional
`difficulty` (number `1..5`) read defensively and written only on arecipe-authored records.
TODO filed in `TODO.md` ("RUN-RECIPE-META-STRIP follow-on: difficulty storage B1→B2").

### O2 — owner decision (Focus mode) — **ANSWERED 2026-07-23**

**Decision: suppress difficulty in Focus mode** (the spec default) — render serves + time,
drop the difficulty row. The renderer takes a `focus` flag and is tested in both positions.
