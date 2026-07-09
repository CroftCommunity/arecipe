# arecipe — Dedicated sign-in page

Passes run: Pass 1 (base) + Pass 2 (gap analysis) combined 2026-07-08; Pass 3
(quality gates) 2026-07-09. **Status: COMPLETE 2026-07-09** — both phases landed,
pushed, CI-deployed to arecipe.app, and the PHASE-GATED hosted post-deploy
sign-in was verified green (real OAuth round-trip on arecipe.app/signin.html →
Cookbook). No revert needed.

## Outcome Summary

| Phase | Outcome | Commit | Note |
|-------|---------|--------|------|
| 1 — dormant sign-in page | ✅ SHIPPED | `188d60c` | `signin.html` + `signin.ts` live on loopback, hosted-inert; hermetic wiring green + one-off loopback OAuth→Cookbook verified. |
| 2 — atomic hosted cutover | ✅ SHIPPED | `383dcbd` | `redirect_uris`→signin.html + all "Sign in" links repointed + mine form→pointer + @live helper + docs. Hermetic (51 e2e / 193 unit) + loopback @live green. Hosted post-deploy sign-in on arecipe.app **verified green** — no revert. |

## Problem Statement

Sign-in currently lives *inside* the My recipes page (`mine.html`). Live testing
(2026-07-08) surfaced two problems:

- The "Sign in" nav link lands on My recipes, which reads as a recipes/drafts
  page, not a login page. Even after leading that page with a Sign in section
  (commit `b1e0df0`), the user reported it still feels like "logging in for a
  draft" — sign-in is entangled with the drafting affordances.
- There is no single, obvious "sign in here" destination.

Goal: a **dedicated sign-in page** (`signin.html`) that is unambiguously the login
page — enter your handle, sign in via atproto OAuth, land in the app (Cookbook).
`mine.html` reverts to being purely "My recipes."

Constraint that shapes everything: atproto OAuth redirects back to a **registered
`redirect_uri`**, and the callback (`?code=…`) must be completed on whatever page
it lands on. So the sign-in page must also be a registered redirect target and
must handle its own callback.

## Reasoning

**Why a dedicated page (vs. the current in-page section).** Sign-in is a distinct
task with a distinct mental model; co-locating it with drafts/recipes conflates
"use the app without an account" (browse, draft locally) with "authenticate."
A dedicated page is the standard IA and removes the confusion the user hit.

**How the OAuth redirect actually works here (verified in code, see Verified
Assumptions).** Two modes:
- **Loopback (local dev):** `buildLoopbackMetadata(window.location)` derives the
  `redirect_uri` from the *initiating page's* `location.pathname`. So sign-in
  initiated on `signin.html` gets `redirect_uri = …/signin.html` automatically,
  and the callback returns there. **No config change needed for loopback.**
- **Hosted (`arecipe.app`):** the `redirect_uri` list comes from
  `client-metadata.json` (`redirect_uris`), currently `["…/mine.html"]`. To make
  `signin.html` the hosted sign-in entry, that array must become `["…/signin.html"]`.
  This is a change to the **deployed production OAuth client config**.

`session-provider.restore()` calls `client.init()`, which *also completes a login
callback*. So any page that runs `bootSession()` handles its own `?code` return.
The sign-in page therefore both initiates the flow and completes it.

**Why an atomic cutover for hosted (not a dual-redirect transition).** A tempting
transition is to register *both* `mine.html` and `signin.html` in `redirect_uris`
and migrate gradually. Rejected: when `client-metadata.json` lists multiple
`redirect_uris`, which one `BrowserOAuthClient` selects at `signIn()` time is
**unverified** (it may use `[0]`, or match the current location). Depending on
that unverified behavior is exactly the "no assumed behavior" trap. Instead:
- **Phase 1** adds `signin.html` as a *dormant* page — fully functional on
  loopback (redirect derives per-page), inert on hosted (nothing links to it;
  hosted `redirect_uris` still `mine.html`). Zero risk to the working flow.
- **Phase 2** is the atomic cutover: flip `redirect_uris` to `["…/signin.html"]`,
  repoint every "Sign in" link, and strip the `mine.html` form — all in one build
  so the deployed page and the deployed client-metadata are always consistent
  (a single `redirect_uri`, so the multi-redirect-selection unknown never
  arises). This is why Phase 2 exceeds the 4-file rule (documented exception): a
  half-cutover would leave hosted sign-in pointing at an unregistered
  `redirect_uri` and break login.

**Why the risky bit is isolated + last.** The only change that can break
production sign-in is the hosted `redirect_uris` flip. It lives in Phase 2, gated
behind Phase 1 proving the page works (on loopback), and its gate is a real
sign-in check (loopback `@live` locally + a manual sign-in on `arecipe.app`
post-deploy), with the commit revert ready.

