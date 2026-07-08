# arecipe — Executable Build Plan

Derived from `docs/BUILD-PLAN.md` (rough phasing) via the phase-plan skill.
This document is the executable version: TDD-first, wired-and-tested phases,
each leaving the system in a working state. The rough plan's coarse stages map
to fine phases here; `docs/sources/arecipe-spec.md` remains the technical source
of truth.

Passes run: Pass 1 (base) + Pass 2 (gap analysis) combined in one context on
2026-07-07; Pass 3 (quality gates) in a fresh context on 2026-07-07; post-Pass-3
feasibility amendment on 2026-07-07 (see Review Log).

## Outcome Summary

| Phase | Outcome | Commits | Note |
|---|---|---|---|
| 0 Discovery | ✅ | `8c47af0`, `e98ad5a` | All 6 probes answered; nothing invalidated; fixtures + spike archived |
| 1 Scaffold + logger + CI | ✅ | `a42375d` | Shell + `src/log.ts` (TDD), hermetic CI, docs; real-Chrome validation passed |
| 2 Identity resolution | ✅ | `0b9c32c` | handle→DID→PDS via resolver service (TDD, fixtures); live validation vs well-known curl |
| 3 OAuth login + persistence | ✅ | `12c9e0f` | session-provider port (TDD); @live tier landed; real login + reload-resume passed; bundle 174 KB gz flagged for M1 |
| 3b Cross-tab coordination | ✅ | `27561a3` | Collapsed: library already coordinates (navigator.locks + BroadcastChannel, source-verified); forceRefresh API + two-tab @live regression pin it |
| 4a Read + verified cache | ✅ | `e10901e` | Public read + Tier 2 CID verify (TDD); live: 3/3 verified vs real PDS; SW fetch-handler/route-interception gotcha found+fixed |
| 4b Render (M1 exit) | ✅ | `5084e4b` | Recipes render; interop confirmed BOTH ways (arecipe + recipe.exchange render the same record). M1 checkpoint held same day |
| 5 Two-device read (M2 exit) | ✅ | Phase 5 close-out commit | Two contexts + two engines (Chrome/Firefox), same account, same recipes; independent refresh pinned. **M2 REACHED** |
| 5b Pages + nav shell | ✅ | Phase 5b close-out commit | 4 documents, native back, bottom tab bar mobile; browse.js −98% (44 KB / 15 KB gz); @live 3/3 incl. mine.html callback |
| 5c Theming (light/dark) | ✅ | Phase 5c close-out commit | Auto + one-tap cycle, pre-paint script, dark enamelware palette; ALTERED? verified loud in dark |
| 5d Recipe detail page | ✅ | `d80424a` | Shareable recipe URLs; cold links verified in fresh profile; back restores results; ALTERED on both surfaces |
| 5e Starter packs (lite) | ✅ | Phase 5e close-out commit | Zero-input feed: 72 verified recipes from 4 curated authors (incl. official arecipe.bsky.social); settings toggles + profile links; seeding pending creds |
| 6 Authoring (MLP core) | ✅ | Phase 6 close-out commit | editor + local drafts + Publish→PDS (@live 5.6s); race bug caught+fixed; brand placeholder |
| 7 Photos (EXIF-stripped) | ✅ | Phase 7 close-out commit | Editor photo → canvas re-encode (EXIF provably gone on real PDS bytes) → embed; placeholder-on-failure |
| 8 Draft-sync + versioning | ✅ | Phase 8 close-out commit | PDS draft backup + eviction recovery (@live-proven); EDIT shipped; stale-cache indicator both edges; PRACTICES.md started |
| 8b Offline PWA | ✅ | Phase 8b close-out commit | Hashed assets, versioned cache-first SW, update toast, manifest+maskable icons, self-hosted fonts, offline starter fallback; theme→2-state; CNAME baked |
| 8c Hosted OAuth client (M3 EXIT) | ✅ | `a03205c` | Real OAuth on arecipe.app; two independent devices signed into the same account, same recipes. **MLP shipped.** |
| 9a Friends (social graph) | ✅ | Phase 9a close-out commit | `app.arecipe.friend` follows; feed.ts loader extracted (starter guard green); 3rd nav tab; `?did=` cold-view; guarded multi-collection purge; @live add→appear→remove green |
| 9b Comments (threaded) | ✅ | Phase 9b close-out commit | `app.arecipe.comment` friends-scoped threaded comments on the recipe page (AT-URI threading, pinned recipe strongRef); Social settings panel + Hide Comments; @live comment→reply-nests green. Recipe-page bundle 49K→930K (code-split backlogged) |
| 9c–12 | roadmap | | re-plan before execution (9c re-confirm shape at start; 9c adds likes + Hide Likes) |
| Cookbook reshape (CB1–CB7) | planned | | Re-planned 2026-07-08 (Pass 1+2). Supersedes the friend model: `cookbook.ts` scope (starters+follows+followers+you), drop `app.arecipe.friend`, rename Friends→Cookbook, two-axis settings. See "### Cookbook reshape" |

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

- **`BrowserOAuthClient` owns session persistence and restore.** The client "keeps
  track of all the sessions that it manages through an internal store" and
  `client.init()` restores the last used session. Multi-tab coordination is NOT
  documented (absence of docs ≠ absence of behavior — D1 probes it empirically).
  Confirmed 2026-07-07 (oauth-client-browser README, bluesky-social/atproto@main).
  Consequence: Phase 3 must not rebuild persistence; its store module is at most a
  thin wrapper over the library's own store.

- **Browsers cannot resolve handles natively; `handleResolver` is required.** DNS
  TXT lookup "is not available in the browser"; the client requires a
  `handleResolver` (a PDS/entryway URL, a service exposing
  `com.atproto.identity.resolveHandle`, or a DNS-over-HTTPS resolver). Confirmed
  2026-07-07 (same README). Consequence: Phase 2's resolution path goes through a
  resolver service — not DNS TXT, and not raw `https://<handle>/.well-known/atproto-did`
  fetches (CORS-blocked for most handle domains). The spec's Layer 1 wording
  describes the protocol view, not the browser-feasible path → errata recorded in
  Documentation Impact.

