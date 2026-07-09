# arecipe — Security posture narrative + primary XSS hardening (CSP/SRI)

Pass 1 (base) — 2026-07-09. Analysis only, no code. Pass 2 (gap analysis) and
Pass 3 (quality gates) to follow in fresh contexts before execution.

## Problem Statement

arecipe is a backendless SPA/PWA on the AT Protocol: no server, static hosting
(GitHub Pages → arecipe.app), OAuth secrets minted and held entirely in the
browser. That is a novel enough trust model that two things are currently
missing:

1. **No written security-posture narrative.** The security reasoning is real but
   scattered — the OAuth secret-storage decision lives in
   `plans/2026-07-07-1-plan-build-execution.md` (Decisions Locked), fragments are
   in `docs/DESIGN.md`, and the sign-in model was just recorded in
   `plans/2026-07-08-2-plan-dedicated-signin-page.md`. There is no single durable
   document that makes the auth/storage design trade-offs explicit — for
   contributors, for auditors, and for us. Given the novel SPA/PWA/atproto shape,
   that clarity is itself a security deliverable.
2. **The designated *primary* defense is unimplemented.** The locked decision
   (2026-07-09) states the DPoP sender-constraint + non-extractable key makes an
   exfiltrated refresh token inert off-device, so the real residual threat is an
   **active same-origin adversary (live XSS)**, and the security budget goes to
   **preventing XSS: strict CSP, SRI on every asset, zero third-party scripts,
   small auditable bundle** — *"treat it as the primary secret-storage defense."*
   Today there is **no CSP and no SRI** in any of the 8 HTML shells (verified:
   `grep -L Content-Security-Policy *.html` → all).

Goal: (a) write the security-posture narrative (largely auth + storage oriented),
and (b) implement the primary XSS defense it names — CSP + SRI + zero-third-party
— so the doc describes a true state, not an aspiration.

Scope boundary: this plan covers the narrative + CSP/SRI/zero-3p. Blast-radius
work beyond what exists today (a global "sign out everywhere" / token-revocation
UI, dependency-audit automation, SW cache-poisoning hardening) is **out of
scope** — the narrative documents the current posture and names those as future
items, but does not build them here.

## Reasoning

**Why a narrative doc, and why auth/storage-heavy.** The hard, non-obvious
security decisions in this project are all about *how a no-backend browser app
safely holds credentials*. A reader's first question is "you have no server — how
is this safe?" The answer is a chain of protocol facts (atproto OAuth is DPoP
sender-constrained; the DPoP key is non-extractable; the library owns an
IndexedDB session store) plus deliberate trade-offs (no at-rest token encryption,
because it adds ~nothing over a non-extractable key and isn't even available
under `BrowserOAuthClient`). That chain is exactly what an audit needs and what a
new contributor will otherwise re-derive (or get wrong). Writing it once, in
`docs/SECURITY.md`, is the highest-leverage clarity we can add.

**Why CSP/SRI is the implementation half.** The narrative's central claim is
"XSS prevention is the primary secret-storage defense." A narrative that asserts
that while the app ships no CSP is not credible. So the doc's XSS-prevention
section and the CSP/SRI phases are coupled: the doc states the target and current
status, and each implementation phase flips its section to "implemented" and
updates the doc in the same phase (the doc-in-the-phase-that-makes-it-true rule).

**Why build-time CSP generation (not hand-authored meta tags).** GitHub Pages
serves static files and does not let us set HTTP response headers, so CSP must be
delivered via `<meta http-equiv="Content-Security-Policy">`. The shells contain
inline `<script>` blocks (theme pre-paint in all 8; a landing/redirect script in
`index.html`) that a strict CSP (`script-src` without `'unsafe-inline'`) will
block unless each inline block is allowlisted by its `'sha256-…'` hash. A static
host cannot mint per-request nonces, so **hashes computed at build time** are the
mechanism. `scripts/build.mjs` already runs an HTML pass (injecting hashed bundle
names); it is the natural place to compute the inline-script hashes and inject the
CSP meta — which guarantees the hash always matches the actual inline content.
Hand-authoring hashes in source HTML would silently break the moment an inline
block's whitespace changed.

