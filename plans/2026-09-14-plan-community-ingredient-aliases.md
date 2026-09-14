# Community ingredient aliases as PDS records

Date: 2026-09-14
Status: **built** (Phase 9 of `plans/2026-08-12-1-plan-ingredient-normalization-and-substitutions.md`, re-planned here before execution as that plan required)

## Problem statement

The ingredient vocabulary learns in one direction only. A cook who taps the "?" beside
a line the app does not know (Phase 6) teaches *that device*: the correction lives in
`localStorage`, never reaches the cook's other devices, and reaches the shared vocabulary
only if the cook copies the seed block from Settings and someone pastes it into the seed.
The corpus battle-test (M4) left 3,859 lines unmatched even with the fuzzy tier, most of
them names no similarity measure should resolve — exactly what a human correction is for.
Those corrections are the cheapest signal the vocabulary can get, and today they evaporate.

## Approach

Alice confirms on her phone that "freeze-dried strawberry" is *strawberry*. On the Account
page she taps **Publish**, and one public `app.arecipe.ingredientAlias` record
`{ name: "freeze-dried strawberry", key: "strawberry", createdAt }` lands on her own PDS.
On her laptop she taps **Pull from account** and the correction is there. When arecipe next
rebuilds its vocabulary, the build tool reads the alias records of the accounts the seed
trusts (`aliasSources`, the arecipe account first) and offers each as an alias candidate in
the review report: attached to its key when the key exists, listed as "names a key we do
not have" otherwise. A record never creates a key and never resolves anything by itself.

Concretely:

- **Record** — `app.arecipe.ingredientAlias`, one per name, key `tid`, required `name`
  (the unmatched name as the resolver reports it: lower-case, whitespace-collapsed), `key`,
  `createdAt`. Lexicon fixture `tests/fixtures/lexicons/app.arecipe.ingredientAlias.json`;
  registry row in `docs/LEXICONS.md`.
- **PDS tier** — `src/recipes/ingredient-aliases-pds.ts`, the cookFollow tier's shape:
  `listIngredientAliases` (public `listRecords` on the cook's repo, unauthenticated),
  `publishIngredientAlias` (adopt-first: an existing record for the name is stamped, never
  duplicated), `unpublishIngredientAlias` (rkey resolved by name), and
  `mirrorIngredientAliasesDown` (reconciling: upsert + stamp every PDS record, prune marked
  local rows the PDS no longer has, leave local-only rows alone).
- **Local store** — `ingredient-aliases-local.ts` gains a `publishedRkey` marker per name,
  cleared when a name is re-confirmed to a different key (the record no longer says what
  the row says). The overlay stays the universal read model: every consumer (resolver,
  substitutions, search, the "?") keeps reading the device-local store; the PDS tier only
  moves rows in and out of it.
- **UI** — Account page, "Ingredient corrections on your account": Publish *N* / Pull from
  account, with a status line. Signed-in only; signed out the block does not exist (never a
  dead control). Settings keeps the device-local list, copy and clear.
- **Build** — `scripts/build-ingredientkeys.mjs --aliases-from` pulls the seed's
  `aliasSources` accounts into a committed cache (`runs/ingredient-normalization/
  community-aliases.json`) so the hermetic build reads the cache; `proposeVocabulary`
  takes `communityAliases` and reports `{ attached, unknownKey }` in the review report.
- **Evidence** — unit: 7 PDS-tier cases (hermetic fake agent + fetch), 1 marker case,
  1 build-core case, all RED first; hermetic e2e: the block is absent signed out;
  `@live`: `tests/e2e/ingredient-aliases-live.spec.ts` publishes one correction, reads it
  back from the account's public `listRecords`, clears the device and pulls it back.

## Reasoning

- **Why a new record type.** The lexicon investigation the workspace rule requires
  (LEXICONS act 1, 2026-09-14) found nothing to reuse: `community.lexicon.*` (archived on
  GitHub; namespaces app, bookmarks, calendar, interaction, location, payments, preference)
  has nothing about food, vocabulary or string annotation; `exchange.recipe.*` models the
  ingredient *line* as free text and its defs are tokens, with no ingredient identity or
  alias anywhere; `com.atproto.label` is a tag on a resource URI carrying one value, not a
  string-to-string mapping a user authors. Minting `app.arecipe.ingredientAlias` follows the
  same path as `cookFollow` and `mealPlan`; proposing it to lexicon.community is a follow-up
  once it has real records behind it.
- **Why the name, not the raw line.** The same choice Phase 6 made: one record covers every
  line that reads the same once quantity and preparation come off, and a parser change
  leaves a record unconsulted rather than wrong.
- **Why adopt-first and reconciling, not last-write-wins.** Two devices publishing the same
  name must not create two records; a correction deleted on one device must not be
  resurrected by another's pull. The cookFollow tier proved both on a live PDS; this tier
  mirrors it line for line so the proof carries.
- **Why candidates, never truth, at build time.** "A lexicon binds you and nobody else"
  (LEXICONS.md): a record on a stranger's PDS can say anything. The build reads only the
  accounts the seed names, attaches an alias only to a key it already has, and puts every
  one in the review report. The human review stays the single quality gate.
- **Why the Account page and not Settings.** Publishing needs the session Agent; Settings
  ships no auth code by design. The device-local list stays where it was.
- **What this does not do.** It does not publish the *lexicon schema* on-network
  (`_lexicon` TXT → `com.atproto.lexicon.schema` record); that follows the other
  `app.arecipe.*` types and is the owner's DNS step. It does not read strangers' records
  at runtime. It does not rank or weight corrections by author.

## Outcome

Built 2026-09-14, PR #104. The record type is defined in code and unpublished on-network,
like every other `app.arecipe.*` type. First real records: none yet — the arecipe account
is the first `aliasSource`, and the cache file is empty until `--aliases-from` runs against
an account that has published corrections.
