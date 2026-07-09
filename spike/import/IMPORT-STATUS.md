# Recipe import & PDS status

The living status of publishing recipes to the arecipe PDS account. Kept **in the repo** (this
file travels with the checkout) — not in agent memory. Update it as import work progresses.

Related in-repo docs: `docs/LEXICONS.md` (NSID/lexicon registry), the recipe-model plan in
`plans/2026-07-09-*-plan-recipe-model-extensions.md`, and `tests/fixtures/lexicons/PROBE-NOTES.md`
(recipe.exchange lexicon capture).

## Account & deploy facts

- **Publishing account:** `arecipe.bsky.social` = `did:plc:spfl4xaktvvchr2cqp2r2xvp` — the first
  entry in `STARTER_AUTHORS` (`src/recipes/starter.ts`), so its records surface in Browse via the
  starter pack. Records are `exchange.recipe.recipe` on `bsky.social`.
- **Credentials:** `BSKY_ARECIPE_HANDLE` / `BSKY_ARECIPE_PASSWORD` in a **gitignored `.env`** at
  the repo root (app password — never commit). The publish tooling reads it.
- **Remote/deploy:** `git@github-personal:CroftCommunity/arecipe.git` (committer chasemp,
  chase@owasp.org). `.github/workflows/ci.yml`: every push runs full `npm test`; the `deploy`
  job (GitHub Pages) runs only on `main` push after `test` passes. Live site: arecipe.app
  (DNS-blocked on the Cisco Umbrella corporate network → resolves to a 146.112.x block page;
  it is not down — verify via public DNS or `--resolve` to 185.199.108.153).

## Import tooling (`spike/import/`)

Ops tooling — lint/typecheck-ignored; tests run via `node --test spike/import/*.test.mjs`. All
publishers are **idempotent** (skip by existing record name).
- `catalogue-map.mjs` (+test) — pure mapper: labels→`suitableForDiet` tokens / `recipeCategory` /
  keywords, category→`recipeCuisine`, ISO/human times→durations, `attributionWebsite`.
- `extract-jsonld.mjs` (+test) — schema.org/Recipe JSON-LD extractor (HowToStep/HowToSection).
- `publish-flagship.mjs` — the 14 flagship recipes. `batch-urls.mjs` / `extracted-batch.json` /
  `batch-authored.mjs` / `publish-batch.mjs` — the URL batch (extracted facts + authored prose).
- Images: `fetch-images.mjs` (Commons search → candidates, rate-limited/resumable),
  `build-picker.mjs` (static picker page + 🚩 flag box), `refetch-alternates.mjs` (round-2),
  `image-record.mjs` + `attach-images.mjs` (uploadBlob + putRecord embed, idempotent, steps down
  width to stay under the 1 MB blob cap).

## State — live records (catalogue import)

**41 records live on arecipe.bsky.social** (14 flagship + 26 URL batch + 1 seed). All 40
published have a Wikimedia Commons image attached (`embed.images[0]` = blob + alt + aspectRatio +
`credit{artist,license,source}`; served via cdn.bsky.app). Image-credit UI shipped (commit
b3f9842): `present.ts#firstImageCredit` + `view.ts imageCreditOverlay`.

- **5 failed (HTTP 403 bot-block) — need an alternate source:** Chicken Tinga, Chiles Rellenos,
  Ceviche (mexicoinmykitchen.com), Classic Cheeseburger (seriouseats.com), Classic Potato Salad
  (simplyrecipes.com, likely transient).
- **~360 remaining** catalogue recipes are names-only (no per-recipe URLs) — need URL discovery +
  extraction. Descriptions must be original prose; steps reduced to a functional sequence
  (copyright stance — see the catalogue caveats).
- `pds-funfacts.json` holds researched fun facts for all 41 live records (prep only; applied to
  the live records in the recipe-model plan's Phase 6, once `funFacts[]` ships).

## State — the 136-recipe import corpus (branch `recipe-import-batch`)

Six structured JSON files in `spike/import/`, each enriched (diet/cuisine/keywords/times),
fact-checked, QA-clean:
`own-batch.json` (25) · `dessert-dual-method-25.json` (25, dual `methods[]`) ·
`regional-dishes-8.json` (8) · `artisan-baking-28.json` (28) · `frugal-family-25.json` (25) ·
`julia-child-25.json` (25).

- **Images: 126 / 134 picked** — `image-choices-corpus.json` (source of truth = Commons File URL +
  license + artist). **8 still need a Commons image:** Easy Vanilla Mug Cake, Banana Bread Mug
  Cake, Chocolate Brownie in a Mug, Rosemary Garlic Homemade Crackers, Savory Stromboli,
  Depression-Era Wacky Chocolate Cake, French Madeleines. **New England Clam Chowder** currently
  has the Manhattan (red) image — wants the white New England kind. (Only Wikimedia Commons /
  CC / public-domain images are usable; recipe-blog images are copyrighted and were rejected.)
- The alt-version/`dishKey` grouping is **not** yet consistently encoded in the JSON (`dish`/`altOf`
  are inconsistent) — canonical dishKey normalization across all 177 records is Phase 1b of the
  recipe-model plan.
- **Publishing is gated on the recipe-model extensions** (versions / fun facts). Plan is
  Pass-1/2/3 complete and ready to execute Phase 1. Nothing publishes until those fields exist.