**Why SRI is build-generated too, and why its value here is bounded.** The
hashed bundles are same-origin, first-party, and served over HTTPS from Pages.
SRI's classic threat model (a compromised third-party CDN serving altered JS) is
largely N/A when there are zero third-party scripts. The locked decision still
lists "SRI on every asset," so we implement it where it is expressible —
`integrity=` on the entry `<script type="module">` and the `<link
rel="stylesheet">`, computed from the same bytes `build.mjs` already hashes. A
known limitation (to be confirmed in Phase 0): **SRI is not expressible on
dynamically `import()`-ed code-split chunks** (the heavy `@atproto/api` chunk that
`recipe.ts`/auth pages defer). We will document that gap rather than pretend to
close it.

**The connect-src wrinkle (the real design decision).** atproto accounts live on
arbitrary PDS hosts. `src/identity/resolve.ts` builds `https://<pds-host>/…` from
the DID document, and `BrowserOAuthClient` talks to the user's authorization
server + PDS. So `connect-src` cannot be a fixed allowlist without breaking any
user whose PDS is not on a host we hard-coded — which contradicts arecipe's
"works with any atproto account" story. The honest options (to decide in Phase 0
/ Open Questions): `connect-src 'self' https:` (allow all HTTPS — weak against
exfil, but the DPoP non-extractable key already makes the token inert, and
`connect-src`'s residual value is blocking non-HTTPS/downgrade and `data:`/`blob:`
exfil channels), versus a tighter scheme. This is precisely the
unverified-behavior trap the planning discipline exists to force into a probe.

**Alternatives considered & rejected:**
- *Skip the narrative, just do CSP.* Rejected — the user explicitly wants the
  design trade-offs written down for others and ourselves; the novel model makes
  that a first-class deliverable, not documentation debt.
- *Hand-author CSP meta tags in each shell.* Rejected — inline-script hashes
  must track content exactly; build-time generation is the only safe source.
- *Content-Security-Policy-Report-Only with a report endpoint.* Rejected as the
  primary mechanism — there is no backend to receive reports; we validate with a
  hermetic "no CSP violations" Playwright pass across all pages/flows instead.
- *Restrict `connect-src` to a fixed PDS allowlist.* Rejected — breaks
  self-hosted PDS users; contradicts the any-atproto-account promise.

## Verified Assumptions

- **No CSP/SRI anywhere today.** `grep -rln "Content-Security-Policy\|integrity="
  *.html` → none. Confirmed 2026-07-09.
- **Delivery is `<meta http-equiv>` only.** GitHub Pages (CI `deploy` job in
  `.github/workflows/ci.yml`, `actions/deploy-pages`) serves static artifacts; no
  response-header control. Confirmed by reading the workflow.
- **Inline scripts to hash:** the theme pre-paint IIFE appears in all 8 shells
  and is byte-identical (→ one hash); `index.html` carries a second, unique
  inline script (the signed-in landing/redirect). Confirmed by reading the shells
  (2026-07-09).
- **No inline `style=` / runtime style injection in `src/`.** `grep -rn
  "style=\|\.style\.\|cssText\|setProperty" src/` → none → `style-src 'self'` is
  plausible (to be confirmed by Phase 0 violation capture; `styles.css` +
  `assets/fonts/fonts.css` are external `'self'`). Confirmed 2026-07-09.
- **Network surface (connect-src / img-src candidates):** `src/` references
  `https://bsky.social` (OAuth auth server), `https://public.api.bsky.app`
  (handle resolution — `resolve.ts:45`), `https://plc.directory` (DID docs —
  `did.ts:12`, `resolve.ts:46`), `https://cdn.bsky.app` (feed thumbnails →
  `img-src`), plus **arbitrary PDS origins** built in `resolve.ts:39`
  (`https://<host>/.well-known/did.json` and the PDS service endpoint). Confirmed
  by grep 2026-07-09.
- **`build.mjs` already runs an HTML pass** (`for (const [file, page] of
  Object.entries(HTML))`) that reads each source shell and writes the dist
  version with hashed refs — the injection point for CSP meta + SRI. Confirmed by
  reading `scripts/build.mjs`.
- **SW is cache-only**, no header/CSP behavior; navigations network-first,
  hashed assets cache-first (`src/sw.ts`). It does not affect CSP delivery.
  Confirmed 2026-07-09.
