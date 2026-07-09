# arecipe — Dedicated sign-in page

Passes run: Pass 1 (base) + Pass 2 (gap analysis) combined in one context,
2026-07-08. Analysis only — no code. Pass 3 (quality gates) can follow in a fresh
context before execution.

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

### Phase 1: Add the dormant sign-in page (loopback-provable, hosted-inert)

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
**Depends on:** the existing auth modules (`boot.ts`, `session-provider.ts`,
`oauth-client.ts`) — unchanged.
**Read-set:** `src/auth/boot.ts`, `src/auth/session-provider.ts`,
`src/auth/oauth-client.ts`, `src/pages/mine.ts` (reference).
**Write-set:** `src/pages/signin.ts`, `signin.html`, `scripts/build.mjs`,
`tests/e2e/signin.spec.ts`. (2 logic surfaces — page + build reg; within budget.)
**Shared-state contract:** SW precache gains `signin.html` (version bump);
localStorage session hint set via `bootSession` on success; no PDS writes; no
ports beyond Playwright's ephemeral web server.
**Diagnostic logging:** auth steps at `info` (sign-in initiated w/ handle, callback
completed w/ DID, forward), `error` on sign-in failure (never the token/handle
secret). Reuse the boot logging.
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

### Phase 2: Cut over to the sign-in page (atomic)

**Goal:** `signin.html` becomes THE sign-in entry on both loopback and hosted;
`mine.html` reverts to My-recipes-only (drafts + published; signed-out shows a
pointer to `signin.html`, keeping account-free drafting).

**Changes (atomic — ship together):**
- [ ] `client-metadata.json` — `redirect_uris`: `["https://arecipe.app/mine.html"]`
  → `["https://arecipe.app/signin.html"]`. (Hosted callback now lands on
  `signin.html`, which forwards to Cookbook.)
- [ ] `src/nav.ts` — signed-out top-right auth link href → `./signin.html`.
- [ ] `src/pages/cookbook.ts` — the signed-out gate's sign-in link → `./signin.html`.
- [ ] `src/pages/mine.ts` — remove the inline sign-in section; signed-out
  `mine.html` shows a short pointer ("Sign in to save your recipes to your
  account" → `./signin.html`), keeping New recipe + local Drafts (account-free).
- [ ] `tests/e2e/helpers/live.ts` — `signIn()` drives `/signin.html` (was
  `/mine.html`); update its comment. The callback→signin→Cookbook forward means
  the helper still ends back at `appOrigin`.
- [ ] `tests/e2e/nav.spec.ts` — the signed-out My-recipes assertion (currently
  `signin-section`/`oauth-signin`) → assert the mine pointer to `signin.html`;
  move the form assertion onto `signin.spec.ts` (Phase 1) / a signin nav check.
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
`src/pages/mine.ts`, `tests/e2e/helpers/live.ts`, `tests/e2e/nav.spec.ts`,
`docs/DESIGN.md`, `README.md`. **Exceeds the 4-file rule — documented exception:**
this is an atomic auth-config cutover; splitting it would leave hosted sign-in
pointing at an unregistered `redirect_uri` (broken login) mid-way. The edits are
individually small (link repoints + a config value + a form→pointer swap).
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

**All 3 confirmed (2026-07-08): 1 PHASE-GATED (Phase 2 manual sign-in gate),
2 ADVISORY. No BLOCKING items — Phase 1 is ready to execute on approval; Phase 2
carries the manual-verify gate.**

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