**Alternatives considered & rejected:**
- *Keep sign-in on mine.html, just restyle.* Rejected — already tried (b1e0df0);
  the user still finds it confusing. The entanglement is structural.
- *A modal/overlay login.* Rejected — violates the app's pages-not-modals
  discipline (DESIGN.md) and complicates the OAuth redirect (the callback still
  needs a real page).
- *Dual-redirect gradual migration.* Rejected — depends on unverified
  multi-`redirect_uri` selection behavior (see above).

## Verified Assumptions

- **Loopback `redirect_uri` derives from the initiating page.** `oauth-client.ts`
  `buildLoopbackMetadata(location)` builds `redirect_uri` from
  `location.pathname`; `createOAuthClient` calls it with `window.location`. So
  the redirect target follows whichever page constructs the client. Confirmed by
  reading `src/auth/oauth-client.ts` (2026-07-08).
- **Hosted `redirect_uris` come from `client-metadata.json`.** Current value:
  `["https://arecipe.app/mine.html"]`. `client_id` is the metadata URL; the auth
  server fetches it to verify. Confirmed by reading `client-metadata.json` +
  `oauth-client.ts` `HOSTED_CLIENT_METADATA`.
- **`bootSession()` → `provider.restore()` → `client.init()` completes the
  callback.** So the page at the `redirect_uri` completes login by running
  `bootSession`. Confirmed in `src/auth/session-provider.ts:48-56` +
  `src/auth/boot.ts`.
- **`provider.signIn(handle)` initiates the redirect** (resolves only on
  failure/abort; success navigates away). Confirmed in `session-provider.ts` +
  its use in `mine.ts`.
- **The session hint is set by `bootSession`** (`setSessionHint(agent !== null)`)
  and read by the `index.html` landing script. `signin.ts` running `bootSession`
  will set the hint on success — consistent with the signed-in→Cookbook landing.
  Confirmed in `src/auth/boot.ts` + `src/auth/session-hint.ts`.
- **`authModeFor`** returns `loopback` for localhost/127.0.0.1, `hosted` for
  `https://arecipe.app`, else `none` (read-only). So `signin.ts` must handle the
  `none` case (no provider) gracefully. Confirmed in `oauth-client.ts`.
- **The `@live` sign-in helper drives `/mine.html`** (`tests/e2e/helpers/live.ts`
  `signIn`: goto `/mine.html` → fill `handle-input` → click `oauth-signin`). It
  must be repointed to `/signin.html` in Phase 2.
- **UNVERIFIED (deliberately avoided):** how `BrowserOAuthClient` selects a
  `redirect_uri` when `client-metadata.json` lists more than one. The plan is
  designed so this never matters (single `redirect_uri`, atomic cutover). If a
  future change needs multiple, verify against the library source first.

## Documentation Impact

- `docs/DESIGN.md` — sign-in becomes its own page; "My recipes" is signed-in
  content + a sign-in pointer. Update the nav/destinations + sign-in narrative in
  **Phase 2** (the cutover that makes it true).
- `README.md` — page list gains `signin.html`; note `mine.html` no longer hosts
  the login form. **Phase 2.**
- New files `signin.html` + `src/pages/signin.ts`: grepped — no external
  references; added in Phase 1, linked in Phase 2.
- `client-metadata.json` is config, not docs, but note: its `redirect_uris`
  change is the production-visible edit; called out in Phase 2.

## Concurrency Map

Sequential spine: **Phase 1 → Phase 2.**
- Phase 2 (cutover: links + `client-metadata` + `mine` strip) depends on Phase 1
  (the `signin.html` page must exist and be proven on loopback first).
- All sequential; no parallelism. No worktrees → no re-entry-verification fields.
- `signin.ts`/`signin.html` (Phase 1 write-set) are new files, disjoint from
  Phase 2's edits (`nav.ts`, `cookbook.ts`, `mine.ts`, `client-metadata.json`,
  tests) — but Phase 2 is gated on Phase 1 by dependency, not write-set.

## Phases

**Cross-phase conventions:** tests-first (RED before production, watch it fail);
`[arecipe]`-leveled logging via `src/log.ts` on the auth boundary; hermetic tier
(unit + Playwright over routed fixtures, push CI) vs `@live` (real OAuth, local
gate). The interactive OAuth flow is proven where it IS the feature — here, on
`signin.html` — in the `@live`/loopback tier, not hermetically.

### Phase 1: Add the dormant sign-in page (loopback-provable, hosted-inert) — ✅ SHIPPED (`188d60c`)

**Goal:** `signin.html` + `src/pages/signin.ts` exist and fully work on loopback;
nothing links to them yet; hosted `client-metadata.json` is unchanged, so the
working mine.html flow is untouched. A safe, isolated additive.