- **Session storage is library-owned.** `BrowserOAuthClient` hard-codes its
  IndexedDB store; its options `Omit` `sessionStore`/`stateStore`
  (`browser-oauth-client.d.ts:8`, re-confirmed in the sign-in plan). The DPoP key
  is generated non-extractable by the library. `session-provider.ts` adds no
  storage of its own and exposes per-session `signOut()` (calls
  `session.signOut()`), `getTokenInfo`, and a debug `forceRefresh`. There is **no
  global "sign out everywhere"** today. Confirmed by reading
  `src/auth/session-provider.ts`.
- **UNVERIFIED (Phase 0):** (a) exact `connect-src` set the OAuth + read + publish
  flows require, and whether `'self' https:` is the right policy given arbitrary
  PDS; (b) that a build-computed `'sha256-…'` matches the browser's hash of each
  inline block (whitespace exactness); (c) whether `integrity=` on an ES-module
  entry is honored and how code-split `import()` chunks behave (SRI not
  expressible on them); (d) which CSP directives `<meta http-equiv>` ignores
  (notably `frame-ancestors` — clickjacking defense may be unavailable on Pages).

## Documentation Impact

- `docs/SECURITY.md` — **new file**, the security-posture narrative. Created in
  Phase 1; its CSP/SRI section status is updated by Phases 2–4 as each lands.
  Grepped: no existing `SECURITY.md` (repo root or `docs/`).
- `README.md` — add a short "Security" line linking to `docs/SECURITY.md`.
  Phase 1.
- `docs/DESIGN.md` — cross-reference `docs/SECURITY.md` from the trust/integrity
  material (currently around the integrity-check explainer, lines ~84–88/194) so
  the design doc points at the security narrative rather than re-stating it.
  Phase 1.
- `plans/2026-07-07-1-plan-build-execution.md` — the locked "OAuth secret
  storage" decision remains the canonical *decision record*; `docs/SECURITY.md`
  **references** it (does not duplicate), and this plan notes that relationship.
  No edit to the build-execution plan required (grepped — it is a decision
  ledger, not a live doc to restate).
- No file is renamed or removed; the CSP/SRI phases edit `scripts/build.mjs` and
  add tests (no doc references to those beyond this plan).

## Concurrency Map

Sequential spine: **Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 4.**

- Phase 0 (discovery) must precede all — D1 feeds Phase 2's `connect-src`, D2 the
  hashing, D3 the SRI scope, D4 the documented limitations that Phase 1's
  narrative must state accurately.
- Phases 2 → 3 → 4 all write `scripts/build.mjs` (CSP injection, then SRI
  injection, then the zero-3p assertion) → shared write-set → strictly
  sequential.
- Phase 1 (`docs/SECURITY.md` + `README.md` + `docs/DESIGN.md`) has a write-set
  disjoint from Phases 2–4 (`build.mjs` + tests), so it is *parallel-eligible*
  with Phase 2. We run it sequentially anyway, first, because the narrative
  should be settled and accurate before the implementation flips its status
  fields — and because the plan is small enough that the parallelism buys little.
  Recorded here so the choice is explicit, not an oversight.
- All sequential; no worktrees → no re-entry-verification fields.

## Phases

**Cross-phase conventions:** tests-first where there is executable behavior
(RED before GREEN, watch it fail); hermetic tier (Playwright over the built
`dist`, push CI) is the gate; the interactive OAuth/`@live` tier is a local
gate only where the flow is the feature. Doc phases validate by accuracy review
against cited `file:line`, not tests.

### Phase 0: Discovery

**Goal:** Resolve the four unknowns that gate an honest CSP/SRI implementation
and an accurate narrative. Cheap probes now vs a wrong policy shipped to
production auth.

- [ ] **D1: What is the complete `connect-src` (and `img-src`) surface, and what
      policy fits arbitrary PDS?**
  - **Probe:** Build `dist`, serve locally, inject a deliberately tight
    report-style CSP meta (e.g. `connect-src 'self'`) into one shell, then drive
    (i) loopback OAuth sign-in via `/signin.html`, (ii) a public read
    (`resolveDidDoc` → PDS records + `cdn.bsky.app` thumbnails), (iii) a publish
    from the editor. Capture every `securitypolicyviolation` event and every
    network origin from the Playwright network log.
  - **Success criteria:** A concrete list of origins each flow contacts, tagged
    fixed (bsky.social / public.api.bsky.app / plc.directory / cdn.bsky.app) vs
    dynamic (user PDS). A recommended `connect-src` + `img-src` policy (see OQ1).
  - **Disposition:** `throwaway` (the probe CSP + capture harness); findings →
    Verified Assumptions + OQ1.
