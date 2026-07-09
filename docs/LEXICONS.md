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

## `exchange.recipe.*` — consumed (owned by recipe.exchange)

| NSID | Status | Purpose | Where |
|------|--------|---------|-------|
| `exchange.recipe.recipe` | live | The recipe record (the core object arecipe reads/publishes). | `src/recipes/read.ts`; fixture `tests/fixtures/lexicons/exchange.recipe.recipe.json` |
| `exchange.recipe.defs` | consumed | Shared defs referenced by the recipe record (e.g. the `imagesEmbed` union). | fixture `tests/fixtures/lexicons/exchange.recipe.defs.json` |
| `exchange.recipe.profile` | consumed | Author/profile record type in the recipe namespace. | fixture `…/exchange.recipe.profile.json` |
| `exchange.recipe.collection` | consumed | A collection/cookbook grouping record. | fixture `…/exchange.recipe.collection.json` |

Required fields of `exchange.recipe.recipe`: `name`, `text`, `ingredients`, `instructions`,
`createdAt`, `updatedAt`. The fixture declares no `additionalProperties: false`, and the live
PDS was **proven to accept and round-trip unknown fields** (see the extension table below).

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

_Last updated: 2026-07-09 (recipe-model-extensions Pass 3 / NSID docs pass)._
