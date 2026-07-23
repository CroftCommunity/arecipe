# RUN-TIMERS-SEASONALITY — run summary

Two independent, model-free features in one run: **Feature A — Timers** (a
standalone timer page + a focus-mode strip) and **Feature B — Seasonality** (a
boost-only "what's good right now" signal). TDD throughout: every acceptance
criterion was a RED test before the code that satisfied it existed.

Branch: `claude/timers-seasonality-ndcl3w`. Environment note (per CLAUDE.md): the
full `npm test` e2e step fails in this container on the Playwright browser-pin
mismatch, not on code — e2e was run through the documented throwaway
`pw-local.config.ts` (pointing at `/opt/pw-browsers/chromium-1194`), then removed
(never committed). `lint`, `typecheck`, `test:unit`, `build` were run directly.

---

## Phase 0 — Re-ground (findings, recorded before code depended on them)

**Timers**

| Thing | Finding |
| --- | --- |
| Local store shape | `src/recipes/drafts-local.ts`: `createDraftStore({dbName?})` → `{save,get,list,remove}`; `indexedDB.open(name, 1)`, `createObjectStore(STORE,{keyPath:'id'})`; per-call open + `finally db.close()`; plain structured-clone objects (no JSON). Mirrored as `src/timers/timers-local.ts` (dbName `arecipe-timers`, store `timers`). |
| New-page registration | `scripts/build.mjs`: an **allowlist**, edited in TWO places — `PAGES[]` (esbuild entrypoint `src/pages/<p>.ts`) and `HTML{}` (stable shell → hashed JS/CSS + CSP + SRI + SW precache). Added `'timers'` to both; created `timers.html` (copy of `reference.html`, retitled). |
| Focus view builder | `src/recipes/view.ts` → `renderFocusView()`; `.focus-top` built ~L439. Added an optional `timerStripHost` appended into `.focus-top`; `src/pages/recipe.ts` `mountFocus()` mounts the strip and stops its tick on every exit route (alongside the wake lock). |
| "Reference page" (A-D7) | Two pages exist: `reference.html` = kitchen **charts** (`reference-view.ts`); `user-guide.html` = help prose. "Reference" = the charts page. Wired **both** entry points: a nav tab (`tab-timers`) and a link on the reference charts page (`timers-link`). |
| Notification / audio | **Greenfield** — no existing `Notification`/`AudioContext`/`vibrate` usage. Followed the wake-lock posture (feature-detect, degrade silently, no nag). |

**Seasonality**

| Thing | Finding |
| --- | --- |
| Ranking path | No stored numeric score. Browse/Cookbook order via `queryEntries` (search) + `sortEntries` (day-seeded shuffle). Boost applied **non-destructively**: the main feed order is never touched; the boost surfaces as an additive "In season now" strip + a card badge. `applySeasonBoost` (stable float-up partition) is the tested ranking primitive. |
| Card rendering | `renderCard` in `view.ts` (precedent: `version-badge`). Added an `in-season-badge` gated by `RenderOptions.inSeasonUris`. |
| Ingredient normalization | Reused `parseIngredient(line).name` from `src/recipes/shopping-list.ts` (lowercase, collapse, plural-fold last word, **no** descriptor stripping). Recipe ingredients are a `string[]` on `value.ingredients`. |
| Settings + persistence | `src/pages/settings.ts` `section()` blocks + localStorage prefs. New `src/seasonality/prefs.ts` (`createSeasonalityPrefs`): `enabled()` default ON (`!== '0'`), `region()` default constant, defensive. |
| Static data | TS-module convention (`taste-preference.ts` etc.) → `src/seasonality/produce.ts`. |
| Strip precedent | `.never-planned-group` (a labelled `<section>` with a testid). |

### Region default (B-D2) — owner decision not available at Phase 0