- [ ] **D2: Does a build-computed `'sha256-…'` match the browser's hash of each
      inline block, and what is the full inline inventory?**
  - **Probe:** Compute `sha256` of each inline `<script>` block's exact text;
    inject a `script-src 'self' 'sha256-…'` meta into the built shells; load each
    page and confirm zero inline-script CSP violations. Enumerate every inline
    `<script>`/`<style>`/inline handler across all 8 shells.
  - **Success criteria:** The two expected hashes (pre-paint, index landing)
    admit the inline scripts with no violations; no other inline execution
    surface exists (or the list of any that does).
  - **Disposition:** `throwaway` (feeds the Phase 2 `build.mjs` implementation).
- [ ] **D3: Is `integrity=` honored on the ES-module entry, and how do code-split
      `import()` chunks behave?**
  - **Probe:** Add `integrity=` (+ `crossorigin`) to a built entry
    `<script type="module" src>`; load the page and a flow that triggers the
    deferred `@atproto` chunk import; confirm the entry loads and observe whether
    the dynamic chunk can/can't carry integrity.
  - **Success criteria:** Confirmed behavior for entry modules and a definite
    answer on code-split chunks (expected: not expressible via HTML `integrity`)
    → sets OQ4 / the documented SRI scope.
  - **Disposition:** `throwaway`.
- [ ] **D4: Which CSP directives does `<meta http-equiv>` ignore on this host?**
  - **Probe:** Read the CSP spec's meta-delivery constraints and confirm against
    a loaded page: `frame-ancestors`, `report-uri`/`report-to`, and `sandbox` are
    not honored via meta. Confirm GitHub Pages sets no `X-Frame-Options`.
  - **Success criteria:** A definitive list of directives we cannot enforce via
    meta on Pages → feeds the narrative's "residual limitations" section and OQ3.
  - **Disposition:** findings → Verified Assumptions.

**Outputs fed back:** Verified Assumptions updated with the origin list, the two
hashes, the SRI-scope answer, and the meta-CSP limitation list; OQ1/OQ3/OQ4
resolved or sharpened; phases adjusted if a probe invalidates an assumption
(recorded in the Review Log).
**Read-set:** `scripts/build.mjs`, `src/auth/*`, `src/identity/*`, the 8 shells,
`playwright.config.ts`.
**Write-set:** throwaway probe files under `tests/e2e/` (deleted post-discovery);
no production files.
**Shared-state contract:** runs against a local `dist` + Playwright ephemeral
server; loopback OAuth hits real bsky.social (rate-limited — reuse one sign-in);
no production config touched.
**Done when:** all four D-items answered with concrete evidence and the Verified
Assumptions / Open Questions reflect it.
**Validation:** Discovery (Exemption applies — no TDD on probe code).
**Stop-point — report findings; user reviews before Phase 1 if the connect-src
decision (OQ1) is non-obvious.**

### Phase 1: Security-posture narrative (`docs/SECURITY.md`)

**Goal:** A durable, standalone security narrative — largely auth + storage
oriented — that makes the backendless SPA/PWA/atproto trade-offs explicit for
contributors, auditors, and us.

**Changes:**
- [ ] `docs/SECURITY.md` — new. Sections:
  - *Threat model & non-goals* — what we defend (credential theft, XSS,
    downgrade), what we explicitly do not (a fully-compromised device; an active
    same-origin adversary *using* the key in place — named as irreducible).
  - *The backendless model* — no server, static hosting, everything in the
    browser; why that is a deliberate trust story, not a gap.
  - *Authentication* — atproto OAuth; DPoP sender-constraint; the non-extractable
    DPoP key; loopback vs hosted client (`client-metadata.json`, `authModeFor`);
    the dedicated sign-in page + single-`redirect_uri` model (cite the sign-in
    plan).
  - *Session storage* — library-owned IndexedDB; why **no at-rest token
    encryption** (inert-off-device reasoning; not available under
    `BrowserOAuthClient`); cross-tab refresh via `navigator.locks`.
  - *XSS prevention — the primary defense* — CSP (meta-delivered, build-generated
    hashes), SRI (scope per D3), zero third-party scripts, small auditable
    bundle. **Marked with implementation status**, flipped to "implemented" by
    Phases 2–4.
  - *Blast-radius* — per-session `signOut()` today; token lifetimes/refresh
    library-owned; **"sign out everywhere" named as a future item** (out of scope
    here).
  - *Residual risks & limitations* — active same-origin adversary; meta-CSP gaps
    from D4 (e.g. `frame-ancestors`/clickjacking on Pages); SRI not on code-split
    chunks.
  - *References* — the locked decision in
    `plans/2026-07-07-1-plan-build-execution.md`; `docs/DESIGN.md`.
