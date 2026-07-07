# arecipe — Executable Build Plan

Derived from `docs/BUILD-PLAN.md` (rough phasing) via the phase-plan skill.
This document is the executable version: TDD-first, wired-and-tested phases,
each leaving the system in a working state. The rough plan's coarse stages map
to fine phases here; `docs/sources/arecipe-spec.md` remains the technical source
of truth.

Passes run: Pass 1 (base) + Pass 2 (gap analysis) combined in one context on
2026-07-07; Pass 3 (quality gates) in a fresh context on 2026-07-07.

---

## Problem Statement

arecipe is a greenfield static SPA/PWA on the AT Protocol (no backend). The repo
currently holds only `README.md`, `LICENSE`, and `docs/`. We need an executable
build plan that:

- Follows TDD without exception (a failing test before production code).

- Respects the spec's dependency-ordered layers (Identity → Data → Delivery →
  Persistence → Auth → Data flow → Social → Immune → Trust → Discovery).

- Holds the load-bearing constraint: **no backend.** Any phase that seems to want
  a server is a signal to stop and re-derive, not to add one.

- Ships the signed-delivery machinery before any public launch, never after.

The near-term target is the spec's own stated first milestone (§17): a prototype
of read-only interop against real `exchange.recipe.*` records, tested across two
devices for the same user. The write path is the next coherent shippable unit.

## Reasoning

**Why executable detail is front-loaded, roadmap detail is not.** Phases 0–8
(discovery through the write path) are specified at single-context-window
granularity with wiring tests, because they are what we build first and their
shape is knowable now. Phases 9–12 (social/immune, delivery, launch) are kept at
milestone altitude deliberately: their file-level shape depends on decisions made
in the earlier phases (framework, module boundaries, record helpers), so planning
them in executable detail now would be inventing structure we cannot yet verify.
Each of Phases 9–12 gets its own phase-plan pass before it executes. This is
called out in every roadmap phase's Done-when. Planning-ahead-of-evidence is the
exact failure the skill's "no assumed behavior" rule guards against.

**Why Phase 0 (Discovery) exists.** This is a greenfield atproto app. Four things
are inferred rather than verified firsthand: (a) the OAuth browser client works
end-to-end (login + DPoP + refresh + resume) against a real PDS — the crashability
review flagged `@atproto/oauth-client-browser` maturity as OPEN; (b) the public
unauthenticated read path (getRecord/listRecords/sync) actually serves recipe
records; (c) the frontend/build/test toolchain that fits "small signed static
bundle, no SSR runtime, PWA + service worker + IndexedDB testable"; (d) the exact
`exchange.recipe.recipe` field-level schema before we render or write it. Building
eight phases on wrong answers to these is multiplicative rework. Phase 0 resolves
them with cheap probes.

**Why TypeScript.** The whole app runs in the browser and leans on WebCrypto,
WebAuthn, IndexedDB, service workers, and `@atproto/*` (TS-native). TS strict mode
per the coding guidance. Any offline/CLI tooling (signing helper, canary publisher)
would be Rust per house conventions, but that tooling is out of the shipped app and
out of this plan's near-term scope.

> Coherence note (Pass 3): "Decisions Locked" phrases TS as *optional* ("TS optional
> for type safety") while this section commits to it. Reconciled: **TS is the
> committed default for the app's `src/` logic** (strict mode, `@atproto/*` is
> TS-native, and the coding guidance requires strict typing); "optional" was meant
> only in the sense that vanilla JS is not forbidden for trivial glue. Plan phases
> use `.ts` throughout. Because the framework decision is *no framework*, there is
> **no JSX** — component files are `.ts` (Web Components / template rendering), never
> `.tsx`; the earlier `main.ts(x)` / `RecipeView.*` notation is normalized to `.ts`.

**Why the framework is an Open Question, not a pick.** The spec is
framework-agnostic and the choice has real consequences for bundle size (which is
itself a trust-surface concern — the whole signed bundle should be small and
auditable). Candidates: Svelte, SolidJS, Preact, or plain TS + Web Components.
This is a decision the maintainer should make, gated before the scaffold phase.

**Alternatives considered and rejected:**

- *A custom AppView (Rust or otherwise).* Rejected: contradicts the no-backend
  commitment. recipe.exchange is the public AppView; arecipe reuses it. Revisiting
  this is a philosophy-level change (see `PHILOSOPHY.md` §5 governance), not a stack
  choice.

- *Server-side rendering for all pages.* Rejected as a default: it reintroduces a
  runtime backend. Public recipe views that need Schema.org JSON-LD for crawlers
  (`OUTREACH.md` §2) will use build-time prerender or an edge function, decided
  when Phase 12 is planned, not now.

- *Deferring signed delivery until after launch.* Rejected: the three-authority
  model is a core claim. Phase 11 is a hard pre-launch gate.

## Decisions Locked (2026-07-07)

- **Frontend: vanilla HTML5 + CSS + JS** (TS optional for type safety), no framework.
  Small enough to be excellent without one; smallest, most auditable signed bundle.
  This narrows D3 (no framework bake-off needed — the D3 spike just confirms the
  vanilla + Vitest + Playwright harness and measures the baseline bundle).

- **OAuth: loopback client for TDD/local; hosted client-metadata is a separate
  milestone item.** Local iteration uses atproto's loopback exception; the real
  client document is planned for the milestone-testing milestone (M3), not now.

- **Delivery style: thin end-to-end vertical slices toward a Minimum Lovable Product.**
  Each milestone is a demoable slice that goes all the way through the stack (not a
  horizontal layer), so directionality is validated early and often. See the Milestones
  section.

## Reference to review at the UI/UX checkpoint (M1) — not now

- **`github.com/chasemp/mealplanner`** (source) and **`https://mealplanner.523.life/`**
  (live page) — the maintainer's prior project in a similar direction. Things he likes
  and things to improve exist there. **Deliberately not analyzed now.** Teed up as
  required reading at the M1 structure/UI/UX discussion so that conversation is
  grounded in a concrete prior artifact rather than abstract. Do not pull decisions
  from it before M1.

