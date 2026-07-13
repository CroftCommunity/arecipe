# Subscribable meal-plan calendar — client-push `.ics` to the user's GitHub Pages

**Status:** 📋 **Planned 2026-07-13.** TDD-first. An **opt-in, advanced**
capability: publish a single, rolling `.ics` of your published meal plans to a
GitHub repo you own (Pages-served as `text/calendar`) so a calendar client
(Google Calendar "add by URL") can **subscribe** and auto-update. Gated,
hardened, and off by default — it deliberately relaxes one security invariant
(see Decisions D1) for the users who want it.

## Evidence base (spikes already done — do not re-litigate)

- **[docs/PAGES-ICS-PROBE.md](../docs/PAGES-ICS-PROBE.md)** — GitHub Pages serves
  `.ics` as `text/calendar` (PASS); same-path republish propagates on deploy
  (edge purge proven). A committed `.ics` is a frozen file, but a *subscription*
  to a republished stable URL is a self-updating feed from the subscriber's side.
- **[docs/GITHUB-CORS-PROBE.md](../docs/GITHUB-CORS-PROBE.md)** — a browser can
  GET (read sha) + PUT (write) the GitHub Contents API cross-origin with a
  fine-grained PAT and **no proxy** (PASS). `Allow-Origin: *`, `Allow-Methods`
  incl `PUT`, `Allow-Headers` incl `Authorization`.
- **[docs/D3-BROWSER-PAT-SECURITY.md](../docs/D3-BROWSER-PAT-SECURITY.md)** — a
  bearer PAT in the browser breaks the "exfiltrated credential is inert"
  invariant; verdict = **not the default, legitimate as a hardened opt-in.** This
  plan *is* that hardened opt-in.

## Outcome Summary

| Phase | Outcome | Note |
|---|---|---|
| 0 Decisions | ⏳ | Confirm D1 (token posture) before Phase 3. Spikes above cover CORS/content-type. |
| 1 ICS core (pure) | ⏳ | `src/recipes/ics.ts` — RFC 5545 serialize, all-day events, stable UIDs, multi-plan aggregate. Unit-only. |
| 1b Start-Monday default | ⏳ | Pure `nextMonday(today)` + planner date picker defaults to it → plans are dated (calendar-eligible) by default. Unit + e2e. |
| 2 GitHub Contents client | ⏳ | `src/publish/github-contents.ts` — GET-sha→PUT, 409 retry, UTF-8 base64. Injected `fetch`. Unit-only. |
| 3 Config + token seams | ⏳ | `github-publish-config.ts` (localStorage, mirrors `reach.ts`) + `TokenProvider` (D1 impl). Token never re-exposed for render. |
| 4 Publish orchestrator | ⏳ | `calendar-publish.ts` `republishCalendar(deps)` — pure orchestration over injected deps. Unit-only. |
| 5 Account UI (advanced) | ⏳ | Collapsed `<details>` enable + config form; write-only token field; "Publish now"; guide link. Hermetic e2e. |
| 6 meals.ts hooks | ⏳ | Republish after publish AND after published-plan delete; never blocks the PDS op. Hermetic e2e. |
| 7 Setup guide page | ⏳ | `calendar-setup.html` (friends.html-style static + CSP inject); linked from account when enabled. |
| 8 Security doc + polish | ⏳ | SECURITY.md carve-out; revoke link; short-expiry guidance; offline; flip D3 memo status. |

## Problem Statement

Meal plans publish to the PDS and are shareable via
`meals.html?mealplan=&user=` (read-only web view). That serves *import-once* and
*view-in-browser*. It does **not** serve **subscribe-and-auto-update**: you
cannot point Google Calendar at a PDS record (XRPC returns JSON, not
`text/calendar`) or at a one-time download. The only backendless path to a
calendar a client can *subscribe* to is a stable `.ics` URL on static hosting,
updated in place — which needs a write credential to the host.

The ask (from the owner, single-tenant/personal use):

1. An **advanced, collapsed** section on the **account page**, off by default,
   with the tradeoffs stated. When enabled, it reveals config: a **PAT**, a
   **repo** (GitHub Pages enabled), and a **path**.