- [ ] `README.md` — add a "Security" line linking `docs/SECURITY.md`.
- [ ] `docs/DESIGN.md` — cross-reference `docs/SECURITY.md` from the
  trust/integrity material; do not restate.

**Call chain:** N/A (documentation). The "entry point" is a reader arriving from
`README.md` / `docs/DESIGN.md`; the wiring is that those links resolve to
`docs/SECURITY.md`.
**Wiring test:** N/A executable; instead an **accuracy review**: every technical
claim carries a `file:line` or a named decision reference, checked against the
code (DPoP non-extractable, `Omit sessionStore`, `authModeFor`, per-session
`signOut`), and the README/DESIGN links resolve.
**Depends on:** Phase 0 (D4 limitations must be accurate before they are written).
**Read-set:** `src/auth/*`, `client-metadata.json`, the two prior plans,
`docs/DESIGN.md`, `README.md`.
**Write-set:** `docs/SECURITY.md`, `README.md`, `docs/DESIGN.md`.
**Shared-state contract:** docs only; no code, no build, no runtime state.
**Risks:** the narrative overstates the CSP posture before Phases 2–4 land —
mitigated by the explicit status markers on the XSS section.
**Done when:**
1. **Behavioral:** a contributor/auditor can read `docs/SECURITY.md` and
   reconstruct the auth + storage security model and its trade-offs without
   reading the plans; every claim is source-cited; the doc is discoverable from
   README + DESIGN.
2. **Verification:** links resolve (grep the new path from README/DESIGN);
   accuracy review of each cited `file:line`.
**Validation:** Narrow-plus — doc, but with a source-accuracy review (the failure
mode is a confident-but-wrong security claim, worse than none).
**Stop-point.**

### Phase 2: Build-time CSP generation + inline-script hashing

**Goal:** `scripts/build.mjs` injects a strict `<meta http-equiv="Content-
Security-Policy">` into every built shell, with `'sha256-…'` hashes computed for
each inline script, and the `connect-src`/`img-src` policy from D1. Enforcing (not
report-only), validated by a hermetic no-violations pass.

**Changes:**
- [ ] `scripts/build.mjs` — in the existing HTML pass, for each shell: extract
  inline `<script>` blocks, compute their `sha256`, assemble the CSP string
  (`default-src 'none'`; `script-src 'self' <hashes>`; `style-src 'self'`;
  `img-src` + `connect-src` per D1; `font-src 'self'`; `manifest-src 'self'`;
  `worker-src 'self'`; `base-uri 'none'`; `object-src 'none'`;
  `form-action 'self'`), and inject the meta into `<head>`. Policy string built
  once, hashes per-shell.
- [ ] `tests/e2e/csp.spec.ts` — hermetic wiring test: for each of the 8 pages,
  register a `securitypolicyviolation` listener, load the page, exercise its
  basic render, assert **zero** violations; assert the CSP meta is present and
  contains the expected `script-src` hashes and the D1 `connect-src`.