Chosen provisional default: **`northern-temperate`** ("Northern Hemisphere
(temperate)"). Rationale: it is explicit, visibly labelled in Settings, and one
tap to change; it covers the largest slice of the likely early audience; **no
geolocation and no locale inference** are used (B-D2, verified by grep below).
Flagged as provisional — swap the `DEFAULT_REGION` constant in
`src/seasonality/produce.ts` if the owner decides otherwise.

### Duration chips (Phase A3, A-D8) — DROPPED

Recorded as dropped, which A-D8 explicitly permits. Rationale: the phase is
optional/last/droppable, and shipping the two solid, fully-tested surfaces
(timer page + focus strip) without a text-parsing chip keeps the surface
conservative — no risk of a mis-parsed step starting a wrong timer, which is
exactly the failure A-D8's 95%-precision gate exists to prevent. The core timer
model needed for chips (`createTimer`/`restartTimer`) is in place, so the phase
can be added later behind its own precision fixture set.

---

## Feature A — Timers

### Phase A1 (RED)

Unit — modules absent:

```
Error: Cannot find module '../../../src/timers/timer-state.js'
 FAIL tests/unit/timers/timer-state.spec.ts
 FAIL tests/unit/timers/timers-local.spec.ts
 Test Files  2 failed (2)   Tests  no tests
```

E2E (`tests/e2e/timers.spec.ts`, against the pre-feature build) — wiring absent:

```
  4 failed
    › a running timer survives navigating away and back, with correct remaining
    › a running timer shows in the focus strip
    › notification permission is not requested on load, only after opting in
    › both the nav and the reference page link to the timers page
  1 passed  (the "strip absent when none run" assertion is trivially true with no strip)
```

### Phase A2 (GREEN)

Implemented in dependency order: `timer-state.ts` (pure) → `timers-local.ts`
(IndexedDB) → `timer-prefs.ts` → `timer-alarm.ts` (audio + opt-in Notification)
→ `timer-strip.ts` → `pages/timers.ts` + `timers.html` → focus wiring → nav +
reference link → CSS.

```
# timer unit specs
 Test Files  2 passed (2)    Tests  11 passed (11)
# timer e2e
 tests/e2e/timers.spec.ts   5 passed
```

One RED test was refined during GREEN: the notify-permission e2e used
`.check()`, but a **denied** permission correctly reverts the box to unchecked
(A-D4, "denial is a permanent silent no"), which `.check()`'s state assertion
rejects — switched to `.click()` + assert the request fired exactly once.

The `nav.spec.ts` tab-order/desktop-only tests pinned the old 5-tab set; they
were updated (the added Timers tab is the deliberate behavior change demanded by
test 13).

### A4 acceptance

1. **No stored countdown** — all remaining time derives from `endsAt`
   (`remainingMs`/`isExpired`, tests 1–4). Grep (A4.1) below.
2. **Survives navigation / reload / sleep** — tests 8, 9 (persistence), 10 (e2e nav).
3. **Concurrent independent timers** — test 7.
4. **Focus strip only when relevant** — test 11 (present with a running timer, absent with none).
5. **Notification permission only on explicit opt-in** — test 12 (not on load; once on toggle).
6. **Background-alert limitation stated in one sentence** — the notify toggle
   and its one-sentence caveat live on the timers page next to the toggle
   (`.timer-notify-note`): *"With no server there is no background alarm: a timer
   stays correct when you return, but its alert may be late if this tab was in
   the background."*

**A4.1 grep — no persisted remaining-duration field.** The persisted `Timer` is
`{id,label,endsAt,durationMs,createdAt}`. Searching the model + store for a
stored countdown finds only function names and comments affirming the absence:

```
$ grep -rniE "remaining|countdown|secondsLeft|timeLeft" src/timers/timers-local.ts src/timers/timer-state.ts
timer-state.ts: … computes a countdown from it. Remaining time always derives from `endsAt`.
timer-state.ts: /** Human-readable remaining time … takes already-computed remaining ms. */
# (remainingMs / formatRemaining are pure functions of endsAt; nothing is stored)
```

---

## Feature B — Seasonality

### Phase B1 (RED)

Unit — modules absent:

```
Error: Cannot find module '../../../src/seasonality/season.js'
 FAIL tests/unit/seasonality/season.spec.ts
 FAIL tests/unit/seasonality/prefs.spec.ts
 Test Files  2 failed (2)   Tests  no tests
```

E2E (`tests/e2e/seasonality.spec.ts`) — surfaces absent:

```
  2 failed
    › the in-season badge appears on a matching card and not on a non-produce card
    › turning the setting off removes the badge and the strip (off = baseline)
  1 passed  (negative-copy grep is trivially clean with no seasonality copy yet)
```

### Phase B2 (GREEN)

Implemented: `produce.ts` (data + regions) → `season.ts`
(`isInSeason`/`matchProduce`/`seasonBoost`/`applySeasonBoost`/`rankWithSeason`)
→ `prefs.ts` → badge in `view.ts` → "In season now" strip → browse/cookbook
wiring → settings section → CSS.

```
# seasonality unit specs
 Test Files  2 passed (2)    Tests  11 passed (11)
# seasonality e2e
 tests/e2e/seasonality.spec.ts   3 passed
```

Two RED tests were corrected to match the locked spec during GREEN:

- Test 4 used `'3 ripe tomatoes'`; curated-alias matching is **exact** and
  `parseIngredient` keeps descriptors (`ripe tomato` ≠ `tomato`), so it must
  NOT match — the same conservative rule that makes test 5's `sun-dried tomato
  paste` miss. Changed to a bare `'2 tomatoes'`.
- The "In season now" strip was redesigned to list in-season **produce names**
  (not recipe links). This is truer to B0 ("surface what is good right now"),
  and it removed a `getByText(recipeName)` collision that would otherwise make
  several pre-existing (clock-dependent) browse/cookbook specs nondeterministic.
  The main feed is thereby never reordered — off is byte-identical to on for the
  card list, and the boost is purely the additive strip + badge.

### B4 acceptance

1. **Boost only; positions never worsen** — `applySeasonBoost` is a stable
   float-up partition, unit-tested (test 6) to never remove an entry and never
   demote a boosted one; the browse/cookbook main feed is not reordered at all.
2. **Off == current build** — `rankWithSeason(enabled:false)` is deep-equal to
   input (test 7); toggling off removes badge + strip (test 9).
3. **Curated-alias only** — exact normalized-alias match; a near-miss substring
   misses (test 5).
4. **Region explicit, defaulted, labelled; no geolocation** — grep below.
5. **No negative seasonality copy** — test 10 greps rendered Browse, Cookbook,
   and Meals DOM for `out of season | not in season | poor month | off-season`;
   all clean. The only copy the feature emits is positive ("In season", "In
   season now").

**B4.4 grep — no geolocation anywhere.** Region is a settings value only:

```
$ grep -rniE "geolocation|navigator\.geo|getCurrentPosition|watchPosition" src/
src/seasonality/produce.ts: // Region is EXPLICIT and never inferred (B-D2): no geolocation, no locale …
src/pages/settings.ts:      // explicit and never inferred — no geolocation.
# (only comments affirming the absence — no API call exists)
```

---

## Gate

```
lint       ✓ (eslint .)
typecheck  ✓ (tsconfig.json + tsconfig.tests.json)
test:unit  ✓ 90 files, 898 tests
build      ✓ (adds the `timers` page bundle + shell)
test:e2e   ✓ 243 passed (hermetic tier, via pw-local.config.ts; browser-pin note above)
```

## Files touched

**New — Feature A**: `src/timers/timer-state.ts`, `src/timers/timers-local.ts`,
`src/timers/timer-prefs.ts`, `src/timers/timer-alarm.ts`,
`src/timers/timer-strip.ts`, `src/pages/timers.ts`, `timers.html`,
`tests/unit/timers/timer-state.spec.ts`, `tests/unit/timers/timers-local.spec.ts`,
`tests/e2e/timers.spec.ts`.

**New — Feature B**: `src/seasonality/produce.ts`, `src/seasonality/season.ts`,
`src/seasonality/prefs.ts`, `tests/unit/seasonality/season.spec.ts`,
`tests/unit/seasonality/prefs.spec.ts`, `tests/e2e/seasonality.spec.ts`.

**Modified**: `scripts/build.mjs` (PAGES + HTML: `timers`), `src/nav.ts` (Timers
destination), `src/pages/reference-view.ts` (timers link), `src/recipes/view.ts`
(`RenderOptions.inSeasonUris` + badge + `renderInSeasonStrip` + focus
`timerStripHost`), `src/pages/recipe.ts` (focus strip mount/teardown),
`src/pages/browse.ts` + `src/pages/cookbook.ts` (seasonality wiring),
`src/pages/settings.ts` (Seasonality section), `styles.css` (timers + seasonality),
`tests/unit/nav.spec.ts` (Timers tab), `tests/e2e/mobile-fit.spec.ts` (timers page).

No new lexicons (timers are device-local, never PDS records — A-D1; seasonality
is static in-repo data), so `docs/LEXICONS.md` is unchanged.

## Out of scope (unchanged)

Timer sync / background scheduling / presets / voice (A5). Out-of-season
anything, planner nudges, geolocation, fuzzy matching (B5). Duration chips
(A3, dropped — see above).