2. When a meal plan is **published**, if enabled, the `.ics` at that repo is
   **updated in place** to include it.
3. It is **single-tenant but rolling**: one aggregate calendar file; publishing
   adds a plan's dated events, and **deleting a published plan** (a date range)
   from the meals page removes them — again an in-place update.
4. A **linked setup guide** (separate page) reachable from the advanced menu when
   enabled, with step-by-step token/repo/Pages guidance and revocation.

## Approach

**Functional spine — the ICS is a pure function of the current published-plan
set.** Both triggers (publish, delete) reduce to one idempotent routine:
`listPdsPlans → buildMealPlanIcs → putFile(path)`. Regenerating from the full
current set (not incremental merge) is self-healing — no drift, delete "just
works," re-runs are safe.

**Each plan's `startDate` — the "starting Monday" date picker on the planner —
is what grounds its events in the ICS.** The picker anchors a plan's first
Monday; `dateForSlot(startDate, rowIndex, dayIndex)` lays every slot out from
there, and the ICS uses the *exact same* mapping so a published range lands on
the same real dates in a subscriber's calendar as it shows in the app. A plan
with no `startDate` has no real dates → it is skipped from the ICS (D5). To make
plans calendar-eligible by default, the picker **defaults to the next Monday**
(D7) so a fresh plan is dated without the user thinking about it.

Reuse what exists: `listPdsPlans` (already returns all published plans with
cached recipe names + `startDate`), `expandCalendar` + `dateForSlot` (the exact
date math the app's calendar uses — mirror the **cumulative `rowIndex`**, 7 days
per expanded row, *not* the source week index; see `buildCalendarRows` in
`meals.ts`). Mirror `reach.ts` for the localStorage config store and
`meal-plan-dates.ts`'s pure/floating/clock-free discipline for the ICS core
(the `DTSTAMP` is injected, never read from a clock).

**Seams for TDD.** Every side-effecting dependency is injected:
`fetch` into the GitHub client; `listPlans`, `putFile`, `config`, `token`,
`dtstamp` into the orchestrator; `storage` into the config store; a
`TokenProvider` interface for the secret. The DOM layers (account form, meals
hooks) stay thin over these tested cores and are covered by hermetic e2e that
**routes `api.github.com`** (no live GitHub, no real token in CI).

**No CSP or dependency change for connectivity.** `connect-src` already carries
the `https:` fallback that admits `api.github.com`; `worker-src 'self'` already
admits a token-holding service worker. No new npm deps. Verify in Phase 5, don't
assume.

### Module map (new)

```
src/recipes/ics.ts               pure RFC 5545 serialize + planEvents()      [P1]
src/publish/github-contents.ts   GET-sha → PUT (create/update), 409 retry     [P2]
src/publish/github-publish-config.ts  enabled/repo/path (localStorage)        [P3]
src/publish/github-token.ts      TokenProvider iface + D1 impl (secret)       [P3]
src/publish/calendar-publish.ts  republishCalendar(deps) orchestrator         [P4]
calendar-setup.html              static setup guide (CSP-injected)            [P7]
```

Touched: `src/pages/account.ts` (advanced section) [P5], `src/pages/meals.ts`
(publish + delete hooks) [P6], `scripts/build.mjs` (copy+CSP the guide page,
friends.html-style) [P7], `docs/SECURITY.md` [P8].

## Decisions

### D1 — Token storage posture (CONFIRM BEFORE PHASE 3) — *recommended below*

The one real fork; it sizes Phase 3. Same-origin page JS can read **any**
persistent store (localStorage / IndexedDB / Cache), so the only place a token is
*not* page-readable is **service-worker memory** — which is ephemeral (re-enter
on SW eviction). The tradeoff:

- **(A) localStorage** — trivial; token readable by any XSS (full exfiltration).
  Matches `reach.ts` simplicity. Weakest.
- **(B) SW-inject, in-memory** *(recommended)* — the SW holds the token in memory
  and attaches `Authorization` to outbound `api.github.com` requests; the page
  hands it over once and can never read the string back. XSS can still *drive*
  writes (misuse in place) but **cannot exfiltrate** — this mirrors the DPoP
  property SECURITY.md relies on. Cost: token re-entry when the SW is evicted;
  more code (SW message channel + fetch handler).