**Call chain:** `npm run build` → HTML pass in `build.mjs` → dist shells carry
the CSP meta → browser enforces on load. Entry point = loading any page.
**Wiring test:** `csp.spec.ts` loads each page through the real document and
asserts no CSP violation fires — proving the policy admits the app's own inline
scripts + assets, not just that a meta string exists.
**Depends on:** Phase 0 (D1 connect-src, D2 hashes), Phase 1 (narrative status
field to flip).
**Read-set:** `scripts/build.mjs`, the 8 shells, D1/D2 findings.
**Write-set:** `scripts/build.mjs`, `tests/e2e/csp.spec.ts`, and
`docs/SECURITY.md` (flip the CSP status to "implemented" — same-phase doc sync).
**Shared-state contract:** build-time only; no runtime/prod state beyond what the
next deploy serves. The CSP ships to prod on the next push→CI→Pages deploy;
because it can break page loads app-wide, the no-violations hermetic pass is the
gate before merge, and it is reversible via revert.
**Risks:** an over-tight directive blanks a page in production (CSP failures are
silent to the user). Mitigations: the per-page no-violations test across all
flows; enforce only after green; revert-ready. `connect-src` too tight would
break sign-in against some PDS — D1 decides the policy deliberately.
**Done when:**
1. **Behavioral:** every built page loads and functions with the CSP enforced;
   no `securitypolicyviolation` fires across the 8 pages; a loopback sign-in
   still completes under CSP.
2. **Verification:** `npm test` hermetic green incl. `csp.spec.ts`; a local
   loopback `@live` sign-in under the enforced CSP (the auth flow is the highest
   CSP-risk path).
**Validation:** Broad — a policy that ships to production and can break page
loads app-wide; hermetic no-violations across all pages + a loopback auth run
under CSP.
**Stop-point.**

### Phase 3: SRI on entry scripts + styles

**Goal:** `build.mjs` adds `integrity=` (+ `crossorigin`) to the entry
`<script type="module" src>` and `<link rel="stylesheet">` in each built shell,
computed from the bytes it already hashes. Scope limited per D3 (entry + styles;
code-split chunks documented as not covered).

**Changes:**
- [ ] `scripts/build.mjs` — during the HTML pass, compute the SRI digest for each
  referenced hashed bundle/stylesheet and add `integrity="sha384-…"` +
  `crossorigin="anonymous"` to its tag.
- [ ] `tests/e2e/csp.spec.ts` (extend) — assert entry `<script>`/`<link>` carry
  `integrity`, and that pages still load (an SRI mismatch blanks the page, so a
  successful render is the proof).

**Call chain:** `npm run build` → SRI digests injected → browser verifies each
subresource before executing. Entry point = loading any page.
**Wiring test:** the extended `csp.spec.ts` asserts integrity attrs are present
AND the page renders (SRI failure → no render), proving the digests are correct,
not merely present.
**Depends on:** Phase 2 (same `build.mjs` HTML pass), Phase 0 (D3 scope).
**Read-set:** `scripts/build.mjs`, D3 findings.
**Write-set:** `scripts/build.mjs`, `tests/e2e/csp.spec.ts`, `docs/SECURITY.md`
(flip SRI status + record the code-split-chunk limitation).
**Shared-state contract:** build-time only; ships on next deploy; reversible.
**Risks:** a wrong digest or a missing `crossorigin` blanks pages. Mitigation:
the render-still-works assertion across all pages.
**Done when:**
1. **Behavioral:** every page's entry script + stylesheet load with SRI enforced
   and the page renders; the documented chunk limitation is recorded.
2. **Verification:** `npm test` hermetic green incl. the extended `csp.spec.ts`.
**Validation:** Moderate — build change affecting every page load; hermetic
render pass across all pages is sufficient (no external integration).
**Stop-point.**

### Phase 4: Zero-third-party enforcement

**Goal:** A test that structurally forbids third-party script origins and keeps
the CSP allowlist honest, plus the narrative's zero-3p claim made enforceable.

**Changes:**
- [ ] `tests/e2e/csp.spec.ts` (extend) or a small unit check — assert no built
  shell references a non-`'self'` script origin, and the CSP `script-src`
  contains only `'self'` + the known inline hashes (no host allowlist creeping
  in). Complements the existing "Browse ships zero auth code" bundle test.
- [ ] `docs/SECURITY.md` — flip the zero-3p claim to "enforced by test", naming
  the test.

**Call chain:** test-only guard over the built output; entry point = the build
artifact the test reads.
**Wiring test:** the assertion itself is the guard; it fails if a third-party
script origin or a stray `script-src` host is introduced.
**Depends on:** Phase 2 (CSP string), Phase 3.
**Read-set:** built `dist` shells, `scripts/build.mjs`.
**Write-set:** `tests/e2e/csp.spec.ts`, `docs/SECURITY.md`.
**Shared-state contract:** test + doc only; no runtime state.
**Risks:** low — a guard test. Could be over-strict if a legitimate future
third-party need arises; documented as intentional.
**Done when:**
1. **Behavioral:** introducing a third-party script origin (or a `script-src`
   host) fails the suite; the narrative's zero-3p claim is test-backed.