- **The loopback OAuth flow works end-to-end — VERIFIED (D1, 2026-07-07).**
  Full cycle against the real PDS via Playwright-driven browser:
  `signIn(handle)` → bsky.social login (handle prefilled via `login_hint`) →
  consent screen (Authorize/Deny — always shown; loopback forbids silent
  sign-in) → callback → `init()` returns the session (correct DID) →
  authenticated DPoP read (`getProfile` via appview proxy) → reload restores
  the session without re-login → `getTokenInfo(true)` forces refresh (twice) →
  a second tab restores the same session from the shared store and keeps
  reading after tab 1's refresh. Findings that bind Phase 3:
  - **Scope must be requested explicitly.** Bare loopback default is `atproto`
    only → appview RPCs fail with "Missing required scope rpc:…". Fix (v0.4.6):
    build the loopback client_id with `?scope=atproto+transition:generic` and
    pass `atprotoLoopbackClientMetadata(clientId)` as `clientMetadata`.
  - **Access token ≈ 1 hour** (observed); loopback refresh validity "typically
    1 day" (library README; not directly measured).
  - **Persistence surface** (all library-owned; IndexedDB db
    `@atproto-oauth-client`): stores `session` (keyed by DID),
    `authorizationServerMetadataCache`, `didCache`, `dpopNonceCache` (per
    host), `handleCache`, `protectedResourceMetadataCache`, `state`. Confirms
    the session-provider-is-a-thin-wrapper rescope.
  - **v0.4.6 has no event API** (the README's `addEventListener('deleted')` is
    a newer version). Client surface: init/initRestore/initCallback, restore,
    revoke, signIn/signInRedirect/**signInPopup**, dispose. Session surface:
    did/sub, serverMetadata, getTokenInfo, signOut, fetchHandler.
  - **Multi-tab (soft evidence):** two tabs share the IndexedDB session store;
    no breakage in a basic probe. The concurrent-refresh race with a
    single-use refresh token was NOT stress-tested — Phase 3b's
    verify-then-build stands.
  - No email-2FA challenge appeared for this account (`emailAuthFactor:
    false`), so the flow is automatable for `@live` tests.

- **The app-password seam is proven — VERIFIED (D5, 2026-07-07).**
  `AtpAgent` + `createSession` with the D1-minted scoped app-password
  (`arecipe-phase0-tests`, in `.env` as `BSKY_TEST_APP_PASSWORD`) performed
  the same appview-proxied read as the OAuth Agent plus a full repo
  `createRecord` → `getRecord` (match) → `deleteRecord` (verified gone) cycle
  on a scratch collection (`app.arecipe.probe`). Port shape: the app consumes
  an `Agent`; OAuth (DPoP) and app-password (Bearer) implementations are
  interchangeable for repo/blob/appview calls. Caveats the `@live` OAuth tier
  alone covers: DPoP nonce retries, OAuth token lifetimes/refresh, scope
  model. Bonus: the PDS auto-generated a **TID rkey** (`3mq2yxuxcz32f`) on
  createRecord — writing without an explicit rkey yields spec-conformant TIDs
  (informs the Phase 6 rkey decision).

- **Loopback clients get ~1-day refresh tokens.** Loopback/public clients have
  "very limited" refresh validity, "typically 1 day," vs longer-lived tokens for
  registered clients. Confirmed 2026-07-07 (same README). Consequence: Phase 3's
  session-persistence criterion is bounded to the loopback token lifetime until the
  hosted client-metadata document lands (locked M3 item); daily re-login in local
  dev is expected behavior, not a bug. D1 records the observed lifetimes.

- **`exchange.recipe.*` NSIDs** (`recipe`, `collection`, `defs`, `profile`) are
  maintained by Josh Huckabee at `recipe.exchange/lexicons/`, corroborated in
  `docs/sources/` (novelty assessment + gradient). Field-level schema of
  `exchange.recipe.recipe` not yet confirmed firsthand → D4.

- **The repo is greenfield.** Only `README.md`, `LICENSE`, `docs/` present
  (confirmed 2026-07-07). No test infra, no build tooling yet — we choose it (D3).

- **Canonical domain: `arecipe.app`** — owned ("bought and paid for"), stated by
  the maintainer 2026-07-07. `arecipe.fyi` was an early idea, not the real domain;
  `recipe.fyi` was never controlled. Consequence: app-scoped NSIDs are
  `app.arecipe.*` (see the NSID resolution in Open Questions), and DNS-authority
  planning (Phase 11) targets arecipe.app.

- **Test account:** `@ngvalidation2112.bsky.social` (`did:plc:xyfhcaweaeyew3zrgk6jaln7`,
  repo PDS `stropharia.us-west.host.bsky.network`, entryway `bsky.social`, email
  `chase@owasp.org`). Reused from the prior appview-validation / public-roundtrip
  experiments. Credential is supplied **out-of-band** (session / gitignored `.env` at
  execution time) and is never stored in-repo. D1 should mint a scoped app-password
  from it for the automated probes rather than using the main password directly.

- **The public read path is unauthenticated AND CORS-open — VERIFIED (D2,
  2026-07-07).** Probed live against real recipe.exchange authors' Bluesky-hosted
  PDSs with no auth header and `Origin: http://127.0.0.1:8080`:
  `repo.listRecords`, `repo.getRecord`, `sync.getRecord` (CAR), `sync.getRepo`,
  `sync.getBlob` all HTTP 200 with `access-control-allow-origin: *`;
  `plc.directory` DID docs likewise. Captured responses in
  `tests/fixtures/atproto/` (see `PROBE-NOTES.md` there for endpoints/DIDs).
  Cold-start public reads from the browser work exactly as Phase 4 assumes.

- **Tier 2 CID verification works in JS and is cheap — VERIFIED (D6, 2026-07-07).**
  Recomputed a real `exchange.recipe.recipe` record's CID from its `getRecord`
  lex-JSON (`$link`→CID / `$bytes`→bytes conversion → canonical DAG-CBOR → sha-256
  → CIDv1): exact match with the PDS-reported CID
  (`bafyreicjd6v75ykac2ky2ccafulnag6ca47enezqm3kp7be5bhubsdchki`). Browser bundle
  cost of `@ipld/dag-cbor` + `multiformats`: **38.5 KB minified / 12.2 KB gzip**.
  **Tier decision: Tier 2 for Phase 4** (recompute-on-receipt); Tier 3 (sync CAR +
  MST proof + commit signature) deferred as a named hardening item.

- **The vanilla toolchain is confirmed — VERIFIED (D3, 2026-07-07).** Vanilla
  TS (strict) + esbuild + Vitest + Playwright: typecheck, 2 unit tests, build, and
  3 Playwright e2e (shell render, IndexedDB round-trip, **service worker
  registered + active**) all green; e2e suite runs in 2.4 s; `esbuild --servedir`
  serves the bundle for e2e (one ephemeral port, as the Phase 1 contract states).
  **Baseline bundle: 2,713 bytes total (~1.3 KB gzip)** — main.js 1,978 B +
  sw.js 324 B + index.html 411 B. Playwright verdict: zero friction with SW and
  IndexedDB — **go** (harness question was ADVISORY; this is the D3 report).

- **`exchange.recipe.recipe` field map captured — VERIFIED (D4, 2026-07-07).**
  Lexicon JSON served at `recipe.exchange/lexicons/<nsid>.json` (recipe,
  collection, defs, profile captured to `tests/fixtures/lexicons/`). Canonical
  resolution also works: `_lexicon.recipe.exchange` DNS TXT →
  `did:plc:4cx7ts7lqgjtsfquo53qo3sz` → `com.atproto.lexicon.schema` record
  (captured). Required fields: name, text, ingredients, instructions, createdAt,
  updatedAt. Two spec-vs-practice discrepancies recorded in the fixtures'
  `PROBE-NOTES.md`: (a) website lexicon adds optional `langs` not yet in the
  canonical record (harmless under open-world validation); (b) lexicon declares
  `key: tid` but real recipe.exchange records use **26-char ULID rkeys** —
  Phase 6 must choose a format (note added there).

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

- `docs/sources/arecipe-spec.md` — **errata recorded, not edited by this plan**
  (spec is v0.3, "status: draft, for discussion"; upstream edits are the
  maintainer's call): (1) Layer 1 describes handle resolution via DNS TXT /
  `.well-known` — the protocol view, not browser-feasible; the browser path goes
  through a `handleResolver` service (see Verified Assumptions). (2) Layer 4's
  drafts-synced-to-PDS does not note that PDS records are world-readable (see the
  drafts-privacy resolution: accepted, with an editor disclosure line). (3) NSID
  namespace: the spec's `fyi.recipe.*` implies authority over `recipe.fyi`, which
  nobody controls; **resolved 2026-07-07 — the owned canonical domain is
  `arecipe.app`, so all app-scoped NSIDs become `app.arecipe.*`**, and the spec's
  `arecipe.fyi` DNS-authority mentions should converge on `arecipe.app` (the spec's
  Layer 3 already uses it). Spec is v0.3 draft; upstream edits are the maintainer's
  call — tracked here so they aren't lost.

- No `agents.md`/`CLAUDE.md` equivalents exist in this repo (those live in the
  coding-agents repo, not here). No cross-references to update there.

## Concurrency Map

Sequential spine (implementation; M3 phases inserted at the M2/M3 re-plan):
Phase 1 → 2 → 3 → 3b → 4 → 5 → 5b → 5c → 6 → 7 → 8 → 8b → 8c → [9, 10] → 11 → 12

- M3 additions are sequential: 5b rewrites the document/nav structure every
  later phase builds on; 5c touches the same nav/styles files as 5b; 6–8
  build on the pages; 8b caches the finished authoring surface; 8c flips the
  deployed origin live. No disjoint write-sets worth parallelizing — 5c/6
  both write `styles.css`/nav and stay sequential (hard rule).

- Each implementation phase reads or builds on what the prior phase wrote
  (scaffold → resolution → auth → read → two-device → write → blobs → drafts). The
  spine is inherently sequential; parallelism is not safe across it.

- **Phase 0 discovery tasks {D2, D4, D6} are independent public-read probes** and
  may run concurrently (disjoint: D2 exercises public record reads, D4 fetches a
  lexicon schema, D6 recomputes a CID from a public record). **D1 → D5 run
  serialized with each other** (both mutate test-account session state: D1 logs in
  via OAuth and mints the app-password, D5 consumes that app-password via
  `createSession`) but may run concurrently with the public-read set. D3 (toolchain
  decision) depends on nothing but should conclude before Phase 1.
  *(Membership updated by the feasibility amendment: D5/D6 added; D1‖D2/D4
  reasoning below unchanged.)*
  - **Shared-state contract (parallel probe set):** Each probe runs in its own
    sandbox directory with disjoint tmp paths; none binds a port. Two shared ambient
    surfaces exist and are handled explicitly: (1) **this plan doc** — the only place
    findings are written; serialize the plan-doc edits (one writer at a time). (2)
    **the test account** `@ngvalidation2112.bsky.social` — D1 *mutates* it by minting
    a scoped app-password and running a real login/refresh, and D5 consumes that
    app-password (a second account-state mutation — hence D1 → D5 serialized); D2,
    D4, and D6 touch only *public, unauthenticated* reads and do not mutate the
    account. Because only the D1→D5 chain writes account state, the mutation is
    disjoint from the public reads — safe to parallelize across the two groups. Do
    not run any other account-mutating probe concurrently with D1 or D5.
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
 M3  Authoring MLP      Phases 5b,5c,6,7,  → THE Minimum Lovable Product: a small
     (the MLP)          8, 8b, 8c            group can author + share recipes that
                                             also appear on recipe.exchange —
                                             page-per-destination + theming +
                                             authoring (draft-before-publish) +
                                             photos + drafts/versioning + offline
                                             PWA + hosted OAuth client; exits with
                                             the physical two-device demo
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

- **M2 scope note (feasibility amendment):** "two devices" at M2 means two isolated
  sessions/browsers on one machine — the loopback OAuth client can't serve a second
  physical device. The physical two-device demo lands at the start of M3, when the
  hosted OAuth client exists. M3 also unlocks long-lived sessions (loopback refresh
  tokens are ~1 day).

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

### Phase 0: Discovery — ✅ COMPLETE (2026-07-07; D2/D3/D4/D6 in `8c47af0`, D1/D5 in `e98ad5a`)

**Goal:** Resolve the four unknowns before any implementation phase is sized.
Discovery Exemption applies (no TDD, no wiring tests); each task records evidence
back into Verified Assumptions and declares a disposition for probe code.

- [x] **D1: Does `@atproto/oauth-client-browser` work end-to-end against a real PDS?**
  ✅ DONE 2026-07-07 — yes: full login→consent→callback→read→restore→forced-
  refresh→two-tab cycle green. Key catches: scope must be requested explicitly
  (`transition:generic`); v0.4.6 has no event API; access token ≈1 h. Spike
  archived in `spike/d1-oauth/`. See Verified Assumptions.
  - **Probe:** In a throwaway Vite + TS sandbox, install `@atproto/oauth-client-browser`
    + `@atproto/api`. Instantiate `BrowserOAuthClient`, complete a login against the
    test account (see BLOCKING open question), obtain an `oauthSession`, build an
    `Agent`, make one authenticated read. Force a token refresh (or wait/expire) and
    confirm the session resumes. Note DPoP behavior and any PWA-redirect quirks.
  - **Success criteria:** A real authenticated read returns data; a refresh cycle
    succeeds without manual re-login; the exact API surface (method names, session
    shape) is recorded. Additionally (added by feasibility amendment): the library's
    persistence surface (what it stores in IndexedDB, what `init()` restores — so
    Phase 3 doesn't rebuild it); observed multi-tab behavior (two tabs open, force a
    refresh — does the library coordinate natively? feeds Phase 3b's verify-then-build);
    observed loopback access/refresh token lifetimes; and the exact loopback
    `client_id` / redirect-URI format (IP-literal constraints, port handling).
  - **Disposition:** `throwaway` (findings recorded; sandbox archived).

- [x] **D2: Is the public read path unauthenticated?** ✅ DONE 2026-07-07 — yes,
  and CORS-open (`*`), incl. blobs and plc.directory. Fixtures in
  `tests/fixtures/atproto/`. See Verified Assumptions.
  - **Probe:** `curl` `com.atproto.repo.getRecord` and `listRecords` against a known
    recipe.exchange author's PDS for `exchange.recipe.recipe`, with no auth header.
    Repeat for a `com.atproto.sync.*` read. Record status codes and whether records
    return.
  - **Success criteria:** Concrete answer per method (public vs auth-required), with
    the observed response, so cold-start reads can be designed correctly.
  - **Disposition:** `keep-as-fixture` (captured responses become read-path test
    fixtures in Phase 4).

- [x] **D3: Confirm the vanilla toolchain + test harness (framework already decided).**
  ✅ DONE 2026-07-07 — vanilla TS + esbuild + Vitest + Playwright all green incl.
  SW + IndexedDB e2e; baseline bundle 2,713 B (~1.3 KB gz); Playwright: **go**.
  Scaffold promoted in-repo, flagged SPIKE. See Verified Assumptions.
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

- [x] **D4: `exchange.recipe.recipe` field-level schema.** ✅ DONE 2026-07-07 —
  all four lexicons + canonical `lexicon.schema` record captured to
  `tests/fixtures/lexicons/`; field map + two spec-vs-practice discrepancies
  recorded (optional `langs` skew; ULID-not-TID rkeys). See Verified Assumptions.
  - **Probe:** Fetch the raw lexicon JSON from `recipe.exchange/lexicons/` (or the
    canonical `com.atproto.lexicon.schema` record) and record the exact field names,
    types, and required/optional status for `recipe`, plus `collection`.
  - **Success criteria:** A recorded field map sufficient to render (Phase 4) and
    construct (Phase 6) a valid record.
  - **Disposition:** `keep-as-fixture` (schema snapshot becomes a test fixture and
    the basis for the lexicon mirror in a later phase).

- [x] **D5: Where is the injectable session seam for auth-dependent wiring tests?**
  ✅ DONE 2026-07-07 — app-password `AtpAgent` ran the same appview read + full
  repo create/read/delete cycle (teardown verified) as the OAuth Agent. Port:
  "provide an `Agent`"; caveat list recorded. App-password minted
  (`arecipe-phase0-tests` → `.env`). See Verified Assumptions.
  *(Added by feasibility amendment. Motivation: Phases 4–8 wiring tests must not
  depend on Playwright driving bsky.social's login/consent pages — a third-party UI
  that can change, rate-limit, captcha, or demand email-2FA. The interactive OAuth
  flow is tested where it IS the feature (Phase 3, `@live` tier); everything
  downstream runs over a real-but-injectable session.)*
  - **Probe:** In the D1 sandbox, mint the scoped app-password and construct an
    `Agent` via `com.atproto.server.createSession`; run the same authenticated read
    (plus a scratch write + delete) through it that the OAuth Agent ran. Confirm the
    repo/blob-facing API surface is identical from the caller's side.
  - **Success criteria:** A named **session-provider port** shape (the interface the
    app codes against, returning an authenticated `Agent`) with two implementations
    proven equivalent for repo/blob calls: OAuth + DPoP (production) and app-password
    Bearer (test). Plus an explicit caveat list of where the two differ (DPoP nonce
    retries, token lifetimes, headers) so it is written down what the `@live` OAuth
    tier alone covers. Note: the app-password Agent is **not a mock** — it talks to
    the same real PDS; only the interactive consent hop is bypassed.
  - **Disposition:** `promote` — the port lands in Phase 3's auth module (TDD applies
    there); the test-tier split it implies lands in Phase 1's CI setup.

- [x] **D6: What does `verified` mean — how deep does client-side CID verification go?**
  ✅ DONE 2026-07-07 — Tier 2 recompute reproduces a real record's CID exactly;
  deps cost 38.5 KB min / 12.2 KB gz. **Decision: Tier 2 in Phase 4; Tier 3
  deferred as named hardening.** See Verified Assumptions.
  *(Added by feasibility amendment. Phase 4's headline claim — cache entries marked
  `verified` after "CID check" — is currently undefined: verify what, against what?)*
  - **Probe:** In browser JS, re-derive the CID of a known `exchange.recipe.recipe`
    record from its `getRecord` JSON (lex-JSON → canonical DAG-CBOR → sha-256 →
    CIDv1) and match the PDS-reported CID. Measure the bundle weight the encoding
    dependencies add (`@ipld/dag-cbor` + `multiformats`, or the relevant `@atproto/*`
    subset) — bundle size is a trust-surface concern for the vanilla stack.
  - **Success criteria:** A tier decision for Phase 4 with evidence. Tier 1 = store
    the PDS-reported CID without checking (rejected as the meaning of `verified` —
    it would make the flag dishonest). Tier 2 = recompute the CID from the received
    record (proves integrity of what we received and cached). Tier 3 =
    `com.atproto.sync.getRecord` CAR with MST proof + commit signature checked
    against the DID document key (proves the record is in the account's signed repo
    — the full credible-exit property). Default recommendation: Tier 2 in Phase 4,
    Tier 3 as a named later hardening item, unless the probe shows Tier 3 is cheap.
  - **Disposition:** `promote` — the recompute path becomes Phase 4's cache verify
    step (TDD applies in Phase 4).

**Done when:** All BLOCKING open questions resolved, Verified Assumptions updated
with firsthand evidence, D3 has produced a concrete toolchain choice, and any
phase whose shape a finding invalidates is updated here with a Review Log entry.

**Key property:** Phase 0 is the only phase allowed to restructure later phases.

---

### Phase 1: Project scaffold, CI, first wiring test — ✅ SHIPPED (2026-07-07, Phase 1 close-out commit)

**Delivered:** as specced, with three reconciliations: (a) the D3 spike's
IndexedDB-probe UI and its e2e test were removed from the app — harness
capability evidence lives in the Phase 0 record; the Phase 1 shell is title +
empty state as specced, and IndexedDB returns in Phase 3/4 where it's real;
(b) lint = ESLint + typescript-eslint (recommended, flat config) — the spec
named "lint" without a tool; (c) the production-quiet gate got its own e2e
test (no `[arecipe]` debug/info without the flag), strengthening the
observability contract beyond the spec's minimum. ~~CI green-on-push remains
unverified until the repo is pushed~~ **PROVEN 2026-07-07:** first push ran CI;
run 1 caught a real defect (@live specs read `.env` at module load — Playwright
loads excluded specs to list tests); after the tolerant-read fix, `test:
success` on run 2. A Pages deploy job was added at the M1 checkpoint (blocked
on repo visibility — private repos need a paid plan for Pages).

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
- [ ] CI workflow running lint + typecheck + the **hermetic tiers** on push:
  `test:unit` (Vitest) and `test:e2e` (Playwright against the built bundle;
  network stubbed via Playwright route fixtures where a phase's journey would
  otherwise need the live PDS; no credentials). A separate **`test:live` tier**
  (real-PDS suites, Phase 2's live-resolution variant and everything from Phase 3
  onward that needs the out-of-band credential) is explicitly **not** in push CI:
  it runs locally as each phase's gate, and later on a manual/nightly trigger.
  Without this split, push CI goes permanently red the day Phase 3 lands — the
  interactive OAuth login cannot be hermetic (see D5's motivation).
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
**Shared-state contract:** No shared mutable state beyond the file write-set.
Playwright's web server binds one ephemeral localhost port per run to serve the
built bundle (released on teardown; corrected by the feasibility amendment — the
earlier "CI binds no local ports" claim was wrong, e2e cannot serve a bundle
portlessly); nothing else binds ports; tests use ephemeral Playwright browser
contexts.
**Diagnostic logging:** This phase *builds* the logger (`src/log.ts`). Verify a
service-worker registration/update event is logged at `info` (the SW update flow is
a flagged risky boundary; make it observable from the first phase that can register
one).
**Risks:** Playwright + service-worker interaction can be fiddly; confirm in D3 so
this phase doesn't discover it late.
**Done when:**
1. **Behavioral:** `npm run build` produces a static bundle that renders the shell
   in a browser; `npm test` runs unit + e2e and passes.
2. **Verification:** `npm test` (hermetic tiers) green in CI on push.
**Validation:** Moderate — run the built bundle in a real browser, confirm the
shell renders outside the test harness.

---

### Phase 2: Identity resolution (handle → DID → PDS) — ✅ SHIPPED (2026-07-07, Phase 2 close-out commit)

**Delivered:** as specced. Resolver goes through the configurable
handle-resolver service (default `public.api.bsky.app`) per the feasibility
amendment; did:plc via plc.directory + did:web via well-known both covered in
unit fixtures (did:web fixture is synthetic-by-shape — no convenient live
did:web atproto account; noted in the fixtures' PROBE-NOTES). Wiring e2e runs
hermetic via Playwright route fixtures; live validation done in real Chrome
against the real network, cross-checked with an independent well-known curl.
Also this phase: tests gained their own tsconfig (`tsconfig.tests.json`,
node types) so the browser app's config stays node-free.

**Goal:** Resolve a handle to a DID and a PDS endpoint + keys, the precondition for
any auth or read.

**Changes:**
- [ ] `src/identity/resolve.ts` — handle → DID **via a configured handle-resolver
  service** (XRPC `com.atproto.identity.resolveHandle` against a public
  entryway/AppView, default `https://public.api.bsky.app`, or a DNS-over-HTTPS
  resolver) — corrected by the feasibility amendment: browsers cannot read DNS TXT,
  and cross-origin `.well-known/atproto-did` fetches are CORS-blocked for most
  handle domains (see Verified Assumptions). Then DID → DID document
  (`plc.directory` serves CORS; `did:web` fetched best-effort) → PDS endpoint +
  public keys. The resolver is a deliberate, recorded third-party dependency — make
  it configurable so it isn't a hard coupling to Bluesky infrastructure (a
  durability-story point, not just a style one).
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

### Phase 3: OAuth login (read scope) + default session persistence — ✅ SHIPPED (2026-07-07, Phase 3 close-out commit)

**Delivered:** as amended (session-provider port instead of a hand-rolled
session store — the library owns persistence, confirmed live). Unit layer:
loopback-metadata behaviors (D1 scope lesson pinned as tests) + provider
contract (restore/signIn/signOut) over an injected client port. Wiring:
`@live` Playwright test performs a REAL OAuth login (automated consent walk
with the leak-safe fill discipline) and proves persistence across a reload —
passed in 5.1 s. The `@live` tier itself landed this phase
(`npm run test:live`, `LIVE=1` grep split in playwright.config; hermetic CI
excludes it). Validation (Broad): real-PDS login + reload-resume via @live;
refresh-cycle resumption verified firsthand in D1 same-day (same library,
PDS, account — forced refresh ×2); silent-reauth on expiry is N/A for
loopback clients (silent sign-in disallowed — documented; the restore-failure
path logs at error and falls back to the sign-in form). **Bundle observation
flagged for M1:** `@atproto/api` + oauth client take `main.js` from 2.7 KB to
869 KB minified / 174 KB gzip; minify added to the build; tree-shaking or a
slimmer XRPC client is an M1-checkpoint agenda item (trust-surface concern).

**Goal:** A user signs in via atproto OAuth and the session persists across app
opens (default path: plaintext refresh token + OS device lock).

**Changes:**
- [ ] `src/auth/oauth-client.ts` — `BrowserOAuthClient` setup using the **loopback
  client** (localhost `clientId` per atproto's loopback exception) + handleResolver;
  login initiation, callback handling, `oauthSession` → `Agent`. Hosted
  client-metadata is deferred to M3; do not block local TDD on it.
  D1-bound specifics: request scope explicitly via the loopback client_id
  (`?scope=atproto+transition:generic` → `atprotoLoopbackClientMetadata`) — the
  bare default `atproto` scope cannot call appview RPCs; v0.4.6 exposes **no
  event API** for session invalidation (handle the `restore`/`init` failure
  path instead, and re-check the API surface if the package is upgraded).
- [ ] `src/auth/session-provider.ts` — rescoped by the feasibility amendment (was
  `session-store.ts` rebuilding persistence): `BrowserOAuthClient` already persists
  sessions and restores them via `init()` (Verified Assumptions), so this module is
  the **D5 session-provider port** instead — the interface the app consumes an
  authenticated `Agent` through, with the OAuth implementation wrapping the
  library's own store/restore (DPoP key stays `extractable: false`; encrypted
  refresh-token opt-in remains a later item) and the app-password implementation
  living in test support. This is the seam that keeps Phases 4–8 wiring tests off
  the third-party consent screen. Do not rebuild what the library persists.
- [ ] `tests/auth/*.spec.ts` — session-provider round-trip unit tests (save/restore
  through the port over the library store); Playwright login-and-resume e2e against
  the test account.

**Call chain:** Shell "sign in" → `oauthClient.signIn(handle)` → redirect →
callback → session persisted (library store, behind the provider port) → app shows
signed-in state; reopen → `sessionProvider` restores via `client.init()` →
signed-in without re-login.
**Wiring test:** Playwright completes login, reloads the page, and asserts the app
is still signed in (proves persistence is wired to the entry point).
**Depends on:** Phase 2, Phase 0 (D1).
**Read-set:** `src/identity/resolve.ts`, `src/main.*`, D1 findings.
**Write-set:** `src/auth/oauth-client.ts`, `src/auth/session-provider.ts`,
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
return path explicitly; D1 should have surfaced the shape. Auth-server token
endpoints are per-account rate-limited — `@live` runs reuse cached sessions rather
than performing a fresh interactive login per test, or repeated runs will hit caps.
**Done when:**
1. **Behavioral:** A user logs in with a handle and stays logged in across a reload
   (within the loopback token lifetime — ~1 day for loopback clients per Verified
   Assumptions; long-lived persistence is validated at M3 once the hosted client
   exists).
2. **Verification:** Playwright login-and-resume test green (**`@live` tier** — this
   phase's wiring test drives the real bsky.social login/consent pages because the
   interactive OAuth flow *is* the feature under test here; it runs locally as the
   phase gate, not in push CI); session-provider unit tests green (hermetic).
**Validation:** Broad — run against a real PDS, confirm a refresh cycle resumes
the session (not just initial login), check for silent-reauth on expiry.

---

### Phase 3b: Cross-tab session coordination — ✅ SHIPPED (2026-07-07, collapsed to regression test; Phase 3b close-out commit)

**Delivered:** the verify-then-build probe answered BUILD NOTHING —
`tab-coordination.ts` was not written. Source verification
(oauth-client-browser 0.4.6): refresh is serialized cross-tab via
`navigator.locks.request(..., {mode:'exclusive'})`
(`browser-runtime-implementation.js:5-10`), tabs sync via a
`BroadcastChannel` synchronization channel (`browser-oauth-client.js:11`),
and session-getter carries an invalid_grant recovery path for lockless
runtimes. Building the planned module would have duplicated the library.
What shipped instead: `SessionProvider.forceRefresh()` (TDD — a real
debug/diagnostic API, exposed on the console under the debug flag) and the
two-tab `@live` regression test: login, second tab restores from the shared
store, forced refresh rotates the single-use token, BOTH tabs remain
authenticated across reloads (passed 4.6 s). The test pins the library
behavior so an upgrade that loses coordination fails loudly. Validation:
the two-tab scenario runs as real same-profile tabs against the real PDS —
the exact hazard scenario, automated. Discovery note for later phases: the
`?debug=1` URL flag does not survive the OAuth redirect round-trip; use the
localStorage flag around auth flows.

**Goal:** Two open tabs do not kill each other's session racing to refresh the
single-use token.

**Changes:**
- [ ] **Verify-then-build** (added by the feasibility amendment): first, a two-tab
  Playwright probe of `BrowserOAuthClient`'s native behavior (two tabs open, force
  a refresh) — the README documents no multi-tab coordination, but absence of docs
  is not absence of behavior, and D1 should already have recorded the answer. Build
  the module below only for what the probe shows is missing; if the library already
  coordinates, this phase collapses to the two-tab regression test.
- [ ] `src/auth/tab-coordination.ts` — leader election via `navigator.locks`;
  leader refreshes; broadcast new access token via `BroadcastChannel`.
- [ ] `tests/auth/tab-coordination.spec.ts` — Playwright with two contexts/tabs
  asserting only one refresh occurs and both stay live.

**Call chain:** App open → acquire lock → if leader, own refresh → broadcast →
followers update in-memory token.
**Wiring test:** Two-tab Playwright test: force a refresh, assert both tabs remain
authenticated and exactly one refresh call was made.
**Depends on:** Phase 3.
**Read-set:** `src/auth/oauth-client.ts`, `src/auth/session-provider.ts`.
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

### Phase 4: Read + render `exchange.recipe.recipe` with verified cache — ✅ SHIPPED (2026-07-07; 4a `e10901e`, 4b in the Phase 4b close-out commit) — **M1 REACHED**

**Delivered (4b):** `src/recipes/view.ts` renders cached recipes as an
unstyled expandable list (deliberately — structure/UI/UX decisions belong to
the M1 checkpoint): title + verified/unverified badge (both sides asserted —
mutation resistance), description, ingredients, instructions. Unit layer runs
under happy-dom. Wiring e2e: fixture titles render through the full
resolve→read→cache→render chain. **Broad validation (interop, both halves):**
(a) live in real Chrome — `rdur.dev`'s three real recipes render with
✓ verified badges from the live PDS; (b) the same record
(`.../01JQJ5RW51ZVEW72XN6GSRWC8D`) confirmed rendering on recipe.exchange
(HTTP 200, title present ×4) — a recipe is readable identically through both
consumers with zero coordination. Gotcha: happy-dom's URL global is not a
node file: URL — fixture reads in DOM-environment specs use cwd-relative
paths.

**Delivered (4a):** executed as the plan's anticipated split (4a read+cache,
4b RecipeView). `src/recipes/read.ts` (public listRecords, open-world
boundary validation — unknown fields preserved, missing required fields fail
loud naming field+uri) and `src/recipes/cache.ts` (IndexedDB keyed by AT-URI,
**Tier 2 CID recompute** per D6 — `verified` never set by trusting the PDS;
mismatch stored `verified:false` + warn). Wiring: resolve → Load recipes →
"N recipes cached (M verified)" in the shell; hermetic e2e over D2 fixtures
(all 3 real records verify in-browser). Live validation: real author
(`rdur.dev`) → real PDS → "3 recipes cached (3 verified)", zero warn/error.
Discovery: the spike SW's passthrough fetch handler routed page requests
through the SW and **bypassed Playwright route interception** — removed (no
fetch handler until a real caching SW lands; hermetic-fixture strategy must
be revisited alongside M1-offline/Phase 11 SW work). Unit cache tests use
fake-indexeddb. **4b (RecipeView render + recipe.exchange interop
comparison + M1 exit) is the remaining half.**

**Goal:** Cold-start fetch and render real recipe records, cached in IndexedDB with
CID verification (the credible-exit proof made visible).

**Changes:**
- [ ] `src/recipes/read.ts` — `listRecords`/`getRecord` against an author's PDS
  (public path per D2), returning typed records validated against the D4 schema.
- [ ] `src/recipes/cache.ts` — IndexedDB store keyed by AT-URI, tagging each record
  with CID + a `verified` boolean. Verification depth per the **D6 tier decision**
  (default Tier 2: recompute the CID from the received record); `verified` is never
  set by merely trusting the PDS-reported CID — that would make the flag, and the
  credible-exit story it fronts, dishonest.
- [ ] `src/recipes/RecipeView.*` + `tests/recipes/*.spec.ts` — render a recipe;
  unit tests over D2/D4 fixtures; Playwright render-from-real-PDS e2e.

**Call chain:** Signed-in shell → `readRecipes(did)` → `cache.put` → `RecipeView`
renders the list.
**Wiring test:** Playwright loads a known author's recipes over an injected test
session (app-password through the D5 session-provider port — real PDS, no consent
screen) and asserts a real recipe title from recipe.exchange renders on screen.
The full OAuth-login variant of this journey lives in the `@live` tier.
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
loud on unexpected shape (per coding guidance: no silent fallback). **Fail-loud
calibration (feasibility amendment):** atproto is an open-world data model —
unknown/extra fields are normal, must be tolerated, and must be preserved
round-trip; fail loud only on missing or mistyped *required* fields per the D4
schema. Failing on unknown fields would break against every future lexicon
addition by recipe.exchange.
**Done when:**
1. **Behavioral:** A recipe authored on recipe.exchange renders in arecipe, and its
   cache entry is marked `verified` after CID check.
2. **Verification:** Playwright render-from-real-PDS test green; cache CID-verify
   unit test green.
**Validation:** Broad — confirm the same record renders identically on
recipe.exchange (the interop claim; recipe.exchange indexes via the firehose, so
allow for indexing lag — this comparison stays manual/generously-timed and never
becomes a tight automated poll), and that a CID mismatch marks `verified:false`.
**Milestone (M1) exit:** this phase closes the walking-skeleton slice. Before starting
M2, hold the structure/UI/UX check-in: demo the sign-in→render slice, review
`github.com/chasemp/mealplanner` + `mealplanner.523.life` for patterns to adopt/avoid,
and record UI/UX directional decisions (a fresh phase-plan pass may spin out of this).

---

### Phase 5: Two-device same-user read (milestone gate) — ✅ SHIPPED (2026-07-07, Phase 5 close-out commit) — **M2 REACHED**

**Delivered:** as specced — no new production code; the phase is the
milestone-level wiring test. `tests/e2e/two-device-read.spec.ts` (@live):
two independent browser contexts (separate IndexedDB, separate DPoP keys),
two full interactive OAuth logins for the same account, both render the
identical recipe set; device 1's forced refresh (single-use token rotation)
leaves device 2's session untouched, both survive reloads — the D1-flagged
independent-refresh risk is pinned. Passed in 10.3 s. The three @live specs'
copy-pasted auth walk was extracted to `tests/e2e/helpers/live.ts` (the
"small fixes" allowance). **Broad validation:** the same account on two
genuinely different engines — real Google Chrome and Firefox — logged in
independently and rendered the same 3 recipes (SAME DID / SAME RECIPES
confirmed). Physical two-device demo remains the first M3 exit item per the
feasibility amendment (loopback client unreachable from a second machine).

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
**Validation:** Broad — automated: two isolated browser contexts (distinct DPoP
keys / IndexedDB). Manual: two different real browsers on the dev machine.
**Recalibrated by the feasibility amendment:** a genuine two-physical-device run is
**deferred to M3** — the loopback OAuth client is unreachable from a second device,
and the hosted client-metadata document that unlocks a deployable origin is a
locked M3 item. M2's milestone claim is satisfied by two-context + two-browser
evidence; the physical two-device demo is the first item of the M3 exit.

---

### Phase 5b: Page-per-destination restructure + nav shell — ✅ SHIPPED (2026-07-07, Phase 5b close-out commit)

**Delivered:** as specced. Four documents (index/mine/settings/account) with
`src/pages/*` entries, shared `src/nav.ts` (wordmark-home link, gear, tab
links with pathname-derived active state) + `src/auth/boot.ts` (shared
session bootstrap for auth pages) + `src/sw-register.ts`; `main.ts` retired.
**Bundle split delivered the budget win: browse.js 916 KB → 44 KB
(15 KB gz), −98% on the landing page**; auth weight isolated to mine/account
(879 KB each); settings 5 KB; per-page sizes now in build-info.json and the
settings page. Native back verified (real Chrome: / → mine.html → back → /);
bottom tab bar on mobile confirmed by screenshot; OAuth callback round-trips
to /mine.html exactly as the loopback metadata derivation predicted (@live
3/3). Bundle-split enforced by e2e (browse.js contains no oauth, <200 KB).

*(Original spec below.)*

**Goal:** Restructure the SPA into separate documents per destination
(blockdoku pattern, user-DECIDED): `index.html` (Browse), `mine.html`
(My recipes + sign-in), `settings.html` (App management + About),
`account.html` (domain settings). Shared top bar (wordmark = home link,
theme-toggle slot, settings gear) + primary destinations as a **bottom tab
bar on mobile**, top tabs on wide screens. Native back button everywhere.
Free code-splitting: **the Browse page ships zero auth code.**

**Changes:**
- [ ] `scripts/build.mjs` → multi-entry (`src/pages/browse.ts`, `mine.ts`,
  `settings.ts`, `account.ts`; one HTML file each at root, copied to dist).
  `main.ts` retires; shared modules stay put.
- [ ] `src/nav.ts` — top bar + tab bar components (plain links; active state
  from `location.pathname`); responsive placement in `styles.css`
  (bottom ≤ 40rem).
- [ ] `src/pages/browse.ts` — the current find-flow, minus every auth import.
- [ ] `src/pages/mine.ts` — sign-in form + signed-in state + empty-state
  (authoring arrives Phase 6). OAuth callback returns here:
  `buildLoopbackMetadata` already derives redirect_uri from
  `location.pathname`, so initiating sign-in on `/mine.html` round-trips
  back to `/mine.html`.
- [ ] `src/pages/settings.ts` — App management v1: build stamp details
  (version/sizes/builtAt from build-info.json), the integrity explainer
  (the "fingerprint matches" teaching text lives here permanently), About +
  source link. Update-check button arrives with Phase 8b.
- [ ] `src/pages/account.ts` — sign-out + session facts (did/handle);
  placeholder-free: only what exists.
- [ ] e2e: tab tests become navigation tests; existing browse testids keep
  their meaning.

**Call chain:** any page → nav link → destination document → its page module
mounts.
**Wiring test:** Playwright: from Browse, tap "My recipes" → `mine.html`
loads with its panel; **browser back returns to Browse (native)**; the
Browse find-flow still passes unchanged. Plus a bundle assertion: the built
browse bundle contains no `oauth` module (metafile or string check).
**Depends on:** Phase 5.
**Write-set:** `index.html`, `mine.html`, `settings.html`, `account.html`,
`src/pages/*`, `src/nav.ts`, `styles.css`, `scripts/build.mjs`,
`tests/e2e/*`, removal of `src/main.ts`.
**Shared-state contract:** No shared mutable state beyond files; e2e binds
the one ephemeral serve port.
**Diagnostic logging:** each page logs `shell mounted {page}` at debug;
sign-in flow logging unchanged.
**Risks:** OAuth callback lands on `/mine.html` — verify with the @live
login test (update its start page); per-page relative paths for
`build-info.json`/`sw.js` (all pages live at root, so `./` works).
**Done when:**
1. **Behavioral:** four documents served; nav + native back work; sign-in
   works from `mine.html` (@live); Browse loads visibly less JS.
2. **Verification:** full hermetic gate + `test:live` green; per-page bundle
   sizes recorded in the build stamp/README.
**Validation:** Moderate+ — real-browser click-through (incl. back gesture),
per-page bundle split measured and recorded.

---

### Phase 5c: Theming — native light/dark — ✅ SHIPPED (2026-07-07, Phase 5c close-out commit)

**Delivered:** as specced. `src/theme.ts` (cycle/resolve pure + unit-tested;
toggle in the top bar showing the current mode glyph; localStorage persist;
auto follows live `prefers-color-scheme` changes; storage access defensive —
Safari private mode degrades to auto instead of crashing); pre-paint inline
script in each document head (no theme flash); dark enamelware palette as
`[data-theme='dark']` token overrides (table in DESIGN.md), incl. the
tokenized `--stamp-veil` so the ALTERED? stamp stays loud in dark (verified
by doctored-fixture screenshot). Wiring e2e: auto follows emulated color
scheme; toggle cycles to dark, changes rendered colors, persists across
reload and across documents.

*(Original spec below.)*

**Goal:** `prefers-color-scheme` respected by default; one-tap override in
the top bar (auto → light → dark, persisted in localStorage); a designed
dark enamelware palette (deep green-black tile, enamel/yolk/rust re-tuned
for contrast floors).
**Changes:**
- [ ] `styles.css` — dark token set under `[data-theme='dark']` + media
  query for auto; palette documented in `docs/DESIGN.md` (same table format).
- [ ] `src/theme.ts` — pure cycle/resolve logic (unit-tested) + applier;
  toggle button in `src/nav.ts` top bar.
**Wiring test:** e2e: tap the toggle → `html[data-theme]` flips and the
rendered background color changes; the choice survives a reload.
**Depends on:** Phase 5b (top bar exists).
**Write-set:** `styles.css`, `src/theme.ts`, `src/nav.ts`,
`docs/DESIGN.md`, tests.
**Diagnostic logging:** theme changes at debug.
**Risks:** dark-mode contrast (rust/yolk on dark tile) — hold the DESIGN.md
floors; ALTERED? stamp must stay loud in dark.
**Done when:** toggle + auto detection work and persist; dark palette passes
the contrast floors. **Validation:** Moderate — screenshots of both themes
reviewed (incl. the tampered-state stamp in dark).

---

### Phase 5d: Recipe detail as a real page — ✅ SHIPPED (2026-07-07, Phase 5d close-out commit)

**Delivered:** as specced. Cards are links; `recipe.html?u=<at-uri>[&by=]` is
a real shareable document (document.title = recipe name); cache-first with
the cold-link path fetching DID doc → PDS → getRecord → Tier 2 verify →
cache (author handle recovered from the DID doc's `alsoKnownAs` when no
`by` param). Browse persists the last search in sessionStorage and restores
results from cache on load — native back from a recipe returns to the
results (validated: 3 cards restored). Cold link validated in a brand-new
browser context: rendered with "as published by rdur.dev · fingerprint
matches · Mar 2025". ALTERED? stamp + warning render on both card and
detail (unit-covered). Banner-cap defect caught in the screenshot pass and
fixed (detail banners 16rem).

*(Original spec below.)*

**Goal:** Cards stop expanding in place ("still like modals" — maintainer) and
link to `recipe.html?u=<at-uri>`: a real document with a shareable URL,
native back, and the page shape Phase 12's public `/recipes/{did}/{rkey}`
prerender will reuse. Cold links work: a recipient with no cache gets the
recipe fetched, Tier 2-verified, and rendered.

**Changes:**
- [ ] `recipe.html` + `src/pages/recipe.ts` — parse `?u=` (+ optional
  `&by=<handle>`); cache-first, network fallback (at-uri → DID doc via
  plc.directory → pds → getRecord → cache.put w/ verify); document.title set
  to the recipe name; back affordance.
- [ ] `src/recipes/read.ts` — `readRecord` (single getRecord, same open-world
  validation, fail loud).
- [ ] `src/recipes/view.ts` — split: `renderRecipeList` = link-cards only;
  `renderRecipeDetail` = banner photo, title, chips, lede, ingredients-first
  columns, provenance line / ALTERED warning.
- [ ] `src/pages/browse.ts` — persist the last search (sessionStorage) and
  re-render from cache on load, so native back from a recipe returns to the
  results instead of an empty page.
**Wiring test:** browse → find → click a card → recipe.html renders title +
ingredients → native back returns to browse **with the results still
showing**. Cold-link test: direct goto `recipe.html?u=…` over route fixtures
renders with the provenance line (no prior cache).
**Write-set:** `recipe.html`, `src/pages/recipe.ts`, `src/pages/browse.ts`,
`src/recipes/read.ts`, `src/recipes/view.ts`, `scripts/build.mjs`, tests.
**Diagnostic logging:** cold-path fetch steps at debug; verify outcome as in
Phase 4a.
**Risks:** back-from-detail UX (addressed via the sessionStorage restore);
provenance author on cold links (DID doc `alsoKnownAs` → handle, did-string
fallback).
**Done when:** a recipe URL is shareable (works cold), back preserves the
browse results, ALTERED renders on the detail page too.
**Validation:** Moderate — real-browser click-through incl. a cold link in a
fresh profile.

---

### Phase 5e: Starter packs, lite — ✅ SHIPPED (2026-07-07, Phase 5e close-out commit)

**Delivered:** as specced, plus the **official application account**:
the maintainer created `arecipe.bsky.social`
(`did:plc:spfl4xaktvvchr2cqp2r2xvp`) as a general data store on its PDS —
the early form of the spec's application account (lexicon mirror / canary /
Phase 11 keys land there later). It is starter-pack member #1 (contributes
zero cards until seeded — the feed loader tolerates empty authors by
design). Live validation: **72 starter-pack recipes (72 verified)** on a
zero-input first load from three real authors, incl. 37 from a self-hosted
PDS. Settings section with per-author toggles + Bluesky profile links;
provenance author on the detail page links out too. Seeding script
(`spike/seed-greek-salad.mjs`, non-production ops tooling) prepared for the
first official recipe: Greek Cucumber Tomato Feta Salad with
`attributionWebsite` credit to Erin Lives Whole (source URL verified; our
own description text; field formats copied from observed wild records —
plain-word category, token-ref `cookingMethodNoCook`). **SEEDED 2026-07-07:**
`at://did:plc:spfl4xaktvvchr2cqp2r2xvp/exchange.recipe.recipe/3mq3m2skev52f`
(TID rkey PDS-minted, per the Phase 6 decision). Cold-loaded live:
Tier 2 verified ("fingerprint matches · Jul 2026"), and the feed rose to
**73 starter-pack recipes (73 verified)**. **Attribution rendering added**
(TDD, user-prompted): the detail page shows off-network credit from the
lexicon's attribution union — linked name for `attributionWebsite`,
name-only for `attributionPerson`, nothing for `attributionOriginal`;
notes carried in the title attr. The wild fixtures' credits (e.g.
lizasfarmhouse.com) now render too. recipe.exchange indexing: not yet
visible minutes after publish (firehose lag, per the eventual-consistency
note) — recheck later; the PDS record itself is instantly public.
No photo on the seeded record by design — the source photo isn't ours.

*(Original spec below.)*

**Goal:** Browse shows content by default: a curated, toggleable set of
starter authors (settings section, all on by default — user asked for
rdur.dev + at least 2 more with real content). Client-side-only for now;
this is the lite forerunner of the `app.arecipe.starterpack` record idea
(parked at Phase 9) — if it earns its keep, it graduates to published
records.

**Curated set (probed live 2026-07-07):** `rdur.dev` (3 recipes),
`recipe.exchange` (32 — the lexicon maintainer's own account), `daffl.xyz`
(37 — on a self-hosted PDS, a live credible-exit demonstration in the
default feed).

**Changes:**
- [ ] `src/recipes/starter.ts` — the curated list (handle + did baked; PDS
  resolved fresh from plc.directory) + prefs (injectable storage, defensive;
  default all-enabled) + the multi-author feed loader (per-author failure
  logged + surfaced in the status, not page-fatal — a multi-source feed
  degrades, it doesn't blank).
- [ ] `settings.html` — "Starter pack" section: per-author checkbox row,
  the **name links to the Bluesky profile**
  (`https://bsky.app/profile/<handle>`), toggles persist immediately.
- [ ] `src/pages/browse.ts` — no last-search? Load the enabled starter
  authors' recipes (cache-first semantics via cache.put) and render the
  merged grid; per-card `by=` from an authors-by-did map.
- [ ] `src/recipes/view.ts` — `RenderOptions.authorsByDid` for mixed-author
  grids; the detail provenance author name links to the Bluesky profile.
**Wiring test:** fresh Browse (no search) renders starter cards from routed
fixtures; unchecking an author in settings removes their cards from Browse.
Settings rows carry the profile links and persist across reload.
**Write-set:** `src/recipes/starter.ts`, `src/pages/browse.ts`,
`src/pages/settings.ts`, `src/recipes/view.ts`, tests.
**Done when:** a first-time visitor sees recipes with zero input; the pack
is user-editable in settings; author names link out to Bluesky profiles.
**Validation:** Moderate — live load of all three real authors (72 records)
+ screenshot.

---

### Phase 5f: Exclusions, lite — ✅ SHIPPED (2026-07-07, with the Phase 6 batch)

**User-requested** on finding junk in the default feed (daffl.xyz "Test
Recipe": "Love" / "Do the things"). The client-side forerunner of
`app.arecipe.mute.recipe` (spec Layer 8 → Phase 10), using the overlay model
the real mute system will need: **a curated hidden-by-default baseline the
user can override in either direction** (that junk URI is baked entry #1).
Hide/unhide button on the recipe detail page; feeds and search filter hidden
URIs with a quiet "· N hidden" status note; Settings § Hidden recipes lists
everything hidden with unhide. TDD (RED observed): baseline hides out of the
box; hide persists; unhiding a baked default works; broken storage degrades
to the baseline. When Phase 10 arrives, this local list is the seed for
published mute records.

---

### Phase 6: Recipe authoring (create/edit) → visible on recipe.exchange — ✅ SHIPPED (2026-07-07, Phase 6 close-out commit)

**Delivered:** the MLP's core. `editor.html` (name/description/ingredients/
instructions one-per-line/prep/total/servings), **draft-before-publish**:
Save draft is local IndexedDB, works signed-out, URL names the draft so
reload resumes it; Publish is the explicit act needing a session
(disabled with a plain note otherwise), builds a lexicon-floor-validated
record (fail loud naming the field; minutes→ISO durations, TDD) and
`createRecord`s to the signed-in account's PDS (TID rkey PDS-minted).
`mine.html` gained New recipe, a Drafts list (open/delete), and Published —
the account's own recipes via the public read path. Shared
`src/identity/did.ts` extracted (recipe/starter/mine all resolve DID docs
through it). Brand-mark placeholder replaced the emoji for photo-less cards
(user request). **@live write-path wiring test passed (5.6 s):** sign in →
author → Publish → real PDS → appears in Published; cleanup is crash-safe
and HARD-GUARDED to the test account's DID (marker-named records, pre-run
purge + teardown). **Race bug found by the milestone regression:** the slow
async starter feed clobbered a faster user search — reproduced hermetically
(RED), fixed with a render-generation guard, regression test kept.
recipe.exchange visibility of published records still rides the indexing
lag (the maintainer signed the official account up on the site, which
should register it; recheck later). Process note: the unit layer was
strictly RED-first; the editor's hermetic e2e were authored alongside the
page rather than observed-RED — the @live wiring test and race regression
were observed failing before their fixes.

*(Original spec below.)*

**Goal:** Write a valid `exchange.recipe.recipe` to the user's PDS and confirm it
appears on recipe.exchange with no coordination (the write half of credible exit).
**M1-checkpoint addition (2026-07-07): draft-before-publish.** Authoring saves
locally first (IndexedDB draft) and publishes to the PDS only on explicit user
action — "build a recipe and save it without publishing it yet." Phase 8's
PDS-synced drafts (eviction survival, accepted-public) layer on top of this
local-first flow, they don't replace it. Ingredients stay free-text lines per
the lexicon (`string[]`, no structure — verified against the D4 capture at the
M1 checkpoint).
**Re-plan update (2026-07-07):** the editor is its own document
(`editor.html` + `src/pages/editor.ts`) per the page-per-destination
architecture, reached from `mine.html` ("New recipe" / edit links with the
rkey in the query string). Write-set becomes `editor.html`,
`src/pages/editor.ts`, `src/recipes/write.ts`, `src/recipes/drafts-local.ts`
(the local-first draft store), tests. The wiring test starts at
`mine.html` → New recipe → author → **Save draft** (survives reload without
publishing, nothing on the PDS) → **Publish** → record on the PDS → appears
in the user's own list. Publishing uses the session-provider Agent; the
`@live` variant covers OAuth, the hermetic variant runs over route fixtures
with an injected app-password-style fake at the port seam only if
unavoidable — prefer @live for the write path per the original spec.

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
**Crash-safe cleanup (feasibility amendment):** teardown alone doesn't run when a
test dies, so orphans accumulate on `@ngvalidation2112` and pollute later read
assertions. Two mechanisms, both required: (a) every test-created record carries a
per-run rkey prefix, and (b) each `@live` run *starts* with a pre-run purge
(`listRecords` + delete over the test collections in the test repo). Applies to
Phases 6–8.
**Risks:** Writing to a real repo in tests. Isolate to a throwaway test account and
delete records after. Never run write tests against a personal account.
**Rkey format (D4 finding, sharpened by D5):** the lexicon declares `key: tid`
but real recipe.exchange records use 26-char ULIDs — PDSs don't enforce the
declared key type. D5 observed that `createRecord` without an explicit rkey
auto-generates a spec-conformant TID — so the path of least resistance (omit
the rkey) also matches the lexicon. Default: let the PDS mint TIDs; revisit
only if ULID sort-compat with recipe.exchange turns out to matter.
**Done when:**
1. **Behavioral:** A recipe authored in arecipe is retrievable from the PDS and
   renders on recipe.exchange.
2. **Verification:** Playwright author-then-read-back test green; a documented check
   confirms recipe.exchange visibility.
**Validation:** Broad — verify on recipe.exchange in a browser; confirm the written
record's CID and fields match what was authored.

---

### Phase 7: Blob (image) handling — ✅ SHIPPED (2026-07-07, Phase 7 close-out commit)

**Delivered, with one lexicon reconciliation:** the spec'd "full + thumb,
embed both CIDs" doesn't exist in the lexicon — `#imagesEmbed` is up to 4
images of **one blob each** (`{alt, image, aspectRatio}`); display
thumbnails are the CDN's job. So: editor gains an optional photo (preview +
fail-loud type/size validation, 20 MB input cap); on Publish the image is
**decoded → downscaled (≤2048 edge) → canvas re-encoded** — which strips
EXIF by construction, full-size path included (the D2 GPS finding) — then
`uploadBlob`'d and embedded with its aspect ratio, record committed
immediately after (the blob-retention window). Pure logic TDD'd (fitWithin,
input validation); the **@live publish test now attaches an EXIF-bearing
fixture JPEG (built with an injected GPS APP1 segment) and verifies the
blob fetched back from the real PDS contains no Exif marker** — the
privacy claim proven on actual uploaded bytes. Broken photo fetches (fresh
blobs not yet on the CDN, host down) degrade to the brand placeholder,
never a broken-image glyph (unit-tested). The thumbnail-cache item from the
original spec is superseded by CDN + HTTP caching; revisit at 8b offline.

*(Original spec below.)*

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
**Risks:** Blob size/caps; enforce a client cap and fail loud past it. A PDS only
retains an uploaded blob once a record references it (unreferenced blobs are
garbage-collected) — commit the record embedding the returned blob ref promptly
after `uploadBlob`, and treat upload-then-crash as self-cleaning, not a leak.
**Privacy (D2 finding):** a real recipe.exchange blob in the wild was a ~1 MB
iPhone photo with intact GPS EXIF. The canvas-thumbnail path strips EXIF as a
side effect; ensure the FULL-SIZE upload path strips EXIF too (re-encode via
canvas or explicit strip) — location data in a public recipe photo is a footgun.
**Done when:**
1. **Behavioral:** An authored recipe carries a working photo that renders.
2. **Verification:** Playwright upload-and-render test green.
**Validation:** Broad — `uploadBlob` is a real external mutation against the test
account's PDS (same risk tier as the Phase 6 write path, which is Broad). Confirm
the blob fetches from a second session/device, verify the embedded CID matches the
uploaded bytes, and confirm teardown removes the blob so it does not leak into later
runs.

---

### Phase 8: Drafts (two-tier) + recipe versioning — ✅ SHIPPED (2026-07-08, Phase 8 close-out commit)

**Delivered, with two reconciliations.** (1) The spec's versioning test
assumed *editing* existed, but Phase 6 shipped create-only — so Phase 8
delivered **edit** (`editor.html?edit=<uri>`: public-read prefill,
`putRecord` same-rkey update preserving `createdAt`, "Edit:" rows under
Published) as versioning's prerequisite. (2) With no referencing records
until Phase 9, the honest strongRef consumer today is **the cache**: a
cached detail view pins its CID; a background revision check (retry-once,
warn on final failure) offers "updated since you last viewed · Show latest"
— both edges tested (same CID stays quiet). `refs.ts` strongRef helpers
ship for Phase 9's comments/interactions. **Drafts:** `app.arecipe.draft`
records (public — editor disclosure line shipped per the accepted
decision), rkey = local draft id so re-saves overwrite; Save-draft backs up
when signed in; My recipes imports PDS drafts missing locally (eviction
recovery); publish removes both copies. `navigator.storage.persist()`
requested + logged, never asserted. **@live journey (9.3 s):** draft
synced → IndexedDB wiped → recovered from PDS → published → edited on
device A → device B's stale cache noticed v2 and refreshed. Guarded purge
extended to `app.arecipe.draft`. One flake investigated en route: the
revision check swallowed transient errors at debug — hardened to
retry-once + warn. `docs/PRACTICES.md` started this phase (user request):
the peadoubleueh-successor practices doc, 11 proven patterns.

*(Original spec below.)*

### Phase 8 (original spec): Drafts (two-tier) + recipe versioning

**Goal:** In-progress work survives storage eviction, and cross-record references
survive recipe edits.

**Changes:**
- [ ] `src/recipes/drafts.ts` — IndexedDB draft + sync to PDS as `app.arecipe.draft`
  (renamed from the spec's `fyi.recipe.draft` per the NSID resolution; `status:
  draft`); restore on open. `navigator.storage.persist()` request. Editor carries a
  one-line disclosure that synced drafts are publicly readable (drafts-privacy
  resolution).
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
rather than relying on real eviction. Added by the feasibility amendment:
- **Drafts on the PDS are public — RESOLVED: accepted** (see Open Questions).
  Dev-time drafts go to the test account and are covered by the pre-run purge; the
  editor carries a public-drafts disclosure line for real users.
- **NSID authority — RESOLVED: namespace is `app.arecipe.*`** (owned domain
  `arecipe.app`; see Open Questions). No `fyi.recipe.*` record is ever written.
- `navigator.storage.persist()` is commonly denied in headless/CI contexts —
  request it, log the answer at `info`, never assert `true` in tests.
**Done when:**
1. **Behavioral:** A draft recovers after local storage is cleared; editing a recipe
   surfaces the older-version indicator on a pinned reference.
2. **Verification:** Playwright draft-recovery + versioning tests green.
**Validation:** Moderate — exercise eviction recovery manually once.

---

### Phase 8b: Offline shell — cache-first SW + PWA manifest — ✅ SHIPPED (2026-07-08, Phase 8b close-out commit)

**Delivered.** Content-hashed page bundles + styles injected into stable-named
HTML (the peadoubleueh cache-buster); real service worker with
version-named caches (from `build-info` via esbuild define), per-asset-
tolerant precache of the stable shell, activate-time deletion of old
versions; **cache-first navigations** (app-shell — robust offline; a
network-first navigate handler was found to fail the whole navigation under
emulated offline, and cache-first is the correct pattern anyway) with
`ignoreSearch` so `recipe.html?u=…` matches its precached document;
**cross-origin requests never touched** (Playwright fixtures + PDS/CDN
behave identically with/without the SW — the interception gotcha resolved by
construction). Update flow: a waiting worker surfaces the blockdoku-style
"Update available → Update now" toast (asks, never ambushes; applies via
SKIP_WAITING + one controlled reload). Manifest + maskable icons
(installable); **fonts self-hosted** (subsetted woff2 in-repo — the Google
Fonts dependency is gone). Starter feed gains an offline fallback: per-author
network failure serves previously-cached copies from IndexedDB ("showing
saved copies"), reported honestly. Settings § Updates & storage: manual
update check + storage estimate. `CNAME` (arecipe.app) baked into the build
so the custom domain survives every deploy. Two @live-adjacent hardenings:
the offline-reload SW-control settling race (retry) and the emulated-offline
navigate bug. **Also revised the theme toggle** to a 2-state light⇄dark flip
(the 3-state auto/light/dark cycle had a dead click when the OS matched —
user-reported); first load still follows `prefers-color-scheme`.

*(Original spec below.)*

### Phase 8b (original spec): Offline shell — cache-first SW + PWA manifest

**Goal:** arecipe.app is a fully offline-capable, installable PWA: the app
shell loads with no network, previously found recipes render from IndexedDB,
and updates ask before applying (blockdoku toast). Encodes the peadoubleueh
cache-busting lessons.

**Changes:**
- [ ] `scripts/build.mjs` — content-hash the bundles (`browse-<hash>.js`,
  `styles-<hash>.css`, …) and inject the hashed names into each HTML page;
  `build-info.json` and the HTML stay stable-named (never cached long).
- [ ] `src/sw.ts` — the real worker: versioned cache names derived from
  `build-info.json`'s version; pre-cache the stable shell (HTML, manifest,
  icons) with per-asset failure tolerance; cache-first for **same-origin
  hashed assets only**; network-first-with-cache-fallback for navigations.
  **Cross-origin requests are untouched (no respondWith)** — this keeps
  Playwright route fixtures working, resolving the Phase 4a interception
  gotcha by construction. `activate` deletes old-version caches.
- [ ] Update flow: `updatefound` → "Update available → Update now" toast
  (user-controlled skipWaiting + reload). Toast is an in-flow element, not
  a modal.
- [ ] `manifest.webmanifest` + icon set (incl. maskable) + install metadata.
- [ ] **Self-host the fonts** (subset Fraunces + Atkinson into the repo) —
  removes the Google Fonts dependency flagged at the skeleton; cached like
  any hashed asset.
- [ ] Settings (App management) gains the update-check button + storage
  facts.

**Call chain:** page load → SW serves shell from cache → page module renders
cached recipes from IndexedDB.
**Wiring test:** Playwright: load Browse, find recipes, then
`context.setOffline(true)` → reload → the shell renders AND the previously
cached recipes are still on screen. Second test: a new build's version
change surfaces the update toast (simulate by re-registering with a bumped
version).
**Depends on:** Phase 5b (pages), 5c (tokens for the toast), ideally after
6–8 so the whole authoring surface gets cached.
**Write-set:** `scripts/build.mjs`, `src/sw.ts`, `manifest.webmanifest`,
`assets/` (icons, fonts), all HTML pages (hashed refs + manifest link),
`src/nav.ts` (toast host), settings page, tests.
**Diagnostic logging:** SW lifecycle at info (already), cache
hits/misses at debug, cache-version transitions at info, update-toast
events at info.
**Risks:** offline + OAuth token expiry (reads work signed-out — fine;
authoring offline is out of scope, drafts are local anyway); iOS SW quirks
(validate on a real phone at the M3 demo); hashed-asset e2e paths.
**Done when:**
1. **Behavioral:** airplane-mode reload shows the app with cached recipes;
   install prompt available; a new deploy surfaces the toast and applies on
   consent.
2. **Verification:** offline wiring test green; manual airplane-mode check
   on a real device at the M3 demo.
**Validation:** Broad — real-device offline + install check; Lighthouse PWA
pass recorded.

**Reference: `github.com/chasemp/peadoubleueh`** (maintainer's prior PWA
best-practices repo — inspect for ideas, don't adopt outright; added at the
M1 checkpoint). The cache-busting/upgrade lessons it encodes, learned the
hard way there:
- **Content-hashed asset filenames** (`main-<hash>.js`) referenced from a
  never-cached `index.html` — the fundamental buster; a deploy changes URLs,
  so stale JS is structurally impossible.
- **Versioned cache names** (`static-${CACHE_VERSION}`) with old-cache
  deletion on `activate`; never pre-cache hashed files (they're cached on
  fetch); per-asset `cache.add` failure tolerance so one miss doesn't brick
  install.
- **`build-info.json`** — peadoubleueh had the same artifact; arecipe's
  version (date+sha+sizes, already shipped) is the single source of truth:
  footer stamp, SW cache version, and later the Phase 11 signed manifest
  all derive from it.
- The testing pain that motivated all this: you could never tell which build
  you were looking at — solved in arecipe by the always-visible build stamp.

---

### Phase 8c: Hosted OAuth client → deployed sign-in + two-device demo (M3 exit) — ✅ SHIPPED (2026-07-08)

**Code delivered.** Canonical `client-metadata.json` (client_id =
`https://arecipe.app/client-metadata.json`, redirect = `.../mine.html`,
scope `atproto transition:generic`, public DPoP web client) is the single
source of truth: burned into the bundle (`import` — auth server fetches the
URL to verify, so the two must match by construction) AND served verbatim at
that URL by the build. `authModeFor(origin, hostname)` picks the client:
loopback locally, hosted on `arecipe.app`, none elsewhere (read-only —
client_id/redirect wouldn't match). Sign-in un-hides on the production
origin; boot + createOAuthClient switch on the mode. Unit-tested
(mode selection, metadata shape); the loopback @live tier is unaffected
(5/5). **Pending (needs the live origin + a human):** sign in on
https://arecipe.app, then the **physical two-device demo** (laptop + phone,
same account, same recipes) — the deferred Phase 5 validation and the M3
exit criterion. Hermetic tests can't exercise the hosted flow (client_id is
tied to arecipe.app, unreachable from the local harness).

*(Original spec below.)*

### Phase 8c (original spec): Hosted OAuth client → deployed sign-in + physical two-device demo (M3 exit)

**Goal:** The deployed app becomes fully functional: a static
`client-metadata.json` served from the deployed origin acts as the OAuth
client identity (no registration authority in atproto — the client_id IS the
metadata URL), sign-in un-hides on non-loopback origins, and the M3 exit
demo runs on two physical devices.

**Changes:**
- [ ] `client-metadata.json` in the repo (deployed by Pages):
  `client_id = https://croftcommunity.github.io/arecipe/client-metadata.json`,
  `redirect_uris = [https://croftcommunity.github.io/arecipe/mine.html]`,
  `scope = "atproto transition:generic"`, `token_endpoint_auth_method:
  "none"`, `dpop_bound_access_tokens: true`, `application_type: "web"`.
- [ ] `src/auth/oauth-client.ts` — non-loopback origins construct the client
  from the hosted metadata instead of returning null; the loopback path is
  unchanged for local TDD. Sign-in un-hidden on deployed origins.
**Call chain:** deployed `mine.html` → sign in → bsky.social fetches the
metadata URL → consent → redirect back to deployed `mine.html`.
**Wiring test:** hermetic unit: metadata-selection logic (loopback vs hosted
by hostname, exact client_id/redirect derivation). Live wiring is manual by
nature (the deployed origin can't run from the local harness): sign in on
the live URL, then **the M3 exit demo — two physical devices (laptop +
phone), same account, same recipes** (the deferred Phase 5 validation item).
**Depends on:** Phase 5b (mine.html), Pages deployment (done).
**Write-set:** `client-metadata.json`, `src/auth/oauth-client.ts`, tests,
README note.
**Diagnostic logging:** client selection (loopback vs hosted) at info.
**Risks:** auth server must fetch the metadata URL (Pages serves .json with
correct content-type — verify with curl first); redirect_uri exactness;
**domain move to arecipe.app changes the client identity** (client_id is the
URL) — existing sessions re-consent at cutover; acceptable pre-launch,
flagged for Phase 12 planning.
**Done when:**
1. **Behavioral:** sign-in works on https://croftcommunity.github.io/arecipe/;
   two physical devices show the same account's recipes.
2. **Verification:** unit tests green; the two-device demo performed and
   recorded (photo or note in the Review Log).
**Validation:** Broad — the demo IS the milestone exit.
**Reference: `github.com/chasemp/peadoubleueh`** (maintainer's prior PWA
best-practices repo — inspect for ideas, don't adopt outright; added at the
M1 checkpoint). The cache-busting/upgrade lessons it encodes, learned the
hard way there:
- **Content-hashed asset filenames** (`main-<hash>.js`) referenced from a
  never-cached `index.html` — the fundamental buster; a deploy changes URLs,
  so stale JS is structurally impossible. arecipe's build script should adopt
  this at 8b (hash `main.js`/`styles.css`, inject into index.html).
- **Versioned cache names** (`static-${CACHE_VERSION}`) with old-cache
  deletion on `activate`; never pre-cache hashed files (they're cached on
  fetch); per-asset `cache.add` failure tolerance so one miss doesn't brick
  install.
- **`build-info.json`** — peadoubleueh had the same artifact; arecipe's
  version (date+sha+sizes, already shipped) becomes the single source of
  truth: footer stamp, SW cache version, and later the Phase 11 signed
  manifest should all derive from it.
- Icon set incl. **maskable icons** + manifest — 8b scope.
- The testing pain that motivated all this: you could never tell which build
  you were looking at — solved in arecipe by the always-visible build stamp.

---

## M4 — Social layer (re-planned 2026-07-08; Pass 1+2 applied 2026-07-08)

**Shape:** comprehensive plan, **stop-anywhere sequencing** (user-chosen). Each
phase leaves a shippable increment; execution can halt after any one. Discovery
ran first (below). Spec Layers 6–8. Ingredients-as-records stays parked (M4 tail).

**Reasoning (why this decomposition).** The social layer's records are ours to
define (`app.arecipe.*`), so the risk isn't upstream behavior — it's that later
phases reference records earlier phases create. So the spine is strictly
sequential by data dependency: 9a mints identity/friend records → 9b/9c
*reference recipes* (strongRef) and render on the recipe page → 9d shows a
*polled* activity feed → 10 applies mutes. **The feed is poll-based by default
(user decision 2026-07-08):** a backendless SPA holding a Jetstream firehose is
an unproven cost for unclear benefit at the 12–25 scale, so live-tail is an
optional, perf-gated 9e — polling (`listRecords` per friend, cache-backed for
offline) is the committed mechanism. Affinity ordering is deferred
(chronological first). Every phase reuses proven surfaces rather
than inventing: `createRecordReader`/`createResolver`/`resolveDidDoc` (reads +
identity), `strongRefOf` (references), the `publishRecipe`-shaped
`createRecord` write path, `retryOnce` (post-redirect races), the Phase-7
EXIF-safe upload (cooked photos), the guarded `@live` purge harness (writes),
and the `renderRecipeList/Detail` views. New third-party dependency: Jetstream
(Bluesky-run) — the `listRecords` polling fallback is the durability answer.

**★ Cookbook re-plan (2026-07-08, supersedes the friend-based model below).**
Talked out with the user; the M4 social model is reframed around a **Cookbook**:
- **Cookbook** = your own recipes + a bounded, user-chosen **reach**. Sources:
  **starter-pack cooks** + **Bluesky follows** + **Bluesky followers**.
  **DROP our `app.arecipe.friend` concept — use Bsky primitives** (user decision).
  "Friend" was our lexicon (9a); it competed with Bsky's graph and muddled the
  model. Adding a cook = following on Bsky / toggling a starter; no arecipe-native
  friend record.
- **Browse stays broader** than the cookbook — starter packs + search + wider
  discovery, NOT limited by cookbook scope, stays zero-auth. (Explore-the-world
  vs my-people's-kitchen.)
- **Two orthogonal cookbook settings:** (1) **reach** — which sources + like-graph
  **depth** (network effect: circle → recipes they liked → the cooks behind those);
  (2) **social signals** — likes / comments shown *on* recipes, independent of reach.
- **Feed = a view** ("newest in your cookbook"), not a dial. **Value order:
  new-recipe feed > likes > comments** (comments most opt-in).
- **Likes = a discovery engine** (the like-graph), not just a count.
- **Nav:** the shipped **"Friends" tab (9a) → "Cookbook" tab** (`friends.html` →
  `cookbook.html`; redirect the old path).
- **UI lab:** `ui-lab/social-scope.html` (throwaway, not deployed) prototypes the
  two-axis settings + preview; iterate there before wiring settings.

**Discovery (2026-07-08, verified) — Bsky graph endpoints, browser-reachable:**
- **Follows:** `listRecords?collection=app.bsky.graph.follow` on your PDS —
  HTTP 200, `access-control-allow-origin: *`, records `{subject:<did>, createdAt}`.
  AppView-free (direct repo read).
- **Followers:** `app.bsky.graph.getFollowers?actor=<did>` on `public.api.bsky.app`
  — HTTP 200, CORS `*`, `{followers:[{did, handle}]}` (handle may be
  `handle.invalid`; DID always present). The one accepted AppView dependency.

**Reshape implications (to execute):**
- **9a:** drop `app.arecipe.friend` (friends.ts add/remove/records, the friend
  `@live` write + its guarded purge). Keep the extracted `loadAuthorsFeed`.
- New **`src/social/cookbook.ts`** — shared scope: resolves cookbook member repos
  from starters + follows + followers (+ you), honoring the reach config. Consumed
  by the Cookbook tab, the recipe page (9b comments / 9c likes discovery), the feed.
- **9b/9c discovery** switches from `listFriends(app.arecipe.friend)` to the
  cookbook scope. Comment/interaction records + their guarded purges stay.
- **Settings** gains the two-axis cookbook controls (reach + social signals).
- The friend-based text in the 9a/9b/9c sections below is **superseded** by this
  note (left in place for history; do not re-implement `app.arecipe.friend`). The
  executable reshape is decomposed into phases **CB1–CB7** in the
  "### Cookbook reshape" section immediately below (Pass 1 + Pass 2 applied
  2026-07-08); those phases are the source of truth for what to build, 9a/9b/9c
  for what shipped.

**M4 cross-phase conventions (added Pass 3, 2026-07-08).** The M0–M3 cross-phase
conventions (line ~426) enumerate phases 1–8/3b explicitly and do not name the M4
phases; these extend them to 9a–10:

- **Tests-first (RED before production code) applies to every M4 implementation
  phase (9a, 9b, 9c/9c-i/9c-ii, 9d, 10).** Unit tests and the phase's wiring test
  are written and watched failing before any production code; the `Changes` bullets
  list production files before tests for readability, not as execution order. 9e is
  the sole exception — it is a Discovery-Exemption spike (a perf measurement + go/no-go
  report, not production code), so no TDD applies to the spike itself; any code that
  survives a "go" verdict gets TDD in the follow-up build.
- **Each M4 phase that touches a failure-prone boundary carries a Diagnostic logging
  line** through `src/log.ts` (`[arecipe]` leveled, `?debug=1` / `localStorage.debug`
  gated) — the M0–M3 observability convention, restated because every M4 phase crosses
  a risky boundary (a PDS write, the polled feed, or mute application) that must be
  debuggable from the console with no backend to inspect. Note the Phase 3b discovery
  gotcha (`?debug=1` does not survive an OAuth redirect); M4 writes are not in the
  redirect path, so the URL flag is fine, but reuse the `localStorage.debug` flag if a
  flow ever crosses sign-in.
- **New `@live` spec modules tolerate a missing `.env` at import** (reuse `readEnv`
  from `tests/e2e/helpers/live.ts`, whose read is already tolerant) so the hermetic
  push CI — which lists but never runs `@live` specs — does not throw at collection.
- **Guarded-purge extension for markerless collections (Pass 3 finding).** The
  existing purge (inline in `tests/e2e/publish-live.spec.ts`) is single-collection and
  matches a `MARKER` substring in `record.value.name`. The M4 record types
  (`app.arecipe.friend` = `{subject, createdAt}`, and comment/interaction/mute) have no
  user-facing `name` field, so the marker layer does not transfer. Recommended default:
  keep the hard `TEST_DID` guard as the safety boundary and purge the **whole**
  `app.arecipe.{friend,comment,interaction,mute}` collection on the dedicated test
  account (the account is test-only, so every record in those collections is
  test-created). 9a both generalizes the purge into a shared multi-collection helper
  (see `tests/e2e/helpers/live.ts`) and folds the `docs/PRACTICES.md` note. If a marker
  is wanted anyway, add a synthetic field to our own lexicon rather than relying on
  `name`. See the Review Log for why this is a recommended default, not a blocker.

### M4 Phase 0: Discovery — ✅ DONE (2026-07-08)

- [x] **D7: Is Jetstream usable for the live feed?** ✅ Reachable via
  browser-native `WebSocket` (`wss://jetstream1.us-east.bsky.network/subscribe`;
  jetstream2 / us-west fallback). Event shape (VERIFIED): `{ did, time_us,
  kind:'commit', commit:{ rev, operation, collection, rkey, record, cid } }` —
  carries the record AND its cid, so feed items render AND Tier 2-verify.
  `wantedCollections` filters by type; **`wantedDids` filters to specific repos**;
  **the two combine (AND)** — VERIFIED 2026-07-08 (busy collection + a
  non-posting DID → 0 events; collection alone → 391), so a friends feed =
  `wantedDids=<friends> & wantedCollections=<app.arecipe.* + exchange.recipe.recipe>`
  yields exactly friends' relevant events. **`cursor=<time_us>` replays**
  (825 events from ~5s back = offline catch-up). Not a `fetch` event and
  cross-origin, so the Phase 8b service worker never touches the WS.
  **Known limit:** Jetstream caps `wantedDids` (~10k) — fine at the 12–25
  scale; note for any future growth.
- [x] **D8: The social lexicons are ours** (`app.arecipe.*`). recipe.exchange
  defines no comment/friend/interaction types (D4), so we define them, reusing
  `com.atproto.repo.strongRef` (uri+cid, in `refs.ts`) for recipe references.
  Field shapes drafted per spec §Layer 6; confirm each before its phase writes.
- [x] **D9: unsigned→verified promotion — RESOLVED (dropped, user 2026-07-08).**
  All identity and engagement is atproto/Bluesky for now, so there is no
  non-Bluesky "unsigned" cold-start path. Every social record comes from a
  resolvable atproto identity; no promotion/badging distinction. (Over-imported
  from the spec's "works even if you're not on Bluesky" language — out of scope
  for M4.) Simplifies 9b.

### Cookbook reshape — executable phases (Pass 1 + Pass 2, 2026-07-08)

> These phases (CB1–CB7) are the source of truth for the M4 social layer going
> forward. They **supersede** the friend-based Phases 9a/9b/9c below (kept for
> history, banners added). 9b (comments) shipped and is *migrated* here; 9c
> (interactions) is built-but-parked in the working tree and is *landed* here;
> 9a's `app.arecipe.friend` is *dropped*. 9d (feed) and 10 (mutes) are re-pointed
> at the cookbook scope at milestone altitude (CB5, CB7). See the ★ Cookbook
> re-plan note above for the settled model and DECIDED items (do not re-litigate).

**Problem.** M4 shipped a friends model built on our own `app.arecipe.friend`
lexicon (9a) that competed with Bluesky's native graph and muddled "who's in my
world." Comments (9b) and the parked interactions (9c) discover content by
walking that friend list. The reshape replaces the arecipe-native friend concept
with a **Cookbook**: your own recipes + a bounded, user-chosen reach drawn from
**Bluesky primitives** (starter-pack cooks + your Bluesky follows + your Bluesky
followers) + you. Browse stays broader and zero-auth; the cookbook is
"my-people's-kitchen."

**Approach.** Introduce one shared scope module (`src/social/cookbook.ts`,
depth-0 membership) that resolves member repos from the enabled sources, and
route every friends-scoped consumer through it: the recipe page's comment (CB1)
and interaction (CB2) discovery, the renamed Cookbook tab/page (CB3), settings
(CB4), the feed (CB5), and mutes (CB7). Drop `app.arecipe.friend` once nothing
imports `listFriends` (CB3, after CB1+CB2 migrate `recipe.ts`). Reuse proven
surfaces: `STARTER_AUTHORS`/`createStarterPrefs` (starter.ts), `resolveDidDoc`
(did.ts), `loadAuthorsFeed` (feed.ts), `strongRefOf`/`isStale` (refs.ts),
`renderRecipeList/Detail` (view.ts), the guarded `purgeCollection` (live.ts).

**Reasoning (why this decomposition + sequencing).** The reshape is sequential
by two hard constraints: (1) **the shared module must exist before its
consumers** — CB1 builds `cookbook.ts` and wires its first consumer in the same
phase (no dead code); (2) **`app.arecipe.friend` cannot be dropped while
`recipe.ts` still imports `listFriends`** — the parked interactions path
(`mountInteractions`) imports it too, so CB1 (comment discovery) and CB2
(interaction discovery) must both migrate `recipe.ts` before CB3 deletes
`friends.ts`. Everything else follows from what each phase leaves shippable:
CB1 keeps shipped comments working under the new model; CB2 lands the parked
likes/saved; CB3 flips the tab + removes the dead lexicon; CB4 makes the reach
legible; CB5/CB7 re-point the feed and mutes; CB6 is optional discovery depth.
**Depth (the like-graph network effect) is deferred to CB6** — depth-0
membership is the committed scope; depth 1/2 needs likes (CB2) + the feed (CB5)
and is perf/relevance-gated, exactly like Jetstream (old 9e, folded into CB6).

**Verified against the codebase (2026-07-08).** `listFriends` is imported by
`src/pages/friends.ts`, `src/pages/recipe.ts` (both `mountComments` and the
parked `mountInteractions`); no other importers. `resolveCookbook`/`cookbook.ts`
/`bsky.graph`/`getFollowers` appear nowhere in `src`/`tests` yet — the module is
genuinely new. The Bsky graph endpoints are the ones the ★ note records as
verified (do not re-probe): follows via `listRecords?collection=app.bsky.graph.follow`
on the repo's PDS (`{subject,createdAt}`), followers via
`app.bsky.graph.getFollowers?actor=<did>` on `public.api.bsky.app`
(`{followers:[{did,handle}]}`, `handle` may be `handle.invalid`, `did` always
present). `resolveDidDoc(did)` returns `{pds, handle}`; `loadAuthorsFeed` takes
`FeedAuthor[]` (`{handle, did}`) and resolves each PDS internally.

**Re-grounded against current `main` (2026-07-08, after the browse-view-filters
track landed — 24 commits, plan `2026-07-08-1-plan-browse-view-filters.md`).**
This CB re-plan was first drafted against a checkout that was behind `main`; the
following now-shipped surfaces were folded in on re-grounding (none invalidate the
CB decomposition — they add reuse surfaces and one CB4 reconciliation):
- **`recipe.ts` deferred-auth split is already live.** `mountComments` renders the
  author's comments first, then loads `bootSession` via a dynamic `import()` split
  chunk. CB1/CB2 build directly on this (the parked 9c-i already extends it with a
  shared memoized `getAgent`) — no change to the CB1/CB2 plan.
- **`settings.ts` gained an "Only show me" diet-preference section** (`createDietPreference`
  + `DIET_OPTIONS` from `src/recipes/diet-preference.ts`, section id `diet-preference`).
  Settings order is now: build, updates, integrity, **Starter pack**, **Only show
  me (diet)**, **Social** (hide comments/likes), Hidden recipes, About. **CB4 is
  updated** to reconcile with this third preference surface (see CB4).
- **New reuse surfaces** (browse track): `src/pages/browse-state.ts`
  (`BrowseState`, `matchesFilter`, `availableFacets`, `createBrowsePrefs` —
  view-mode + facet filtering), `src/recipes/diet-preference.ts`
  (`createDietPreference`, `DIET_OPTIONS`), and `src/recipes/view.ts` now also
  exports `renderRecipeDetailsList` + `renderFacetDropdown` beside
  `renderRecipeList`/`renderRecipeDetail`. The Cookbook page (CB3) and feed (CB5)
  can reuse the view-mode/facet machinery and MUST honor the diet preference the
  same way Browse does (see CB5).
- **Unchanged and still valid:** the browse track did NOT touch `nav.ts`,
  `feed.ts`, `friends.ts`, `comments.ts`, `starter.ts`, `identity/did.ts` — every
  CB claim on those holds as written.

**CB cross-phase conventions.** The M4 cross-phase conventions above (tests-first
RED-before-production, `?debug=1`/`localStorage.debug`-gated `[arecipe]` logging,
`.env`-tolerant `@live` modules via `readEnv`, guarded whole-collection purge
hard-scoped to `TEST_DID`) apply unchanged to CB1–CB7. The reads-hermetic /
writes-`@live` wiring split (9a/9b precedent) also carries: follows/followers are
public repo/AppView reads → hermetically routable with fixtures; writes
(interactions) proven `@live`.

---

#### CB1 — Cookbook scope module (`src/social/cookbook.ts`, depth-0) + migrate comment discovery

**Goal:** A shared module that resolves the cookbook's member repos (depth 0:
direct membership) from the enabled sources — starter-pack cooks + your Bluesky
follows + your Bluesky followers + you — honoring an injectable reach config, and
its first consumer: the recipe page's **comment** discovery switches off
`listFriends(app.arecipe.friend)` onto the cookbook scope.

**Changes:**
- [ ] `src/social/cookbook.ts` — new. Shapes:
  - `type CookbookSource = 'you' | 'starter' | 'follow' | 'follower'`
  - `type CookbookMember = { did: string; handle?: string; sources: CookbookSource[] }`
  - `type ReachConfig = { starters: boolean; follows: boolean; followers: boolean }`
    (depth is **not** a field here — deferred to CB6; see open questions)
  - `resolveCookbook(args: { you?: { did: string; pds: string }; config?: ReachConfig; starters?: FeedAuthor[]; fetchFn?: typeof fetch; appView?: string }): Promise<CookbookMember[]>`
  - **starters:** `args.starters ?? createStarterPrefs().enabledAuthors()` (reuse
    5e; the starter section already toggles these).
  - **follows:** `${you.pds}/xrpc/com.atproto.repo.listRecords?repo=<you.did>&collection=app.bsky.graph.follow` → `records[].value.subject` (public read; works for any `you`, incl. the cold-view `?did=`).
  - **followers:** `${appView}/xrpc/app.bsky.graph.getFollowers?actor=<you.did>` (`appView` default `https://public.api.bsky.app`) → `followers[].{did,handle}`; keep the DID even when `handle === 'handle.invalid'`.
  - **you:** `{did, sources:['you']}` when `you` is provided.
  - Merge/dedup by DID, **union** the `sources` tags; **degrade-not-blank per
    source** (a source that throws logs `warn` and contributes nothing — never
    fails the whole cookbook), mirroring `loadAuthorsFeed`'s contract.
- [ ] `tests/unit/social/cookbook.spec.ts` — routed `fetchFn`/`appView` fixtures:
  dedup edge (a DID that is both a follow and a follower → one member, two source
  tags); per-source failure edge (follows HTTP 500 → followers + starters still
  resolve); config-off edge (`followers:false` → no `getFollowers` call);
  `handle.invalid` follower keeps its DID.
- [ ] `src/pages/recipe.ts` — in `mountComments`, replace
  `const friends = await listFriends({pds, did: me}); for (friend) addRepo(friend.subject)`
  with `const members = await resolveCookbook({you:{did:me,pds}}); for (member) addRepo(member.did)`.
  (`mountInteractions` still on `listFriends` until CB2 — both are migrated before
  CB3 drops the import.)

**Call chain:** recipe page (signed in) → `getAgent()` → `resolveDidDoc(me)` →
`resolveCookbook({you})` → per-member `addRepo(member.did)` → `loadRecipeComments`.
**Wiring test:** `@live` — the recipe page's comment section surfaces a comment
authored by one of the test account's **real Bluesky follows** on a shared recipe
(was: an `app.arecipe.friend`), proving the entry point reaches the new scope
module through the deferred-auth path. Hermetic: the recipe-comment cold path
(author-repo only, no session) is unchanged, and `cookbook.spec.ts` proves the
module over routed fixtures. (Per the 9a/9b split, the signed-in discovery path is
`@live`; there is no injectable hermetic agent on the recipe page.)
**Depends on:** 9b (shipped comments), `starter.ts`, `did.ts`, `feed.ts` (FeedAuthor).
**Read-set:** `src/recipes/starter.ts`, `src/identity/did.ts`, `src/social/feed.ts`,
`src/pages/recipe.ts`.
**Write-set:** `src/social/cookbook.ts`, `tests/unit/social/cookbook.spec.ts`,
`src/pages/recipe.ts` (mountComments discovery only), `tests/e2e/comments-live.spec.ts`
(assert a follow-scoped comment). (2 logic `.ts` touched — within budget.)
**Shared-state contract:** reads only (public `listRecords` + `getFollowers`); no
PDS writes; no ports; reads localStorage (starter/reach prefs). No cross-tab state.
**Diagnostic logging:** per-source resolve at `debug` (source, member count); a
source that fails at `warn` (degrade path); merged member count at `info`. The
scope must be reconstructable from the console (which source contributed whom).
**Mutation resistance:** assert the three edges above (dedup union, per-source
degrade, config-off skip) — not a single happy-path assertion that survives an
"always include everything" regression.
**Done when:**
1. **Behavioral:** signed in, the recipe page's comments include comments from
   your Bluesky **follows** (not `app.arecipe.friend`); a follow with no comment
   contributes nothing (no error).
2. **Verification:** `npm test -- cookbook` (unit) + `npm run test:live -- comments`
   (follow-scoped comment appears) green; hermetic suite green (no regression).
**Validation:** Moderate — reads real follows/followers `@live` (no external
mutation); confirm the merged member set in the console log matches the account.
**Test-tier coverage (Pass 3):** CB1 shipping alone is covered by (a) the hermetic
`cookbook.spec.ts` unit tests (the module's edges, no creds — runs in push CI) and
(b) the `@live` recipe-comment discovery gate (the entry-point wiring, run locally
with `.env`). The scope module's *hermetic entry-point* wiring proof arrives at CB3
(the `cookbook.html?did=` cold-view over routed fixtures) — so if execution stops
after CB1, note in the commit that the scope wiring is unit + `@live` only until CB3
adds the hermetic cold-view. This is the 9a/9b reads-hermetic/writes-`@live` split,
not a coverage gap.
**Stop-point.**

---

#### CB2 — Land interactions (likes + saved) on the cookbook scope

**Goal:** Commit the parked 9c-i (`interactions.ts` + recipe-page like/save +
`prefs.hideLikes`), migrate `mountInteractions` discovery to `resolveCookbook`,
and **re-prove the `@live` like WRITE now roots** (the parked write "was not
landing — unrooted"; re-test in the reworked flow). After CB2, `recipe.ts`
imports no `listFriends`.

**Changes (re-confirm the parked shape at start):**
- [ ] Commit `src/social/interactions.ts` (+ `tests/unit/social/interactions.spec.ts`,
  already green): `buildInteractionRecord`/`listInteractionsFor`/`loadRecipeInteractions`/
  `summarize`/`findInteractionRkey`/`addInteraction`/`removeInteraction`; kinds
  `liked`+`saved` (cooked deferred); counts friends-scoped (now cookbook-scoped).
- [ ] `src/pages/recipe.ts` — in `mountInteractions`, swap `listFriends` →
  `resolveCookbook` (same edit shape as CB1); keep the shared memoized `getAgent`
  deferred-auth load (comments + interactions share one `@atproto/api` chunk).
- [ ] `src/social/prefs.ts` — commit the parked `hideLikes`/`setHideLikes` (key
  already reserved). The settings **toggle** is CB4; the recipe surface honors
  the pref now.
- [ ] **Investigate the "unrooted" like write** at execution: the record carries
  `recipe: strongRefOf(entry)` (uri+cid) — confirm the write lands rooted to the
  recipe and toggles cleanly against a real recipe on the test PDS. Record the
  root cause in the close-out (report-outcomes discipline).
- [ ] `tests/e2e/interactions-live.spec.ts` + `tests/e2e/interactions.spec.ts`
  (parked) — commit; extend `purgeCollection` usage to `app.arecipe.interaction`.

**Call chain:** recipe page → shared `getAgent()` → `resolveCookbook` → per-member
`addRepo` → `loadRecipeInteractions` → `summarize`; like/save button →
`addInteraction`/`removeInteraction` → `refresh`.
**Wiring test:** `@live` — like a recipe → `app.arecipe.interaction` record on the
test PDS → the count reflects it → unlike → record gone (guarded purge). Hermetic
— counts render from routed fixtures; Browse tiles show the heart+count read-only
(the "Browse ships zero auth code" e2e stays valid unchanged).
**Depends on:** CB1 (cookbook scope), the parked 9c-i code, `refs.ts`.
**Read-set:** `src/pages/recipe.ts`, `src/social/interactions.ts`, `src/recipes/refs.ts`,
`src/social/cookbook.ts`, `src/identity/did.ts`.
**Write-set:** `src/social/interactions.ts`, `src/pages/recipe.ts` (mountInteractions),
`src/social/prefs.ts`, `tests/unit/social/interactions.spec.ts`,
`tests/e2e/interactions{,-live}.spec.ts`, guarded-purge entry in
`tests/e2e/helpers/live.ts`. (3 logic `.ts`; `interactions.ts` already exists.)
**Shared-state contract:** writes `app.arecipe.interaction` to the guarded test
account (`TEST_DID`); no ports; localStorage for `hideLikes`.
**Diagnostic logging:** like/save write at `info` (recipe uri, kind); count-agg
read failure at `warn` (degrade to hidden/zero, never blank the card); toggle
failure at `error`. Reuse from the parked code.
**Mutation resistance:** count edges (0 → no/explicit-0 chip, 1 → "1 like",
idempotent double-like → one record/count); toggle-off removes exactly the
viewer's own record.
**Done when:**
1. **Behavioral:** on the recipe page you can like/unlike and save/unsave; the
   like count is cookbook-scoped and honest; Browse shows read-only counts.
2. **Verification:** `npm test -- interactions` + `npm run test:live -- interactions`
   (like write roots + toggles) green; the Browse-zero-auth e2e still green.
**Validation:** Broad — external `app.arecipe.interaction` write to the guarded
test account; confirm the record roots to the recipe and teardown removed it.
**Sizing:** if committing the parked surface + migration + settings exceeds one
context, split CB2-i (interactions.ts + recipe-page migration + `@live` like
re-test) / CB2-ii (Browse card counts + the Saved view under My recipes). Each
sub-phase ≤3 logic `.ts`, own wiring test, own stop-point.
**Stop-point.**

---

#### CB3 — Rename Friends → Cookbook + Cookbook page rework + DROP `app.arecipe.friend`

**Goal:** The 3rd nav tab and its page become the **Cookbook**; membership is by
**source** (not add/remove-friend); the `app.arecipe.friend` lexicon and all its
machinery are removed. Safe now: after CB1+CB2 nothing imports `listFriends`
except the friends page itself, which this phase replaces.

**Changes:**
- [ ] Rename `src/pages/friends.ts` → `src/pages/cookbook.ts` and rework: drop the
  add/remove-friend form; render cookbook **members** (from `resolveCookbook`) with
  source provenance + Bluesky profile links; render the members' recipes via
  `loadAuthorsFeed` (map members → `FeedAuthor` by resolving handles); keep the
  shareable **`?did=` cold-view** (any account's cookbook, hermetic seam).
- [ ] Rename `friends.html` → `cookbook.html`; add a `friends.html` **redirect
  stub** (`<script>location.replace('./cookbook.html'+location.search)</script>`),
  kept in the HTML/precache list so old links, bookmarks, and the SW navigate
  handler resolve offline. (Decided: a static stub, not an SW-rewrite — simplest,
  works offline, one file.)
- [ ] `src/nav.ts` — `DESTINATIONS`: `Friends`→`Cookbook`, `href './cookbook.html'`,
  `testid 'tab-cookbook'`, `match /\/cookbook\.html$/`.
- [ ] `scripts/build.mjs` — `PAGES`: `friends`→`cookbook`; `HTML` map:
  `cookbook.html → cookbook`; keep `friends.html` as a static passthrough (the
  redirect stub has no JS bundle to hash).
- [ ] **Delete `src/social/friends.ts`** (`FRIEND_COLLECTION`, `buildFriendRecord`,
  `listFriends`, `findFriendRkey`, `addFriend`, `removeFriend`, `loadFriendsFeed`).
  `loadAuthorsFeed` already lives in `feed.ts` (unaffected).
- [ ] Tests: delete `tests/e2e/friends-live.spec.ts` (friend `@live` write + friend
  purge) and `tests/unit/social/friends.spec.ts`; rework `tests/e2e/friends.spec.ts`
  → `tests/e2e/cookbook.spec.ts` (cold-view over follows/followers/starter+PDS
  fixtures); update `tests/unit/nav.spec.ts` (`tab-cookbook`, `./cookbook.html`,
  `/cookbook.html` active-match).
- [ ] Remove `app.arecipe.friend` from the guarded multi-collection purge list
  (keep comment/interaction/mute).
- [ ] Docs: `docs/DESIGN.md` (Friends → Cookbook destination narrative), `README.md`
  (page list: `friends.html`→`cookbook.html` + redirect note), `docs/PRACTICES.md`
  (purge collections: drop friend).

**Call chain:** Cookbook tab → `cookbook.html` → `cookbook.ts` → `resolveCookbook`
→ render members + `loadAuthorsFeed` → `renderRecipeList`.
**Wiring test:** hermetic — `cookbook.html?did=<did>` cold-view renders the member
list + their recipes via `resolveCookbook` over routed follows/followers/starter +
PDS fixtures (the scope module's hermetic wiring proof, through the page entry
point); `tab-cookbook` navigates; loading old `friends.html` redirects to
`cookbook.html` (assert URL after `location.replace`).
**Depends on:** CB1, CB2 (recipe.ts fully off `listFriends`).
**Read-set:** `src/social/cookbook.ts`, `src/social/feed.ts`, `src/recipes/starter.ts`,
`src/identity/did.ts`, `src/nav.ts`, `scripts/build.mjs`, `src/sw.ts`.
**Write-set:** `src/pages/cookbook.ts` (renamed), `cookbook.html`, `friends.html`
(→ redirect stub), `src/nav.ts`, `scripts/build.mjs`, delete `src/social/friends.ts`,
delete/rework the friends specs, `tests/unit/nav.spec.ts`, `docs/DESIGN.md`,
`README.md`, `docs/PRACTICES.md`.
**Shared-state contract:** SW cache (a version bump ships the rename; the
`friends.html` stub precaches); no PDS writes; no ports.
**Diagnostic logging:** page mount at `debug` (view: cold vs signed-in); reuse the
CB1 scope-resolution logging (no new boundary).
**Mutation resistance:** the redirect edge (old `friends.html` → `cookbook.html`,
query preserved) and the cold-view edge (an account's members render) are both
asserted; a no-op redirect or an empty member list must fail.
**Sizing:** 4+ files → **split at execution:** CB3-i (rename plumbing —
nav/build/html + `friends.html` redirect stub + page rename to the new source
model) / CB3-ii (delete `app.arecipe.friend` machinery + rework/delete its specs +
docs). Each ≤3 logic `.ts`, own wiring test, own stop-point.
**Done when:**
1. **Behavioral:** the 3rd tab reads "Cookbook"; the page shows membership by
   source + the members' feed; old `friends.html` redirects; no
   `app.arecipe.friend` code remains (`grep -r 'app.arecipe.friend\|listFriends'
   src` is empty).
2. **Verification:** `npm test -- nav` + the `cookbook.spec.ts` cold-view e2e +
   the redirect e2e green; full hermetic suite green (friend specs removed, not
   red).
**Validation:** Moderate — read-only page + a redirect; the friend WRITE surface is
being *removed*, not added, so no `@live` write tier is needed here.
**Stop-point.**

---

#### CB4 — Settings: two-axis controls (reach + social signals)

**Goal:** Promote the UI-lab's two-axis controls (`ui-lab/social-scope.html`) into
`settings.html` legibly. **Axis 1 — reach:** source toggles (starter cooks
[= the existing Starter-pack section], Bluesky follows, Bluesky followers)
[+ depth — see open questions]. **Axis 2 — social signals:** show/hide likes and
comments *on* recipes, independent of reach — reconciled with the existing Social
panel (Hide Comments) + `prefs.hideLikes`.

**Changes (re-confirm shape at start):**
- [ ] Reach config store — extend `src/social/prefs.ts` (or a sibling
  `src/social/reach.ts`) with `ReachConfig` persistence (localStorage, same
  defensive posture as starter/social prefs; **default all sources on**). This is
  the config `resolveCookbook` reads (CB1 defaults all-on until this lands).
  Decided: localStorage now (matches starter/social prefs); a synced
  `app.arecipe.*` reach record is a later option, not this phase.
- [ ] `src/pages/settings.ts` — a "Your cookbook (reach)" section: the existing
  **Starter pack** section becomes the "starter cooks" reach source (fold or
  cross-reference — do not duplicate the author toggles), plus new Bluesky
  **follows** / **followers** source toggles. In the **Social** section, add the
  **Hide Likes** toggle beside Hide Comments (the parked `prefs.hideLikes` key).
- [ ] **Reconcile with the existing "Only show me" (diet-preference) section**
  (re-ground 2026-07-08): the diet preference is an app-wide *content* filter
  (which recipes, by dietary suitability), **orthogonal to both cookbook axes** —
  it is neither a reach source (which people) nor a social signal (what shows on a
  recipe). Leave it as its own Settings section; do NOT fold it into reach. Result:
  Settings carries three related-but-distinct preference groups — **reach** (starter
  cooks + follows + followers), **social signals** (hide likes/comments), and
  **diet** ("Only show me", unchanged). Cross-link them with clear section copy so
  the three are legibly different (the lab's two axes + the pre-existing diet
  filter).
- [ ] Copy honesty: counts are cookbook-scoped ("you + your reach"), never a
  pretend-global number (ties to CB2's like copy).

**Call chain:** settings toggle → reach/social pref write → next `resolveCookbook`
/ recipe-surface read reflects it.
**Wiring test:** hermetic — toggling a reach source in settings changes what
`resolveCookbook` returns (settings→cookbook read-through) and the Cookbook page /
feed reflects it; the **Hide Likes** toggle hides the recipe-page like surface
(mirrors the shipped Hide Comments test).
**Depends on:** CB1 (config shape), CB2 (Hide Likes surface exists), CB3 (Cookbook
page).
**Read-set:** `src/pages/settings.ts`, `src/social/prefs.ts`, `src/recipes/starter.ts`,
`src/social/cookbook.ts`.
**Write-set:** `src/social/prefs.ts` (or `src/social/reach.ts`), `src/pages/settings.ts`,
`tests/unit/social/prefs.spec.ts`, `tests/e2e/settings*.spec.ts`.
**Shared-state contract:** localStorage only; no PDS writes; no ports.
**Diagnostic logging:** reach-source toggle + signal toggle at `debug` (key,
value), reusing the existing settings toggle logging.
**Mutation resistance:** a source toggled off is absent from the resolved cookbook
(and its recipes leave the feed), toggled on returns — both edges, not a single
default-on assertion. Hide Likes both edges (surface present when off, absent when
on).
**Done when:**
1. **Behavioral:** settings exposes reach source toggles + likes/comments signal
   toggles; each governs the cookbook membership / recipe surfaces observably.
2. **Verification:** `npm test -- prefs` + the settings reach/signal e2e green.
**Validation:** Moderate — localStorage-backed UI; confirm the read-through to the
Cookbook feed in a real browser.
**Stop-point.**

---

#### CB5 — Cookbook feed view (re-plan of Phase 9d; milestone-altitude, re-confirm at start)

**Goal:** "**Newest in your cookbook**" — a VIEW (not a dial) over the cookbook
members' recipes, merged newest-first, each Tier 2-verified, **polled** on load
with a manual refresh, offline-tolerant (8b cache fallback). Lives on the Cookbook
tab (`cookbook.html`). Value order per the ★ note: the new-recipe feed is the
headline (above likes, above comments). Supersedes the "friends activity feed"
framing of 9d — same polled mechanism, now over cookbook scope via
`resolveCookbook` + `loadAuthorsFeed`.
**Reuses:** `resolveCookbook` (members), `loadAuthorsFeed` (merge+verify+cache),
the 8b offline fallback, and (re-ground 2026-07-08) the browse-track view layer —
`renderRecipeList`/`renderRecipeDetailsList` + `renderFacetDropdown` (view.ts) and
`browse-state.ts` (`matchesFilter`/`availableFacets`/`createBrowsePrefs`) for
view-mode + facet filtering. **The cookbook feed MUST honor the app-wide diet
preference** (`createDietPreference` + `matchesFilter`) the same way Browse does,
so "Only show me" applies consistently across Browse and the Cookbook — confirm
this at CB5 start. **Depends on:** CB1 (scope), CB3 (Cookbook page).
**Kept milestone-altitude** because its file shape is settled by CB1/CB3 and it
adds no new record type; the 9d Diagnostic-logging / mutation-resistance
(interleaved-timestamp merge, offline edge) notes carry over verbatim.
**Done when:** decomposed at CB5 start into executable detail, then built:
merged chronological cookbook feed, polled, offline-tolerant, on the Cookbook tab.
**Validation:** Moderate (read-only feed + offline). **Stop-point (cookbook social
core complete without depth/live-tail).**

---

#### CB6 — (OPTIONAL) Reach depth (like-graph 1/2) + Jetstream live-tail — spike-gated

**Only if a spike justifies it.** Two optional enrichments, both off the critical
path (skipping CB6 leaves M4 complete):
- **Reach depth (the network effect):** depth 1 = recipes your circle *liked*
  (read cookbook members' `app.arecipe.interaction` `liked` records, resolve the
  liked recipes); depth 2 = the cooks *behind* those recipes (resolve non-member
  authors → new members). Adds a `depth` field to `ReachConfig` + the depth radio
  to CB4's settings, and the like-graph walk to `cookbook.ts`. **Depends on:** CB2
  (likes exist) + CB5 (feed). Perf/relevance-gated: depth-2 fetches non-member
  repos and can fan out — measure the read cost at the target scale before
  committing, and cap with a logged "showing first N" (no silent truncation).
- **Jetstream live-tail (old Phase 9e):** the perf-gated live-update layer over the
  polled feed (`wantedDids`×`wantedCollections`, cursor replay, Tier-2 verify,
  degrade to CB5 polling). Discovery-Exemption spike → written go/no-go report,
  then TDD on a "go".
**Done when:** each sub-item's spike says go/no-go; on go, it layers onto — never
replaces — the depth-0 cookbook + polled feed.

---

#### CB7 — Mutes over the cookbook scope (re-plan of Phase 10; milestone-altitude, re-confirm at start)

**Goal:** The real mute system (spec Layer 8), promoting `exclusions.ts` (5f
mute-lite) into `app.arecipe.mute.*`, with presence-based inheritance now scoped
to **cookbook members** (not `app.arecipe.friend`). Everything in the Phase 10
spec below stands (records + inheritance resolver + settings mute-management UI +
filter-application at `feed.ts`/`view.ts`, the 10-i/10-ii split, Broad `@live`
validation with the guarded purge) with one substitution: the graph it reads for
inherited mutes is the cookbook scope. **Depends on:** CB1 (scope), 5f (overlay
seed). **Kept milestone-altitude** — re-confirm at CB7 start; the reshape does not
force new detail beyond re-pointing the graph.
**Done when:** decomposed at CB7 start, then built: subscribable mute lists +
presence-based inheritance over cookbook members, all overrideable (both edges).
**Validation:** Broad (external `app.arecipe.mute.*` write). **Stop-point (M4
complete).**

---

#### Cookbook reshape Concurrency Map

Sequential spine: **CB1 → CB2 → CB3 → CB4 → CB5 → [CB6 optional] → CB7.**
All phases sequential; reasons:
- **CB1 → CB2:** both write `src/pages/recipe.ts` (mountComments, then
  mountInteractions discovery) — shared write-set → the hard rule forbids parallel.
- **CB2 → CB3:** CB3 deletes `src/social/friends.ts`/`listFriends`, which CB1's
  and CB2's `recipe.ts` edits must have migrated off first. Ordering makes the
  delete safe.
- **CB3 → CB4:** CB4 reads the reach config `resolveCookbook` consumes and toggles
  the CB2/CB3 surfaces; CB3 owns the Cookbook page CB4's read-through targets.
- **CB4 → CB5:** CB5's feed lives on `src/pages/cookbook.ts` (written by CB3) and
  reads the reach config (CB4). Shared page write-set with CB3.
- **CB5 → CB7:** CB7 writes `src/social/feed.ts` + `src/recipes/view.ts` as
  filter-application sites (shared with CB5's feed work and CB2's view chips) — last
  on the spine by construction, as Phase 10 already is.
- **CB6 optional**, off the critical path.
No worktree/parallel dispatch → no re-entry-verification fields required (stated,
matching the M4 map). `src/pages/recipe.ts` (CB1, CB2) and `src/pages/cookbook.ts`
(CB3, CB5) are the shared hot files that force the sequence — not a default.

#### Cookbook reshape Documentation Impact

- `docs/DESIGN.md` — Friends → Cookbook destination narrative + the settings
  model. **CB3** (destination). **CB4** (settings): document the three distinct
  preference groups now on the page — **reach** (starter cooks + follows +
  followers), **social signals** (hide likes/comments), and the pre-existing
  **diet** ("Only show me") content filter — and how they differ (who vs what-shows
  vs which-recipes). Each in the phase that makes the narrative stale.
- `README.md` — page list: `friends.html` → `cookbook.html` + the redirect stub.
  **CB3.**
- `docs/PRACTICES.md` — guarded multi-collection purge: drop `app.arecipe.friend`,
  keep comment/interaction/mute. **CB3** (drop), **CB2** (add interaction).
- `ui-lab/social-scope.html` — throwaway reference (not deployed, not in the build
  page list); note it still lists an "arecipe friends" source that the reshape
  **drops** — the promoted settings (CB4) use starters + follows + followers only.
  No build/doc reference to update; left as-is for provenance.
- New `src/social/cookbook.ts` (+ optional `reach.ts`): grepped — no references
  outside the phases that create them.
- The M4 Documentation Impact and Concurrency Map sections below still describe the
  friend-based 9a–10; they are **superseded** by these two subsections for CB work
  (kept for history).

#### Cookbook reshape — open questions (walk through before executing CB1)

- [CONFIRMED: PHASE-GATED (CB1) — user, 2026-07-08] **All three sources feed
  per-recipe discovery, with a logged cap.** `resolveCookbook` includes
  starters+follows+followers (+you); per-recipe comment/like discovery reads the
  first N resolved members with a logged "reading first N" (no silent truncation);
  the Cookbook feed reads all members. *Rationale: honors the DECIDED cookbook
  model at M4's 12–25 scale; the cap bounds the per-recipe read fan-out without a
  behavioral carve-out. CB1 must implement the cap + the log line; pick N at CB1
  start (a small default, e.g. ~50, is fine — the cap is a safety bound, not a
  product limit at this scale). If the cap bites in use, the fallback
  (followers→feed-only) is a later, reversible narrowing.*
- [CONFIRMED: PHASE-GATED (CB4) — user, 2026-07-08] **Defer the reach-depth
  control to CB6.** CB4 ships source toggles (starters/follows/followers) + social
  signals (hide likes / hide comments) only; the like-graph depth radio (0/1/2)
  lands in CB6 alongside the code that honors it, so settings never shows a dead
  control. *Consequence: `ReachConfig` in CB1 carries no `depth` field (CB6 adds
  it); CB4's settings section is source toggles + signals, matching the lab minus
  the depth group.*
- [CONFIRMED: ADVISORY — user, 2026-07-08] **Reach config in localStorage now**
  (matches `createStarterPrefs`/`createSocialPrefs` — same degrade posture, no new
  lexicon; per-device). *A synced `app.arecipe.*` reach record is a clean later add
  if cross-device reach is wanted.*

**All 3 Cookbook-reshape open questions confirmed with the user (2026-07-08):**
2 PHASE-GATED (CB1 followers+cap; CB4 depth deferred to CB6), 1 ADVISORY (reach
storage = localStorage). No BLOCKING items. CB1 is ready to start on approval.

---

### Phase 9a: Friends (social graph) — ✅ SHIPPED (2026-07-08, Phase 9a close-out commit) — sequenced M4 #1  ⛔ SUPERSEDED by the Cookbook reshape (CB1–CB7 above): `app.arecipe.friend` is dropped at CB3

**Delivered:** as specced, with the user-confirmed Option A wiring split (see the
"Wiring split" note below). `loadStarterFeed` was extracted to
`src/social/feed.ts` as `loadAuthorsFeed` (behavior-preserving — `starter.ts`
re-exports it; the 5e starter suite stayed green as the guard). `src/social/
friends.ts` provides `buildFriendRecord`/`listFriends`/`findFriendRkey` (unit-
tested, both edges) + `addFriend`/`removeFriend` (proven `@live`) +
`loadFriendsFeed`. `src/pages/friends.ts` + `friends.html` add the three states
(cold-view `?did=`, signed-in add/remove, signed-out gate); Friends is the 3rd
nav tab. The guarded purge generalized into `purgeCollection` in
`tests/e2e/helpers/live.ts` (markerless whole-collection purge, hard-scoped to
`TEST_DID`). Hermetic wiring (Friends-tab nav, signed-out gate, `?did=` read
feed) + `@live` write path (real add `rdur.dev` → recipes appear → remove →
record gone, 9.9s) both green; full hermetic suite (30 e2e + unit) green, no
regressions. Docs updated same-phase: DESIGN.md (Friends destination),
PRACTICES.md (guarded multi-collection purge), README (page list).

**Goal:** `app.arecipe.friend` records (a public follow naming a DID), a friends
list to add/remove by handle, and a friends **read** feed (their recipes via the
existing multi-author reader). No live tail yet — that's 9d.
**Changes:**
- [ ] `src/social/friends.ts` — `addFriend(agent, handle)` (resolve handle→did
  via `createResolver`, `createRecord` an `app.arecipe.friend` `{subject: did,
  createdAt}`), `listFriends(pds, did)` (public `listRecords`),
  `removeFriend(agent, rkey)`. **rkey decision:** PDS-minted TID; remove by
  listing and matching `subject` (a `did:` can't be a raw rkey; hashing adds
  complexity for no gain at this scale). `loadFriendsFeed(friends)` reuses the
  `loadStarterFeed` multi-author shape — extract the shared loader from
  `starter.ts` into `src/social/feed.ts` so both call it (small refactor,
  removes duplication rather than adding it).
- [ ] `src/pages/friends.ts` + `friends.html` — add-by-handle form, friends list
  (names link to Bluesky profiles, per the starter-pack pattern), the read feed.
- [ ] `src/nav.ts` — add a "Friends" destination (3rd tab; bottom bar already
  handles N tabs).
**Call chain:** Friends tab → `friends.html` → `friends.ts` → `addFriend`/
`loadFriendsFeed` → renders via `renderRecipeList`.
**Wiring test:** hermetic e2e — add a friend by handle (routed fixture) → their
recipes appear in the Friends feed; remove → they leave. `@live`: friend write
to the test account, guarded purge extended to `app.arecipe.friend`.
**Wiring split — resolved 2026-07-08 (execution finding, user-confirmed).** The
hermetic "add→appear→remove" as written assumed an injectable signed-in `Agent`
in hermetic e2e; no such seam exists (mirroring Phase 6, every write is proven in
the `@live` tier, hermetic covers the signed-out + read paths). Resolution
(Option A, matches the Pass 3 calibration — writes Broad/@live, reads Moderate):
- **Hermetic (push CI, no creds):** the Friends tab exists and navigates; the
  signed-out state shows the "sign in to add friends" gate; and the friends
  **read feed** renders via a shareable **`friends.html?did=<did>` cold-view**
  (mirrors `recipe.html?u=`) over routed plc/PDS fixtures — a genuinely useful
  affordance (view/share any account's public friends feed), which also makes the
  read path hermetically testable without auth.
- **`@live` (local gate, `.env` creds):** the real `addFriend` → record on the
  test PDS → their recipes show in the feed → `removeFriend` → record gone, with
  the guarded whole-collection purge (hard-scoped to `TEST_DID`).
The add/remove **write** buttons are gated on a signed-in session on the page as
usual; their proof lives in `@live`, not hermetic.
**Depends on:** Phase 8 (reader, `resolveDidDoc`, guarded-write harness),
`createResolver`.
**Read-set:** `src/recipes/read.ts`, `src/identity/resolve.ts`,
`src/identity/did.ts`, `src/recipes/starter.ts` (to extract the shared loader),
`src/recipes/view.ts`.
**Write-set:** `src/social/friends.ts`, `src/social/feed.ts`, `src/pages/friends.ts`,
`friends.html`, `src/nav.ts`, `src/recipes/starter.ts` (import the extracted
loader), `scripts/build.mjs` (register the page), tests. (Logic surface: 3 new
`.ts` + nav + a starter.ts import swap — the page-scaffold overhead mirrors 5b;
split friends-management vs feed if it exceeds one context.)
**Shared-state contract:** writes `app.arecipe.friend` to the signed-in PDS
(real external mutation — dedicated test account only, guarded purge, per
Phase 6). No ports, no cross-tab state. The starter.ts loader extraction is a
pure move (behavior-preserving; its tests must stay green).
**Diagnostic logging:** friend add/remove at info; feed per-author failure at
warn (reuse the starter fallback — cached copies offline).
**Risks:** the starter.ts extraction must not regress the starter feed
(Pass 2: shared write-set with 5e — keep the loader's signature identical, run
starter tests). Friend-of-a-non-atproto-handle → `createResolver` fails loud.
**Done when:**
1. **Behavioral:** adding a handle persists an `app.arecipe.friend` record and
   that cook's recipes show in the Friends feed; removing deletes the record and
   the cards.
2. **Verification:** `npm test -- friends` + the friends wiring e2e green;
   `npm run test:live` friend round-trip green. **Extraction guard:** the
   existing 5e starter suite (`npm test -- starter` + the starter e2e in
   `tests/e2e/starter.spec.ts`) must stay green after the `loadStarterFeed`
   loader is moved to `feed.ts` — this is the behavior-preserving proof for the
   refactor and is a required part of 9a's gate, not an optional check. Watch
   the friends wiring test fail first (RED) before writing `friends.ts`.
**Validation:** Broad — real friend write/read/remove against the test account
(external mutation); confirm the record on the PDS and that teardown removed it.
Extend the guarded `@live` purge into a shared multi-collection helper (in
`tests/e2e/helpers/live.ts`) hard-scoped to `TEST_DID`
(`did:plc:xyfhcaweaeyew3zrgk6jaln7`), covering `app.arecipe.friend` now and
comment/interaction/mute as later phases land (see the M4 cross-phase
guarded-purge note for the markerless-collection guard).
**Stop-point.**

### Phase 9b: Comments (threaded) — ✅ SHIPPED (2026-07-08, Phase 9b close-out commit) — sequenced M4 #2  ⚠️ SUPERSEDED discovery: comment discovery is migrated off `listFriends` onto the cookbook scope at CB1 (the comment records + threading + `@live` write are unchanged)

**Delivered:** friends-scoped threaded comments on the recipe page.
`src/social/comments.ts`: `buildCommentRecord`/`listCommentsFor`/`buildThread`/
`commentOnStaleRevision`/`loadRecipeComments` (unit-tested, all mutation-
resistance edges — nesting top/reply/reply-to-reply, orphaned-parent-at-top,
AT-URI-survives-CID-change, stale both edges) + `addComment` (@live). Threading
keys on the parent **AT-URI** (edited parent still nests); the recipe ref stays a
pinned strongRef (alteration detectable). Recipe page is now session-aware and
mounts the comment section (friends-scoped discovery: recipe author + you +
friends), with a compose box + reply when signed in and a read-only + sign-in
note when out. Hermetic proves the signed-out threaded render; `@live` proves
comment → appears → reply nests (7.6s). Full hermetic gate (32 e2e + unit) green.

**Deviations from the Pass-3 spec (all recorded, none silent):**
- **`renderComments` lives in `src/social/comments-view.ts`, not `view.ts`** —
  the plan's sanctioned alternative; taken because `view.ts` carried unrelated
  in-flight image-credit WIP (since landed as `b3f9842`) and this keeps the
  write-sets disjoint.
- **Added a "Social" settings panel + Hide Comments toggle** (new files
  `src/social/prefs.ts` + `settings.ts` edit) per a user request 2026-07-08.
  Hide Comments is wired (skips the section); Hide Likes is scheduled into 9c.
- **Recipe-page bundle regressed 49K→930K** (session-awareness pulls
  `@atproto/api`). User-confirmed to ship now; the code-split fix is filed in the
  M4 backlog ("lazy-load auth on the recipe page").
- Actual 9b write-set: `src/social/comments.ts`, `comments-view.ts`, `prefs.ts`,
  `src/pages/recipe.ts`, `src/pages/settings.ts` (not `view.ts`), + tests + docs.

**Goal:** `app.arecipe.comment` (recipe strongRef + text + optional parent
**AT-URI** for threading) rendered on the recipe detail page; author your own.
Every commenter is a resolvable atproto identity (D9 dropped — no unsigned
path), so comments render uniformly; author names link to Bluesky profiles.
**Threading decision (Pass 2):** the parent reference threads by **AT-URI**
(follows the latest revision, so an edited parent still resolves), while the
recipe reference keeps the full strongRef (uri+cid) for provenance — the same
mutable-vs-pinned split settled in Phase 8.
**Shape confirmed 2026-07-08 (execution, user-confirmed): friends-scoped
discovery.** In a backendless app, `app.arecipe.comment` records live in each
commenter's own PDS and nothing indexes them globally (recipe.exchange's AppView
does not know our lexicon — D8). So the recipe page discovers comments only from
repos it already knows: the **recipe author** (always queryable — the page
already resolves the author's PDS), **you** (when signed in), and **your
friends** (the 9a graph). Non-friends' comments are invisible — honest for a
backendless, friends-scoped app at 12–25 scale, and coherent with 9a/9d/10.
Consequences: the recipe page gains session-awareness (was pure public read);
signed-out shows the author's own comments (read-only, and the hermetic test
seam); signed-in adds a compose box + reply and folds in your + friends'
comments. 9d later merges these into the activity feed. Wiring split mirrors 9a
(user-confirmed): **hermetic** proves the threaded render + reply nesting +
orphaned-parent fallback over routed fixtures (author-repo comments, no session);
**`@live`** proves the write path (comment → appears → reply nests) with a
guarded `app.arecipe.comment` purge.
**Changes (planned; re-confirm shape at 9b start):** `src/social/comments.ts`
(write/list/thread-build), comment section + compose box added to
`src/pages/recipe.ts` rendered via a new `renderComments` in
`src/recipes/view.ts` (or `src/social/comments-view.ts` if `view.ts` grows).
**Wiring test:** comment on a recipe → appears threaded on its page; a reply
nests under its parent. `@live` write + guarded teardown (purge extended).
**Depends on:** 9a (identity/feed patterns, guarded purge), `refs.ts`.
**Read-set:** `src/pages/recipe.ts`, `src/recipes/refs.ts`, `src/identity/did.ts`.
**Write-set:** `src/social/comments.ts`, `src/pages/recipe.ts`,
`src/recipes/view.ts` (comment render), tests.
**Shared-state contract:** writes `app.arecipe.comment` to the signed-in PDS
(guarded test account). Shares `recipe.ts`/`view.ts` with 9c → **sequential
with 9c** (see Concurrency).
**Diagnostic logging (Pass 3):** comment write at info (recipe uri, parent uri
if a reply); thread-build fallback (a parent AT-URI that no longer resolves —
render orphaned at top level rather than dropping) at warn; list/read failure
at error. The threaded read must be debuggable from the console.
**Mutation resistance (Pass 3):** the threading test asserts BOTH edges of the
mutable-vs-pinned split settled in Phase 8 — (a) a comment whose parent recipe
was *edited* still resolves and renders because the parent thread reference is
by **AT-URI** (mutation: pin it to a CID → the test must go red when an edited
parent stops resolving); (b) the recipe **strongRef** (uri+cid) still flags an
altered recipe body loud (reuse the Phase 8 same-CID/new-CID assertion). Name
the reply-nesting boundary too: a top-level comment (no parent), a direct reply,
and a reply-to-a-reply, so a flattened-threading regression fails.
**Done when:** threaded comments read+write on recipe pages, author names
linked to profiles. **Validation:** Broad (external write). **Stop-point.**

### Phase 9c: Interactions (cooked / saved) — sequenced M4 #3  ⚠️ SUPERSEDED: the built-but-parked likes/saved is *landed* on the cookbook scope at CB2 (discovery migrated off `listFriends`; the `@live` like write is re-tested for the unrooted-write issue)

**Goal:** `app.arecipe.interaction.cooked` (recipe strongRef, optional rating/
notes/photos — reuse the Phase 7 EXIF-safe `prepareImage`/`uploadRecipeImage`)
and `…saved`; buttons + counts on recipe cards/detail; a "Saved" view under My
recipes.
**Reshaped 2026-07-08 (user decisions) — likes + saved; cooked deferred.**
- **Kinds: `liked` + `saved` only — `cooked` is DEFERRED** (it was the heaviest:
  ratings/notes/photos; can return later). `saved` = private bookmark with a
  "Saved" view under My recipes; `liked` = one-tap public approval (heart +
  count).
- **`liked` surfaces:** `Foo Recipe · N likes` on the name/title line (Browse
  tiles + detail) and a heart on the recipe **image**. **Counts are
  friends-scoped** (same backendless boundary as comments — you can only count
  likes from repos you know, you + friends); copy must be honest, not a
  pretend-global count.
- **Liking happens ONLY on the recipe detail page — NOT from Browse.** Browse
  ships zero auth code (a tested guarantee) and liking is an auth'd write. So
  Browse tiles show the heart + count **read-only** (display); tapping a tile
  opens `recipe.html`, where the heart actually likes (the recipe page is
  already session-aware with deferred auth). Browse stays a pure read surface —
  the "Browse ships zero auth code" e2e stays valid unchanged.
- **Hide Likes** toggle joins the 9b "Social" settings panel (`src/social/
  prefs.ts` — reserve the key; off by default), hides the hearts + counts.
- Wiring split as 9a/9b: hermetic renders counts from routed fixtures; `@live`
  proves the like write (+ guarded `app.arecipe.interaction` purge).
**Changes (planned; re-confirm at start):** `src/social/interactions.ts`
(write/list/count), buttons in `src/pages/recipe.ts` + `src/recipes/view.ts`
card chips, a saved list in `src/pages/mine.ts`.
**Wiring test:** mark cooked/saved → reflected on the recipe and in My recipes;
a cooked photo round-trips EXIF-stripped (reuse the Phase 7 fixture assertion).
**Depends on:** 9a, Phase 7 (blobs).
**Read-set:** `src/pages/recipe.ts`, `src/pages/mine.ts`, `src/recipes/view.ts`,
`src/recipes/images-upload.ts`, `src/recipes/refs.ts`.
**Write-set:** `src/social/interactions.ts`, `src/pages/recipe.ts`,
`src/recipes/view.ts`, `src/pages/mine.ts`, tests. (4+ files → **split** at
execution: 9c-i write+recipe-page, 9c-ii card counts + Saved view.)
**Shared-state contract:** writes `app.arecipe.interaction.*` + blobs to the
guarded test account. Shares `recipe.ts`/`view.ts` with 9b → **sequential**.
**Diagnostic logging (Pass 3):** cooked/saved write at info (recipe uri, kind);
blob upload reuses the Phase 7 upload logging; count-aggregation read failure at
warn (degrade to a hidden/zero count, never blank the card); interaction list
failure at error.
**Mutation resistance (Pass 3):** count logic asserts edges, not a single point
— zero interactions renders no chip (or an explicit 0 per the design call), one
renders 1, and the toggle is idempotent (marking cooked twice does not double the
count / create a second record). The cooked-photo test reuses the Phase 7 fixture
assertion that EXIF is provably gone on the uploaded bytes (both edges: a
GPS-bearing input, and the stripped output).
**Sizing (Pass 3):** confirmed 4+ files → **split at execution** as already
flagged (9c-i = write path + recipe-page buttons; 9c-ii = card counts + Saved
view). Each sub-phase keeps its logic surface ≤3 `.ts` and gets its own wiring
test and stop-point.
**Done when:** interactions read+write with counts and a Saved view.
**Validation:** Broad (external write + blob). **Stop-point.**

### Phase 9d: Friends activity feed (POLLED) — sequenced M4 #4

**Restructured 2026-07-08 (user):** the committed feed is **poll-based**, not
Jetstream. A backendless SPA holding a firehose WebSocket is an unproven cost
for unclear benefit at the 12–25 scale — polling `listRecords` per friend on
load/refresh is simpler, cacheable (offline via the 8b fallback), and
sufficient. **Live-tail via Jetstream is demoted to an optional enhancement
(9e), gated on a perf spike.** Affinity ordering is **deferred** — chronological
first (newest across friends); affinity only if flat chronology proves
inadequate in use.
**Goal:** a "Friends activity" view — friends' recent recipes (and, once 9b/9c
ship, comments/interactions), merged newest-first, each Tier 2-verified,
polled on load with a manual refresh. Reuses `loadFriendsFeed`/`feed.ts` from 9a.
**Changes (planned; re-confirm at start):** feed view on `friends.html`
(merge + sort recipes across friends by `createdAt`), a refresh control,
"showing saved copies" offline note (reuse the 8b fallback).
**Wiring test:** two friends' recipes appear merged newest-first; refresh
re-polls; offline shows cached copies.
**Depends on:** 9a (friends + `feed.ts`); enriched by 9b/9c when present.
**Read-set:** `src/social/feed.ts`, `src/social/friends.ts`, `src/recipes/cache.ts`.
**Write-set:** `src/pages/friends.ts`, `src/social/feed.ts` (merge+sort), tests.
**Shared-state contract:** reads only (public `listRecords`); IndexedDB cache.
No PDS writes, no WebSocket, no new ambient state.
**Diagnostic logging (Pass 3):** poll start at debug (friend count); per-friend
result at debug (handle, record count, or cache-fallback); merge result at info
(total items, sources served-live vs served-from-cache); per-author failure at
warn reusing the `loadStarterFeed` fallback (cached copies offline, never blank).
The polled feed must be debuggable from the console — which friend was slow,
which served stale.
**Mutation resistance (Pass 3):** the merge+sort test asserts ordering with
interleaved timestamps across ≥2 friends (e.g. friend A older/newer than friend
B), so a flipped or stable-but-wrong comparator fails — not a single
already-sorted list. Assert the offline edge too: with the network down, cached
copies render and are marked as saved copies (both edges: live vs cached).
Each merged item stays Tier 2-verified (reuse the Phase 4 verify assertion).
**Risks:** N friends = N requests per refresh (fine at 12–25; note if it grows).
**Done when:** merged chronological friends feed, polled, offline-tolerant.
**Validation:** Moderate — real multi-friend feed load + offline check (read-only;
Moderate is correctly calibrated — no external mutation).
**Stop-point (M4 social core complete without live-tail).**

### Phase 9e (OPTIONAL): Jetstream live-tail — spike-gated

**Only if a perf spike justifies it.** Discovery proved Jetstream *works*
(D7); this phase asks whether it's *worth it* in a backendless SPA: measure a
real WS subscription's memory/CPU/battery and reconnect behavior on a phone
over hours, against the polling baseline. If the live-update value clears that
cost, build `src/social/jetstream.ts` (subscribe `wantedDids`×`wantedCollections`,
`cursor` persistence, backoff reconnect, Tier 2-verify, degrade to 9d polling
on failure). Otherwise, don't — polling stands. **Depends on:** 9d. **Done
when:** a spike report says go/no-go; if go, live updates layer onto the polled
feed without replacing it.
**Validation (Pass 3 — honesty check):** this phase is a Discovery-Exemption
spike, so "the spike IS the gate" is honest: its deliverable is a **written
go/no-go report** (measured memory/CPU/battery + reconnect behavior on a real
phone over hours, against the polling baseline), **not a test suite**. No
production code and no TDD until a "go" verdict; on "go", the build that follows
gets normal TDD (unit + wiring test) and layers `jetstream.ts` onto — never
replacing — 9d's polling. On "no-go", nothing ships and polling stands. 9e is
off the M4 critical path; skipping it entirely leaves M4 complete.

### Phase 10: Immune system / moderation — sequenced M4 #5 (spec Layer 8)

**Goal:** the real mute system, **promoting the 5f exclusions-lite** into
`app.arecipe.mute.*` (person/recipe/tag/list/listitem/listblock) — inherited
mutes applied client-side with a legible inheritance path; canonical baseline
lists; optional labeler. Bounded to 12–25 scale. **Inheritance is
presence-based** (a friend's mute list is applied if you subscribe to it);
affinity-*weighting* is optional and only layers in if 9d's deferred affinity
work ever ships.
**Changes (planned; re-confirm at start):** promote `src/recipes/exclusions.ts`
→ `src/social/mutes.ts` (records, not just localStorage; keep the local
overlay as the offline layer), a subscription/inheritance resolver, mute
management UI in settings.
**Depends on:** 9a (graph), 5f (overlay model — the seed). (Affinity weighting
optional, only if 9d affinity ships.)
**Read-set:** `src/recipes/exclusions.ts`, `src/social/friends.ts`,
`src/pages/settings.ts`.
**Write-set:** `src/social/mutes.ts`, `src/pages/settings.ts`, and the
filter-application sites — name them explicitly: `src/social/feed.ts` (feed
filtering) and `src/recipes/view.ts` (render-time hiding). That is 4 files →
**flag a split at execution (Pass 3):** 10-i = `mutes.ts` records + the
subscription/inheritance resolver (+ its `@live` guarded write); 10-ii = the
settings mute-management UI + applying the filter in `feed.ts`/`view.ts`. Confirm
the shape at 10 start (deferred, like 9b–9d); keep each sub-phase's logic surface
≤3 `.ts`.
**Shared-state contract:** writes `app.arecipe.mute.*` to the guarded test
account (extends the 9a shared multi-collection purge to `app.arecipe.mute`);
reads friends' public mute lists.
**Diagnostic logging (Pass 3):** mute add/remove and list-subscribe/unsubscribe
at info; inheritance resolution at debug (which subscribed list contributed each
applied mute — the "legible inheritance path" must be reconstructable from logs);
a friend's mute list that fails to resolve at warn (degrade to your own mutes,
never over- or under-hide silently).
**Mutation resistance (Pass 3):** assert BOTH edges of presence-based
inheritance — (a) a recipe/person is hidden when you subscribe to a list that
mutes it; (b) the *same* item is visible when you do not subscribe, and visible
again when you explicitly override an inherited mute (the 5f both-edges model).
Boundary: a directly-muted item, an inherited-muted item, and an
inherited-then-overridden item must render differently, so a regression that
ignores overrides or over-applies inheritance fails.
**Done when:** subscribable mute lists + presence-based inheritance, all
overrideable (both edges, per the 5f model). **Validation:** Broad (external
write of `app.arecipe.mute.*` to the guarded test account).
**Stop-point (M4 complete).**

### M4 Concurrency Map

Sequential spine: 9a → 9b → 9c → 9d → [9e optional] → 10.
- **9a → rest:** later phases reference records 9a's identity/friend layer and
  the extracted `feed.ts` create. Sequential by data dependency.
- **9e is optional and spike-gated** (Jetstream live-tail) — layers onto 9d's
  polled feed only if a perf spike justifies it; not on the critical path to
  M4 completion.
- **9b vs 9c — SEQUENTIAL (corrected in Pass 2).** Both write
  `src/pages/recipe.ts` AND `src/recipes/view.ts` (comment render + interaction
  chips live on the same detail page). Shared write-set → the hard rule forbids
  parallel. (The pre-Pass-2 note calling them a "parallel candidate" was wrong —
  it hadn't compared write-sets.)
- **9d** writes `src/social/feed.ts` + `src/pages/friends.ts` — both also written
  by 9a; sequential ordering (9a before 9d) makes the overlap safe.
- **10** writes `src/social/feed.ts` (shared with 9a/9d) and `src/recipes/view.ts`
  (shared with 9b/9c) as filter-application sites, plus `src/social/mutes.ts` +
  `src/pages/settings.ts`. These overlaps with earlier phases are exactly why 10
  is last on the spine — the hard rule forbids running it beside any phase it
  shares a write-set with.
- No disjoint subgraphs worth parallelizing. Write-set disjointness re-checked at
  Pass 3 against the (now explicit) per-phase Write-sets: every adjacent pair on
  the spine shares at least one file (9a↔9d on `feed.ts`/`friends.ts`; 9b↔9c and
  9b/9c↔10 on `recipe.ts`/`view.ts`; 9a↔10 on `feed.ts`), so the spine is
  sequential by construction, not by default.
All phases sequential; reason recorded above. No worktree/parallel dispatch for
M4 — so no re-entry-verification fields are required per phase.

**Parked (from M1): structured ingredients as records** — a future
`app.arecipe.ingredient` (+ starter pack), dual-writing flattened strings into
`exchange.recipe.recipe` for interop. Revisit after M4 or when a
composition/grocery feature is actually pulled.

**Backlog (filed 2026-07-08): client-side search over the verified cache** —
dynamic search across recipes, authors, and (friends-scoped) comments. **Its own
phase-plan pass before execution.** Key framing already established: search is a
*runtime* index over `src/recipes/cache.ts` (IndexedDB), NOT a build step —
content is fetched live from PDSs and doesn't exist at build time, so a
build-time SSG/search story (Astro + Pagefind, etc.) is the wrong fit and would
also break the locked no-framework + small-signed-bundle (trust-surface)
decisions. Approach: a tiny, auditable single-file full-text index
(MiniSearch/FlexSearch-class, prefix + fuzzy) built from `cache.list()` at load.
Scope follows the data model: recipes + authors are searchable over whatever's
cached (starter + friends + browsed); *global* recipe search would need
recipe.exchange's AppView (optional, third-party, durability caveat); **comment
search is bounded by 9b's friends-scoped discovery** — you can only search
comments you can see. Discovery gate for that pass: a **D6-style bundle-cost
probe** of the chosen index library (trust-surface budget), the same bar
`@ipld/dag-cbor` was held to. (Origin: user raised Astro-for-search 2026-07-08;
ruled out for the reasons above.)

**✅ DONE (2026-07-08, `030f57f`): themed "no meal image" card standin** — split
the user-supplied 1024² contact sheet into `assets/no-meal-{light,dark}.png`
(labels cropped, transparency kept) and pointed `placeholderEl` (in
`src/recipes/view.ts`) at them instead of the wordmark logo, reusing the same
light/dark CSS pair mechanism. Precached for offline. The contact-sheet source
stays untracked (not shipped). Unit test updated (both variants asserted).

**✅ DONE (2026-07-08): lazy-load auth on the recipe page (code-split)** — the
recipe page now defers `bootSession` (and its `@atproto/api` dependency) behind a
dynamic `import()` in `mountComments`: the detail + the recipe author's comments
render from the light read path, then the auth client loads as a split chunk only
after (signed-in → compose/reply + friends' comments). Implementation:
- `scripts/build.mjs`: `splitting: true` + `chunkNames`. Bonus — `@atproto/api`
  now dedupes into ONE shared chunk (~895KB) instead of a copy per auth page.
  Per-page ENTRY bundles dropped to single-digit KB (recipe 8K, browse 3K, …);
  note build-info `pages[].bytes` now reports the entry only, not entry+chunks.
- Verified via the esbuild metafile: the heavy atproto chunk is NOT a static
  import of the recipe entry (loads only on the deferred `import()`); browse/
  settings never import it; mine/friends/account/editor still load it (they need
  auth on load).
- SW precache excludes chunks > 150KB (the atproto chunk) — it can't be used
  offline anyway (OAuth needs the network) and the fetch handler runtime-caches
  it on first use; precaching it bloated every install and defeated the split.
  Build logs the deferred chunk (no silent caps).
- `playwright.config.ts`: `workers: 2` — with more precache files per install,
  the default worker count starved concurrent no-cache precache fetches on the
  shared dev server, blanking the offline boot. (User-confirmed 2026-07-08.)

### M4 Documentation Impact

- `docs/DESIGN.md` — a "Friends" 3rd nav destination changes the top-bar/tab
  narrative (handled in **9a**, same-phase). The comment surface on the recipe
  page gets its DESIGN entry in **9b**, the interaction (cooked/saved chips +
  Saved view) surface in **9c**, and the mute-management UI in **10** — each in
  the phase that makes the design narrative stale, not deferred to a trailing
  docs phase (Pass 3: the earlier "handled in 9a/10" lumping would have left
  9b/9c design surfaces undocumented until a later phase touched DESIGN.md).
- `docs/PRACTICES.md` — the guarded-`@live`-purge pattern generalizes across
  collections (recipe, draft, friend, comment, interaction, mute); fold a
  "guarded multi-collection purge" note when 9a extends it.
- `README.md` — Building/dev section: note the new page entries (friends/feed)
  once they exist. Handled in 9a.
- New files (`src/social/*`, `friends.html`, maybe `feed.html`): grepped — no
  references outside the phases that create them.

**M4 open questions — all resolved with the user (2026-07-08 walk-through):**
- [RESOLVED] D9 unsigned→verified promotion → **dropped.** All identity is
  atproto for now; no non-Bluesky path. (See D9.)
- [RESOLVED] Live feed via Jetstream → **demoted to optional 9e, spike-gated.**
  Polling is the committed feed (9d); a backendless SPA holding a firehose is
  an unproven cost for unclear benefit at this scale.
- [RESOLVED] Affinity ordering → **deferred.** Chronological feed first;
  affinity only if flat chronology proves inadequate in use.
- [RESOLVED] "Friends" as a 3rd top-level tab → **yes, try it and evaluate in
  use** ("let's try one and see").

---

### Phase 11: Multi-authority delivery and trust (ROADMAP — pre-launch gate, re-plan before executing)

**Goal:** Offline Ed25519 key ceremony, signed release manifest, `app.arecipe.status`
canary (NSID renamed per the NSID resolution), service-worker verify-before-install
flow, multi-origin hosting + DNS
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

- [RESOLVED 2026-07-07, M1 checkpoint] **Bundle budget → accept @atproto/api for
  M3 velocity, with visibility baked in.** Measured: 915 KB min / 174 KB gz;
  `@atproto/api` = 62% (570 KB — every Bluesky lexicon for one Agent wrapper).
  User chose accept-and-document, with a hard rider: **the app must carry
  console logging and a visible way to see the bundle/version** — a build
  stamp (version + built-at + main.js size/gzip) generated at build time,
  logged at startup, and rendered in the shell footer (mealplanner's visible
  version stamp, upgraded into the trust story). Thin XRPC port (−62%) and
  auth code-splitting stay on the table for launch prep (Phase 12 planning),
  or earlier if the size starts to bite.

- [RESOLVED 2026-07-07, M1 checkpoint] **Offline app shell → YES: arecipe.app is
  a fully offline-capable PWA.** A minimal cache-first service worker + web app
  manifest (installability) join the M3 scope as their own phase (spec'd in the
  M2/M3 re-plan; see Phase 8b stub). The verify-before-install SW still lands at
  Phase 11 and replaces/extends the M3 worker. Known interaction: a SW fetch
  handler bypasses Playwright route interception — the hermetic tier needs
  `serviceWorkers: 'block'` (or equivalent) for fixture-routed specs when the
  caching SW lands.

- [RESOLVED 2026-07-07] **Drafts on the PDS are public → accepted.** Recipe drafts
  are low-sensitivity; PDS sync stays as specced. Two follow-ons recorded: (a)
  during development, all drafts are written to the test account's PDS
  (`@ngvalidation2112`) and the Phase 6 crash-safe pre-run purge explicitly covers
  the draft collection; (b) for real users the authoring UI should disclose that a
  synced draft is publicly readable — folded into Phase 8's scope (a disclosure
  line in the editor, not a modal).

- [CONFIRMED: ADVISORY — user, 2026-07-07 ("sure lets try it out")] **Dark
  palette hues** (added at the M2/M3 re-plan):
  the dark enamelware token values are designed inside Phase 5c via
  screenshot iteration against the contrast floors — no upfront decision
  needed. *Rationale: pure design-time iteration, same loop as the skeleton.*

- [CONFIRMED: ADVISORY — user, 2026-07-07] **Client identity moves with the domain** (added at
  the M2/M3 re-plan): the hosted OAuth client_id is the metadata URL, so the
  arecipe.app cutover (Phase 12 territory) mints a new client identity and
  existing sessions re-consent once. *Rationale: acceptable pre-launch;
  just needs remembering at Phase 12 planning.*

- [RESOLVED 2026-07-07] **NSID namespace authority → rename to `app.arecipe.*`.**
  The maintainer owns **`arecipe.app`** ("bought and paid for"; `arecipe.fyi` was a
  first thought, not the real domain). Neither `recipe.fyi` nor `arecipe.fyi` is
  controlled, so the spec's `fyi.recipe.*` namespace is replaced by `app.arecipe.*`
  (reverse of arecipe.app — same pattern as bsky.app → `app.bsky.*`). Applies to
  every app-scoped lexicon (draft, friend, comment, interaction.*, mute.*, status,
  release, starterpack, group.manifest). The spec's own Layer 3 already references
  `arecipe.app` DNS, so this also resolves the spec's internal arecipe.fyi/arecipe.app
  inconsistency in favor of arecipe.app — errata updated.

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

### Feasibility amendment (post-Pass 3) — 2026-07-07
Two freeform execution/feasibility analyses, run outside the structured gates and
folded in additively: one prior review plus an independent second pass that
verified its claims against the spec and the atproto docs before incorporating.
Evidence tiers are marked: **[verified]** = confirmed against
bluesky-social/atproto oauth-client-browser README or the spec text on 2026-07-07;
**[probe]** = plausible, deferred to a Phase 0 probe.

**Externally verified findings (drove rescoping):**
- **[verified]** `BrowserOAuthClient` persists sessions itself; `init()` restores.
  → Phase 3's `session-store.ts` rescoped to `session-provider.ts` (the D5 port
  wrapping the library store) — do not rebuild library persistence. Multi-tab
  behavior undocumented → Phase 3b converted to verify-then-build.
- **[verified]** Browsers cannot resolve handles (no DNS TXT; `.well-known` is
  CORS-hostile); `handleResolver` service is required. → Phase 2 resolution method
  corrected; resolver recorded as a deliberate, configurable third-party
  dependency. Spec Layer 1 errata recorded in Documentation Impact.
- **[verified]** Loopback clients get ~1-day refresh tokens. → Phase 3's
  persistence criterion bounded to the loopback lifetime; long-lived persistence
  validated at M3 (hosted client); D1 records observed lifetimes. New finding not
  present in the prior analysis.
- **[verified, spec]** The spec assigns the service worker to Layer 3 → Phase 11
  owns it; consequence surfaced: the M3 MLP has no offline shell → new open
  question (M1 checkpoint).
- **[verified, spec]** `fyi.recipe.*` NSID authority = `recipe.fyi` ≠ the spec's
  DNS authority `arecipe.fyi` → new open question (Phase 8). New finding.
- **[verified, spec-silence]** PDS records are public; `fyi.recipe.draft` synced
  for eviction survival is world-readable and the spec doesn't say so → new open
  question (Phase 8). New finding.

**Structural changes:**
- **New D5 (auth test seam):** wiring tests for Phases 4–8 run over a real
  app-password session injected through a session-provider port — not through
  Playwright driving bsky.social's consent pages (third-party UI: 2FA/captcha/rate
  limits; the test account's email is not automatable). The interactive OAuth flow
  is tested where it IS the feature: Phase 3's wiring test, `@live` tier.
  Documented caveat: Bearer ≠ DPoP failure modes, so the `@live` tier's exclusive
  coverage is recorded. Disposition `promote` → Phase 3.
- **New D6 (CID verification depth):** Phase 4's `verified` flag was undefined
  (verify what against what?). Three tiers named; Tier 1 (trust the PDS-reported
  CID) rejected as dishonest; default Tier 2 (recompute from received record),
  Tier 3 (sync CAR + commit signature = full credible exit) as later hardening.
  Probe measures the dag-cbor dependency's bundle cost. Disposition `promote` →
  Phase 4. New finding.
- **CI test-tier split (Phase 1):** hermetic tiers (`test:unit`, `test:e2e` with
  route fixtures) in push CI; `test:live` (credentials + live PDS) runs locally as
  each phase's gate / nightly. Without this, push CI goes permanently red at
  Phase 3.
- **Phase 5 validation recalibrated:** two-physical-device demo deferred to M3
  (loopback client unreachable from a second device; hosted client is a locked M3
  item). M2 = two contexts + two browsers on one machine; milestone note added.
- **Concurrency Map:** D5/D6 added — {D2, D4, D6} parallel public reads; D1 → D5
  serialized on the test account.

**Risk notes added (probe/execution-time):**
- **[probe]** Crash-safe test cleanup (Phases 6–8): per-run rkey prefix + pre-run
  purge; teardown alone doesn't survive a crashed test.
- **[probe]** Blob retention: PDS garbage-collects unreferenced blobs — commit the
  referencing record promptly after `uploadBlob` (Phase 7).
- **[probe]** Auth-server rate limits: `@live` runs reuse cached sessions rather
  than fresh logins per test (Phase 3).
- recipe.exchange indexes via the firehose — interop comparisons stay
  manual/generously-timed, never tight automated polls (Phase 4/6).
- Fail-loud calibrated to atproto's open-world model: tolerate + preserve unknown
  fields; fail loud only on required-field violations (Phase 4).
- `navigator.storage.persist()` commonly denied headless — log, never assert
  (Phase 8). Phase 1 shared-state contract corrected: Playwright's web server binds
  one ephemeral port per run (the "CI binds no ports" claim was wrong).

**What was checked and NOT incorporated:** pulling the hosted OAuth client forward
to fix Phase 5 — rejected because "hosted client at M3" is a locked decision and
the two-context evidence satisfies the automated milestone; the physical demo moves
to M3 instead.

**Open questions:** three new, walked through with the user same day. Outcomes:
- **NSID authority → RESOLVED:** owned domain is `arecipe.app`; namespace renamed
  `fyi.recipe.*` → `app.arecipe.*` throughout the plan (Phases 8, 9, 11); spec
  errata updated (also settles the spec's internal arecipe.fyi vs arecipe.app
  inconsistency in favor of arecipe.app).
- **Drafts privacy → RESOLVED: accepted** (drafts are public); dev drafts live on
  the test account and are covered by the pre-run purge; editor gains a one-line
  public-drafts disclosure (Phase 8).
- **Offline shell → CONFIRMED PHASE-GATED (M1 checkpoint)** per the
  recommendation.

**Confirmed ready:** Yes — unchanged from Pass 3. No BLOCKING items; one
PHASE-GATED item (offline shell, decided at the M1 checkpoint) and one ADVISORY
(Playwright harness, from Pass 3). Execution starts at Phase 0.

### Phase 0 execution — 2026-07-07 (D2/D3/D4/D6 done; D1/D5 pending credential)
Public-read probes and the toolchain spike ran first per the Concurrency Map;
D1→D5 wait on the out-of-band credential. Findings recorded in Verified
Assumptions (five new/updated entries) and inline on the D-tasks. Highlights:
- **D2:** public read path unauthenticated AND CORS-open (`*`) end to end,
  including `sync.getBlob` and plc.directory — better than assumed (CORS was the
  open risk for a browser app). Fixtures: `tests/fixtures/atproto/`.
- **D4:** lexicons captured (website + canonical `lexicon.schema` record, which
  also proves the canonical mirror path works). Two spec-vs-practice
  discrepancies: optional `langs` skew; **ULID rkeys despite `key: tid`** —
  decision note added to Phase 6.
- **D3:** vanilla TS + esbuild + Vitest + Playwright green including SW +
  IndexedDB e2e in 2.4 s; **baseline bundle 2,713 B (~1.3 KB gz)**; Playwright
  verdict **go**. Scaffold promoted in-repo (flagged SPIKE), `.gitignore` added
  (`.env` ignored ahead of D1).
- **D6:** Tier 2 CID recompute exact-matches a real record; deps 12.2 KB gz.
  **Decision: Tier 2 in Phase 4, Tier 3 deferred as named hardening.**
- New risk note on Phase 7 from a D2 observation: real-world blobs carry GPS
  EXIF; full-size upload path must strip EXIF, not just the thumbnail path.
- Probe hygiene: the fetched third-party blob (personal photo w/ GPS EXIF) was
  deleted, not kept as a fixture.

### Phase 0 close-out — 2026-07-07 (D1/D5 done; Phase 0 ✅ COMPLETE)
- **D1 (OAuth e2e): full pass.** Login → consent → callback → authenticated
  DPoP read → reload-restore → two forced refreshes → two-tab share, all against
  the real PDS. Three plan-binding catches: explicit scope required
  (`transition:generic`), v0.4.6 has no event API, access token ≈ 1 h. Phase 3
  spec annotated. Spike archived to `spike/d1-oauth/` (throwaway disposition,
  kept for diagnostic value per execute.md).
- **D5 (seam): proven.** App-password Agent ≡ OAuth Agent for appview reads and
  repo create/read/delete (teardown verified, scratch collection
  `app.arecipe.probe`). Scoped app-password `arecipe-phase0-tests` minted and
  recorded in `.env` (kept for `@live` tests — re-entry item (c) satisfied as
  "recorded"). Bonus: PDS auto-mints TID rkeys — Phase 6 rkey note resolved to
  "omit rkey, let the PDS mint TIDs."
- **Re-entry verification (parallel probe set):** (a) all findings in Verified
  Assumptions ✓; (b) no orphan processes — probe HTTP server stopped, port 8127
  verified clear ✓; (c) app-password recorded ✓; (d) dispositions honored — D1
  throwaway→`spike/`, D2/D4 fixtures in `tests/fixtures/`, D3 promoted in-repo
  flagged SPIKE, D6 algorithm archived in `spike/d6-cid/` pending Phase 4 TDD ✓.
- **Incident (recorded per report-outcomes discipline):** a Playwright failure
  log mid-D1 dumped the DOM state of the filled password field, putting the
  test account's **main password into the session transcript**. The driver was
  fixed (check-before-fill, no retry on filled fields). Recommendation to the
  maintainer: rotate `@ngvalidation2112`'s main password, then re-mint the
  app-password (one `spike/d1-oauth/mint-app-password.mjs` run). The account is
  a dedicated validation account; blast radius is limited to it.
- **Plan impact:** no phase restructuring needed — every Phase 0 finding
  confirmed or sharpened the existing specs (scope note on Phase 3, rkey
  default on Phase 6, EXIF note on Phase 7). Phase 1 is unblocked.

### Post-M3 polish: retry the transient own-repo fetch — 2026-07-08
The M3-demo transient (My-recipes "Published" own-repo fetch failing once
post-OAuth-redirect) is fixed. New `src/retry.ts` `retryOnce` (TDD: succeeds
first try / recovers on second / throws the second error) wraps the
own-recipes `resolveDidDoc` + read; the recipe-page revision check was
refactored onto the same helper (was open-coded). Gate green.

### M3 live click-through punch-list — 2026-07-08
Full user session walked in real Chrome (mobile viewport) against the shipped
build — landing feed, recipe detail, dark mode, editor+draft, settings.
Zero console errors; UX holds up. Findings (design/feel, none blocking):
1. **Disabled Publish button looks enabled** — when signed out, Publish is
   disabled but has no disabled styling, so it looks identical to Save draft.
   Fix: `.button:disabled` (dimmed + not-allowed cursor). [smallest, clearest]
2. **Photo-less hero is a large empty tile** — the official Greek salad has no
   photo, so its detail banner (and its first-card slot) is a big brand-mark
   placeholder. Options: shrink the placeholder banner on detail; and/or order
   photo-bearing cards first in feeds; and/or give the seed an original photo.
3. **First impression is a photo-less card** (arecipe.bsky.social is starter
   author #1) — a food app's first card ideally shows food. Tied to #2.
4. Minor: "Hide this recipe" renders as a full button, reads a touch primary
   for a rare action; could be quieter.
Deferred as a small backlog; candidates to fold into M4 or a quick polish pass.

### INFRA NOTE — arecipe.app DNS-sinkholed from this network (2026-07-08)
Mid-session, arecipe.app began resolving to 146.112.45.x (Cisco Umbrella /
OpenDNS block range) from this network — connection resets. The site is
healthy (github.io origin 200/301; two-device demo passed ~30 min prior);
this is a network DNS filter blocking a newly-registered domain, typically
temporary. Not an app defect. Verify from another network / cellular; request
an allowlist if it persists. Live click-through was run against the identical
local build instead.

### M3 milestone reached — MLP shipped — 2026-07-08

### M4 re-plan — 2026-07-08

### M4 Pass 1 + Pass 2 (combined) + open-question walk-through — 2026-07-08
Ran the phase-plan skill's Pass 1 (reasoning + executable detail) and Pass 2
(gap analysis) over the M4 block, grounded in the actual codebase.

**Pass 1 added:** an M4 Reasoning paragraph (why sequential-by-data-
dependency; which proven surfaces each phase reuses); full field sets on 9a
(Call chain, Wiring test, Read/Write-set, Shared-state contract, Diagnostic
logging, two-tier Done-when, Broad Validation) and structural fields on
9b–10; an M4 Concurrency Map and M4 Documentation Impact section; one new
ADVISORY open question (Friends as a 3rd tab vs under Account).

**Pass 2 found (and fixed):**
- **9b/9c are NOT a parallel candidate.** Both write `src/pages/recipe.ts`
  AND `src/recipes/view.ts` (comments + interaction chips share the recipe
  detail page). Shared write-set → pulled to strictly sequential; the earlier
  "parallel candidate" note was made before comparing write-sets.
- **wantedDids × wantedCollections combine unverified → verified live** (AND;
  D7 updated). The friends feed's whole filtering model depended on it.
- **Threading must use AT-URI, not pinned CID** — an edited parent comment
  would otherwise orphan its children (the Phase 8 mutable-vs-pinned lesson).
  Recorded as the 9b threading decision.
- **Friend rkey strategy** named (PDS-minted TID, remove-by-subject-match;
  a `did:` isn't a valid raw rkey).
- **9c is 4+ files → split** flagged at execution (9c-i / 9c-ii).
- **Codebase grounding confirmed:** loadStarterFeed / createResolver /
  strongRefOf / createRecordReader / resolveDidDoc / retryOnce / the guarded
  @live purge / SW cross-origin rule all exist as the plan assumes. The 9a
  starter.ts→feed.ts loader extraction is a shared-write-set with 5e —
  behavior-preserving, starter tests must stay green.

**Confirmed:** the stop-anywhere sequencing holds; Jetstream + polling
fallback is the right transport pair; every phase reuses existing surfaces
rather than inventing. Analysis only — no code.

**Open-question walk-through (user, 2026-07-08) — all 4 resolved, reshaping M4:**
- D9 (unsigned→verified) **dropped** — all identity/engagement is atproto for
  now; no non-Bluesky path. 9b simplified (uniform rendering, profile links).
- Live feed **restructured**: 9d is now a **polled** friends activity feed
  (committed); Jetstream live-tail split out to **9e, optional + perf-gated**.
  Rationale (user): a backendless SPA holding a firehose is unproven cost for
  unclear benefit at 12–25 scale. Reasoning paragraph + Concurrency spine +
  Phase 10 affinity dependency updated to match.
- Affinity **deferred** — chronological feed first; Phase 10 inheritance is
  presence-based, affinity-weighting optional.
- Friends **3rd tab confirmed** ("try one and see") — evaluate the IA in use.
These are post-Pass-2 scope decisions, not new gaps; folded in additively.
Comprehensive plan, stop-anywhere sequencing (user-chosen), discovery-first.
D7 (Jetstream) + D8 (social lexicons are ours) probed and answered live; D9
(unsigned→verified) surfaced as a PHASE-GATED design question for 9b. M4
decomposed: 9a friends → 9b comments → 9c interactions → 9d live feed +
affinity → 10 moderation (promotes 5f exclusions-lite into app.arecipe.mute.*).
Each phase is a shippable stop-point. Spine sequential; 9b/9c a parallel
candidate. Not yet executable-sized past 9a (later phases depend on 9a's
record helpers) — each re-confirmed at its start per "no assumed behavior."
Also holding: the M3 click-through punch-list (4 items) as near-term polish
candidates.
The Minimum Lovable Product is live at https://arecipe.app: a small group can
find, author (draft-before-publish), photograph (EXIF-stripped), edit, and
version recipes that live in their own atproto accounts and appear on
recipe.exchange with no coordination — offline-capable, installable, with a
legible trust surface. **M3 exit demo passed** (2026-07-08): driven with the
test account across two independent browser contexts on the LIVE origin, both
completed real OAuth sign-in via the hosted client-metadata document, resolved
to the same DID (did:plc:xyfhcaweaeyew3zrgk6jaln7), and rendered the same
recipes. Known transient: the My-recipes "Published" own-repo fetch failed
once on one device post-redirect (network race; the PDS is healthy, CORS-open,
verified) — caught + shown gracefully; a one-shot retry is the candidate
hardening. Milestones M0–M3 complete. Next: M4 (social, Phases 9–10) and M5
(trust + launch, 11–12), each re-planned before execution.

**Phase 0 done-when check:** all BLOCKING questions resolved ✓ (none remain);
Verified Assumptions reflect firsthand evidence ✓ (9 probe-backed entries);
D3 produced a concrete toolchain ✓; no phase invalidated ✓.

### M2/M3 re-plan — 2026-07-07
Planning pass (analysis only) turning the M1/M2-checkpoint decisions into
executable M3 phases. Additive: existing Phases 6–8 specs stand with re-plan
notes; new phases inserted with full field sets.
**Structure:** M3 = 5b (page-per-destination + nav shell: 4 documents,
top bar with wordmark-home + gear, bottom tab bar on mobile, Browse ships
zero auth code) → 5c (native light/dark: prefers-color-scheme + one-tap
override, dark enamelware palette designed in-phase) → 6 (authoring on its
own `editor.html`, draft-before-publish local-first) → 7 (blobs + EXIF
strip) → 8 (PDS draft sync + versioning) → 8b (offline PWA: hashed assets,
versioned SW caches, same-origin-only fetch handling — resolves the route-
interception gotcha by construction — update toast, manifest + icons,
self-hosted fonts) → 8c (hosted `client-metadata.json` on the deployed
origin, sign-in un-hidden there, **M3 exits with the physical two-device
demo**).
**Gates applied inline** (the plan's cross-phase conventions govern):
every new phase carries wiring test, write-set, diagnostic logging,
calibrated validation (8b/8c Broad — real device / live origin). Concurrency
Map extended: all sequential (5c/6 share styles/nav write-sets — hard rule).
**Settings architecture** per the blockdoku/mealplanner references: App
management (`settings.html`, owns the build stamp details + integrity
explainer + About + update check) vs domain settings (`account.html`).
**New open questions:** two ADVISORY (dark palette in-phase; client_id
changes at the arecipe.app cutover — Phase 12 reminder). No BLOCKING items;
Phase 5b is ready to start on approval.
Held per the milestone plan: walking-skeleton demo (live render of rdur.dev's
verified recipes in real Chrome), mealplanner review, bundle-budget analysis,
UI-pattern research. Outcomes:
- **CI proven green on push** (Phase 1's last open criterion); first run caught
  the @live/.env module-load defect. Pages deploy job added; blocked on repo
  visibility — **user is making the repo public**; enable Pages + verify the
  deployed URL when it flips. Non-loopback guard shipped so the deployed app
  degrades to read-only instead of crashing (sign-in needs the M3 hosted client).
- **Mealplanner review:** adopt the UI skeleton — ≤3 top tabs, card panels,
  instructive empty states, segmented controls, visible version stamp,
  offline-first PWA feel. Avoid: flat manager-singleton architecture, sql.js
  local store, feature breadth (rotation/pantry/etc. are planning-domain;
  post-MLP candidates). arecipe's cold-start "demo data" is real network data —
  a strictly better story.
- **Bundle → RESOLVED:** accept @atproto/api for M3 velocity + bake in a build
  stamp (version/size, console + footer). Thin-XRPC (−62%) and code-splitting
  deferred to launch prep. (See Open Questions.)
- **Offline shell → RESOLVED: yes** — fully offline-capable PWA; Phase 8b stub
  added to M3 scope. (See Open Questions.)
- **Design iteration 2 (maintainer feedback on the live skeleton):**
  wordmark "a" differentiated (yolk-deep, lighter weight — reads "a recipe");
  Resolve+Load merged into one action ("Find recipes"), PDS line demoted to
  console diagnostics; footer colophon added (© 2026 Chase Pettet + GitHub
  source, one link) under the build stamp; **the stamp now explains itself**
  — clicking reveals a plain-language note ("matches the fingerprint it was
  published with — hasn't been altered…"), because the maintainer himself
  didn't know what "verified" meant, which made it noise, not trust surface.
  Tokens formalized (spacing/type/radii scales) + `docs/DESIGN.md` written
  (palette rules, type roles, machine-facts-in-mono, copy voice, a11y
  floors).
- **M2/M3 re-plan inputs (maintainer references, 2026-07-07):** from
  blockdoku (`settings.html` / `gamesettings.html` / `index.html`) and
  mealplanner (`?tab=settings`): settings split into **App management**
  (version/update/cache/install/About — plus arecipe's integrity explainer
  and later release verification) vs **domain settings** (account, prefs),
  as separate cross-linked pages; wordmark top-left = home; theme toggle in
  the top bar; **bottom tab bar on mobile** (thumb reach), top tabs on wide;
  native light/dark via `prefers-color-scheme` + manual override (dark
  palette to be designed at the re-plan). Details in `docs/DESIGN.md`
  § Header, nav placement, settings architecture.
- **DECIDED (user, 2026-07-07): page-per-destination architecture.** The
  M2/M3 re-plan restructures the app as separate HTML documents per
  destination (browse / my recipes / settings / …, blockdoku-style): native
  back button, no SPA tab state, free code-splitting (the browse page never
  loads the OAuth stack — this also materially serves the bundle budget).
  Shared modules stay in `src/`; esbuild gains multi-entry.
- **Design iteration 3 (trust surface + mobile navigation):** the VERIFIED
  badge failed twice with the maintainer ("I still don't understand it") —
  root causes: the word reads as account status (blue-check connotation) and
  an always-on badge carries no information (the browser-padlock lesson).
  Decision (user-confirmed): **silent when good, loud when bad** — intact
  cards carry no badge; detail ends with a quiet human provenance line
  ("as published by <author> · fingerprint matches · <date>"); a failed check
  gets the rust ALTERED? rubber stamp across the photo + always-visible
  warning. "Verified" banned from primary UI copy. Also recorded (pea +
  blockdoku evidence): **pages, not modals** — mobile first-class; blockdoku's
  page-per-destination architecture (separate HTML docs, native back button,
  natural code-splitting) is the recommended shape for the M2/M3 re-plan;
  update-available toast pattern noted for Phase 8b/11.
- **UI direction: keep it lite and data-grounded.** The middle-ground skeleton
  (tabs, cards w/ verified+time chips, ingredients-first detail) is directional,
  not committed; refine while walking real data. Lexicon fact established:
  ingredients are free-text `string[]` — no structure in the exchange lexicon.
  Structured-ingredient records parked (Phase 9 note). **Draft-before-publish
  added to Phase 6** (author + save locally without publishing).

### M4 Pass 3: Quality Gates — 2026-07-08

Scope: the M4 block only (`## M4 — Social layer` through Phase 10). M0–M3
(Phases 0–8c, all ✅ SHIPPED, live at https://arecipe.app) were NOT re-gated.
All M4 open questions were already RESOLVED and user-confirmed in the 2026-07-08
Pass 1+2 walk-through; Pass 3 surfaced no new BLOCKING questions. Fixes applied
additively — no phase reorder, no reasoning rewrite. Spot-checked the codebase:
every reuse surface named in the plan exists as described (`loadStarterFeed`
in `starter.ts`, `strongRefOf`/`isStale` in `refs.ts`, `createResolver`,
`resolveDidDoc`, `prepareImage`/`uploadRecipeImage`, `createExclusions`,
`renderRecipeList/Detail`; `recipe.ts`+`view.ts` confirmed the genuinely shared
9b/9c surface; the guarded purge is currently inline in `publish-live.spec.ts`,
single-collection + `MARKER`-on-`name`).

**TDD ordering:**
- The M0–M3 tests-first convention enumerates phases 1–8/3b and did not name the
  M4 phases. Added an **M4 cross-phase conventions block** extending tests-first
  (RED before production, watch it fail) to 9a, 9b, 9c/9c-i/9c-ii, 9d, 10, with
  9e explicitly exempt (Discovery-Exemption spike — report, not code).
- 9a already carries full executable detail (specific behaviors, a wiring test
  through the Friends page entry point, a Verification that exercises the page +
  `@live` round-trip) — confirmed it meets the full bar. 9b–10 held to the
  deferred bar (sized-but-"re-confirm shape at start", since their file shape
  depends on 9a's record helpers); each names a wiring test through its page and
  a validation tier, which is the correct bar for them.
- 9a: named the **5e starter suite** (`npm test -- starter` + `starter.spec.ts`)
  as the required behavior-preserving guard for the `loadStarterFeed`→`feed.ts`
  extraction, and made "watch the friends wiring test fail first" explicit.

**Observability:**
- 9a already had a Diagnostic logging line. Added them to **9b** (comment write /
  orphaned-parent fallback / read failure), **9c** (cooked-saved write / count-agg
  failure / list failure), **9d** (poll start / per-friend result / merge result /
  per-author fallback — the polled feed debuggable from the console), and **10**
  (mute add-remove / inheritance resolution at debug for the legible path /
  failed friend-list resolve). All through `src/log.ts`, `?debug=1`-gated. Noted
  the 3b gotcha (URL debug flag doesn't survive an OAuth redirect; M4 writes are
  off that path).

**Debugging readiness:**
- Every M4 phase is a declared stop-point with its own gate — natural checkpoints
  already present; no change needed beyond the logging above.

**Validation calibration:**
- 9a/9b/9c/10 Broad (external PDS mutation, guarded test account) — correct.
- 9d Moderate (read-only polled feed + offline) — confirmed correctly calibrated
  and annotated why (no external mutation).
- 9e: confirmed "the spike IS the gate" is honest and made it explicit — the
  deliverable is a written go/no-go report (real-phone perf over hours vs the
  polling baseline), not a test suite; no TDD until a "go" verdict; on no-go
  nothing ships and polling stands; 9e is off the M4 critical path.

**Concurrency honesty:**
- M4 Concurrency Map accounts for every phase (9a→9b→9c→9d→[9e]→10). Re-checked
  write-set disjointness directly against the per-phase Write-sets after Pass 3
  edits: **9b/9c both write `src/pages/recipe.ts` AND `src/recipes/view.ts`**
  (confirmed in source — the comment section and interaction chips live on the
  same detail page) → sequential is correct. 9d is source-file writes only
  (`feed.ts`+`friends.ts`, shared with 9a) with **no PDS writes**. Named Phase
  10's previously-vague "feed/render filters" write-set as `src/social/feed.ts`
  + `src/recipes/view.ts`, which surfaces its overlaps with 9a/9d and 9b/9c and
  confirms 10 must be last. Every adjacent pair on the spine shares ≥1 file → the
  sequential spine is by construction, not by default. All sequential → no
  worktree/parallel dispatch → no re-entry-verification fields required (stated).
  No new parallel candidates worth pulling.

**Sizing (≤3 logic .ts):**
- 9a: logic surface = 3 new `.ts` (`friends.ts`, `feed.ts`, `pages/friends.ts`);
  `nav.ts` is a small registration and `starter.ts` an import swap — page-scaffold
  overhead mirrors 5b (acceptable). ✓
- 9b: 3 files (`comments.ts`, `recipe.ts`, `view.ts`). ✓
- 9c: 4+ files → split into 9c-i / 9c-ii already flagged; reinforced each
  sub-phase keeps ≤3 `.ts` + its own wiring test + stop-point.
- 9d: 2 files. ✓
- 10: naming the filter sites makes it 4 files → **flagged a 10-i / 10-ii split**
  (records+resolver vs UI+filter-application), consistent with the 9c precedent.

**Documentation impact:**
- Corrected a same-phase-doc violation: DESIGN.md entries for the comment surface
  and interaction surface had been lumped under 9a/10; **rescheduled the comment
  DESIGN entry into 9b and the interaction DESIGN entry into 9c** (each in the
  phase that makes the narrative stale). PRACTICES.md (guarded multi-collection
  purge) stays in 9a; README page entries in 9a. No trailing docs phase.

**Guarded-purge finding (new, resolved with a recommended default — not a
blocker):**
- The existing purge matches a `MARKER` substring in `record.value.name`. The M4
  record types (`app.arecipe.friend` = `{subject, createdAt}`, plus
  comment/interaction/mute) have **no `name` field**, so the marker layer does not
  transfer. Recommended default (recorded in the M4 cross-phase block and 9a):
  keep the hard `TEST_DID` guard as the safety boundary and purge the **whole**
  `app.arecipe.*` collection on the dedicated test account (every record there is
  test-created), generalizing the purge into a shared `tests/e2e/helpers/live.ts`
  multi-collection helper. This has a clear safe default and does not gate
  execution — surfaced for the user to override if a synthetic marker field is
  preferred instead.

**Coherence:**
- The M4 block still solves the stated problem (spec Layers 6–8, no backend,
  polling-first feed). No scope creep — affinity deferred, Jetstream optional,
  D9 dropped, all as decided. Reasoning holds; no rewrite.

**Confirmed ready:** yes. No BLOCKING or unreviewed open questions remain in the
M4 block; the one new item (markerless guarded-purge) is resolved with a
recommended default and flagged for optional override.

### M4 Cookbook reshape — Pass 1 + Pass 2 (combined) — 2026-07-08

Scope: re-planned the M4 social layer around the **Cookbook** model (talked out
with the user 2026-07-08; DECIDED items in the ★ Cookbook re-plan note — not
re-litigated). Ran Pass 1 (reasoning + executable phases) and Pass 2 (gap
analysis) in one context, grounded in the actual codebase. Produced the new
"### Cookbook reshape" section (phases **CB1–CB7**) that supersedes the
friend-based 9a/9b/9c specs; added ⛔/⚠️ SUPERSEDED banners to 9a/9b/9c (text kept
for history) and an Outcome Summary row. Analysis only — no code; the parked 9c-i
stays uncommitted.

**Pass 1 added:**
- The Cookbook reshape Problem / Approach / Reasoning (why sequential; the two
  hard ordering constraints), a Verified-against-the-codebase block, and CB
  cross-phase conventions.
- Full executable field sets on **CB1** (cookbook.ts scope module + comment
  migration), **CB2** (land parked interactions + re-test the unrooted `@live`
  like write), **CB3** (rename Friends→Cookbook + page rework + drop
  `app.arecipe.friend`), **CB4** (two-axis settings): Goal, Changes, Call chain,
  Wiring test, Depends-on, Read/Write-set, Shared-state contract, Diagnostic
  logging, Mutation resistance, two-tier Done-when, Validation, Stop-point.
- Milestone-altitude CB5 (feed, re-plan of 9d), CB6 (optional depth + Jetstream),
  CB7 (mutes, re-plan of 10), each "re-confirm shape at start" per "no assumed
  behavior."
- A Cookbook reshape Concurrency Map + Documentation Impact subsection.

**Pass 2 found (and fixed):**
- **listFriends drop hazard.** The parked `mountInteractions` in `recipe.ts`
  imports `listFriends` alongside `mountComments`. Dropping `app.arecipe.friend`
  before *both* are migrated would break the parked interaction path → sequenced
  CB1 (comments) → CB2 (interactions) → CB3 (drop). Verified `listFriends` has no
  other importers (`src/pages/friends.ts` is the page CB3 replaces).
- **Scope-module wiring is @live for the recipe page, hermetic for the Cookbook
  page.** The recipe page's signed-in discovery has no injectable hermetic agent
  (9a/9b precedent), so CB1's wiring proof is `@live`; the hermetic proof of
  `resolveCookbook` is the `cookbook.html?did=` cold-view (CB3) over routed
  follows/followers fixtures + unit tests. Recorded both so neither is mistaken
  for the other.
- **`recipe.ts` and `pages/cookbook.ts` are the shared hot files** forcing the
  sequence (CB1+CB2 on recipe.ts; CB3+CB5 on cookbook.ts) — the spine is
  sequential by construction, not default.
- **Settings reconciliation:** the existing Starter-pack section *is* the reach
  "starter cooks" toggle — CB4 folds/cross-references it rather than duplicating;
  the Social panel's Hide Comments + parked `prefs.hideLikes` are the axis-2
  signals. Prevented a duplicate starter-toggle surface.
- **Docs + tests that go stale on the drop** were pulled into CB3's write-set
  (DESIGN.md, README, PRACTICES.md, the friend unit/e2e/live specs, nav.spec.ts,
  the guarded-purge collection list) rather than left to a trailing cleanup.
- **Depth is not depth-0.** The like-graph network effect (depth 1/2) needs likes
  (CB2) + the feed (CB5) and fans out to non-member repos → separated into the
  optional CB6 with a perf gate and a logged cap; `ReachConfig` in CB1 carries no
  `depth` field.
- **Codebase grounding confirmed:** `resolveCookbook`/`cookbook.ts`/`bsky.graph`/
  `getFollowers` are genuinely new (absent from src/tests); `STARTER_AUTHORS`/
  `createStarterPrefs`, `resolveDidDoc`→`{pds,handle}`, `loadAuthorsFeed(FeedAuthor[])`,
  `strongRefOf`/`isStale`, `purgeCollection`(TEST_DID-guarded) all exist as the
  reshape assumes. The Bsky graph endpoints match the ★ note's verified shapes
  (not re-probed, per instruction).

**Concurrency:** All CB phases sequential; map recorded with per-edge reasons. No
parallel candidates (every adjacent pair shares `recipe.ts` or `pages/cookbook.ts`
or a config read). No worktree dispatch → no re-entry-verification fields.

**Confirmed:** the Cookbook model is coherent with the shipped surfaces (Browse
stays zero-auth and broader; comments/likes friends-scoped → now cookbook-scoped
with honest copy; feed is a view). Each CB phase is a shippable stop-point
(stop-anywhere sequencing holds). Every phase reuses an existing surface.

**Open questions (3) — walked with the user one at a time, all CONFIRMED
(2026-07-08):** (1) PHASE-GATED CB1 — all sources feed per-recipe discovery with a
logged cap (no silent truncation); (2) PHASE-GATED CB4 — depth control deferred to
CB6 (ReachConfig carries no `depth` field until then); (3) ADVISORY — reach config
in localStorage. No BLOCKING items; CB1 ready to start on approval.

### M4 Cookbook reshape — re-grounded against current main — 2026-07-08

The CB1–CB7 re-plan above was first drafted against a local checkout that was **24
commits behind `origin/main`**. The intervening commits are the shipped
**browse-view-filters** track (its own plan, `plans/2026-07-08-1-plan-browse-view-filters.md`):
view modes, photos-only, Meal/Cuisine facets, and a Settings "Only show me" diet
preference. Fast-forwarded to `origin/main` (clean — none of the parked/uncommitted
files were touched upstream), then re-verified every CB codebase claim against the
now-current source. Analysis only; additive edits, no CB phase reorder.

**Found (and folded in):**
- The browse track changed `recipe.ts` (the deferred-auth `mountComments` split —
  CB1/CB2 already build on it; no change), `settings.ts` (added the "Only show me"
  diet-preference section), and `view.ts` (added `renderRecipeDetailsList` +
  `renderFacetDropdown`); it added `browse-state.ts` + `diet-preference.ts`.
- It did NOT touch `nav.ts`, `feed.ts`, `friends.ts`, `comments.ts`, `starter.ts`,
  `identity/did.ts` — every CB claim on those still holds.

**Changed:**
- Added a "Re-grounded against current `main`" note to the CB **Verified against
  the codebase** block (what changed, what's still valid).
- **CB4** now reconciles with the existing **diet-preference** section: diet is an
  app-wide *content* filter, orthogonal to both cookbook axes (reach = who, signals
  = what shows), kept as its own Settings section — Settings ends up with three
  distinct groups (reach / social signals / diet), cross-linked with clear copy.
- **CB5** now names the browse-track view layer (`renderRecipeDetailsList`,
  `renderFacetDropdown`, `browse-state.ts`) as reuse surfaces and requires the
  cookbook feed to honor the app-wide diet preference the way Browse does.

**Confirmed:** no CB phase decomposition or sequencing change; the 3 CONFIRMED open
questions stand. The CB block is ready for a fresh-context Pass 3 (add a line to the
Pass 3 prompt: re-verify against current `main`, incl. the browse-view-filters
surfaces) then execution at CB1.

**Unrelated observation (filed, not fixed):** during the Browse work, e2e logs show
self-hosted fonts 404 on a doubled path (`assets/fonts/assets/fonts/*.woff2`) — a
pre-existing issue on `main` (fonts fall back to system), not caused by this work.
Worth its own small fix pass.

### M4 Cookbook reshape Pass 3: Quality Gates — 2026-07-08

Scope: the CB1–CB7 block only (the friend-model 9a/9b/9c and M0–M3 were gated in
their own prior passes). Run in the same context as the Pass 1+2 re-plan +
re-grounding (the skill prefers fresh eyes for Pass 3; noted the tradeoff, applied
the gate checklist rigorously rather than leaning on prior reasoning). Codebase
spot-checked post-fast-forward (current `main`). Additive fixes only; no phase
reorder, no reasoning rewrite.

**TDD ordering:**
- Confirmed the CB cross-phase conventions already impose tests-first (RED before
  production, watch it fail) on CB1–CB4 and the CB2/CB3 sub-splits; CB5–CB7 held to
  the deferred "re-confirm shape at start" bar (each names a wiring test + a
  validation tier, correct for milestone-altitude phases).
- Specificity: each executable phase names concrete behaviors (CB1 dedup/per-source-
  degrade/config-off/`handle.invalid`; CB2 count 0/1/idempotent; CB3 redirect +
  cold-view; CB4 both-edges of each toggle) — not "write tests for X". No vague
  specs.
- Wiring/verification: every executable phase's Verification runs through an entry
  point (recipe page / cookbook page / settings), not an isolated module. **Made
  CB1's test-tier explicit** (hermetic unit + `@live` entry-point now; hermetic
  entry-point via CB3's cold-view) so a stop-after-CB1 commit isn't misread as
  under-tested — it's the 9a/9b reads-hermetic/writes-`@live` split.
- Mutation resistance: CB1–CB4 name boundary edges, not single points. No defects.

**Observability:** confirmed per-phase Diagnostic-logging lines through `src/log.ts`
(`?debug`/`localStorage.debug`-gated) on every risky boundary — CB1 per-source
resolve/degrade/merged-count, CB2 write/count-agg/toggle, CB3 mount, CB4 toggles.
The CB1 member **cap** must be reconstructable from the log (already required). No
additions needed.

**Debugging readiness:** every CB phase is a declared stop-point with its own gate
(commit-per-phase). No change.

**Validation calibration:** CB1 Moderate (real-network reads, no mutation), CB2
Broad (external `app.arecipe.interaction` write), CB3 Moderate (read-only page +
redirect; the friend WRITE surface is *removed*), CB4 Moderate (localStorage UI) —
all correctly scoped. No Phase 0 in the CB block (M4 discovery D7–D9 already done).

**Concurrency honesty:** CB Concurrency Map accounts for CB1–CB7, all sequential
with per-edge reasons. Re-checked write-set disjointness against current per-phase
Write-sets after the re-grounding: `recipe.ts` (CB1 comments, CB2 interactions) and
`pages/cookbook.ts` (CB3 page, CB5 feed) are the shared hot files forcing the
sequence. **Noted:** CB4's write-set (`settings.ts` + `prefs.ts`/`reach.ts`) is
actually *disjoint* from CB1–CB3, but CB4 is sequential by *dependency* (needs CB1's
config shape, CB2's Hide-Likes surface, CB3's Cookbook page for its read-through
test), not by write-set — so no parallel restructure (and stop-anywhere sequencing
is user-chosen; worktree overhead isn't worth it for a solo dev). All sequential →
no parallel sets → no shared-state-invariant / re-entry-verification fields required.

**Documentation impact:** CB Documentation Impact schedules DESIGN.md/README/
PRACTICES.md updates in the phase that makes each stale (CB3 destination + drop;
CB4 settings; CB2 interaction purge) — no trailing docs phase. **Extended the
DESIGN.md CB4 entry** to document the three distinct settings groups (reach / social
signals / the pre-existing diet filter) surfaced by the re-grounding.

**Coherence:** the CB block still solves the stated problem (Cookbook = your recipes
+ bounded Bsky-primitive reach; Browse broader + zero-auth; no backend). No scope
creep — depth deferred to CB6, Jetstream optional, diet kept as its own orthogonal
filter. Reasoning holds; no rewrite.

**Confirmed ready:** yes. The 3 open questions are all CONFIRMED (2026-07-08); no
BLOCKING items. Two PHASE-GATED items remain flags on their phases — CB1 (all
sources feed per-recipe discovery, implement the logged member cap) and CB4 (depth
control deferred to CB6, `ReachConfig` has no `depth` field). CB1 is ready to
execute.

### CB1 execution — landed + verified (commit pending) — 2026-07-08

Built `src/social/cookbook.ts` (`resolveCookbook`, depth-0 membership: you +
starters + Bluesky follows + followers; source-tagged; priority-ordered you →
starter → follow → follower; degrade-not-blank per source) TDD-first —
`tests/unit/social/cookbook.spec.ts` 6/6 (dedup/union, per-source degrade,
config-off, `handle.invalid`, priority order, no-`you`). Migrated `recipe.ts`
`mountComments` discovery `listFriends` → `resolveCookbook`, with the CONFIRMED
per-recipe **logged member cap** (`COOKBOOK_DISCOVERY_CAP = 50`; favors high-signal
sources; logs when it truncates — never silent).

**Verified:** typecheck ✓, lint ✓, unit 191 ✓ (+6), build ✓, hermetic e2e
(comments + recipes) 9 ✓, and the **`@live` comment gate green** (real OAuth →
`mountComments` runs `resolveCookbook` against the real PDS follows + AppView
followers, comment write/appear/reply-nest, records verified on the PDS + purged).
So the cookbook scope is proven live from the entry point.

**Commit-strategy finding (recipe.ts CB1/CB2 fusion).** The parked 9c-i already
refactored `mountComments` onto a shared `getAgent` loader and added
`mountInteractions` in the same file. CB1's `mountComments` migration is
interleaved with that parked refactor in one uncommitted `recipe.ts` diff, so a
clean "CB1-only" commit is impractical. Resolution options recorded for the user:
- **(A) Fold CB1+CB2's recipe.ts discovery migration into one commit** — also
  migrate `mountInteractions` `listFriends` → `resolveCookbook` (same edit shape),
  run the `@live` interaction gate (incl. the parked "unrooted like write"
  investigation), and commit cookbook.ts + recipe.ts (both surfaces) +
  interactions.ts + prefs (+`hideLikes`) + tests. Coherent `recipe.ts`; matches the
  working tree; pulls CB2's discovery migration forward (CB2's card-counts + Saved
  view remain).
- **(B) Leave CB1 + parked 9c-i uncommitted (WIP)** — CB1 is verified; defer the
  commit until CB2 is executed properly, then commit both.
`friends.ts`/`listFriends` stays until CB3 (both `mountComments` and
`mountInteractions` must be off it first — the drop-hazard the CB ordering guards).

### CB1 shipped + CB2 (discovery/write core) shipped + no-meal image — 2026-07-08

Resolved the recipe.ts CB1/CB2 fusion by **Option A** (user-chosen): folded CB2's
discovery migration in and committed CB1+CB2 core together.

**CB1 — SHIPPED.** `src/social/cookbook.ts` (`resolveCookbook`, depth-0) + the
`mountComments` discovery migration off `listFriends`. Unit 6/6; hermetic green;
**`@live` comment gate green** (real OAuth → cookbook scope reached against the
real PDS follows + AppView followers).

**CB2 (core) — SHIPPED with a flagged flake.** Migrated `mountInteractions`
discovery `listFriends` → `resolveCookbook` (recipe.ts now imports no
`listFriends`; `friends.ts` stays until CB3). Landed the parked likes/saved
(`interactions.ts` + `prefs.hideLikes` + unit/e2e specs). **Optimistic-UI
hardening:** new `withOwnInteraction` (unit-tested, 4 edges) — `mountInteractions`
reflects the viewer's own like/save from the write result and no longer re-reads
immediately (that immediate `listRecords` raced the PDS read-after-write). One
clean `@live` run proved like→count `1`→unlike→count `0` with the record verified
on the PDS then purged. **Remaining CB2 (deferred, as planned):** Browse card
counts + the Saved view under My recipes.

**⚠️ TODO (filed) — `@live` like gate is flaky.** Intermittently the like click
does not complete the write (no `adding` log, no `toggle failed` error) → count
stays `0`. It is NOT read-after-write (the optimistic fix left it unchanged; the
write isn't attempted on the failing runs). Suspected: a timing race on the
concurrent-async recipe page (two `void mount*()` calls sharing the deferred
`getAgent`, multiple refreshes) and/or auth-server **rate-limiting** from ~6 rapid
`@live` OAuth logins in one session (the plan's known caveat: reuse cached
sessions / space runs out). Records are correct (clean pass + hermetic + unit);
this is test-reliability/timing, not a data defect. **Investigate fresh** (rate-
limit-reset session; instrument the click→toggle→addInteraction path; consider a
"mount ready" signal for the e2e or making the recipe page's social mounts
sequential). CB1's `@live` comment gate uses the same page and passed.

**No-meal placeholder image — refreshed.** Split the new 1024² contact sheet
`assets/no_meal_image_standin.png` (VERSION 1 light / VERSION 2 dark, cutlery-
butterfly) into `assets/no-meal-{light,dark}.png` (384×400, transparent, labels
cropped, identical tight crop). Source stays untracked; `view.spec.ts` green;
build precaches the pair. (Same process as the 2026-07-08 `030f57f` standin.)

**Gate before commit:** full hermetic `npm test` PASS — lint, typecheck, unit
(29 files / 195 tests), build, e2e (45). `@live` comment gate green; `@live` like
gate flaky (filed above). Committed to `main` (chasemp identity); code + this plan
in separate commits per repo convention.

### CB3 shipped — Cookbook rename + app.arecipe.friend dropped — 2026-07-08

Did CB3 in one coherent pass (CB3-i plumbing + CB3-ii drop together, to avoid
shipping a transitional state with a knowingly-broken @live friend spec).

**Renamed Friends → Cookbook.** `src/pages/friends.ts` → `src/pages/cookbook.ts`,
reworked to source-based membership: resolves the cookbook (via `resolveCookbook`)
and renders members with a source badge (you / starter / following / follower) +
their recipes feed (`loadAuthorsFeed`). No add/remove-friend form — membership is
your starters + Bluesky graph (a note points to following on Bluesky / Settings).
Kept the `?did=` cold-view (now any account's cookbook). `friends.html` → `nav.ts`
tab (`tab-cookbook`, `./cookbook.html`), `scripts/build.mjs` page swap, and
`cookbook.html`. Legacy `friends.html` is now a **static redirect stub**
(query + hash preserved, precached → resolves offline); the SW serves it and it
`location.replace`s to `cookbook.html`.

**Dropped `app.arecipe.friend`.** Deleted `src/social/friends.ts`
(FRIEND_COLLECTION / buildFriendRecord / listFriends / findFriendRkey / addFriend
/ removeFriend / loadFriendsFeed), `tests/unit/social/friends.spec.ts`, and
`tests/e2e/friends-live.spec.ts` (the friend @live write + its guarded purge).
`loadAuthorsFeed` (feed.ts) is unaffected. `recipe.ts` comment terminology
refreshed friends-scoped → cookbook-scoped. Docs updated same-phase: `README.md`
(page list + redirect), `docs/DESIGN.md` (Cookbook destination + cookbook-scoped
comments). `grep -r 'app.arecipe.friend\|listFriends' src` is now clean (only a
doc-comment mention in cookbook.ts describing what it replaced).

**Wiring test (hermetic):** `tests/e2e/cookbook.spec.ts` — the `?did=` cold-view
renders a Bluesky-follow member + that cook's recipes via `resolveCookbook` over
routed follows/followers/plc fixtures (the scope module's hermetic entry-point
proof, which CB1 deferred here); `tab-cookbook` navigates; the legacy
`friends.html` redirects to `cookbook.html`. **Validation:** Moderate (read-only
page + redirect; no @live — the friend write surface was removed, not added).

**Gate:** full hermetic `npm test` PASS — lint, typecheck, unit (28 files / 188
tests), build, e2e (46). Committed to `main` (chasemp); code + plan separate.

**M4 cookbook reshape status:** CB1 ✅, CB2 core ✅ (Browse card counts + Saved
view remain), CB3 ✅. Remaining: CB4 (two-axis settings), CB5 (cookbook feed
re-plan), CB6 (optional depth/Jetstream), CB7 (mutes re-plan). The @live like-gate
flake TODO still stands.