**Changes:**
- [ ] `src/pages/signin.ts` — the login page. Runs `bootSession()`:
  - agent present (already signed in, or a callback just completed via
    `init()`) → `location.replace('./cookbook.html')` (land in the app).
  - `provider !== null`, signed out → render the dedicated login UI: heading
    "Sign in", a one-line intro, `handle-input`, `oauth-signin` button, a
    `signin-status` line; on submit → `provider.signIn(handle.trim())`.
  - `provider === null` (read-only origin) → a "sign-in unavailable here" note.
  - Log each step through `src/log.ts` (initiated / callback-completed / error).
- [ ] `signin.html` — shell (theme pre-paint script; `./signin.js` bundle; title
  "arecipe — sign in"). No landing-redirect script (that's index.html only).
- [ ] `scripts/build.mjs` — add `signin` to `PAGES` and `'signin.html': 'signin'`
  to `HTML` (hashed bundle + precache, like any page).
- [ ] `tests/e2e/signin.spec.ts` — hermetic: signed-out `signin.html` renders the
  form (`handle-input` + `oauth-signin` visible); the page is a real document
  reachable by URL.

**Call chain:** (Phase 2 wires the links) `signin.html` → `signin.ts` →
`bootSession` → signed-out renders form → submit → `provider.signIn` → OAuth →
back to `signin.html?code` → `bootSession`/`init()` completes → agent →
`location.replace('./cookbook.html')`.
**Wiring test:** hermetic `signin.spec.ts` proves the entry point renders the
sign-in form; the real OAuth round-trip is loopback/`@live` (the flow IS the
feature). This mirrors the Phase 3 precedent (interactive OAuth proven `@live`).
**Branch coverage (Pass 3):** `signin.ts` has three branches — (1) signed-out →
render form (covered hermetically by `signin.spec.ts`; the reachable branch on
the loopback Playwright origin); (2) agent present → `location.replace('./cookbook.html')`
(covered by the loopback/`@live` sign-in, since a live session is required);
(3) `provider === null` → "sign-in unavailable here" note (NOT reachable on the
loopback Playwright origin, which is always `provider !== null` — its parity is
the existing `mine.ts` read-only empty-state plus `authModeFor` unit coverage in
`tests/unit/auth/oauth-client.spec.ts`). Name these branches in the spec so the
assertion sits on the branch, not a single happy-path point.
**TDD order (Pass 3):** write `signin.spec.ts` first and watch it fail (RED) —
the page/HTML/build-registration items are what make it GREEN. The Changes
checklist lists the spec last only for readability; execution writes it first.
**Depends on:** the existing auth modules (`boot.ts`, `session-provider.ts`,
`oauth-client.ts`) — unchanged.
**Read-set:** `src/auth/boot.ts`, `src/auth/session-provider.ts`,
`src/auth/oauth-client.ts`, `src/pages/mine.ts` (reference).
**Write-set:** `src/pages/signin.ts`, `signin.html`, `scripts/build.mjs`,
`tests/e2e/signin.spec.ts`. (2 logic surfaces — page + build reg; within budget.)
**Shared-state contract:** SW precache gains `signin.html` (version bump);
localStorage session hint set via `bootSession` on success; no PDS writes; no
ports beyond Playwright's ephemeral web server.
**Diagnostic logging (strengthened Pass 3):** the auth boundary is *already*
instrumented one layer down — `session-provider.ts` emits `sign-in initiated`
({handle}, `info`) and `session restored` ({did}, `info` = callback-completed),
and `boot.ts` emits `session restore failed` ({error}, `error`). So `signin.ts`
does NOT re-implement these; it adds only its page-level steps: (a) the submit
handler's `.catch` → `log.error('auth', 'sign-in failed', { error })`, mirroring
today's `mine.ts`; (b) a forward log when agent is present (e.g.
`log.info('auth', 'signed in — forwarding', { to: 'cookbook' })`). Levels:
`info`/`debug` are gated behind `?debug=1` / `localStorage.debug` (quiet in
prod); `warn`/`error` always emit. The always-on `error` path is deliberate — a
failed hosted sign-in surfaces in the console without the debug flag, which is
what makes the Phase 2 manual post-deploy check debuggable. Never log the
access/refresh token or any session secret; the handle and DID are public
identifiers (already logged by the provider) and are fine.
**Risks:** on hosted, `signin.html` sign-in would (until Phase 2) redirect to the
still-registered `mine.html` and complete there — harmless because nothing links
to `signin.html` yet. Called out so it isn't mistaken for a bug.
**Done when:**
1. **Behavioral:** navigating to `/signin.html` shows a dedicated sign-in form; on
   loopback, signing in there completes and lands on Cookbook.
