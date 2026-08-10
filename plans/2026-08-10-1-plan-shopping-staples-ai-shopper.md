# Plan — shopping staples, check-off, and AI shopper (2026-08-10)

## Problem

The shopping list faithfully lists everything a menu's recipes call for — including
pantry staples the cook already owns ("2 pinches of salt", "1 tsp vanilla"). Those
clutter the copied/downloaded list, which should be *shopping that still needs doing*.
Three asks:

1. **Staples** — an account-level list of ingredients ALWAYS assumed on hand. They
   stay visible in the panel as a muted annotation but are **excluded** from every
   copy / download / AI payload.
2. **Check-off in place** — every shopping line in both By-recipe and Combined views
   is tappable to mark "I already have this". Checked lines drop out of the copy /
   download / AI payloads too (but stay visible, struck through, so you can undo).
3. **AI shopper copy** — a second copy button that emits the list as terse
   instructions for an AI shopping agent ("Add these items to my cart: …"), with an
   account-level **custom instructions** block folded in (e.g. "prefer versions we've
   bought before"). No arecipe/recipe color — agents have their own notion of a
   "recipe"; get straight to the cart.

## Approach

Pure core in `src/recipes/shopping-list.ts` (extends the existing deterministic
builder/renderers), a defensive device-local store in `src/recipes/shopping-prefs.ts`,
Account-page UI in `src/pages/account.ts`, panel wiring in `src/pages/meals.ts`.

### Core (pure, tested first)
- `normalizeIngredientName` — expose the existing name normalizer for reuse.
- `makeStapleMatcher(staples)` — normalized whole-word match: `salt` covers
  `sea salt`, not `salted butter`; `olive oil` covers `extra virgin olive oil`.
- `applyStaples(list, staples)` — flags combined lines, as-listed lines, and
  by-recipe lines whose name matches a staple (`staple: true`), non-mutating.
- Line keys (`combinedLineKey`, `rawLineKey`) — stable, and **shared** across views
  by normalized name, so checking `flour` in By-recipe also excludes it in Combined.
- `filterForShopping(list, isExcluded)` — drops staples + excluded keys; feeds the
  existing markdown/document renderers untouched.
- `renderAiShopperText(list, { instructions })` — terse cart instructions from the
  (already filtered) combined + as-listed items.

### Store — `shopping-prefs.ts`
`{ staples: string[]; aiInstructions: string }`, one `shopping-prefs` key,
defensive load/save (private mode degrades to empty), staples de-duped.

### Account UI — a "Shopping list" section (device-local, everyone)
Staples chip input (add/remove) + AI-shopper custom-instructions textarea.

### Panel UI — `meals.ts`
Load prefs on open → `applyStaples`. Checkboxes on shop lines (in-memory `checked`
Set keyed by line key), muted "Assumed on hand" annotation for staples. Copy /
Download / new **AI shopper** button all run through `filterForShopping`.

## Tests
- Unit: staple matcher, applyStaples, keys, filterForShopping, AI render, store.
- e2e: staple excluded from copy but shown; check-off removes from copy; AI button
  emits instructions with the custom block.

## Outcome

Shipped 2026-08-10. Core in `shopping-list.ts` (`makeStapleMatcher`, `applyStaples`,
`combinedLineKey`/`rawLineKey`, `filterForShopping`, `renderAiShopperText`,
`normalizeIngredientName`) + `shopping-prefs.ts` store. Account page grows a
"Shopping list" section (staple chips + AI-instructions textarea). The meal-plan
shopping panel now: flags staples as a muted "Assumed on hand" annotation, makes
every shop line tap-to-check in both views (shared by normalized name across the two
tabs), and adds an **AI shopper** copy button. Copy / Download / AI all run through
`filterForShopping`, so staples and checked-off items never reach the payload.
Covered by unit (staple matcher, applyStaples, keys, filter, AI render, store) and
e2e (account persistence; panel annotate + check-off + AI copy) specs.
