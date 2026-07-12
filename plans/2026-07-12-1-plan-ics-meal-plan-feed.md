# Plan: iCalendar (.ics) meal-plan feed

date: 2026-07-12

status: in progress

owner: arecipe

related: `docs/LEXICONS.md` (`app.arecipe.mealPlan`), `src/recipes/meal-plan.ts`,
`src/recipes/meal-plan-dates.ts`, `src/recipes/meal-plan-sync.ts`, `src/pages/meals.ts`,
`meals.html`, `scripts/build.mjs`, `docs/PRACTICES.md`, `docs/SECURITY.md`

A committed, deployed, subscribable `.ics` per configured DID that renders a user's
`app.arecipe.mealPlan` records to Google Calendar as one continuously-extending calendar,
refreshed by a scheduled GitHub Action (zero always-on backend), plus a one-tap
"Add to Google Calendar" affordance on `meals.html`. Read-only and slow by design.

---

## Phase status

| Phase | Status | Notes |
|-------|--------|-------|
| 0 Recon & grounding | ✅ | Findings below. No product code changed. |
| 1 Shared derivation | ✅ | `src/recipes/meal-plan-calendar.ts` (`deriveDatedRows`/`deriveDatedSlots`), generic `expandCalendar`; `meals.ts` repointed. 8 characterization unit tests + 16 meals e2e green (behavior-preserving). |
| 2 ICS serializer | ✅ | `src/recipes/ics-serialize.ts` (`serializeCalendar`). RFC 5545: CRLF, 75-octet UTF-8-safe folding, TEXT escaping, all-day `VALUE=DATE` + non-inclusive `DTEND` (reuses `addDays`), weekly `RRULE`. 13 unit tests + hand-checked golden fixture `tests/fixtures/ics/golden-basic.ics`. |
| 3 Feed assembler | ✅ | `src/recipes/ics-assemble.ts` (`buildCalendar`). Expansion mode (one discrete VEVENT per anchored meal-slot); structural date-independent UIDs `<rkey>-w<week>-r<rep>-d<day>@arecipe.app`; skip empty/note-only slots + unanchored plans; DTSTAMP from `updatedAt`; URL = `arecipe.app/recipe.html?u=<uri>`; dedup by UID; stable (date, day, uid) order. 13 unit tests. |
| 4 PDS reader | ✅ | `src/recipes/ics-read.ts` (`listMealPlans(did)`): resolves DID→PDS (fetch-injectable `resolveDidDoc`), follows listRecords cursors, unauth, reuses exported `planFromRecord`. 5 hermetic tests (paging, resolution, open-world skip) + `tests/e2e/ics-feed-live.spec.ts` `@live` schema guard (verified live: DID→`stropharia…`, 0 records → graceful skip). |
| 5 Generator entry point | ⏳ | |
| 6 Scheduled Action | ⏳ | |
| 7 meals.html affordance | ⏳ | |
| 8 Docs + deploy verify | ⏳ | |

---

## Phase 0 findings (recon, no product code)

### Derivation and its date source — RESOLVED

The dated calendar is derived by **two** pieces that must be reused **together**:

- **`expandCalendar(weeks: PlanWeek[]) -> CalendarWeek[]`** (`src/recipes/meal-plan.ts:97`):
  pure, exported. Stamps each week `repeat` times (clamped [1,12], default 1) in array
  order, `rep` ascending. Each `CalendarWeek` carries `{ week (1-based source), rep, days }`.

- **The running-`rowIndex` date math inside `buildCalendarRows`** (`src/pages/meals.ts:97`–156):
  as it iterates `expandCalendar(plan.weeks)` it keeps a **running `rowIndex`** that advances
  by 1 for **every** emitted row (each repeat occurrence = a full 7-day week). The date of a
  slot is `dateForSlot(startDate, rowIndex, dayIndex)` = `addDays(startDate, rowIndex*7 + dayIndex)`.

  **This is the anti-drift trap:** the date base is the *running row position in the expanded
  calendar*, **not** the source week index `cw.week`. A week with `repeat = 3` occupies 3
  *consecutive* calendar weeks. Any feed-side code that used `cw.week` instead of a running
  counter would drift the moment a repeat > 1 appears. Phase 1 extracts this loop as a shared
  pure function so the feed and the app cannot diverge.

- **Anchor / week ordering.** The anchor is **`plan.startDate`** — a record field, optional,
  strict ISO `YYYY-MM-DD`, documented as "the first Monday" (`meal-plan-dates.ts:1`–5). Dates
  are **floating / UTC** (no timezone conversion) so a shared calendar reads identically in
  every timezone. When `startDate` is absent the app renders abstract "Week N" labels with **no
  dates** → the feed cannot place such a plan on a calendar and must **skip** it (no dated events).