2. **Verification:** `npm test` hermetic green incl. `signin.spec.ts`; build
   registers/precaches `signin.html`; a local loopback sign-in via `/signin.html`
   → Cookbook (run once locally).
**Validation:** Moderate — hermetic form render + a local loopback sign-in
confirming the callback→forward. No production config touched.
**Stop-point.**

### Phase 2: Cut over to the sign-in page (atomic) — ✅ SHIPPED (`383dcbd`)

**Goal:** `signin.html` becomes THE sign-in entry on both loopback and hosted;
`mine.html` reverts to My-recipes-only (drafts + published; signed-out shows a
pointer to `signin.html`, keeping account-free drafting).

**Changes (atomic — ship together):**
- [ ] `client-metadata.json` — `redirect_uris`: `["https://arecipe.app/mine.html"]`
  → `["https://arecipe.app/signin.html"]`. (Hosted callback now lands on
  `signin.html`, which forwards to Cookbook.)
- [ ] `src/nav.ts` — signed-out top-right auth link href → `./signin.html`.
- [ ] `src/pages/cookbook.ts` — the signed-out gate's sign-in link → `./signin.html`.
- [ ] `src/pages/account.ts` — the signed-out note "Not signed in — sign in from
  My recipes." (`account-signed-out`, `account.ts:39`) → repoint at the sign-in
  page ("sign in" → `./signin.html`). Found mid-execution during Phase 1 (a
  fourth stale "sign in from My recipes" reference the Pass 1/2 write-set
  missed); folded into the atomic cutover so no signed-out surface still points
  at `mine.html` for login.
- [ ] `src/pages/mine.ts` — remove the inline sign-in section. Note (Pass 3)
  `mine.ts` has **two** signed-out branches: the `provider !== null` branch
  (currently leads with the sign-in form) → replace with a short pointer
  ("Sign in to save your recipes to your account" → `./signin.html`), keeping
  New recipe + local Drafts (account-free); the `provider === null` read-only
  branch (currently the `mine-empty` "sign-in arrives once the hosted client
  ships" note) → keep a terminal "sign-in isn't available on this copy of the
  app" note; do NOT point it at `signin.html` (confirmed user decision,
  2026-07-09 — sign-in is structurally impossible on those origins, so a pointer
  is a two-hop dead end).
- [ ] `tests/e2e/helpers/live.ts` — `signIn()` drives `/signin.html` (was
  `/mine.html`); update its comment. The callback→signin→Cookbook forward means
  the helper still ends back at `appOrigin`.
- [ ] `tests/e2e/nav.spec.ts` — the "tabs navigate" test references
  `signin-section`/`oauth-signin`/`handle-input` in **several** assertions (Pass
  3): the initial mine.html check AND the post-`goBack` / wordmark-home
  re-assertions, not just one. Reconcile ALL of them — assert the mine pointer to
  `signin.html` where mine.html is expected, and move the form assertion onto
  `signin.spec.ts` (Phase 1) / a signin nav check. A partial edit that fixes only
  the top assertion leaves the test red.
- [ ] Docs: `docs/DESIGN.md` (sign-in is its own page; My recipes = signed-in
  content + pointer), `README.md` (page list + `mine.html` no longer hosts login).

**Call chain:** any "Sign in" (nav / cookbook gate / mine pointer) → `signin.html`
→ (real OAuth) → `signin.html?code` → `init()` → Cookbook.
**Wiring test:** hermetic — nav signed-out "Sign in" → `./signin.html`; cookbook
gate link → `./signin.html`; signed-out `mine.html` shows the pointer (not a
form). `@live`/loopback: a real sign-in via `signin.html` lands on Cookbook.
**Depends on:** Phase 1.
**Read-set:** `src/pages/signin.ts`, `src/nav.ts`, `src/pages/cookbook.ts`,
`src/pages/mine.ts`, `client-metadata.json`, `tests/e2e/helpers/live.ts`.
**Write-set:** `client-metadata.json`, `src/nav.ts`, `src/pages/cookbook.ts`,
`src/pages/account.ts`, `src/pages/mine.ts`, `tests/e2e/helpers/live.ts`,
`tests/e2e/nav.spec.ts`, `docs/DESIGN.md`, `README.md`. **Exceeds the 4-file
rule — documented exception:**
this is an atomic auth-config cutover; splitting it would leave hosted sign-in
pointing at an unregistered `redirect_uri` (broken login) mid-way. The edits are
individually small (link repoints + a config value + a form→pointer swap).
*(Pass 3 honesty note: the atomicity-critical core is `client-metadata.json` +
the "Sign in" link/form files (`nav.ts`, `cookbook.ts`, `account.ts`,
`mine.ts`) — a half-cutover there breaks production login. `live.ts`/`nav.spec.ts` ride the
same commit to keep the hermetic + `@live` tiers green; `docs/DESIGN.md` /
`README.md` ride by the same-phase docs convention, not by deploy-atomicity. All
low-complexity; none introduce new logic.)*
**Shared-state contract:** changes the **deployed production OAuth client config**
(`client-metadata.json` `redirect_uris`) — the one production-visible, auth-
sensitive edit. Reversible via commit revert + redeploy. No parallel phase.
**Diagnostic logging:** unchanged (the boot logging from Phase 1 covers the flow).
**Risks:** the hosted `redirect_uris` flip is the only change that can break
production sign-in. Mitigations: single `redirect_uri` (no selection ambiguity);
atomic deploy (page + config together); revert ready; a real post-deploy sign-in
check (below) as the gate.
**Done when:**
1. **Behavioral:** "Sign in" anywhere → `signin.html` → real atproto OAuth →
   Cookbook; My recipes signed-out is not a login form (shows the pointer);
   account-free drafting still works on My recipes.