## Verified Assumptions

- **`@atproto/oauth-client-browser` is the official SPA OAuth client.** Exposes
  `BrowserOAuthClient` (configured with `handleResolver` + `clientId`), returns an
  `oauthSession` usable to instantiate an `Agent`; implements PKCE + DPoP for
  backendless SPAs. Confirmed via npm + ecosystem docs, 2026-07-07
  (npmjs.com/package/@atproto/oauth-client-browser,
  github.com/bluesky-social/atproto/blob/main/packages/api/OAUTH.md). End-to-end
  reliability (refresh, resume, PDS migration) still needs a firsthand probe → D1.

- **`exchange.recipe.*` NSIDs** (`recipe`, `collection`, `defs`, `profile`) are
  maintained by Josh Huckabee at `recipe.exchange/lexicons/`, corroborated in
  `docs/sources/` (novelty assessment + gradient). Field-level schema of
  `exchange.recipe.recipe` not yet confirmed firsthand → D4.

- **The repo is greenfield.** Only `README.md`, `LICENSE`, `docs/` present
  (confirmed 2026-07-07). No test infra, no build tooling yet — we choose it (D3).

- **Test account:** `@ngvalidation2112.bsky.social` (`did:plc:xyfhcaweaeyew3zrgk6jaln7`,
  repo PDS `stropharia.us-west.host.bsky.network`, entryway `bsky.social`, email
  `chase@owasp.org`). Reused from the prior appview-validation / public-roundtrip
  experiments. Credential is supplied **out-of-band** (session / gitignored `.env` at
  execution time) and is never stored in-repo. D1 should mint a scoped app-password
  from it for the automated probes rather than using the main password directly.