- **(C) SW-inject + encrypted persistence** — (B) plus persist the token
  encrypted under a non-extractable WebCrypto key so it survives eviction. The
  page can read the ciphertext but not decrypt without invoking the SW; adds real
  complexity for partial benefit.

**Recommendation: (B).** It is the security bar the D3 memo set for this feature
and it keeps the codebase's "exfiltrated credential is inert" story intact.
Regardless of choice: fine-grained PAT scoped to a **single repo**,
**Contents:write + Metadata:read only**, **short expiry**, an **isolated
Actions-disabled repo**, and an in-product **revoke** link — the compensating
controls that bound blast radius (D3 memo, alt-4). The `TokenProvider` interface
makes A/B/C swappable without touching P1/P2/P4; **all cores can be built and
tested against a fake provider before D1 is even implemented.**

### D2 — Event shape: **all-day DATE events**

`DTSTART;VALUE=DATE` / `DTEND;VALUE=DATE` (end = next day, exclusive). Plans are
floating calendar dates (per `meal-plan-dates.ts`), not instants — all-day is
correct and timezone-free. No `VTIMEZONE`.

### D3 — Stable UID = `${planId}-${YYYYMMDD}@arecipe.app`

Within a plan, expanded weeks never overlap, so each absolute date is unique →
UID is unique in the file and **stable across regenerations**, so subscribers
*update* events rather than duplicating them. Cross-plan same-date collisions are
distinct UIDs (both events shown).

### D4 — One aggregate file, configurable path (default `meals.ics`)

Single-tenant = one calendar file = the union of the account's published plans.
`X-WR-CALNAME` labels it "arecipe meals". Path configurable; default `meals.ics`
at repo root (Pages `/` → `https://<user>.github.io/<repo>/meals.ics` or their
custom domain).

### D5 — Undated plans are skipped (with a hint)

A plan without `startDate` can't produce dated events → excluded from the ICS;
the UI surfaces "set a start date to include this plan in your calendar." Tested.
In practice D7 makes this rare (fresh plans are dated by default), but the skip
path stays — a user can still clear the anchor, and older undated plans exist.

### D7 — Planner start-date picker defaults to the next Monday

