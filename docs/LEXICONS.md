# Lexicon & NSID registry

The canonical list of every AT Protocol namespace (NSID) arecipe **creates**, **consumes**,
or **extends** — what each is for, who owns it, and its implementation status. Keep this
current: any time a new record collection is introduced, a field is added to a consumed
record, or an NSID is dropped, update this file in the same change.

Ownership policy:
- **`exchange.recipe.*`** is owned by **recipe.exchange**, not arecipe. arecipe is a
  *consumer*. We may add **open-world extension fields** (recipe.exchange ignores unknown
  fields), but we do **not** mint new `exchange.recipe.*` NSIDs or amend the lexicon
  unilaterally. A formal amendment is a future TODO to coordinate with recipe.exchange.
  (Cross-ref: `discovery/alpha/ECOSYSTEM.md` for the ownership relationship.)
- **`app.arecipe.*`** is arecipe's **own** namespace. We define and version these freely.
- **`app.bsky.*`** / **`com.atproto.*`** are Bluesky / atproto core — consumed only.

Status legend: **live** (record type read/written by shipping code) · **planned** (designed,
forerunner exists, not yet a PDS record) · **dropped** (was considered/used, now removed) ·
**ops** (throwaway/tooling, never user data).

---

## `exchange.recipe.*` — the recipe.exchange ecosystem (consumed)

`exchange.recipe.*` is the **shared, open recipe namespace** that arecipe is built on. It is
**owned and published by recipe.exchange**, an independent project — arecipe is one *consumer*
of a lexicon meant for many clients. This is the whole point of the atproto model: the data
(recipes) lives in users' PDS repos under a community lexicon, and any app can read/write it.

**Authority & resolution** (captured firsthand 2026-07-07 — `tests/fixtures/lexicons/PROBE-NOTES.md`):
- Publisher DID: **`did:plc:4cx7ts7lqgjtsfquo53qo3sz`**, PDS `poisonpie.us-west.host.bsky.network`.
- Canonical resolution: DNS TXT `_lexicon.recipe.exchange` → that DID → `com.atproto.repo.getRecord`
  on `com.atproto.lexicon.schema` (the atproto-native way lexicons are published on-network).
- Website mirror: `https://recipe.exchange/lexicons/<nsid>.json` (HTTP 200). The website is the
  *leading edge* — it can carry fields not yet in the canonical PDS record (see skew below).

**The four NSIDs recipe.exchange defines:**

| NSID | Kind | Purpose / surface |
|------|------|-------------------|
| `exchange.recipe.recipe` | record | The recipe. Required: `name`, `text`, `ingredients[]`, `instructions[]`, `createdAt`, `updatedAt`. Optional: `attribution` (union), `embed`→`#imagesEmbed` (blob images), `prepTime`/`cookTime`/`totalTime`, `recipeYield`, `recipeCategory`, `recipeCuisine`, `cookingMethod`, `nutrition` (obj), `suitableForDiet[]`, `keywords[]`, `langs[]` (website-only). Local defs: `main`, `imagesEmbed`, `image`, `view`, `viewImage`. |
| `exchange.recipe.defs` | tokens | The shared **controlled vocabulary** (~110 enum tokens) the recipe record's fields draw from: `cookingMethod*` (Baking, Frying, NoCook…), `diet*` (Vegan, GlutenFree, Keto…), `category*` (Dessert, Entree, Snack…), `cuisine*` (Italian, Thai, TexMex…), `attribution*`, `license*` (CreativeCommonsBy…, PublicDomain), `profileType*`, `businessType*`. |
| `exchange.recipe.profile` | record | Author/business profile. Props: `profileType`, `businessType`, `about`, `email`, `phone`, `address`, `links`, `createdAt`, `updatedAt`. |
| `exchange.recipe.collection` | record | A cookbook/collection grouping recipes. Props: `name`, `text`, `langs`, `recipes` (refs), `createdAt`, `updatedAt`. |

arecipe currently reads/writes only `exchange.recipe.recipe` (`src/recipes/read.ts`); it holds
local fixture copies of all four (`tests/fixtures/lexicons/*.json`) as the schema-of-record for
validation and tests.

**Two practice-vs-spec caveats arecipe must honor (from PROBE-NOTES):**
- **rkey:** the record declares `key: tid`, but real recipe.exchange records use **26-char
  ULID** rkeys (e.g. `01JQJ5RW51ZVEW72XN6GSRWC8D`), not 13-char TIDs. PDSs don't enforce the
  declared key type. Phase 6 (publish) must decide ULID (match practice) vs TID (match spec).
- **website↔canonical skew:** the website lexicon adds `langs`; otherwise byte-identical to the
  canonical PDS record. Open-world validation makes the skew harmless.

The recipe record's fixture declares no `additionalProperties: false`, and the live PDS was
**proven to accept and round-trip unknown fields** (D1 probe) — which is what makes arecipe's
open-world extension fields (below) safe without touching recipe.exchange's lexicon.

### arecipe open-world extension fields on `exchange.recipe.recipe`

**This is the extension surface for the recipe-model-extensions work.** We add no new NSID; we
layer these fields onto the consumed record. recipe.exchange ignores them; arecipe consumes
them. Verified open-world-safe via a live createRecord → getRecord → delete probe on
2026-07-09 (all fields survived byte-identical with matching CID). Plan:
`plans/2026-07-09-1-plan-recipe-model-extensions.md`.