- **NOT yet verified (deferred to Phase 0, do not plan around as fact):** that
  `com.atproto.repo.getRecord`/`listRecords` and `com.atproto.sync.*` serve records
  unauthenticated (the XRPC spec explicitly says there is "not yet a consistent way
  to enumerate which endpoints do or do not" require auth) → D2.

## Documentation Impact

- `docs/BUILD-PLAN.md` — stays as the narrative rough plan; add a one-line pointer
  to this executable plan. Handled in Phase 1 (first commit that establishes the
  repo working tree).

- `README.md` — add a "Building / development" section once the scaffold and test
  command exist. Handled in Phase 1.

- `docs/STACK.md` §7 (open stack decisions) — the framework and OAuth decisions
  were **already recorded here during the Pass 2 addendum** (§7 lines 171/179, DECIDED
  2026-07-07); no further Phase 1 work on those. **Still stale:** §2 (line 58) reads
  "Frontend framework / build tooling: OPEN" and contradicts the §7 DECIDED entry —
  Phase 1 fixes that cross-reference. The prerender "OPEN" item stays open and is
  resolved when Phase 12 is planned.

- New: `plans/` directory (this file). No references elsewhere yet — grepped repo
  for "plans/" , none found outside this file.

- No `agents.md`/`CLAUDE.md` equivalents exist in this repo (those live in the
  coding-agents repo, not here). No cross-references to update there.

## Concurrency Map

Sequential spine (implementation):
Phase 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → [9, 10] → 11 → 12

- Each implementation phase reads or builds on what the prior phase wrote
  (scaffold → resolution → auth → read → two-device → write → blobs → drafts). The
  spine is inherently sequential; parallelism is not safe across it.

- **Phase 0 discovery tasks {D1, D2, D4} are independent probes** and may run
  concurrently (disjoint: D1 exercises OAuth, D2 exercises public reads, D4 fetches
  a record schema). D3 (toolchain decision) depends on nothing but should conclude
  before Phase 1.
  - **Shared-state contract (parallel probe set):** Each probe runs in its own
    sandbox directory with disjoint tmp paths; none binds a port. Two shared ambient
    surfaces exist and are handled explicitly: (1) **this plan doc** — the only place
    findings are written; serialize the plan-doc edits (one writer at a time). (2)
    **the test account** `@ngvalidation2112.bsky.social` — D1 *mutates* it by minting
    a scoped app-password and running a real login/refresh; D2 and D4 touch only
    *public, unauthenticated* reads and do not mutate the account. Because only D1
    writes account state and it writes its own dedicated app-password, the mutation is
    disjoint from D2/D4's reads — safe to parallelize. Do not run a second
    account-mutating probe concurrently with D1.
  - **Re-entry verification (after the probe set returns):** (a) each finding is
    recorded in Verified Assumptions with evidence; (b) no probe left a running
    process or dev server; (c) D1's minted app-password is recorded for later reuse
    or revoked — not left dangling; (d) D3's promoted scaffold is the only probe
    output kept as code (D1 throwaway archived, D2/D4 fixtures captured), matching
    each task's declared disposition.

- **Phases 9 and 10** (social graph, immune system) have plausibly disjoint
  write-sets and could parallelize, but both are roadmap-altitude and will be
  re-planned before execution; the parallel/sequential call is deferred to that
  re-plan. Marked `[9, 10]` as a candidate, not a commitment.

Hard rule honored: no two implementation phases in the sequential spine share a
write-set, because each builds forward on the prior.

## Milestones and Delivery Cadence

Phases are the unit of work; **milestones are the unit of demo, check-in, and
directional decision.** Each milestone is a thin end-to-end vertical slice — it goes
all the way through the stack (identity → data → render, then → write, etc.) rather
than completing a horizontal layer — so we validate direction with something runnable
at every checkpoint. Each milestone ends with: a demo, a green test gate, a check-in,
and an explicit go/adjust decision before the next milestone starts.

```
 M0  Discovery          Phase 0            → decisions locked, unknowns resolved
 M1  Walking skeleton   Phases 1–4         → sign in (loopback) + render ONE real
     (+ UI/UX checkpoint)                    recipe; DISCUSS structure/UI/UX here,
                                             grounded against mealplanner
 M2  Read MLP           Phase 5            → two-device same-user read (spec milestone)
 M3  Authoring MLP      Phases 6–8         → THE Minimum Lovable Product: a small
     (the MLP)                               group can author + share recipes that
                                             also appear on recipe.exchange; hosted
                                             OAuth client planned here for staging
 M4  Social layer       Phases 9–10        → friends, comments, client moderation
 M5  Trust + launch     Phases 11–12       → signed delivery (hard gate) + public
                                             launch + durability pledge
```

Notes:

- **M1 is the "core + basic setup to get on the same page" checkpoint.** The point of
  M1 is not feature-completeness; it is a runnable end-to-end slice thin enough to
  build fast and real enough to anchor a structure/UI/UX conversation. The mealplanner
  review happens here (see the Reference section). No UI/UX decisions are pre-committed
  before this checkpoint.

- **M3 is the MLP (Minimum Lovable Product):** the first milestone that is genuinely
  useful and lovable to a real small group — you can put a recipe in and your people
  see it, with credible exit demonstrated live on recipe.exchange. Everything before
  M3 is skeleton/read that builds toward it; M4–M5 are enhancement and hardening.

- **Check-in discipline:** commit per phase (per the skill's guardrails), demo per
  milestone. Do not roll multiple milestones into one review — the point is to catch
  directional drift early.

## Phases

> Phase numbering note: the skill reserves "Phase 0" for Discovery. The rough
> `docs/BUILD-PLAN.md` "Phase 0 (read-only interop)" maps to Phases 1–5 here;
> its "Phase 1 (write path)" maps to Phases 6–8; its Phases 2–4 map to the
> roadmap Phases 9–12.

**Cross-phase conventions (added Pass 3):**

- **Tests first (RED before production code).** In every implementation phase
  (1–8, 3b), the unit tests and the phase's wiring test are written and observed
  failing *before* any production code — the `Changes` bullets list production
  files before their tests for readability, not as an execution order. The wiring
  test is RED at phase start and GREEN at phase end; watch each test fail before
  making it pass (per coding-agents TDD guidance). Phase 1 is a partial exception:
  the D3 spike is *promoted* as the scaffold, so TDD applies to the shell entry
  point and the wiring test (RED-first), not to build/config files.

- **Diagnostic logging (observability).** Each phase that touches a failure-prone
  boundary carries a **Diagnostic logging** line naming what to log so a failure is
  debuggable after the fact. Convention: a small `src/log.ts` leveled logger
  (`debug`/`info`/`warn`/`error`) writing structured records to the console, gated
  by a `?debug=1` / `localStorage.debug` flag so production stays quiet. The
  risky boundaries the spec and crashability review flag — OAuth redirect + token
  refresh, PDS fetch, service-worker update, blob upload — must be traceable from
  logs alone, since there is no backend to inspect. `src/log.ts` is created in
  Phase 1 (add it to the Phase 1 write-set) and used from Phase 3 onward.

### Phase 0: Discovery

**Goal:** Resolve the four unknowns before any implementation phase is sized.
Discovery Exemption applies (no TDD, no wiring tests); each task records evidence
back into Verified Assumptions and declares a disposition for probe code.

- [ ] **D1: Does `@atproto/oauth-client-browser` work end-to-end against a real PDS?**
  - **Probe:** In a throwaway Vite + TS sandbox, install `@atproto/oauth-client-browser`
    + `@atproto/api`. Instantiate `BrowserOAuthClient`, complete a login against the
    test account (see BLOCKING open question), obtain an `oauthSession`, build an
    `Agent`, make one authenticated read. Force a token refresh (or wait/expire) and
    confirm the session resumes. Note DPoP behavior and any PWA-redirect quirks.
  - **Success criteria:** A real authenticated read returns data; a refresh cycle
    succeeds without manual re-login; the exact API surface (method names, session
    shape) is recorded.
  - **Disposition:** `throwaway` (findings recorded; sandbox archived).

- [ ] **D2: Is the public read path unauthenticated?**
  - **Probe:** `curl` `com.atproto.repo.getRecord` and `listRecords` against a known
    recipe.exchange author's PDS for `exchange.recipe.recipe`, with no auth header.
    Repeat for a `com.atproto.sync.*` read. Record status codes and whether records
    return.
  - **Success criteria:** Concrete answer per method (public vs auth-required), with
    the observed response, so cold-start reads can be designed correctly.
  - **Disposition:** `keep-as-fixture` (captured responses become read-path test
    fixtures in Phase 4).

- [ ] **D3: Confirm the vanilla toolchain + test harness (framework already decided).**
  - **Probe:** Stand up a minimal vanilla HTML5+CSS+JS "hello" (optionally TS), with a
    trivial build (esbuild or none), and confirm Vitest (unit) + the **candidate**
    e2e harness (Playwright) (service-worker/OAuth-redirect/IndexedDB) run against it.
    Record the baseline bundle size. Confirm a service worker and IndexedDB are
    exercisable in the candidate harness; note any friction that would argue for an
    alternative.
  - **Success criteria:** A working vanilla scaffold with one green test in each layer,
    baseline bundle size recorded, service-worker + IndexedDB confirmed testable, and a
    go/reassess call on Playwright as the harness.
  - **Disposition:** `promote` — the scaffold becomes the Phase 1 base (TDD applies to
    code added in Phase 1, not to the spike).

- [ ] **D4: `exchange.recipe.recipe` field-level schema.**
  - **Probe:** Fetch the raw lexicon JSON from `recipe.exchange/lexicons/` (or the
    canonical `com.atproto.lexicon.schema` record) and record the exact field names,
    types, and required/optional status for `recipe`, plus `collection`.
  - **Success criteria:** A recorded field map sufficient to render (Phase 4) and
    construct (Phase 6) a valid record.
  - **Disposition:** `keep-as-fixture` (schema snapshot becomes a test fixture and
    the basis for the lexicon mirror in a later phase).

**Done when:** All BLOCKING open questions resolved, Verified Assumptions updated
with firsthand evidence, D3 has produced a concrete toolchain choice, and any
phase whose shape a finding invalidates is updated here with a Review Log entry.

**Key property:** Phase 0 is the only phase allowed to restructure later phases.

---

### Phase 1: Project scaffold, CI, first wiring test

**Goal:** A running static app skeleton with the chosen toolchain, a green test
command, and CI, so every later phase has a home and a gate.

**Changes:**
- [ ] Promote the D3 winning scaffold: `package.json`, build config, TS strict
  config (one commit).
- [ ] `src/main.ts` app entry that renders a static shell (title + empty state).
- [ ] `src/log.ts` — leveled structured logger (`debug`/`info`/`warn`/`error`),
  gated by `?debug=1` / `localStorage.debug`; the observability spine every later
  phase logs through. Unit test asserts level gating (debug suppressed unless the
  flag is set; `error` always emits).
- [ ] Test harness config (Vitest + Playwright) with one passing unit test and one
  Playwright test that loads the built bundle and asserts the shell renders.
- [ ] CI workflow running lint + typecheck + `test` on push.
- [ ] `README.md` "Building / development" section; `docs/BUILD-PLAN.md` pointer to
  this plan; fix the stale `docs/STACK.md` §2 line ("Frontend framework / build
  tooling: OPEN") to point at the §7 DECIDED entry (the §7 decision itself was
  already recorded during the Pass 2 addendum — this phase only clears the stale
  cross-reference).

**Call chain:** Browser loads `index.html` → bundle → `main` mounts shell.
**Wiring test:** Playwright loads the built bundle and asserts the app shell is
visible (proves the entry point actually renders, not just that a component unit-
tests green).
**Depends on:** Phase 0 (D3).
**Read-set:** D3 spike output.
**Write-set:** `package.json`, build/test config files, `src/main.ts`,
`src/log.ts`, `tests/shell.spec.*`, `tests/log.spec.*`, CI workflow, `README.md`,
`docs/BUILD-PLAN.md`, `docs/STACK.md`. (Config-heavy scaffold; the logic surface is
two small files — split further only if D3 reveals more than a trivial entry.)
**Shared-state contract:** No shared mutable state beyond the file write-set. CI
binds no local ports; tests use ephemeral Playwright browser contexts.
**Diagnostic logging:** This phase *builds* the logger (`src/log.ts`). Verify a
service-worker registration/update event is logged at `info` (the SW update flow is
a flagged risky boundary; make it observable from the first phase that can register
one).
**Risks:** Playwright + service-worker interaction can be fiddly; confirm in D3 so
this phase doesn't discover it late.
**Done when:**
1. **Behavioral:** `npm run build` produces a static bundle that renders the shell
   in a browser; `npm test` runs unit + e2e and passes.
2. **Verification:** `npm test` green in CI on push.
**Validation:** Moderate — run the built bundle in a real browser, confirm the
shell renders outside the test harness.

---

### Phase 2: Identity resolution (handle → DID → PDS)

**Goal:** Resolve a handle to a DID and a PDS endpoint + keys, the precondition for
any auth or read.

**Changes:**
- [ ] `src/identity/resolve.ts` — handle → DID (DNS TXT / `.well-known/atproto-did`)
  → DID document → PDS endpoint + public keys.
- [ ] `tests/identity/resolve.spec.ts` — unit tests over recorded fixtures
  (well-known and DID-doc JSON), including the failure path (unresolvable handle).

**Call chain:** Shell "sign in" input → `resolveHandle(handle)` → returns
`{ did, pds, keys }` surfaced in the UI.
**Wiring test:** Playwright enters a handle in the shell and asserts the resolved
PDS endpoint is displayed — proves the UI reaches the resolver end-to-end.
**Depends on:** Phase 1.
**Read-set:** `src/main.*`, D2 fixtures.
**Write-set:** `src/identity/resolve.ts`, `tests/identity/resolve.spec.ts`, minimal
wiring in `src/main.*`.
**Shared-state contract:** No shared mutable state beyond the write-set; resolver
makes outbound HTTPS reads only.
**Risks:** DID doc shape variance (did:plc vs did:web); cover both in fixtures.
**Done when:**
1. **Behavioral:** Entering a real handle in the app shows its resolved PDS.
2. **Verification:** `npm test -- identity` + the Playwright resolution test green.
**Validation:** Moderate — resolve a real handle live, confirm against a `curl` of
the same well-known.

---

### Phase 3: OAuth login (read scope) + default session persistence

**Goal:** A user signs in via atproto OAuth and the session persists across app
opens (default path: plaintext refresh token + OS device lock).

**Changes:**
- [ ] `src/auth/oauth-client.ts` — `BrowserOAuthClient` setup using the **loopback
  client** (localhost `clientId` per atproto's loopback exception) + handleResolver;
  login initiation, callback handling, `oauthSession` → `Agent`. Hosted
  client-metadata is deferred to M3; do not block local TDD on it.
- [ ] `src/auth/session-store.ts` — persist/restore refresh token + DPoP key in
  IndexedDB (default plaintext; DPoP key `extractable: false` via WebCrypto).
- [ ] `tests/auth/*.spec.ts` — session store round-trip unit tests; Playwright
  login-and-resume e2e against the test account.

**Call chain:** Shell "sign in" → `oauthClient.signIn(handle)` → redirect →
callback → `session-store.save` → app shows signed-in state; reopen →
`session-store.restore` → signed-in without re-login.
**Wiring test:** Playwright completes login, reloads the page, and asserts the app
is still signed in (proves persistence is wired to the entry point).
**Depends on:** Phase 2, Phase 0 (D1).
**Read-set:** `src/identity/resolve.ts`, `src/main.*`, D1 findings.
**Write-set:** `src/auth/oauth-client.ts`, `src/auth/session-store.ts`,
`tests/auth/*`, wiring in `src/main.*`. (3 source files + tests — at the limit;
cross-tab coordination is deliberately deferred to Phase 3b to stay within it.)
**Shared-state contract:** IndexedDB (origin-scoped); no ports; OAuth redirect uses
the browser's own navigation. No shared state across test runs (fresh browser
context per Playwright test).
**Diagnostic logging:** Log each OAuth step through `src/log.ts`: sign-in initiated
(handle, resolved authz endpoint), redirect returned (callback params present /
error param), token exchange result, session save/restore, and every refresh
attempt with its outcome. Redirect and refresh are the two highest-frequency
failure modes in a backendless SPA and the crashability review's OPEN item —
without a log trail a silent-reauth or lost-session bug is undebuggable. Log
`error` on any auth failure with the DPoP/nonce error class (never the token
value or app-password).
**Risks:** PWA/installed-context redirect quirks (spec §4) — exercise the redirect
return path explicitly; D1 should have surfaced the shape.
**Done when:**
1. **Behavioral:** A user logs in with a handle and stays logged in across a reload.
2. **Verification:** Playwright login-and-resume test green; session-store unit
   tests green.
**Validation:** Broad — run against a real PDS, confirm a refresh cycle resumes
the session (not just initial login), check for silent-reauth on expiry.

---

### Phase 3b: Cross-tab session coordination

**Goal:** Two open tabs do not kill each other's session racing to refresh the
single-use token.

**Changes:**
- [ ] `src/auth/tab-coordination.ts` — leader election via `navigator.locks`;
  leader refreshes; broadcast new access token via `BroadcastChannel`.
- [ ] `tests/auth/tab-coordination.spec.ts` — Playwright with two contexts/tabs
  asserting only one refresh occurs and both stay live.

**Call chain:** App open → acquire lock → if leader, own refresh → broadcast →
followers update in-memory token.
**Wiring test:** Two-tab Playwright test: force a refresh, assert both tabs remain
authenticated and exactly one refresh call was made.
**Depends on:** Phase 3.
**Read-set:** `src/auth/oauth-client.ts`, `src/auth/session-store.ts`.
**Write-set:** `src/auth/tab-coordination.ts`, its test, minimal wiring in the auth
bootstrap.
**Shared-state contract:** `BroadcastChannel` + Web Locks are origin-scoped; tests
use two contexts in one origin. No ports, no filesystem.
**Risks:** Lock/timing flakiness in CI; keep the assertion on end state (both
authenticated), not on exact call ordering, to avoid flakiness.
**Done when:**
1. **Behavioral:** Opening a second tab does not log the first out on refresh.
2. **Verification:** Two-tab Playwright test green.
**Validation:** Moderate — reproduce manually in two real tabs.

---

### Phase 4: Read + render `exchange.recipe.recipe` with verified cache

**Goal:** Cold-start fetch and render real recipe records, cached in IndexedDB with
CID verification (the credible-exit proof made visible).

**Changes:**
- [ ] `src/recipes/read.ts` — `listRecords`/`getRecord` against an author's PDS
  (public path per D2), returning typed records validated against the D4 schema.
- [ ] `src/recipes/cache.ts` — IndexedDB store keyed by AT-URI, tagging each record
  with CID + a `verified` boolean.
- [ ] `src/recipes/RecipeView.*` + `tests/recipes/*.spec.ts` — render a recipe;
  unit tests over D2/D4 fixtures; Playwright render-from-real-PDS e2e.

**Call chain:** Signed-in shell → `readRecipes(did)` → `cache.put` → `RecipeView`
renders the list.
**Wiring test:** Playwright signs in, loads a known author's recipes, and asserts a
real recipe title from recipe.exchange renders on screen.
**Depends on:** Phase 3, Phase 0 (D2, D4).
**Read-set:** `src/auth/*`, D2/D4 fixtures.
**Write-set:** `src/recipes/read.ts`, `src/recipes/cache.ts`, `src/recipes/RecipeView.*`,
`tests/recipes/*`. (4 files — split render vs read if it doesn't fit one context:
4a read+cache, 4b RecipeView. Decide at execution based on D3 framework verbosity.)
**Shared-state contract:** IndexedDB (origin-scoped). Outbound reads only.
**Diagnostic logging:** Log each PDS fetch (endpoint, DID, record count) at `debug`,
cache hit/miss at `debug`, and every CID verification outcome — pass at `debug`,
**mismatch at `warn`** with the AT-URI and both CIDs. The `verified` flag is the
credible-exit proof made visible; a mismatch is a trust-surface event and must be
traceable, not silent. Log `error` on a schema-validation failure (the fail-loud
boundary) with the offending field.
**Risks:** Record schema drift vs D4 fixture; validate at the boundary and fail
loud on unexpected shape (per coding guidance: no silent fallback).
**Done when:**
1. **Behavioral:** A recipe authored on recipe.exchange renders in arecipe, and its
   cache entry is marked `verified` after CID check.
2. **Verification:** Playwright render-from-real-PDS test green; cache CID-verify
   unit test green.
**Validation:** Broad — confirm the same record renders identically on
recipe.exchange (the interop claim), and that a CID mismatch marks `verified:false`.
**Milestone (M1) exit:** this phase closes the walking-skeleton slice. Before starting
M2, hold the structure/UI/UX check-in: demo the sign-in→render slice, review
`github.com/chasemp/mealplanner` + `mealplanner.523.life` for patterns to adopt/avoid,
and record UI/UX directional decisions (a fresh phase-plan pass may spin out of this).

---

### Phase 5: Two-device same-user read (milestone gate)

**Goal:** The spec's stated first milestone — the same account, signed in on two
devices, renders the same records. Completes the rough plan's "Phase 0".

**Changes:**
- [ ] `tests/e2e/two-device-read.spec.ts` — Playwright with two independent browser
  contexts (distinct DPoP keys / storage), same account, asserting both render the
  same recipe set. No new production code expected beyond small fixes surfaced by
  the test.

**Call chain:** Reuses Phases 2–4 in two contexts.
**Wiring test:** This phase *is* a wiring test at the milestone level.
**Depends on:** Phase 4.
**Read-set:** all of `src/`.
**Write-set:** `tests/e2e/two-device-read.spec.ts` (+ any small fixes).
**Shared-state contract:** Two isolated browser contexts, distinct IndexedDB; same
remote account (read-only, so no write contention).
**Risks:** Two DPoP sessions for one account — confirm both refresh independently
(ties back to D1).
**Done when:**
1. **Behavioral:** Two devices show the same account's recipes, both verified.
2. **Verification:** `two-device-read` Playwright test green.
**Validation:** Broad — run on two real browsers/devices, not just two contexts, at
least once manually.

---

### Phase 6: Recipe authoring (create/edit) → visible on recipe.exchange

**Goal:** Write a valid `exchange.recipe.recipe` to the user's PDS and confirm it
appears on recipe.exchange with no coordination (the write half of credible exit).

**Changes:**
- [ ] `src/recipes/write.ts` — construct + `createRecord`/`putRecord` a valid record
  (validated against D4 schema before write; fail loud on invalid).
- [ ] `src/recipes/RecipeEditor.*` + tests — authoring UI; unit tests on record
  construction; Playwright author-then-read-back e2e.

**Call chain:** Editor form → `writeRecipe(payload)` → PDS → re-`readRecipes`
shows it.
**Wiring test:** Playwright authors a recipe and asserts it appears in the app's own
list after write-through; a manual/automated check confirms it on recipe.exchange.
**Depends on:** Phase 5.
**Read-set:** `src/recipes/read.ts`, `src/recipes/cache.ts`, D4 schema.
**Write-set:** `src/recipes/write.ts`, `src/recipes/RecipeEditor.*`, tests.
**Shared-state contract:** Writes to the user's real PDS (a real external mutation)
— use a dedicated test account; clean up created records in test teardown.
**Risks:** Writing to a real repo in tests. Isolate to a throwaway test account and
delete records after. Never run write tests against a personal account.
**Done when:**
1. **Behavioral:** A recipe authored in arecipe is retrievable from the PDS and
   renders on recipe.exchange.
2. **Verification:** Playwright author-then-read-back test green; a documented check
   confirms recipe.exchange visibility.
**Validation:** Broad — verify on recipe.exchange in a browser; confirm the written
record's CID and fields match what was authored.

---

### Phase 7: Blob (image) handling

**Goal:** Recipe photos as atproto blobs (thumbnail + full-size), embedded by CID.

**Changes:**
- [ ] `src/recipes/blobs.ts` — canvas thumbnail, `uploadBlob` full + thumb, embed
  both CIDs; `getBlob` fetch with placeholder on failure; IndexedDB thumbnail cache.
- [ ] tests — unit on the upload/embed flow (mocked PDS blob endpoint), Playwright
  upload-and-render e2e.

**Call chain:** Editor image picker → `uploadBlob` → embed CID in record → view
`getBlob` renders image.
**Wiring test:** Playwright uploads an image to a recipe and asserts it renders on
read-back.
**Depends on:** Phase 6.
**Read-set:** `src/recipes/write.ts`, `src/recipes/RecipeView.*`.
**Write-set:** `src/recipes/blobs.ts`, tests, small edits to editor/view wiring.
**Shared-state contract:** Blob writes to the test account's PDS; teardown cleans up.
**Diagnostic logging:** Log `uploadBlob` start/result (size, mime, returned CID) at
`info`, thumbnail generation at `debug`, and `getBlob` failures at `warn` (the
placeholder-on-failure path must record *why* it fell back — a silent placeholder
hides a broken blob). Enforce the client size cap with an `error` log naming the
observed vs allowed size.
**Risks:** Blob size/caps; enforce a client cap and fail loud past it.
**Done when:**
1. **Behavioral:** An authored recipe carries a working photo that renders.
2. **Verification:** Playwright upload-and-render test green.
**Validation:** Broad — `uploadBlob` is a real external mutation against the test
account's PDS (same risk tier as the Phase 6 write path, which is Broad). Confirm
the blob fetches from a second session/device, verify the embedded CID matches the
uploaded bytes, and confirm teardown removes the blob so it does not leak into later
runs.

---

### Phase 8: Drafts (two-tier) + recipe versioning

**Goal:** In-progress work survives storage eviction, and cross-record references
survive recipe edits.

**Changes:**
- [ ] `src/recipes/drafts.ts` — IndexedDB draft + sync to PDS as `fyi.recipe.draft`
  (`status: draft`); restore on open. `navigator.storage.persist()` request.
- [ ] `src/recipes/refs.ts` — `com.atproto.repo.strongRef` (AT-URI primary + CID);
  "older version" indicator when CID mismatches.
- [ ] tests — draft survives simulated eviction; edit changes CID and the indicator
  appears; **and the negative edge: a reference whose pinned CID still matches shows
  NO stale indicator.** Assert both sides so the test survives a mutation that always
  shows (or never shows) the indicator.

**Call chain:** Editor autosave → `drafts.save` (local + PDS) → reopen →
`drafts.restore`; edit recipe → new CID → references show stale indicator.
**Wiring test:** Playwright starts a draft, clears local storage, reopens, and
asserts the draft is recovered from the PDS.
**Depends on:** Phase 6 (7 optional).
**Read-set:** `src/recipes/write.ts`, `src/recipes/read.ts`, `src/recipes/cache.ts`.
**Write-set:** `src/recipes/drafts.ts`, `src/recipes/refs.ts`, tests, editor wiring.
(Two source files + tests; split drafts vs refs if it doesn't fit one context.)
**Shared-state contract:** IndexedDB + draft records on the test PDS; teardown.
**Risks:** Eviction is browser-dependent; simulate by clearing IndexedDB in the test
rather than relying on real eviction.
**Done when:**
1. **Behavioral:** A draft recovers after local storage is cleared; editing a recipe
   surfaces the older-version indicator on a pinned reference.
2. **Verification:** Playwright draft-recovery + versioning tests green.
**Validation:** Moderate — exercise eviction recovery manually once.

---

### Phase 9: Social graph, comments, interactions (ROADMAP — re-plan before executing)

**Goal:** `fyi.recipe.friend`, `fyi.recipe.comment`, `interaction.cooked/saved`,
affinity scoring, Jetstream live tail with polling fallback, unsigned→verified
promotion, rate-limit handling. Spec Layers 6 + 7.
**Depends on:** Phase 8.
**Done when:** This phase is decomposed via its own phase-plan pass (Phase 0–style
discovery on Jetstream availability + a fine phase breakdown), then executed. It is
intentionally not sized to single-context granularity here — its shape depends on
the module boundaries established in Phases 4–8.

---

### Phase 10: Immune system / moderation (ROADMAP — re-plan before executing)

**Goal:** Client-derived moderation — inherited mutes weighted by affinity, applied
client-side with a legible inheritance path; optional labeler; canonical baseline
lists. Spec Layers 8 + 9 (moderation parts). Bounded to 12–25 scale.
**Depends on:** Phase 9.
**Done when:** Decomposed via its own phase-plan pass, then executed. Candidate to
run parallel with Phase 9 (disjoint write-sets) — decide at re-plan.

---

### Phase 11: Multi-authority delivery and trust (ROADMAP — pre-launch gate, re-plan before executing)

**Goal:** Offline Ed25519 key ceremony, signed release manifest, `fyi.recipe.status`
canary, service-worker verify-before-install flow, multi-origin hosting + DNS
failover, Tangled mirror + fallback origin, app-account DID with split keys, public
incident runbook. Spec Layers 3 + 10.
**Depends on:** a shippable app (Phases 6–8 at minimum). **Hard gate: must complete
before any public launch.**
**Done when:** Decomposed via its own phase-plan pass (the key ceremony and
signing toolchain — likely the Rust offline helper — warrant their own discovery),
then executed. Exit: a tampered bundle on one origin is refused; a non-`normal`
canary pauses updates.

---

### Phase 12: Launch pages and durability pledge (ROADMAP — re-plan before executing)

**Goal:** Public pages (landing/about/how-it-works/spec/status/verify/blog +
prerendered `/recipes/{did}/{rkey}` with Schema.org JSON-LD), the 1.0 durability
pledge (structural floor + 10-year domain + 2-year LTS), and the `OUTREACH.md`
beachhead. Spec §Layer 10 + `OUTREACH.md`.
**Depends on:** Phase 11.
**Done when:** Decomposed via its own phase-plan pass — including resolving the
prerender-without-a-backend question (`docs/STACK.md` §7) — then executed.

## Open Questions

- [RESOLVED] What test atproto account / PDS do the Phase 0 probes and all write-path
  tests run against? **Resolved 2026-07-07:** `@ngvalidation2112.bsky.social` (see
  Verified Assumptions). Credential supplied out-of-band, never committed; D1 mints a
  scoped app-password from it. A second account (`chase+two@owasp.org`) exists on
  Bluesky but its handle/creds are not recorded in the CroftC repos; provide them
  separately if a second identity is needed for multi-user tests (Phase 9+).

- [RESOLVED 2026-07-07] Frontend framework → **none; vanilla HTML5 + CSS + JS**
  (see Decisions Locked). D3 no longer needs a framework bake-off.

- [RESOLVED 2026-07-07] OAuth client registration → **loopback client for TDD/local;
  hosted client-metadata document is an M3 milestone item** (see Decisions Locked).

- [CONFIRMED: ADVISORY — user, 2026-07-07] e2e/wiring harness → **Playwright is the
  working candidate, not yet committed.** *User set ADVISORY (overriding the agent's
  PHASE-GATED recommendation): the harness does not gate execution — start on
  Playwright, let D3 stress it against the vanilla stack (service worker, OAuth
  redirect, IndexedDB), and reassess in-flight if it fights us (e.g. WebdriverIO, or
  Vitest browser mode) rather than blocking Phase 1 on a lock-in decision.* The
  maintainer is fine with it but wants to see how it goes before committing.

## Review Log

### Pass 1: Base plan — 2026-07-07
Built from `docs/BUILD-PLAN.md` and the v0.3 spec. Established Phase 0 discovery
(D1–D4), decomposed the rough "Phase 0 read-only interop" into executable Phases
1–5, the write path into Phases 6–8, and kept social/immune/delivery/launch as
roadmap Phases 9–12 to be re-planned before execution. Grounded the auth layer in a
firsthand check of `@atproto/oauth-client-browser`.

### Pass 2: Gap Analysis — 2026-07-07 (combined with Pass 1)
**Found:**
- Cross-tab coordination was implied inside the OAuth phase, pushing it to 4 files;
  extracted as its own Phase 3b to honor the ≤3-file rule and the single-use-refresh
  hazard (spec §8) that would otherwise be untested.
- The write path had no test-account isolation plan; added an explicit BLOCKING open
  question and per-phase teardown so write tests never hit a personal repo.
- The public-read assumption (D2) was being treated as fact in an early draft; pulled
  it into Verified Assumptions as explicitly NOT verified and made it a Phase 0 probe,
  because the XRPC spec does not enumerate which endpoints are public.
- Phase 5 (two-device) had no independent-DPoP-refresh check; tied its risk back to
  D1 so the milestone actually proves the multi-device claim.
**Concurrency:**
- Confirmed the implementation spine is sequential (each phase builds on the prior).
- Marked Phase 0 probes {D1, D2, D4} as parallel-safe (disjoint probes, plan-doc
  edits serialized), and flagged Phases 9/10 as a parallel candidate to decide at
  re-plan.
**Changed:**
- Split Phase 3 → 3 + 3b; added test-account open question; sharpened Phase 4/8
  "split if it doesn't fit" notes to keep phases within a single context window.
**Confirmed:**
- Front-loading executable detail and keeping 9–12 at roadmap altitude holds up:
  their file shape genuinely depends on decisions in Phases 1–8, so sizing them now
  would violate "no assumed behavior."
- The no-backend constraint survives every phase; the only place it is stressed
  (prerender in Phase 12) is explicitly deferred to that phase's re-plan.

### Pass 2 addendum: decisions + milestones — 2026-07-07
**Found / Decided:**
- Frontend framework resolved to vanilla HTML5+CSS+JS (no framework); OAuth resolved
  to loopback-for-dev with hosted client deferred to M3. Both moved from Open Questions
  to Decisions Locked; STACK.md §7 updated to match.
**Changed:**
- Added a Milestones and Delivery Cadence section (M0–M5) framing work as thin e2e
  vertical slices toward an MLP at M3, with per-milestone demo/check-in gates.
- Added M1 as the "core + basic setup" structure/UI/UX checkpoint; teed up
  `chasemp/mealplanner` (+ `mealplanner.523.life`) as required reading there, explicitly
  not analyzed now. Wired the checkpoint into Phase 4's exit.
- Phase 3 pinned to the loopback OAuth client.
**Confirmed:**
- Vanilla stack shrinks D3 to a harness+baseline check rather than a framework bake-off.
- Only Playwright-as-harness remains open (PHASE-GATED Phase 1); all other planning
  questions are resolved.

### Pass 3: Quality Gates — 2026-07-07
Fresh-context quality-gate review. Spot-checked the repo (still greenfield: only
`README.md`, `LICENSE`, `docs/`, `plans/`) and confirmed the doc touch points.
Applied additively; the Pass 2 phase shape is unchanged.

**TDD ordering:**
- Added a cross-phase "Tests first (RED before production code)" convention note at
  the head of the Phases section: `Changes` lists production files before tests for
  readability only; unit + wiring tests are written and watched failing first. Noted
  Phase 1's promoted-scaffold exception (TDD applies to the shell entry point and
  wiring test, not build/config).
- Phase 8: added the negative mutation-resistance edge (a reference whose pinned CID
  still matches shows NO stale indicator) so the versioning test isn't a single-point
  assertion that survives an always-show / never-show mutation.
- Verified every implementation phase (1–8, 3b) already has a wiring test that
  exercises the entry point through Playwright and a Verification command that runs
  the call chain (not isolated-module tests). No defects there.

**Observability:**
- Biggest gap in the Pass 2 plan: no diagnostic-logging strategy anywhere, despite a
  backendless app where post-hoc debugging depends entirely on client logs. Added a
  logging convention (`src/log.ts`, leveled, flag-gated) created in Phase 1, and
  per-phase **Diagnostic logging** lines on every flagged risky boundary: Phase 1
  (service-worker update), Phase 3 (OAuth redirect + every refresh outcome), Phase 4
  (PDS fetch + CID-verify mismatch at `warn`), Phase 7 (blob upload/fetch + cap
  enforcement). Explicitly barred logging token/app-password values.

**Debugging readiness:**
- Logger + per-phase log points now make a mid-execution failure attributable to a
  phase and a boundary. Milestone demos and commit-per-phase (already in the plan)
  remain the coarse checkpoints. Added `src/log.ts` and `tests/log.spec.*` to the
  Phase 1 write-set.

**Validation calibration:**
- Recalibrated Phase 7 (blobs) from Moderate → **Broad**: `uploadBlob` is a real
  external mutation against the test account's PDS, the same risk tier as the Phase 6
  write path (Broad). Added CID-matches-bytes and teardown-verification to its
  validation. Phase 8 stays Moderate (draft records are lower-stakes writes) —
  reviewed and left as-is.
- Reviewed all other phases' Validation fields: 3/4/5/6 Broad (external/interop), 1/2/3b
  Moderate — calibration matches scope. Phase 0 tasks each have a concrete question,
  probe, success criterion, and declared disposition (D3 `promote` → named Phase 1
  follow-up with TDD). Note: D2 and D4 are technically resolvable during planning
  (public curl / public lexicon fetch); left batched into Phase 0 execution since Pass
  3 is analysis-only and they carry proper dispositions — flagging for the executor to
  front-run if convenient.

**Concurrency honesty:**
- Concurrency Map accounts for all phases; implementation spine correctly sequential.
- Strengthened the {D1, D2, D4} parallel probe set: the Pass 2 contract named only the
  plan doc as shared surface and omitted re-entry verification (required for any
  parallel-set member). Added the **test account** as the second shared ambient
  surface — D1 mutates it (app-password mint + login/refresh), D2/D4 are public reads
  only, so the mutation is disjoint from the reads and parallel-safe; barred a second
  account-mutating probe alongside D1. Added a concrete 4-point re-entry verification
  (findings recorded, no orphan processes, D1 app-password recorded-or-revoked,
  dispositions honored). No new parallelism surfaced — the spine genuinely builds
  forward.

**Coherence:**
- Reconciled the TS-committed (Reasoning) vs TS-optional (Decisions Locked) tension:
  TS is the committed default for `src/`; "optional" meant only that trivial glue JS
  isn't forbidden. Normalized `main.ts(x)` / `.tsx` notation to `.ts` — no framework
  means no JSX. Plan still solves the original problem (read-only interop milestone +
  write path); no scope creep observed.

**Documentation impact:**
- Corrected the Documentation Impact entry: STACK.md §7 framework/OAuth decisions were
  already recorded in the Pass 2 addendum (not pending Phase 1 work). Caught a stale
  cross-reference the Pass 2 update left behind — STACK.md §2 line 58 still says
  "Frontend framework / build tooling: OPEN," contradicting §7 DECIDED. Scheduled the
  fix into Phase 1 (the phase already touching STACK.md), not a trailing docs phase.
- Reconciled the Playwright open-question tag from the non-standard "[CANDIDATE]" to
  `[RECOMMENDED: PHASE-GATED (Phase 1, via D3)]` with rationale, per the skill's
  severity format.

**Confirmed ready:** Yes. The one open question (Playwright harness) was confirmed
by the user as **ADVISORY** (overriding the agent's recommended PHASE-GATED) — it
does not gate execution; start on Playwright and reassess in-flight if D3 or a later
phase reveals friction. No BLOCKING or PHASE-GATED items remain. The plan is ready
for execution starting at Phase 0.