- **Date helpers** (`src/recipes/meal-plan-dates.ts`, pure, exported): `addDays`,
  `dateForSlot(anchorIso, weekIndex, dayIndex)`, `formatShortDate`, `weekRangeLabel`.

### Collection constant, reader, slot shape — RESOLVED

- **`MEAL_PLAN_COLLECTION = 'app.arecipe.mealPlan'`** (`src/recipes/meal-plan.ts:13`).

- **Reader:** `listPdsPlans(pds, did, { fetchFn? }) -> Promise<LocalPlan[]>`
  (`src/recipes/meal-plan-sync.ts:116`). Uses a **plain injectable `fetch`** against
  `com.atproto.repo.listRecords` — **unauthenticated, runs under Node** (Node 18+ global fetch;
  env is Node 22.22). Validates + **skips** malformed records per record. **Caveat:** it hard-codes
  `limit=100` and does **not** follow the `cursor`. Phase 4 builds a read-only sibling
  `listMealPlans(did)` that resolves DID→PDS then follows cursors, reusing the record→plan mapping.
  Note `planFromRecord` (the mapper) is **not exported** today — Phase 4 either exports it or shares it.

- **DID→PDS:** `resolveDidDoc(did) -> { pds, handle }` (`src/identity/did.ts:11`) — plc.directory,
  CORS-open, but hard-codes `fetch` (no injectable seam). Phase 4's reader takes an injectable
  resolver so it is hermetically testable.

- **Slot accessors.** `PlanSlot = { recipe?: StrongRef; note?: string }` in the model
  (`meal-plan.ts:20`); `StrongRef = { uri, cid }` (`refs.ts:8`). The **record** additionally caches
  the display **`name`** as an open-world extra on each filled slot (`meal-plan-sync.ts:19`–25). The
  reader's `LocalSlot.recipe = { uri, cid, name }` (`meal-plan-local.ts:21`), name defaulting to
  `'(recipe)'` when absent. **A slot bears a meal iff `slot.recipe !== undefined`** — the reader
  already drops note-only/empty slots to `{}`, so "skip if neither recipe nor name" falls out for free.

- **`updatedAt` availability — CONFIRMED.** `updatedAt` is a **required** string on the record
  (`validateMealPlanValue`, `meal-plan.ts:52`) and is preserved onto `LocalPlan.updatedAt`
  (`meal-plan-sync.ts:92`). → per-event `DTSTAMP` sources from `plan.updatedAt` for reproducible output.

### Deploy pipeline & TS-runtime facts — RESOLVED

- `scripts/build.mjs` emits `dist/` (rm'd fresh each build) and copies static files in; the `deploy`
  job (`.github/workflows/ci.yml`) runs `npm run build` then `actions/deploy-pages` on push to `main`.
  → the feed lives at **`calendars/<did>.ics`** in the repo source; **`build.mjs` copies `calendars/`
  into `dist/`**; the scheduled Action commits changed `.ics` on diff → that push triggers the normal
  deploy. Host is `arecipe.app` (CNAME). `.ics` MIME on GitHub Pages is **not assumed** (Phase 8 verify).

- **No runtime TS runner** (no tsx/ts-node; vitest runs TS for tests only). Native
  `node --experimental-strip-types` **fails** across `src` because the tree uses `.js` import
  specifiers (bundler resolution) — confirmed. → the generator CLI (`scripts/build-ics-feed.mjs`)
  **bundles its TS entry via esbuild** (`buildSync`, already the repo idiom) then imports it. The
  reader/serializer/assembler use only `fetch` (no `@atproto/api`), so the bundle is small.

### CSP / security — RESOLVED

- CSP is `<meta>`-delivered, generated by `build.mjs` (`docs/SECURITY.md`). The Phase 7 affordance is
  a **plain top-level anchor** to Google (a navigation, not a subresource) → **no CSP fetch directive
  applies**, no third-party origin is added, CSP is unchanged. `form-action 'self'` and `default-src
  'none'` do not restrict `<a href>` navigation.

### Fixtures to reuse

- `tests/fixtures/lexicons/app.arecipe.mealPlan.json` — the lexicon (record/#week/#slot).
- `tests/fixtures/atproto/listRecords-*.json` — `listRecords` envelope shape (`{ records: [{uri,cid,value}] }`).
- Reader hermetic tests inject `fetchFn` returning a `mealPlan` `listRecords` fixture (build via `planToRecord`).

### Stop conditions — all cleared

Anchor/week-ordering derivation **found** (`startDate` + running `rowIndex` over `expandCalendar`).
Derivation purity: `expandCalendar` + `dateForSlot` are pure; only the *combination* is entangled in
`meals.ts` DOM code — Phase 1 extracts it behavior-preservingly. Nothing invented.