The "starting Monday" date input defaults to the upcoming Monday when a plan has
no `startDate`, so plans are dated (and thus calendar-eligible) by default. Pure
helper `nextMonday(todayIso)` = the soonest Monday **on or after** `today` (today
if today is Monday); the UI supplies `today` (keeps the core clock-free, per
`meal-plan-dates.ts`). Applies only when `startDate` is unset — it never
overwrites a user's chosen date, and clearing the input still returns the plan to
abstract "Week N". Setting the default persists `plan.startDate` for a fresh plan
(so publish/ICS see it) rather than being a display-only hint. "On or after" is
the chosen rule (planning can start this week if it's Monday); easily flipped to
"strictly after" if preferred.

### D6 — Regenerate-from-full-set, not incremental

Every trigger rebuilds the whole file from `listPdsPlans`. Idempotent,
self-healing, makes delete trivial. Accepts a full list+rebuild+PUT per publish
(cheap; personal scale).

## Phases

> Every phase is **tests-first**: write the failing spec, then the
> implementation, then make it green. Unit = `tests/unit/**` (vitest, pure,
> injected seams). E2e = `tests/e2e/**` (Playwright, hermetic, routes
> `api.github.com`). Gate each phase on `npm test` (lint + typecheck + unit +
> build + e2e) green. No `@live` GitHub in CI.

### Phase 0 — Decisions & preconditions (no code)
- Confirm **D1**. Everything else is locked by the spikes + decisions above.
- **Done when:** D1 chosen; this plan's Decisions reflect it.

### Phase 1 — ICS core (pure) — `src/recipes/ics.ts`
Tests first (`tests/unit/recipes/ics.spec.ts`):
- **`planEvents(plan)`** → `{ uid, date, summary, recipeUri? }[]`: iterate
  `expandCalendar(plan.weeks)` with a **cumulative row index**; for each filled
  slot emit `date = dateForSlot(startDate, rowIndex, dayIndex)`,
  `summary = slot.recipe.name`. Assert the date math matches `buildCalendarRows`
  (repeated weeks lay out consecutively; month/year rollovers). Empty/undated →
  `[]`.
- **`buildMealPlanIcs(plans, { dtstamp, calName? })`** → string:
  - VCALENDAR wrapper: `VERSION:2.0`, `PRODID:-//arecipe//meal-plan//EN`,
    `CALSCALE:GREGORIAN`, `METHOD:PUBLISH`, `X-WR-CALNAME`.
  - One `VEVENT` per event: `UID` (D3), `DTSTAMP` (injected), all-day
    `DTSTART`/`DTEND` (D2), escaped `SUMMARY`, optional `DESCRIPTION` with the
    `recipe.html?u=…` link.
  - **CRLF** line endings; **75-octet line folding** (CRLF + space); **text
    escaping** (`\ ; , \n`); DATE values unescaped.
  - **Deterministic order** (by date, then planId) → stable diffs.
  - **Aggregate** multiple plans; **empty set → valid empty VCALENDAR** (so a
    republish after deleting the last plan clears the calendar and still parses).
  - **Unicode** recipe names survive (drives the UTF-8 base64 in P2).
- No DOM, no network, **no clock** (`dtstamp` is a parameter).
- **Done when:** ics.spec green; folding/escaping/date/UID/empty/unicode covered.

### Phase 1b — Start-date default = next Monday
Tests first:
- **Pure helper** `nextMonday(todayIso)` in `src/recipes/meal-plan-dates.ts`
  (`tests/unit/recipes/meal-plan-dates.spec.ts` additions): Monday→same day,
  Tuesday→+6, Sunday→+1, across month/year boundaries; invalid `today`→null.
  Clock-free (caller passes `today`).
- **Planner default** (`tests/e2e/meals.spec.ts` additions): a fresh plan with no
  `startDate` shows the date input pre-filled with the next Monday **and**
  `plan.startDate` is persisted to it (reload keeps it; the calendar shows real
  dates immediately). Setting a different date overrides; clearing the input
  returns to abstract "Week N" and clears `plan.startDate`. An existing plan with
  a saved `startDate` is untouched.
- Wire `today` from a single call site (e.g. `new Date().toISOString().slice(0,10)`)
  passed into the helper — the only clock read, at the UI edge.
- **Done when:** `nextMonday` unit tests green; the planner defaults to next
  Monday without clobbering user choices; e2e green.

### Phase 2 — GitHub Contents client — `src/publish/github-contents.ts`
Tests first (`tests/unit/publish/github-contents.spec.ts`), **injected `fetch`**:
- `putFile({ repo, path, branch?, contentUtf8, message, authorization, fetchFn })`:
  - GET `contents/<path>` → **404 ⇒ create** (PUT, no `sha`); **200 ⇒ update**
    (PUT with `sha`).
  - Body `content` is **base64 of UTF-8 bytes** (TextEncoder → base64) — assert a
    non-ASCII payload round-trips (guards btoa/latin1 bug).
  - **409 (stale sha) ⇒ re-GET sha, retry once**; second 409 ⇒ typed error.
  - `401/403` ⇒ typed `AuthError` (message steers UI to "check/replace token");
    other non-2xx ⇒ typed error with status.
  - `Authorization` header set from the passed value; assert it is **never
    logged** (a spy on the logger asserts no token substring).
  - Returns `{ commitSha, contentSha }`.
- **Done when:** create/update/409-retry/error-mapping/base64-unicode/no-log-leak
  green.

### Phase 3 — Config store + token provider (seams)
Tests first:
- `github-publish-config.ts` (`tests/unit/publish/github-publish-config.spec.ts`),
  mirrors `reach.ts`: `createGithubPublishConfig({ storage })` with
  `enabled`, `repo`, `path` (default `meals.ics`), `branch?`; defensive read
  (corrupt → defaults, off); `enabled=false` is the zero-storage default.
  **Config holds no secret.**
- `github-token.ts` — `TokenProvider` interface
  `{ hasToken(): Promise<boolean>; set(t): Promise<void>; clear(): Promise<void>;
  authorizationFor(req): … }` per **D1**. Contract test: **`get`-style readback
  of the raw token is not part of the interface** (the UI can never render it);
  `set` then `hasToken()===true`; `clear()` then `false`. For D1=(B): a
  message-channel fake stands in for the SW in unit tests; the real SW wiring is
  exercised in P5/P6 e2e.
- **Done when:** config + provider specs green; "token not re-exposable" contract
  encoded as a test.

### Phase 4 — Publish orchestrator — `src/publish/calendar-publish.ts`
Tests first (`tests/unit/publish/calendar-publish.spec.ts`), all deps faked:
- `republishCalendar({ config, listPlans, putFile, token, dtstamp })`:
  - `enabled=false` ⇒ **no-op**, no `putFile` call, returns `{ status: 'skipped' }`.
  - enabled + token ⇒ `listPlans()` → `buildMealPlanIcs` → `putFile(path)`;
    returns `{ status: 'published', commitSha }`.
  - enabled + **no token** ⇒ `{ status: 'needs-token' }`, no PUT.
  - **delete case:** given a plan set that shrank, the built ICS omits the
    removed plan's events (regenerate-from-set) — assert the payload passed to
    `putFile` no longer contains those UIDs.
  - `putFile` throws ⇒ `{ status: 'error', error }` (never throws to caller — the
    caller must not let a calendar failure break the PDS op).
- **Done when:** skipped/published/needs-token/delete/error paths green.

### Phase 5 — Account UI (advanced, collapsed) — `src/pages/account.ts`
Tests first (`tests/e2e/account.spec.ts` additions; hermetic, route
`api.github.com`):
- A collapsed `<details data-testid="calendar-publish">` "Publish a subscribable
  calendar (advanced)", with a one-line tradeoff note and an **Enable** checkbox
  (persists via config). Renders for signed-in users.
- When enabled, reveal: **repo** input, **path** input, a **token** field that is
  **write-only** — a password input that on save calls `token.set`, then shows
  "token set ✓" with **Replace** / **Clear**; the stored token is **never**
  rendered back (assert the input is empty on reload even when a token exists).
  A **"Publish now"** button runs `republishCalendar` and shows status; a
  **Revoke on GitHub** link (deep link to token settings) and a **Setup guide**
  link (to `calendar-setup.html`) appear only when enabled.
- e2e: enable → fill repo/path → set token → "Publish now" → assert a PUT hit the
  routed `contents/<path>` with an `Authorization` header and a base64 body that
  decodes to a `BEGIN:VCALENDAR`; assert a 401 route surfaces the auth error.
- **Done when:** the section is collapsed/off by default, config persists, token
  is write-only, publish-now works against the routed API, CSP fires zero
  violations (csp.spec).

### Phase 6 — meals.ts hooks (publish + delete) — `src/pages/meals.ts`
Tests first (`tests/e2e/meals.spec.ts` additions; hermetic, route both PDS and
`api.github.com`):
- **Publish hook:** after `syncPlanToPds` resolves, if `config.enabled`, call
  `republishCalendar`; surface a small status in `shareSlot` ("calendar
  updated" / "calendar update failed: …"). A calendar failure **must not** fail
  the publish (PDS write already succeeded) — assert publish still shows its
  share link when the GitHub route 500s.
- **Delete hook:** after `removePlanFromPds` resolves in the published-plans
  subpage, if enabled, call `republishCalendar`; assert the PUT body no longer
  contains the deleted plan's events. Delete UI still completes if the calendar
  PUT fails.
- Disabled ⇒ neither hook calls GitHub (assert no request to the routed API).
- **Done when:** both hooks fire only when enabled, regenerate correctly, and
  never block the underlying PDS op; e2e green.

### Phase 7 — Setup guide page — `calendar-setup.html`
- Static page (no JS bundle) copied + CSP-injected in `scripts/build.mjs` exactly
  like `friends.html` (outside the HTML-map loop, `injectCsp(...)`); add to the
  SW precache list. Linked from the account section (Phase 5) when enabled.
- Content: (1) create an **isolated repo**, enable **GitHub Pages**, **disable
  Actions**; (2) create a **fine-grained PAT** — that one repo, **Contents:write
  + Metadata:read**, **short expiry**; (3) paste token + `owner/repo` + path;
  (4) subscribe in Google Calendar via the Pages URL, with the **expectation that
  Google polls slowly (hours), not instantly**; (5) **revoke** (deep link) and
  what to do if the token leaks.
- Tests: add the page to `tests/e2e/csp.spec.ts`'s document list (or confirm it's
  globbed) and assert zero `securitypolicyviolation`; a nav/render smoke test.
- **Done when:** page builds with CSP, loads clean, links resolve, precached.

### Phase 8 — Security doc + polish
- `docs/SECURITY.md`: add a **"Calendar publish (opt-in)"** subsection — the
  D3-memo carve-out: this feature relaxes "exfiltrated credential is inert" for
  a browser-held PAT, blast radius bounded to the isolated Actions-disabled repo,
  compensating controls (scope, expiry, D1 posture, revoke). Cross-link the three
  probe docs.
- Flip **`docs/D3-BROWSER-PAT-SECURITY.md`** status → "implemented as the opt-in
  hardened flow (this plan)."
- Offline/precache sanity (account section + guide degrade gracefully offline);
  error states (bad repo, 404 repo, expired token) have clear messages.
- **Done when:** SECURITY.md carve-out merged, D3 memo updated, error/offline
  states verified.

## Risks & mitigations

- **PAT XSS exposure.** The core tension. Mitigated by D1=(B) (no exfiltration),
  scope/expiry, isolated Actions-disabled repo, revoke link, and the SECURITY.md
  carve-out. Off by default.
- **PDS read-after-write timing** — `listPdsPlans` right after `putRecord` should
  reflect the new plan; if a PDS lags, the next republish self-heals. Acceptable;
  note in code.
- **Google Calendar poll latency** — updates are eventually-consistent (hours,
  Google-controlled, not our `max-age=600`). Set expectations in the guide; this
  is inherent, not a bug.
- **RFC 5545 conformance** — folding/escaping/all-day-DTEND are the classic
  breakages; each is a Phase 1 unit test. Validate one real file against Google
  Calendar during Phase 6 `@live` (manual, owner's repo).
- **`btoa` unicode bug** — non-ASCII recipe names must base64 via UTF-8 bytes;
  explicit Phase 2 test.
- **New page + CSP** — `calendar-setup.html` must be in the CSP-injection path and
  the csp.spec doc list, or it ships policy-less / breaks the zero-violation gate.
- **Can't enforce token scope** — a user can over-scope the PAT. The guide steers
  hard to minimal scope + isolated repo; we cannot verify it. Documented.

## Open questions (non-blocking; defaults chosen)

- **OQ1 — Include a recipe link in `DESCRIPTION`?** Default **yes**
  (`recipe.html?u=…`) — useful in a calendar entry. Cheap to drop.
- **OQ2 — Custom-domain vs `github.io` URL guidance.** Guide covers both; the
  file/path logic is domain-agnostic.
- **OQ3 — Surface published-URL in the account section** once known (repo + path
  → guessable Pages URL), with a "copy" affordance. Nice-to-have; Phase 5 stretch.

## Test inventory (new)

- `tests/unit/recipes/ics.spec.ts` — serialize/fold/escape/date/UID/empty/unicode/aggregate.
- `tests/unit/recipes/meal-plan-dates.spec.ts` (+) — `nextMonday` per-weekday + boundaries.
- `tests/unit/publish/github-contents.spec.ts` — create/update/409/errors/base64/no-leak.
- `tests/unit/publish/github-publish-config.spec.ts` — defaults/persist/corrupt.
- `tests/unit/publish/github-token.spec.ts` — provider contract (no readback).
- `tests/unit/publish/calendar-publish.spec.ts` — orchestrator paths.
- `tests/e2e/account.spec.ts` (+) — advanced section, write-only token, publish-now (routed).
- `tests/e2e/meals.spec.ts` (+) — publish/delete hooks regenerate + never block PDS.
- `tests/e2e/csp.spec.ts` (+) — `calendar-setup.html` zero violations.
- (Manual `@live`, owner's repo) — one real subscribe in Google Calendar.