| Field | Type | Purpose |
|-------|------|---------|
| `dishKey` | `string` (slug) | Groups alternative versions of the same dish (e.g. `chocolate-chip-cookies`). Canonical map curated in `spike/import/dishkeys.json`; spans live + imported records. Basis of the version switcher and fun-fact pooling. |
| `versionLabel` | `string` | Distinguishes one version within a `dishKey` group — a source/style ("Sally's", "King Arthur") **or** a method label ("Microwave" / "Oven"). Method variants are modeled as sibling version records, not a separate field. |
| `primaryVersion` | `boolean` (optional) | Marks the default version to show for a `dishKey` group. |
| `funFacts` | `array<{ text: string; source?: string }>` | Pooled "Did you know?" facts for the dish, denormalized onto each version record so any single record renders the full set. Replaces the single `funFact` string used in the import JSON. |

Types + defensive accessors for these fields are locked in **`src/recipes/model.ts`**
(`FunFact`, `DishKey`, `RecipeExt`; `extensionsOf`/`funFactsOf`/`dishKeyOf`/`versionLabelOf`/
`isPrimaryVersion`). Status: **defined in code, not yet live on the PDS** — Phase 6 publishes them.

Notes:
- The import corpus JSON currently carries a **singular** `funFact` string + inconsistent
  `dish`/`altOf` fields; these are normalized into `dishKey` + `funFacts[]` at publish time.
- `spike/import/dishkeys.json` is a **data file, not an NSID** — the reviewed dishKey mapping.

---

## `app.arecipe.*` — created (arecipe's own namespace)

| NSID | Status | Purpose | Where |
|------|--------|---------|-------|
| `app.arecipe.comment` | live | Threaded comments on a recipe. | `src/social/comments.ts` (`COMMENT_COLLECTION`) |
| `app.arecipe.interaction` | live | Likes / reactions on a recipe. | `src/social/interactions.ts` (`INTERACTION_COLLECTION`) |
| `app.arecipe.draft` | live | Synced editor drafts (cross-device). | `src/recipes/drafts-sync.ts` (`DRAFT_COLLECTION`) |
| `app.arecipe.mealPlan` | live | Weekly meal planner: `#week` (1–12 `repeat`, exactly 7 `#slot` days) → `#slot` (optional recipe `strongRef` + `note`, plus an open-world cached display `name`); calendar is a derived view, not stored. Caveat: a slot's `recipe` strongRef cannot declare its target is a recipe (same open-world caveat as consumed strongRefs) — the app treats it as a recipe ref by construction. Round-trip confirmed live 2026-07-10 (`LIVE=1 meals-live.spec.ts`). | `src/recipes/meal-plan-sync.ts` (`MEAL_PLAN_COLLECTION`, `syncPlanToPds`/`listPdsPlans`); model `src/recipes/meal-plan.ts` |
| `app.arecipe.mute.recipe` | planned | User-scoped recipe mutes/exclusions. Current impl is a client-side (localStorage) forerunner. | forerunner `src/recipes/exclusions.ts` (spec Layer 8 / plan Phase 10) |
| `app.arecipe.starterpack` | planned | Curated starter-pack record. Current impl is a forerunner over the seed account. | forerunner `src/recipes/starter.ts` |
| `app.arecipe.friend` | dropped | Was a friend-graph record; **removed** in favor of `app.bsky.graph.follow`-based discovery. | replaced (see `src/social/cookbook.ts`, `src/pages/recipe.ts`) |
| `app.arecipe.probe` | ops | Throwaway collection used only by the OAuth-seam spike; never real user data. | `spike/d1-oauth/d5-seam.mjs` |

**Reserved / not used:** the recipe-model-extensions plan evaluated an `app.arecipe.*` **overlay
record** as a fallback (tier 2) for holding the extension fields if the PDS had rejected
open-world fields. The D1 probe passed, so **no overlay NSID was minted.** If that fallback is
ever revived, register the new NSID here first.

---

## `app.bsky.*` / `com.atproto.*` — consumed (Bluesky / atproto core)

| NSID | Purpose |
|------|---------|
| `app.bsky.graph.follow` | Follow graph — arecipe's social discovery scope (replaced the dropped `app.arecipe.friend`). |
| `app.bsky.graph.getFollowers` | Resolve followers for discovery. |
| `app.bsky.embed.defs` | Embed defs referenced by recipe images. |
| `app.bsky.feed.post` (`langs`) | Language-tag convention mirrored by the recipe `langs` field. |
| `com.atproto.repo.{createRecord,getRecord,listRecords,deleteRecord}` | Repo XRPC methods (record CRUD). |
| `com.atproto.server.createSession` | Auth (app-password session for ops tooling). |

## Cross-references

- `tests/fixtures/lexicons/PROBE-NOTES.md` — firsthand D4 capture of the recipe.exchange
  lexicons (resolution paths, field map, rkey/skew caveats). Source of truth for the
  `exchange.recipe.*` surface above; re-verify against it rather than re-probing.
- `tests/fixtures/lexicons/*.json` — the four `exchange.recipe.*` schemas held locally.
- `discovery/alpha/ECOSYSTEM.md` — related-projects register (broader atproto ecosystem).
- `plans/2026-07-09-1-plan-recipe-model-extensions.md` — the open-world extension-field work.

_Last updated: 2026-07-09 (NSID docs pass — expanded with the recipe.exchange ecosystem overview)._