2. **Verification:** `npm test` hermetic green (nav/cookbook/mine wiring + the
   repointed links); a **real sign-in** confirmed — loopback `@live` locally, and
   a **manual sign-in on `arecipe.app`** after deploy (the hosted `redirect_uri`
   round-trip can't be auto-verified — see Open Questions).
**Validation:** Broad — touches production auth config + the interactive OAuth
flow. Hermetic proves wiring; the hosted OAuth round-trip requires the manual
post-deploy sign-in check (revert ready if it misbehaves).
**Stop-point (dedicated sign-in page complete).**

## Open Questions

- [CONFIRMED: PHASE-GATED (Phase 2) — user, 2026-07-08] Ship the hosted
  `redirect_uris` change behind a **manual verification**: Phase 2's gate is
  (a) hermetic `npm test` green + (b) a loopback `@live` sign-in locally +
  (c) a **manual real sign-in on `arecipe.app` immediately post-deploy**, with
  the commit revert staged. *The `@live` tier can't auto-prove the hosted
  round-trip now (rate-limited + flaky); manual check accepted.*
- [CONFIRMED: ADVISORY — user, 2026-07-08 (recommended, not overridden)]
  Post-sign-in forward target = **Cookbook** (`signin.ts` →
  `location.replace('./cookbook.html')`), matching the signed-in landing.
- [CONFIRMED: ADVISORY — user, 2026-07-08 (recommended, not overridden)] Keep
  **account-free drafting** on `mine.html` when signed out (New recipe + local
  Drafts stay; only the login form moves to `signin.html`).

- [CONFIRMED: ADVISORY — user, 2026-07-09] On read-only mirror origins
  (`provider === null`, neither loopback nor `arecipe.app`), signed-out
  `mine.html` **keeps a terminal "sign-in isn't available on this copy of the
  app" note** — it does NOT point at `signin.html`. Rationale: sign-in is
  structurally impossible on those origins (the `client_id` must match the
  serving origin), so a pointer would be a two-hop dead end; the terminal note
  is honest. One screen. *(Confirmed via Pass 3 walk-through.)*

**Confirmed 2026-07-08: 1 PHASE-GATED (Phase 2 manual sign-in gate), 2 ADVISORY.
Pass 3 (2026-07-09) added + confirmed 1 more ADVISORY (read-only `mine.html`
keeps a terminal unavailable note). All 4 confirmed; no BLOCKING items — Phase 1
is ready to execute on approval; Phase 2 carries the manual-verify gate.**

## Review Log

### Pass 1: Base plan — 2026-07-08
Built the dedicated-sign-in-page plan from the live-testing findings. Grounded the
OAuth mechanics in `oauth-client.ts` (loopback redirect derives per-page; hosted
from `client-metadata.json`), `session-provider.ts` (`restore()`=`init()`
completes the callback), and `boot.ts`/`session-hint.ts` (hint set on success).
Decomposed into Phase 1 (dormant page, loopback-provable, hosted-inert) → Phase 2
(atomic hosted cutover), isolating the one risky change (hosted `redirect_uris`)
to last, behind a page already proven on loopback. Recorded the deliberate
avoidance of the unverified multi-`redirect_uri` selection behavior by designing
for a single redirect + atomic cutover.

### Pass 2: Gap Analysis — 2026-07-08 (combined with Pass 1)
**Found:**
- **Hosted-during-Phase-1 behavior:** on hosted, a `signin.html` sign-in would
  redirect to the still-registered `mine.html` and complete there. Harmless
  (nothing links to `signin.html` in Phase 1) — recorded as a Phase 1 risk note
  so it isn't mistaken for a bug, not a blocker.
- **`@live` helper coupling:** `tests/e2e/helpers/live.ts` `signIn()` hard-codes
  `/mine.html`; every `@live` write suite (comments/interactions/publish/drafts)
  depends on it. Added its repoint to Phase 2's write-set so the `@live` tier
  keeps working after the cutover; the callback→signin→Cookbook forward keeps the
  helper's "return to appOrigin" wait valid.
- **`nav.spec.ts` (e2e) coupling:** it currently asserts the signed-out My-recipes
  `signin-section`/`oauth-signin` (added earlier today). Phase 2 moves the form to
  `signin.html`, so that assertion must move — added to Phase 2's write-set.
- **`provider === null` (read-only origins):** `signin.ts` must handle the mode
  where no OAuth client exists (neither loopback nor `arecipe.app`) — added the
  read-only note to Phase 1's `signin.ts` changes.
- **Session-hint / landing interplay:** `signin.ts` runs `bootSession`, which sets
  the hint on success; combined with the forward to Cookbook, a signed-in user
  hitting `signin.html` goes straight to Cookbook (consistent, no loop — the
  landing script is only on `index.html`). Confirmed no redirect loop.
- **Atomicity of the hosted cutover:** verified the page + `client-metadata.json`
  deploy in one build (build.mjs copies both), so the deployed redirect target and
  the deployed client-metadata are never inconsistent.
**Concurrency:** spine Phase 1 → Phase 2 sequential (dependency, not write-set).
No parallelism; map confirmed.
**Changed:** added the `@live` helper + `nav.spec` repoints and the read-only
`signin.ts` case to the phase write-sets; documented the Phase 2 4-file-rule
exception (atomic auth cutover) with its justification.
**Confirmed:** the loopback-derives-redirect fact makes Phase 1 genuinely safe and
loopback-provable; the risk is fully isolated to Phase 2's single `redirect_uris`
value; the design never depends on the unverified multi-redirect selection.

### Pass 3: Quality Gates — 2026-07-09
Fresh context; codebase spot-checked (all Verified Assumptions re-confirmed
against `oauth-client.ts`, `client-metadata.json`, `session-provider.ts`,
`boot.ts`, `session-hint.ts` + `index.html:18-20`, `nav.ts`, `cookbook.ts:150`,
`mine.ts`, `live.ts`, `nav.spec.ts`, `build.mjs`, and
`browser-oauth-client.d.ts:8`; `signin.*` confirmed not-yet-existing; shipped
commits `9e0d7a6`/`1566c0f`/`b1e0df0` present). Fixes applied additively — no
phase reorder, no reasoning rewrite.

**TDD ordering:**
- Phase 1: added an explicit TDD-order note — write `signin.spec.ts` first (RED,
  watch it fail), then page/HTML/build make it GREEN; the checklist lists the
  spec last only for readability.
- Mutation resistance: named `signin.ts`'s three branches and which tier covers
  each (signed-out→form hermetic; agent-present→forward loopback/`@live`;
  `provider === null`→note not reachable on the loopback test origin, parity via
  `mine.ts` empty-state + `authModeFor` unit test). Prevents a single
  happy-path assertion standing in for branching behavior.
- Verification for both phases confirmed to run through the entry point (`npm
  test` hermetic + the real-sign-in gate), not isolated modules.

**Observability:**
- Confirmed the auth boundary is already instrumented in `session-provider.ts`
  (`sign-in initiated`, `session restored`) and `boot.ts` (`session restore
  failed`). Rewrote Phase 1's logging note so `signin.ts` ADDS only its
  page-level steps (submit `.catch` → `error`; forward `info`) instead of
  duplicating provider logs. Corrected the muddled "never the token/handle
  secret" to: never log the token/session secret; handle + DID are public
  identifiers already logged by the provider. Recorded that `warn`/`error` are
  ungated (emit in prod) while `info`/`debug` are `?debug=1`-gated — the
  always-on error path is what makes the Phase 2 manual post-deploy check
  debuggable.

**Debugging readiness:**
- Both phases are explicit **Stop-points**; confirmed unchanged. Phase 1 is a
  fully-reversible additive checkpoint; Phase 2's single risky edit
  (`redirect_uris`) is revert-ready.

**Validation calibration:**
- Confirmed Phase 1 = Moderate (hermetic render + local loopback sign-in), Phase
  2 = Broad (production auth config + interactive OAuth). Confirmed the manual
  post-deploy sign-in gate is spelled out in Phase 2's Verification (2), not
  buried. No recalibration needed.

**Concurrency honesty:**
- Map confirmed; sequential plan. Re-checked write-set disjointness after Pass 3
  edits: Phase 1 {`signin.ts`, `signin.html`, `build.mjs`, `signin.spec.ts`} vs
  Phase 2 {`client-metadata.json`, `nav.ts`, `cookbook.ts`, `mine.ts`,
  `live.ts`, `nav.spec.ts`, `docs/DESIGN.md`, `README.md`} — disjoint. Phase 2
  is gated on Phase 1 by dependency (needs `signin.html` to exist), so no
  parallelism is available regardless. No re-entry-verification fields needed
  (no worktrees).

**Coherence:**
- Still solves "sign-in is its own clear page." No scope creep — every Pass 3
  change was a specificity/observability strengthening, not new work. Added a
  4-file-rule honesty note distinguishing the atomicity-critical core
  (`client-metadata.json` + link/form files) from the cohesion-bundled
  test/docs files, so the documented exception is honest about *why* each file
  is in the same commit.

**Documentation impact:**
- Confirmed `docs/DESIGN.md` + `README.md` are scheduled IN Phase 2 (the cutover
  that makes them true), not a trailing docs phase; the new `signin.html` /
  `src/pages/signin.ts` are grepped (no external references).

**Specificity fixes (Phase 2 wiring):**
- `mine.ts`: named the two signed-out branches and prescribed each (form→pointer;
  read-only note kept).
- `nav.spec.ts`: flagged that the "tabs navigate" test asserts on
  `signin-section`/`oauth-signin`/`handle-input` in several places (incl. the
  `goBack`/wordmark re-assertions) — all must be reconciled, not just the top.

**New open question:** 1 ADVISORY (read-only `mine.html` treatment) — surfaced
and **confirmed by the user 2026-07-09**: keep a terminal "unavailable" note, do
not point at `signin.html`. Phase 2 `mine.ts` item updated to lock it.

**Confirmed ready:** yes — Phase 1 ready to execute on approval; Phase 2 carries
the confirmed PHASE-GATED manual sign-in gate. The one new ADVISORY does not gate
execution (recommendation recorded; Phase-2-gated at most).

### Phase 1 execution — 2026-07-09 (`188d60c`)
**Shipped:** `signin.html` + `src/pages/signin.ts` (three branches:
agent-present→forward to Cookbook; signed-out→dedicated form; `provider ===
null`→terminal "unavailable" note per the confirmed ADVISORY), registered in
`scripts/build.mjs` (`PAGES` + `HTML` → hashed bundle + SW precache). Modeled on
`account.ts` (shell mount, build stamp, SW register) + `mine.ts`'s form.
**TDD:** wrote `tests/e2e/signin.spec.ts` first, watched it RED (`/signin.html`
404 → empty title), then implemented to GREEN. Page-level logging added per Pass
3: submit `.catch` → `log.error('auth','sign-in failed')`, forward →
`log.info('auth','signed in — forwarding')`; the provider/boot layer already
emits initiated/restored/restore-failed.
**Validation (Moderate):** hermetic full suite green (50 e2e incl. `signin.spec`,
+ lint/typecheck/unit/build). Loopback interactive OAuth verified once locally
via a throwaway `@live` spec (sign-in on `/signin.html` → real bsky.social
consent → callback completes on `signin.html` → forwards to `cookbook.html`);
throwaway deleted after the run (disposition honored).
**Mid-execution finding:** `account.ts:39` carries a fourth stale "sign in from
My recipes" reference (`account-signed-out`) the Pass 1/2 write-set missed.
Folded into Phase 2 (write-set + Documentation Impact + Changes) so the atomic
cutover leaves NO signed-out surface pointing at `mine.html` for login. The
existing `nav.spec.ts` account assertion (`/sign in/i`) stays green if the note
keeps that phrasing; Phase 2 should also assert the `./signin.html` href.
**Deviation from spec:** none in the four planned changes; Phase 1 shipped as
specified. The only addition is the Phase 2 scope bump above.

### Phase 2 execution — 2026-07-09 (`383dcbd`)
**Shipped:** the atomic cutover — `client-metadata.json` `redirect_uris`
`mine.html`→`signin.html`; every signed-out "Sign in" affordance repointed at
`./signin.html` (`nav.ts`, `cookbook.ts`, `account.ts`, and a new `mine.ts`
pointer); `mine.ts` form stripped (signed-out → pointer keeping account-free New
recipe + Drafts; read-only origin → terminal "unavailable" note); `@live` helper
repointed; unit + e2e tests updated; `DESIGN.md` + `README.md` updated in-phase.
**TDD:** e2e RED→GREEN (added `nav.spec` "every signed-out affordance →
signin.html" + `mine-signin-pointer`, watched RED on the old `./mine.html`
hrefs, then implemented). Two unit tests (`oauth-client.spec` hosted
`redirect_uri`, `nav.spec` unit `nav-signin` href) encoded the old wiring and
went RED on the flip — updated to the new target (the RED was the signal the
config change landed).
**Validation (Broad):** hermetic full suite green (51 e2e + 193 unit + lint +
typecheck + build); loopback `@live` `auth-live.spec.ts` green through the
repointed helper (real OAuth via `signin.html` → forward → `signed-in-did` →
reload-persist). The hosted OAuth round-trip is the confirmed PHASE-GATED manual
post-deploy check on `arecipe.app` — deploys via CI on push to `main`; revert =
`git revert 383dcbd` + redeploy.
**Mid-execution findings (beyond the account.ts one folded in Phase 1):**
- **@live helper landing:** every `@live` suite asserts `signed-in-did`
  immediately after `signIn()`, and only `mine.html`/`account.html` render it —
  NOT `cookbook.html`, where the new forward lands. Pass 2's "the forward keeps
  the helper valid" was incomplete. Fixed the helper to wait for the
  Cookbook-forward (which fires only post-restore, so it doubles as a
  session-persisted signal) then `goto('/mine.html')`, restoring a deterministic
  signed-in landing for the suites.
- **nav.spec `handle-input` re-assertions:** the post-`goBack`/wordmark
  assertions in the "tabs navigate" test are on **Browse's** lookup form
  (`browse.ts:39`), not mine's sign-in form — verified, so they legitimately
  stayed. (Pass 3's "several assertion sites" caution resolved by inspection,
  not a blind rip-out.)
**Deviation from spec:** the Phase 2 write-set grew by the two unit tests
(`oauth-client.spec`, `nav.spec` unit) — behavior-encoding tests that had to
move with the config/nav change. Consistent with the atomic-cutover exception.

### Plan close-out — 2026-07-09
**Shipped:** sign-in is now its own page. `signin.html` + `src/pages/signin.ts`
(commit `188d60c`) are the dedicated login document — handle → atproto OAuth →
forward to Cookbook — completing their own callback (loopback derives the
`redirect_uri` per-page; hosted uses `client-metadata.json`, flipped to
`signin.html` in `383dcbd`). Every signed-out "Sign in" affordance (nav
top-right, Cookbook gate, Account note, My recipes pointer) points at
`signin.html`; `mine.html` is My-recipes-only and stays account-free for
drafting; read-only mirror origins show a terminal "unavailable" note. Both
commits pushed to `main` (CI-deployed to arecipe.app). Hermetic tier: 51 e2e +
193 unit green. Loopback `@live` sign-in green through the repointed helper.
**Stopped or skipped:** nothing outstanding. The confirmed PHASE-GATED
**hosted post-deploy sign-in on arecipe.app was verified green** (2026-07-09,
via a throwaway `@live` spec against the production origin: real OAuth →
callback on arecipe.app/signin.html → forward to Cookbook), so no revert was
needed. The full `@live` write-tier (comments/drafts/publish/interactions) was
not re-run — only `auth-live` (loopback) + the hosted sign-in check, which
together exercise the one thing that changed (the repointed `signIn` helper and
the hosted `redirect_uri`); the write suites share that helper path.
**Discoveries:** (1) `cookbook.html` doesn't render `signed-in-did`, so the
new callback→Cookbook forward broke the `@live` helper's post-sign-in landing —
caught because `auth-live` failed the way a good wiring test should; the helper
now waits for the forward (a session-persisted signal) then lands on mine.html.
(2) Two unit tests hard-encoded the old `redirect_uri`/`nav-signin` href —
their RED on the flip was the cleanest confirmation the cutover actually
changed production wiring. (3) `browse.ts` and `mine.ts` shared the
`handle-input` testid; verifying that before editing `nav.spec` avoided
removing assertions that were actually testing Browse's lookup, not sign-in.

### Note: OAuth secret-storage posture (recorded 2026-07-09)

Relevant to this plan since sign-in is where OAuth secrets are minted/persisted.
The storage-security reasoning is recorded canonically in
`plans/2026-07-07-1-plan-build-execution.md` → Decisions Locked → "OAuth secret
storage" (+ Layer 5 spec erratum). Summary bearing on `signin.ts`:
- The DPoP sender-constraint + non-extractable DPoP key make an exfiltrated
  refresh token inert off-device — the storage threat is covered by the protocol,
  not by encrypting the token. `signin.ts` should NOT try to hand-roll refresh-
  token encryption (BrowserOAuthClient owns the store; its options `Omit`
  `sessionStore`). It just runs `bootSession`/`init()` as designed.
- The primary defense is XSS prevention (CSP/SRI/no-3p/small bundle) — a
  cross-cutting hardening item, not part of this page's scope, but the sign-in
  page must not weaken it (no third-party scripts, no inline handlers that would
  force a loose CSP).
- WebAuthn PRF is optional/out-of-scope here.