2. **Verification:** `npm test` green; a deliberate local spike adding a
   third-party `<script>` is caught by the test (verify once, revert).
**Validation:** Narrow — a test guard; wiring test + the deliberate-violation
check.
**Stop-point (security-posture narrative + primary XSS hardening complete).**

## Open Questions

- [CONFIRMED: PHASE-GATED (Phase 2) — user, 2026-07-09] `connect-src`/`img-src`
  policy: **fixed origins + `https:` fallback** — `connect-src 'self'
  https://bsky.social https://public.api.bsky.app https://plc.directory https:`;
  `img-src 'self' data: blob: https:`. The `https:` breadth covers any PDS
  (works with any atproto account); the DPoP non-extractable key already
  neutralizes token exfil, so connect-src's residual job is blocking
  non-HTTPS/downgrade, not exfil. **D1 still confirms the fixed origin set** and
  that no additional origin is missed; the `https:` fallback is the accepted,
  documented trade-off (record it in the narrative's residual-risks section).
- [CONFIRMED: ADVISORY — user, 2026-07-09 (recommended, not overridden)] Ship the
  CSP **enforcing**, not Report-Only: no backend to receive reports, so
  Report-Only buys little; gated by the hermetic no-violations pass across all
  pages/flows. Revert-ready.
- [CONFIRMED: ADVISORY — user, 2026-07-09 (recommended, not overridden)]
  Clickjacking: `frame-ancestors` is not honored via `<meta>` and Pages sets no
  `X-Frame-Options` (confirm in D4). **Document as a residual limitation** in the
  narrative; the JS frame-buster fallback is deferred (low severity — the only
  sensitive flow, sign-in, is a full-page OAuth redirect, not a framed action).
- [CONFIRMED: PHASE-GATED (Phase 3) — user, 2026-07-09 (recommended, not
  overridden)] SRI scope: **entry `<script>` + `<link>` only**, with code-split
  `import()` chunks documented as not integrity-covered (HTML `integrity` isn't
  expressible on dynamic imports; value is bounded since everything is
  same-origin first-party). D3 confirms.
- [CONFIRMED: ADVISORY — user, 2026-07-09] Narrative lives at **`docs/SECURITY.md`**
  (beside `docs/DESIGN.md`), as the living narrative that **references** (not
  duplicates) the locked decision in the build-execution plan. Root
  `SECURITY.md` was considered and not chosen (cohesion with `docs/` over
  GitHub's Security-policy-tab discoverability).

**All 5 confirmed (2026-07-09): 2 PHASE-GATED (connect-src → Phase 2, SRI scope →
Phase 3), 3 ADVISORY (enforce, clickjacking-as-residual, docs/SECURITY.md). No
BLOCKING items — Phase 0 discovery is ready to execute on approval after Pass
2+3.**

## Review Log

### Pass 1: Base plan — 2026-07-09
Built from the user's request to (a) write a detailed security-posture narrative
(auth/storage-oriented, trade-offs explicit, for the novel SPA/PWA/atproto model)
and (b) implement the CSP/SRI/zero-3p hardening the project's own locked decision
names as the *primary* secret-storage defense but has not built. Grounded in the
codebase: confirmed no CSP/SRI exists; `<meta http-equiv>` is the only delivery
path on GitHub Pages; the two inline-script hashes needed; no inline styles; the
full network surface incl. arbitrary PDS (the `connect-src` design decision);
`build.mjs`'s HTML pass as the injection point; library-owned session storage +
per-session-only `signOut`. Structured as Phase 0 discovery (connect-src surface,
inline-hash mechanism, SRI feasibility, meta-CSP limits) → Phase 1 narrative →
Phase 2 CSP+hashing → Phase 3 SRI → Phase 4 zero-3p enforcement, each ≤ 3 files,
strictly sequential (Phases 2–4 share `build.mjs`). Coupled the doc to the
implementation via same-phase status flips so the narrative never overstates the
posture. Scoped out global revoke / dependency-audit / SW hardening as named
future items.
