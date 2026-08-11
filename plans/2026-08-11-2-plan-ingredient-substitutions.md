# Plan — ingredient substitutions (⇄) (2026-08-11)

## Problem

Cooks routinely swap one ingredient for another they always prefer — ground
hamburger → ground turkey, milk → lactaid milk (lactose-free), etc. Today the
recipe, the plan/menu, and the shopping list all show whatever the recipe author
wrote, so the cook re-does the same mental swap every time. Three asks, mirroring
the shape of the existing **staples** feature (same Account "Shopping list"
section, same device-local store):

1. **Substitutions** — an account-level list of `from → to` ingredient swaps,
   authored like staples (add/remove rows).
2. **Recipe page (opt-in)** — a compact **⇄ toggle** by the Ingredients heading.
   Off by default: you see the recipe as published. On: each matched line shows
   the original **struck through** with the preferred swap beside it. An Account
   checkbox **"Always apply substitutions"** makes the toggle start on.
3. **Shopping list (default on)** — unlike the recipe/plan/menu surfaces,
   substitutions are **swapped in by default** (you shop for what you actually
   want), so the on-screen list, Copy, Download, and AI-shopper payloads all
   carry the substitute.

**Symbol:** `⇄` (swap arrows) — a monochrome glyph matching the app's existing
affordances (⧉ copy, ⚑ flag, ⛶ focus), not a colored emoji.

## Approach

Pure core in `src/recipes/shopping-list.ts`, extend the device-local store in
`src/recipes/shopping-prefs.ts`, recipe-detail render in `src/recipes/view.ts`,
wiring in `src/pages/recipe.ts` (opt-in), `src/pages/account.ts` (authoring), and
`src/pages/meals.ts` (default-on shopping list). Styles in `styles.css`.

### Core (pure, tested first — `shopping-list.ts`)
- `type Substitution = { from: string; to: string }`.
- `applyLineSubstitution(raw, subs)` — first matching sub only; whole-word,
  case-insensitive (`\bfrom\b`), so `milk` swaps `2 cups milk` but never
  `buttermilk`. Returns `{ original, substituted, from, to } | null`, preserving
  the leading qty/unit and everything else verbatim.
- `substituteLines(lines, subs)` — map raw lines through substitutions (no-op
  with none).
- `resolveShoppingList(..., substitutions = [])` — applies `substituteLines`
  **before** aggregation, so two recipes that both resolve to the substitute
  combine into one line.

### Store (`shopping-prefs.ts`)
- Add `substitutions: Substitution[]` + `alwaysApplySubstitutions: boolean` to
  `ShoppingPrefs`/`emptyShoppingPrefs`; `normalizeSubstitutions` (trim both
  sides, drop rows missing either side, de-dupe by `from`). Load tolerates legacy
  records with no substitution fields (open-world posture).

### Recipe page (`view.ts` + `recipe.ts`)
- `RenderOptions.substitutions` + `RenderOptions.applySubstitutions`.
- The ⇄ toggle renders only when a configured sub **actually matches** a line
  here (never a no-op control); toggling re-paints the list in place. `recipe.ts`
  reads the store and passes `substitutions` + `applySubstitutions:
  alwaysApplySubstitutions`.

### Account page (`account.ts`)
- New "Substitutions ⇄" block in the Shopping-list section: `from`/`to` inputs +
  Add, chip rows with ✕ remove, and the "Always apply substitutions" checkbox.

### Shopping list (`meals.ts`)
- On open, read `substitutions` and pass to `resolveShoppingList` — applied by
  default; Copy/Download/AI all derive from the substituted list.

## Verification

- Unit: `tests/unit/recipes/shopping-prefs.spec.ts` (normalize + round-trip +
  legacy tolerance), `tests/unit/recipes/shopping-list.spec.ts`
  (`applyLineSubstitution`, `substituteLines`, resolve-with-subs),
  `tests/unit/recipes/view.spec.ts` (toggle presence/default/swap/interaction).
- E2E (hermetic): `tests/e2e/account.spec.ts` (author + persist + always-apply),
  `tests/e2e/recipes.spec.ts` (opt-in swap + always-apply seeds it on),
  `tests/e2e/shopping-list.spec.ts` (default-on swap in screen + copy).
- Gate: `npm run lint`, `npm run typecheck`, `npm run test:unit`, `npm run build`,
  and e2e via the local Chromium config (per CLAUDE.md).

## Outcome

Implemented as planned. Symbol `⇄`; store extended backward-compatibly; recipe
page opt-in, shopping list default-on. Full unit suite + all e2e green.
