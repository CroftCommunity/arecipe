# arecipe — Security posture narrative + primary XSS hardening (CSP/SRI)

**Status: CLOSED — shipped in full.** Passes 1–3 (`efabd22`, `4ad4290`,
`5b89fba`); Phases 0–4 all ✅ (discovery, narrative, enforcing CSP, SRI, zero-3p
guard). Nothing deferred except the pre-existing out-of-scope font bug (below).
Not pushed.

## Outcome Summary

| Phase | Outcome | Ref | Note |
|-------|---------|-----|------|
| 0 Discovery | ✅ complete | — | D2/D3/D4 hermetic; D1 read+PDS path proven; `@live` auth slice → Phase 2 gate |
| 1 Narrative | ✅ shipped | `cf32b5e` | `docs/SECURITY.md` + README/DESIGN links; all claims source-cited |
| 2 CSP + hashing | ✅ shipped | `ceee042` | enforcing CSP on all 9 docs; hermetic green; `@live` auth/publish pass under CSP (3 unrelated `@live` flakes confirmed pre-existing via no-CSP baseline) |
| 3 SRI | ✅ shipped | `ab20147` | sha384 integrity on entry module + both stylesheets; chunks documented uncovered |
| 4 Zero-3p guard | ✅ shipped | `b2e6f90` | structural guard: no cross-origin script; script-src = self+hashes only |

**Surfaced, out of scope (needs triage/tracking):** custom fonts 404 in
production — `assets/fonts/fonts.css` uses `url(./assets/fonts/X.woff2)` but is
itself served from `/assets/fonts/`, so the browser resolves to a doubled path
`/assets/fonts/assets/fonts/X.woff2` (404 → system-font fallback). Pre-existing,
unrelated to CSP (`font-src 'self'` neither causes nor worsens it — the requests
are same-origin, just mis-pathed). Not part of this plan's scope; fixed
separately in a follow-up commit (`117ecc3`) with `tests/e2e/fonts.spec.ts`.

---

Pass 1 (base) — 2026-07-09. Pass 2 (gap analysis) + Pass 3 (quality gates)
complete. Execution began 2026-07-09 at Phase 0.

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
- **No `eval` / `new Function` / `WebAssembly` in the built output** (Pass 2):
  `grep -roE "eval\(|new Function\(|WebAssembly\." dist/` → empty across every
  bundle + code-split chunk. So `script-src` needs **no** `'unsafe-eval'` /
  `'wasm-unsafe-eval'` — the biggest CSP-breaker is absent. esbuild does not
  rename literal `eval(`/`new Function(`, so a minified-output grep is a valid
  signal; Phase 0 D1 still confirms at runtime by exercising cbor
  encode/decode + DPoP JWT signing + publish under a no-`unsafe-eval` policy.
- **Three distinct inline-script hashes site-wide** (Pass 2, verified by hashing
  the `<script>` blocks): the theme pre-paint block is byte-identical across
  account/cookbook/editor/mine/recipe/settings/signin + index (one hash);
  `index.html` adds the landing/redirect block (second hash); **`friends.html`
  carries its own redirect-stub inline script (third hash)**. Critically,
  `friends.html` is copied verbatim via `copyFileSync` and is **not** in the
  `HTML` map, so it does **not** pass through the HTML-injection loop — Phase 2
  must handle it explicitly or it ships without CSP. Confirmed 2026-07-09.
- **No inline event handlers (`on*=`) and no `WebSocket`/`EventSource`** in
  shells or `src/` (Pass 2) → `script-src-attr` unneeded and `connect-src` needs
  no `wss:`. Confirmed by grep 2026-07-09.
- **Two stylesheets + a manifest + an icon per shell** (Pass 2): `styles.css`
  (content-hashed) and `assets/fonts/fonts.css` (copied via `cpSync`, **not**
  hashed) are both `<link rel="stylesheet">` (→ `style-src 'self'`; both are SRI
  candidates); `manifest.webmanifest` (→ `manifest-src 'self'`); `logo-light.png`
  icon (→ `img-src 'self'`). `src/build-stamp.ts:51` fetches `./build-info.json`
  (→ `connect-src 'self'`). Confirmed by reading a shell + `build-stamp.ts`.
- **Session storage is library-owned.** `BrowserOAuthClient` hard-codes its
  IndexedDB store; its options `Omit` `sessionStore`/`stateStore`
  (`browser-oauth-client.d.ts:8`, re-confirmed in the sign-in plan). The DPoP key
  is generated non-extractable by the library. `session-provider.ts` adds no
  storage of its own and exposes per-session `signOut()` (calls
  `session.signOut()`), `getTokenInfo`, and a debug `forceRefresh`. There is **no
  global "sign out everywhere"** today. Confirmed by reading
  `src/auth/session-provider.ts`.
- **VERIFIED via Phase 0 discovery (2026-07-09, hermetic Playwright/Chromium
  over built `dist`; probe code was `throwaway` and has been removed):**
  - **(D2) The three build-computed `sha256` hashes match the browser exactly**
    — under `script-src 'self'` + the three hashes, all 9 documents loaded with
    **zero** `securitypolicyviolation`. Base64 values for `build.mjs`:
    - `sha256-FZCh04/evgapIEHhqDZ2QN+jSctIo/PmzHFZCcGVwlA=` — theme pre-paint
      (all 8 shells)
    - `sha256-AFuWlNTFNFOiaCN/V9holAXSCcoVXtnsje4QkAYG/CI=` — index landing block
    - `sha256-oEG+8rARcF5NdiN3bUoe+M8OmKs3aT23yOBbuduJvQQ=` — friends.html stub
    Zero inline `<style>` and zero `on*=` handlers across all 9 docs (re-confirmed
    at runtime) → `style-src 'self'` holds and `script-src-attr` is unneeded.
  - **(D2) Meta ordering is load-bearing and proven.** A hash-less
    `script-src 'self'` placed **before** the inline theme block fired a
    `script-src-elem: inline` violation (blocked); the identical meta placed
    **after** the block fired **no** `script-src-elem` violation (the script ran
    **ungoverned**). Therefore Phase 2 must inject the CSP meta *before* the first
    inline `<script>` — a meta does not retroactively govern preceding scripts.
  - **(D1, read path) `connect-src`/`img-src` candidate policy fires zero
    violations on the read path**, exercising `resolveDidDoc` → PDS records +
    thumbnails. Origins actually contacted: `plc.directory`, `cdn.bsky.app`, and
    **four distinct dynamic PDS hosts** (`morel.us-east.host.bsky.network`,
    `phellinus.us-west.host.bsky.network`, `poisonpie.us-west.host.bsky.network`,
    `pds.commonscomputer.com`) — none on a hard-codeable allowlist. This is the
    concrete proof that OQ1's `https:` breadth is required: a fixed allowlist
    would have blocked every one of those PDS. The build-info fetch stayed
    same-origin (`connect-src 'self'`).
  - **(D3) `integrity=` is honored AND enforced on the entry ES module.** Correct
    `sha384` → the app mounted (module executed); a deliberately wrong digest →
    Chromium reported *"Failed to find a valid digest … The resource has been
    blocked"* and `#app` stayed empty. Computed digests:
    - entry (`browse-*.js`): `sha384-20jNTbRJwu+6nXPFIKyo6CbhM4pUDD3xPLGcgwMmOZrt8j0mqUh1EoMAMHz/Y44R`
    - styles (`styles-*.css`): `sha384-ssn9sGhxErOpZgOrmH8ixE6Us1eHKS6dqJUt2v61qDmZatpSCeXR4Ax8VIqnWpFo`
    (these rotate per content hash; `build.mjs` recomputes them per build).
    Code-split `import()` chunks carry **no HTML tag**, so HTML `integrity` is
    structurally not expressible on them — documented as not-covered (OQ4), not a
    gap we can close.
  - **(D4) GitHub Pages sets no framing/CSP response header.** `curl -I
    https://arecipe.app/` returns `server: GitHub.com` with **no
    `X-Frame-Options` and no `Content-Security-Policy`**. Combined with the CSP
    spec (`<meta http-equiv>` ignores `frame-ancestors`, `report-uri`,
    `report-to`, `sandbox`), clickjacking cannot be defended on Pages → document
    as a residual limitation (settled decision #3).
- **STILL PENDING `@live` (no `.env` credentials in this environment):** (a) the
  **auth + publish** slice of D1 — the OAuth sign-in against `bsky.social`,
  handle resolution against `public.api.bsky.app`, a publish, and the
  `frame-src` (hidden-refresh-iframe) / `wss:` watch — was **not** exercised
  hermetically; and (e) the **runtime no-`'unsafe-eval'` confirmation** (cbor
  encode/decode + DPoP JWT signing run only in the auth/publish flow). The static
  `dist` grep (no `eval`/`new Function`/`WebAssembly`) stands as strong evidence.
  Both fold directly into **Phase 2's `@live` loopback sign-in-under-CSP
  Verification gate** — which is the plan's designated place for them — so no
  new phase is needed; they are gated, not lost.

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
  add tests. Grepped for stale references (Pass 3, 2026-07-09): `docs/PRACTICES.md:11`
  mentions `scripts/build.mjs`, but in a deploy-versioning context (the build-SHA /
  "deploy is DONE when the live origin serves that SHA" rule) — **not** the
  HTML-injection pass these phases touch, so it is not made stale and needs no
  update. No doc references `tests/e2e/csp.spec.ts` or `docs/SECURITY.md` (the
  latter does not yet exist; no pre-existing or broken links found in `README.md`
  or `docs/`).

## Concurrency Map

Sequential spine: **Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 4.**

- Phase 0 (discovery) must precede all — D1 feeds Phase 2's `connect-src`, D2 the
  hashing, D3 the SRI scope, D4 the documented limitations that Phase 1's
  narrative must state accurately.
- Phases 2 → 3 → 4 all write `scripts/build.mjs` (CSP injection, then SRI
  injection, then the zero-3p assertion) → shared write-set → strictly
  sequential.
- Phase 1 is **not** parallel-eligible with Phase 2 after all (Pass 2
  correction): Phases 2, 3, and 4 each write `docs/SECURITY.md` to flip their
  status field, and Phase 1 creates it — so all four phases share the
  `docs/SECURITY.md` write-set, and Phases 2–4 additionally share
  `scripts/build.mjs` and `tests/e2e/csp.spec.ts`. Sequential is therefore
  **required by the write-sets**, not merely preferred. (Pass 1 mis-stated this
  as a free choice; the shared status-field writes make it mandatory.)
- All sequential; no worktrees → no re-entry-verification fields.

## Phases

**Cross-phase conventions:** tests-first where there is executable behavior
(RED before GREEN, watch it fail); hermetic tier (Playwright over the built
`dist`, push CI) is the gate; the interactive OAuth/`@live` tier is a local
gate only where the flow is the feature. Doc phases validate by accuracy review
against cited `file:line`, not tests.

### Phase 0: Discovery — ✅ COMPLETE (hermetic; `@live` auth slice deferred to Phase 2 gate)

**Delivered (2026-07-09):** D2/D3/D4 fully resolved hermetically; D1 resolved for
the read + dynamic-PDS path (the connect-src design question), with its auth +
publish slice deferred to Phase 2's `@live` gate (no `.env` here). All findings in
Verified Assumptions. Probe code (`tests/e2e/spike-phase0.spec.ts`,
`tests/spike/d2-inline-inventory.mjs`) was `throwaway` and has been removed.

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
    dynamic (user PDS). Confirmation that the enforced policy (OQ1: `'self'` +
    the fixed origins + `https:`) fires zero connect/img violations across all
    three flows. **Also confirm** under a no-`'unsafe-eval'` `script-src`: cbor
    encode/decode + DPoP JWT signing + publish raise no eval/wasm violation (VA
    (e)); and watch for any `frame-src` violation (would reveal
    `BrowserOAuthClient` using a hidden refresh iframe) or `wss:` connect.
  - **Disposition:** `throwaway` (the probe CSP + capture harness); findings →
    Verified Assumptions + OQ1.
- [ ] **D2: Does a build-computed `'sha256-…'` match the browser's hash of each
      inline block, and what is the full inline inventory?**
  - **Probe:** Compute `sha256` of each inline `<script>` block's exact text;
    inject a `script-src 'self' 'sha256-…'` meta **as the first element in
    `<head>`** (before the inline scripts it must govern) into the built shells;
    load each page and confirm zero inline-script CSP violations. Enumerate every
    inline `<script>`/`<style>`/inline handler across **all 9 documents** (the 8
    shells + `friends.html`).
  - **Success criteria:** The **three** expected hashes admit the inline scripts
    with no violations — pre-paint (`1590a1d38f`, 7 shells + index), index landing
    (`005b9694d4`), and the `friends.html` redirect stub (`a041bef2b0`); no other
    inline execution surface exists. Confirm meta-first-in-`<head>` ordering is
    required (a meta placed after an inline script does not retroactively govern
    it). Confirm `friends.html`'s handling path (it is copied outside the HTML
    loop — see Phase 2).
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

### Phase 1: Security-posture narrative (`docs/SECURITY.md`) — ✅ SHIPPED (`cf32b5e`)

**Delivered (2026-07-09):** `docs/SECURITY.md` created (threat model, backendless
model, authentication, session storage, XSS-primary-defense with per-control
status markers, blast-radius, residual risks, references); README `## Docs`
entry added; DESIGN.md integrity bullet cross-references it. Every technical
claim carries a `file:line` or named-decision citation; all citations and links
re-verified (CI deploy job `ci.yml:31/53`; auth citations in
`src/auth/oauth-client.ts`, `session-provider.ts`, `session-hint.ts`;
`client-metadata.json`; `browser-oauth-client.d.ts:8`). CSP/SRI/zero-3p markers
read NOT YET IMPLEMENTED, to be flipped by Phases 2–4.

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
    chunks; the deliberate `connect-src 'https:'` breadth (accepted so any PDS
    works — OQ1; the DPoP non-extractable key is what actually neutralizes exfil);
    **no `report-uri`/`report-to`** (no backend to receive reports), so
    production CSP violations are not centrally observed — the pre-ship hermetic
    no-violations pass is the compensating control.
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

### Phase 2: Build-time CSP generation + inline-script hashing — ✅ SHIPPED (`ceee042`)

**Delivered (2026-07-09):**
- `scripts/build.mjs` — `cspFor(html)` computes the `sha256` of each inline
  `<script>` per document (never hand-authored) and assembles the OQ1 policy;
  `injectCsp(html)` inserts the meta into every built shell AND `friends.html`
  (handled explicitly, since it is written outside the HTML map). Enforcing.
- `tests/e2e/csp.spec.ts` — loads all 9 documents under the enforcing policy and
  asserts zero `securitypolicyviolation`, plus meta-presence, hash membership,
  and OQ1 `connect-src`; friends.html asserted to redirect (stub ran) and to
  carry its own hash in source order.
- `docs/SECURITY.md` CSP status flipped to IMPLEMENTED (enforcing).

**Refinement vs the Pass 3 spec (charset-first):** the spec said inject the meta
as the *first* `<head>` child. Delivered instead **immediately after
`<meta charset>`**, keeping charset the genuine first child (HTML best practice;
keeps the charset declaration well under the 1024-byte limit). Phase 0 D2 proved
the only hard requirement is that the CSP meta *precede the inline scripts* — this
satisfies it and is strictly more correct. `csp.spec.ts` asserts that invariant
(charset first; CSP index < first-inline-script index).

**Verification result:** hermetic `npm test` green (lint · typecheck · unit
193 · build · e2e 61 incl. `csp.spec.ts`, exit 0). `@live` under the enforced
CSP: the core auth/write paths — `auth-live` (sign-in), `publish-live`,
`comments-live`, `drafts-live` — **pass under CSP**, satisfying the "sign-in
completes under CSP" gate and confirming no `'unsafe-eval'` is needed at runtime
(publish signs + writes). Three `@live` tests failed (`interactions-live`
like-reflection, `two-device-read` 5-min timeout, `two-tab-live` refresh-token
hazard); a **no-CSP baseline failed the identical three tests the same way**, so
they are pre-existing `@live` flakiness (real-PDS write consistency, rate-limits,
single-use refresh-token state), **not CSP regressions**. No CSP-violation
fingerprints in any failure artifact; the app rendered and the `@atproto` chunk
executed under CSP in all three.

**Goal:** `scripts/build.mjs` injects a strict `<meta http-equiv="Content-
Security-Policy">` into every built shell, with `'sha256-…'` hashes computed for
each inline script, and the `connect-src`/`img-src` policy from D1. Enforcing (not
report-only), validated by a hermetic no-violations pass.

**Changes:**
- [ ] `scripts/build.mjs` — in the existing HTML pass, for each shell: extract
  inline `<script>` blocks, compute their `sha256`, assemble the CSP string
  (`default-src 'none'`; `script-src 'self' <hashes>`; `style-src 'self'`;
  `img-src 'self' data: blob: https:`; `connect-src 'self' https://bsky.social
  https://public.api.bsky.app https://plc.directory https:` per OQ1;
  `font-src 'self'`; `manifest-src 'self'`; `worker-src 'self'`;
  `base-uri 'none'`; `object-src 'none'`; `form-action 'self'`), and inject the
  meta **as the first child of `<head>`, before any inline `<script>`** (a meta
  CSP does not govern inline scripts that precede it). Policy string built once;
  hashes computed per-document from actual inline content (never hand-authored).
- [ ] `scripts/build.mjs` — **also process `friends.html`** (the legacy redirect
  stub, currently `copyFileSync`'d verbatim outside the HTML loop): route it
  through the same CSP injection with its own inline-script hash
  (`a041bef2b0`-class), so no document ships without CSP. It has no page bundle,
  so only the meta + its single inline hash apply.
- [ ] `tests/e2e/csp.spec.ts` — hermetic wiring test across **all 9 documents**
  (8 shells + `friends.html`): before navigating, `page.addInitScript` a
  collector that pushes every `securitypolicyviolation` (violatedDirective +
  blockedURI) onto a `window`-scoped array; load the page, exercise its basic
  render (and for `signin.html`, mount the form), then read the array and assert
  it is **empty**. Also assert the CSP `<meta>` is present, is the first
  `<head>` child, and its `script-src` contains the expected hash(es) and the
  OQ1 `connect-src`. The empty-violations assertion is the real gate; a present
  meta string alone proves nothing.
  - **Written RED-first (TDD ordering note):** run `csp.spec.ts` against the
    current no-CSP `dist` and watch it fail — the RED driver is the
    meta-present / first-`<head>`-child / `script-src`-contains-hashes /
    `connect-src`-matches assertions (all fail when no meta exists). The
    zero-`securitypolicyviolation` assertion is *trivially green before any CSP
    exists* (no policy → no violations) and only becomes load-bearing after
    injection, where it goes RED if the policy over-tightens. Do not write the
    violations assertion alone and mistake its pre-implementation green for a
    passing test.

**Call chain:** `npm run build` → HTML pass in `build.mjs` → dist shells carry
the CSP meta → browser enforces on load. Entry point = loading any page.
**Wiring test:** `csp.spec.ts` loads each page through the real document and
asserts no CSP violation fires — proving the policy admits the app's own inline
scripts + assets, not just that a meta string exists.
**Depends on:** Phase 0 (D1 connect-src, D2 hashes), Phase 1 (narrative status
field to flip).
**Read-set:** `scripts/build.mjs`, all 9 documents (8 shells + `friends.html`),
D1/D2 findings.
**Write-set:** `scripts/build.mjs`, `tests/e2e/csp.spec.ts`, and
`docs/SECURITY.md` (flip the CSP status to "implemented" — same-phase doc sync).
**Shared-state contract:** build-time only; no runtime/prod state beyond what the
next deploy serves. The CSP ships to prod on the next push→CI→Pages deploy;
because it can break page loads app-wide, the no-violations hermetic pass is the
gate before merge, and it is reversible via revert.
**Risks:** an over-tight directive blanks a page in production (CSP failures are
silent to the user). Mitigations: the per-page no-violations test across all
flows; enforce only after green; revert-ready. `connect-src` too tight would
break sign-in against some PDS — OQ1's `https:` fallback avoids this. Two
specific traps Pass 2 surfaced: (1) meta placed *after* an inline script won't
govern it — inject first in `<head>`; (2) `friends.html` is copied outside the
HTML loop — miss it and one document ships un-CSP'd. Also run the **full** e2e
suite (not just `csp.spec`) — enabling CSP could break any existing test that
relied on inline injection (none found, but the regression run is the proof).
**Done when:**
1. **Behavioral:** every built page loads and functions with the CSP enforced;
   no `securitypolicyviolation` fires across the 8 pages; a loopback sign-in
   still completes under CSP.
2. **Verification:** `npm test` hermetic green incl. `csp.spec.ts` (the `test`
   script runs `npm run build` before `test:e2e`, so the spec always runs against
   a freshly-built `dist`; Playwright auto-discovers the new spec via its
   `tests/e2e/**` glob — no registration step); a local loopback `@live` sign-in
   under the enforced CSP (the auth flow is the highest CSP-risk path).
**Validation:** Broad — a policy that ships to production and can break page
loads app-wide; hermetic no-violations across all pages + a loopback auth run
under CSP.
**Stop-point.**

### Phase 3: SRI on entry scripts + styles — ✅ SHIPPED (`ab20147`)

**Delivered (2026-07-09):** `scripts/build.mjs` `sri()` adds
`integrity="sha384-…" crossorigin="anonymous"` to the entry ES module and both
stylesheets (`styles.css` from `cssBytes`; `assets/fonts/fonts.css` from source
bytes), computed from the served bytes. `csp.spec.ts` extended (8 SRI tests):
per shell, asserts sha384 integrity + `crossorigin=anonymous` on the entry module
and both stylesheets, the page renders (entry-mismatch would blank it), and no
subresource fails its integrity check at load (covers the stylesheets, whose
mismatch would not blank the page). Code-split `import()` chunks left uncovered
(D3: no HTML tag), documented in `docs/SECURITY.md`. SRI status flipped to
IMPLEMENTED. Verification: hermetic `npm test` green (unit 193, e2e 69, exit 0).



**Goal:** `build.mjs` adds `integrity=` (+ `crossorigin`) to the entry
`<script type="module" src>` and `<link rel="stylesheet">` in each built shell,
computed from the bytes it already hashes. Scope limited per D3 (entry + styles;
code-split chunks documented as not covered).

**Changes:**
- [ ] `scripts/build.mjs` — during the HTML pass, compute the SRI digest for each
  referenced entry bundle **and both stylesheets** — `styles.css` (content-hashed)
  and `assets/fonts/fonts.css` (copied unhashed; its digest must be recomputed
  whenever the file changes, since its URL doesn't rotate) — and add
  `integrity="sha384-…"` + `crossorigin="anonymous"` to each tag. Code-split
  `import()` chunks are out of scope (HTML `integrity` isn't expressible on them
  — OQ4; documented, not silently skipped).
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

### Phase 4: Zero-third-party enforcement — ✅ SHIPPED (`b2e6f90`)

**Delivered (2026-07-09):** `tests/e2e/csp.spec.ts` gains a structural guard over
all 9 built documents — every `<script src>` must be same-origin (relative), and
each `script-src` must contain only `'self'` + sha256 inline hashes (no host,
scheme, wildcard, or `'unsafe-*'`). RED proof performed: a deliberate
`<script src="https://evil.example/x.js">` injected into `dist/mine.html` failed
the guard as expected (`script src … must be same-origin`), then the clean build
was restored. `docs/SECURITY.md` zero-3p claim flipped to ENFORCED BY TEST,
naming the guard. Verification: hermetic `npm test` green (unit 193, e2e 78,
exit 0).



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
script origin or a stray `script-src` host is introduced. **TDD ordering note:**
this guard is green against today's zero-3p output, so its RED proof is the
deliberate third-party `<script>` injection called out in Verification — run that
injection and watch the suite fail *before* trusting the green. A guard never
exercised against a real violation is untested.
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

### Pass 2: Gap Analysis — 2026-07-09
**Found:**
- **`friends.html` is a missed document.** It carries its own redirect-stub
  inline script (hash `a041bef2b0`) and is `copyFileSync`'d verbatim **outside**
  `build.mjs`'s HTML-injection loop — so it would ship with no CSP. Added an
  explicit Phase 2 item to route it through CSP injection. Site-wide there are
  **three** distinct inline-script hashes (pre-paint ×7+index, index-landing,
  friends-redirect), not two.
- **No `eval`/`Function`/`WebAssembly` in the built output** (grep over all
  `dist/*.js` + chunks → empty). De-risks the biggest CSP-breaker: `script-src`
  needs no `'unsafe-eval'`/`'wasm-unsafe-eval'`. Recorded as a Verified
  Assumption with a runtime re-confirm folded into D1.
- **CSP-meta ordering constraint.** A `<meta>` CSP does not govern inline
  scripts that precede it — it must be the first child of `<head>`, before the
  theme pre-paint block. Added to D2 and the Phase 2 change + risks.
- **Second stylesheet + fetch surface.** `assets/fonts/fonts.css` (copied
  unhashed) is a second `<link rel=stylesheet>` alongside `styles.css`; both need
  `style-src 'self'` and are SRI candidates (Phase 3 updated). `build-stamp.ts`
  fetches `./build-info.json` → `connect-src 'self'` confirmed.
- **No inline handlers, no WebSocket** → `script-src-attr` and `wss:` not needed
  (recorded).
- **Refresh-iframe unknown.** Whether `BrowserOAuthClient` uses a hidden iframe
  for token refresh (→ `frame-src`) is unverified; folded into D1's violation
  watch.
**Concurrency:**
- **Correction:** Pass 1 called Phase 1 "parallel-eligible" with Phase 2. It is
  not — Phases 2–4 each write `docs/SECURITY.md` (status flips) and Phase 1
  creates it, so all four share that write-set (and 2–4 share `build.mjs` +
  `csp.spec.ts`). Sequential is **required by the write-sets**, not chosen.
  Concurrency Map updated. No parallel candidates exist.
**Changed:**
- Added the `friends.html` Phase 2 item + three-hash inventory; folded
  eval/iframe/`wss`/no-eval runtime checks into D1; added meta-first-in-`<head>`
  to D2 + Phase 2; expanded SRI scope to `fonts.css` (Phase 3); added the
  `connect-src 'https:'` breadth and no-`report-uri` items to the narrative's
  residual-risks section; corrected the Concurrency Map.
**Confirmed:**
- The build-time-generation approach and `build.mjs` HTML pass as the injection
  point hold up. The OQ1 policy (`'self'` + fixed origins + `https:`) is
  consistent with the measured network surface. The five Pass 1 open questions
  are unchanged — no new open questions surfaced (the gaps were fillable without
  a user decision). Phase sizing still ≤ 3 files each after the additions.

### Pass 3: Quality Gates — 2026-07-09
Fresh context; plan doc as sole handoff. Spot-checked the codebase — every cited
`file:line` still resolves and every Verified Assumption holds: no CSP/`integrity=`
in any shell; `docs/SECURITY.md` absent (root `SECURITY.md` absent); `build.mjs`
HTML pass at `scripts/build.mjs:64` with `friends.html` copied verbatim at line 71
*outside* the loop (confirms the Phase 2 friends.html item); inline-script tally
= pre-paint in all 8 shells + a 2nd (landing) block in `index.html` + the
`friends.html` stub → the three distinct hashes; `resolve.ts:39/45/46`,
`did.ts:12`, `build-stamp.ts:51`, `browser-oauth-client.d.ts:8` (`Omit
sessionStore`), `session-provider.ts` per-session-only `signOut` — all accurate;
no `eval`/`new Function`/`WebAssembly` in `dist/*.js`; no `on*=` handlers;
`csp.spec.ts` not yet present (Phase 2 creates it); both referenced plan files
present; `docs/DESIGN.md:84–88` integrity-check explainer (+ line 194) exists as
the Phase 1 cross-ref anchor.

**TDD ordering:**
- Phase 2: added an explicit RED-first note. The zero-`securitypolicyviolation`
  assertion is *trivially green before any CSP exists* (no policy → no
  violations), so it cannot be the RED driver — the RED comes from the
  meta-present / first-`<head>`-child / hash-contains / `connect-src`-matches
  assertions, which fail against the current no-CSP `dist`. Flagged the trap of
  writing the violations assertion alone and mistaking its pre-implementation
  green for a pass. This is the one place the "watch it fail" discipline could
  silently no-op, so it is now called out in the phase.
- Phase 4: added a note that the zero-3p guard is green against today's output;
  its RED proof is the deliberate third-party `<script>` injection (already in
  Verification) — run and watch it fail before trusting the green.
- Phases 0 (Discovery exemption), 1 (doc → source-accuracy review), and 3
  (integrity-present + render-proof, RED via the integrity-present assertion)
  were already correctly ordered; no change.

**Observability:**
- Confirmed the plan adds no runtime logging (CSP is build-time) and correctly
  does not invent any. The observability story is stated in Phase 1's
  residual-risks section as intended: (a) the pre-ship hermetic no-violations
  pass is the compensating control for (b) the documented no-`report-uri`/
  `report-to` blindspot (production CSP violations are not centrally observed).
  Both present; no change.

**Debugging readiness:**
- Every phase is a marked stop-point. Phase 2 (production CSP, silent blank-page
  risk) already calls out revert-readiness and the *full* e2e regression run (not
  just `csp.spec`); added a Verification note that `npm test` runs `npm run build`
  before `test:e2e` (spec runs against fresh `dist`) and that Playwright
  auto-discovers the new spec via its `tests/e2e/**` glob — so a "green" run is
  provably exercising the new policy, not skipping the spec.

**Validation calibration:**
- Confirmed honest and scope-matched: Phase 0 Discovery (exemption), Phase 1
  Narrow-plus (doc + source-accuracy review), Phase 2 Broad (all-pages
  no-violations + loopback `@live` under CSP), Phase 3 Moderate (render pass
  across all pages), Phase 4 Narrow (guard + deliberate-violation check). Every
  Phase 0 D-item has a concrete question/probe/success-criteria and a declared
  disposition (D1/D2/D3 `throwaway`, D4 findings→VA); none is `promote`, so no
  follow-up TDD phase is owed. D4's spec portion (meta ignores `frame-ancestors`/
  `report-uri`/`sandbox`) is essentially known, but its host-specific half (Pages
  sets no `X-Frame-Options`) genuinely needs the probe — left as-is.

**Concurrency honesty:**
- Map confirmed; sequential plan. Re-checked write-sets directly: Phase 1 writes
  {`docs/SECURITY.md`, `README.md`, `docs/DESIGN.md`}; Phases 2–3 write
  {`scripts/build.mjs`, `tests/e2e/csp.spec.ts`, `docs/SECURITY.md`}; Phase 4
  writes {`tests/e2e/csp.spec.ts`, `docs/SECURITY.md`}. All four share the
  `docs/SECURITY.md` status-flip write, and 2–4 additionally share `build.mjs` +
  `csp.spec.ts` — so sequential is genuinely *required by the write-sets*, and no
  parallel candidate was missed (nothing can parallelize while every phase writes
  `docs/SECURITY.md`). All-sequential → no re-entry-verification fields needed;
  correctly omitted. No change.

**Discovery:**
- Phase 0 reviewed above under Validation calibration — concrete, answerable,
  dispositions complete. No change.

**Coherence:**
- Still solves both goals (write the narrative + implement the primary XSS
  defense, coupled via in-phase status flips so the doc never overstates the
  posture). No scope creep — global revoke / dependency-audit / SW hardening
  remain explicitly out and named as future items. Sizing still ≤ 3 files per
  phase after the additions (all additions were prose notes + one corrected
  Documentation Impact bullet; no new files).

**Documentation impact:**
- `docs/SECURITY.md` is NEW in Phase 1, with README link + DESIGN cross-ref in
  the same phase; the CSP/SRI status fields are flipped in-phase by Phases 2–4
  (no trailing docs phase). Corrected one inaccuracy: the section claimed "no doc
  references" to the touched files, but `docs/PRACTICES.md:11` does reference
  `scripts/build.mjs` — in a deploy-versioning context unrelated to the
  HTML/CSP pass, so not made stale. Rewrote the bullet to record the grep result
  accurately (per the gate: a "grepped — found, not stale" record beats a blanket
  "none").

**Confirmed ready:** yes — all five open questions previously confirmed by the
user; no BLOCKING items. Execution starts at Phase 0.

### Phase 0 execution — Discovery findings — 2026-07-09
Ran hermetic Playwright/Chromium probes over the built `dist` (probe code
`throwaway`, since removed). Full evidence promoted into Verified Assumptions;
summary:

- **D2 (hashing) — resolved.** The three build-computed `sha256` hashes match the
  browser byte-for-byte; all 9 documents load with zero violations under
  `script-src 'self'` + the 3 hashes. Zero inline styles / `on*=` handlers.
  **Meta-ordering proven load-bearing:** a hash-less policy before the inline
  block blocks it; the same policy after the block does not govern it (script
  runs) — so Phase 2 must inject the meta before the first inline `<script>`.
- **D1 (connect/img) — read path resolved, auth path deferred.** The candidate
  policy (OQ1: `'self'` + fixed origins + `https:`) fired zero violations while
  contacting `plc.directory`, `cdn.bsky.app`, and **four dynamic PDS hosts** not
  on any allowlist — concrete proof the `https:` breadth is required for
  arbitrary-PDS support. The OAuth sign-in + publish slice (and the runtime
  no-`unsafe-eval` confirmation) needs `@live` credentials absent here → folded
  into Phase 2's existing `@live` Verification gate.
- **D3 (SRI) — resolved.** Entry ES-module `integrity=` is honored and enforced
  (wrong digest → Chromium blocks the module, app stays empty). Code-split
  `import()` chunks have no HTML tag → integrity not expressible → documented
  not-covered (OQ4). Digests computed (recorded in VA).
- **D4 (meta limits) — resolved.** Live `arecipe.app` sets no `X-Frame-Options`
  and no CSP response header (`server: GitHub.com`); with `<meta>` ignoring
  `frame-ancestors`/`report-uri`/`report-to`/`sandbox`, clickjacking is
  undefendable on Pages → narrative residual-limitation (settled #3).

**No phase restructuring needed** — every finding matched the plan's assumptions;
OQ1/OQ3/OQ4 are confirmed by evidence rather than changed. The only material
carve-out (D1 auth slice + runtime eval check → Phase 2 `@live` gate) was already
the plan's designated home for those checks.

**New discovery, out of scope (surfaced, not fixed):** custom fonts 404 in
production via a doubled relative path in `assets/fonts/fonts.css` (see Outcome
Summary). Pre-existing, CSP-independent. Needs its own triage/tracking (no
`TODO.md` exists in this repo yet — flagged to the user).

**Phase 0 stop-point:** findings reported; awaiting user go-ahead for Phase 1
(the OQ1 connect-src decision was already confirmed and is now evidence-backed, so
no re-decision is required).

### Plan close-out — 2026-07-09
**Shipped:** Both plan goals met. (1) `docs/SECURITY.md` — a durable,
auth/storage-oriented security narrative for the backendless SPA/PWA-on-atproto
model (threat model, DPoP + non-extractable key, library-owned storage, XSS-as-
primary-defense with live status, blast-radius, residual risks), every claim
`file:line`-cited, linked from README + DESIGN, referencing (not duplicating) the
locked OAuth-secret-storage decision. (2) The primary XSS defense it names, built
into `scripts/build.mjs`: a strict enforcing `<meta>` CSP on all 9 documents
(`default-src 'none'`; `script-src 'self'` + per-document sha256 inline hashes,
no `unsafe-inline`/`unsafe-eval`; the OQ1 `connect-src` with the `https:` breadth
for arbitrary PDS; `friends.html` handled explicitly outside the HTML map);
sha384 SRI on the entry ES module + both stylesheets; and a structural zero-3p
guard. Enforced by `tests/e2e/csp.spec.ts` (27 tests: CSP no-violations across
all 9 docs, SRI presence + no-integrity-failure, zero-3p guard). Full hermetic
gate green throughout (unit 193, e2e 78); `@live` under CSP confirmed sign-in +
DPoP publish work. Commits: `cf32b5e` (P1), `ceee042` (P2), `ab20147` (P3),
plus P4 and doc-sync commits. Not pushed.

**Stopped or skipped:** Nothing in scope was skipped. The pure OAuth-redirect-UI-
under-CSP had no automated OAuth-consent path, so it was left as a manual
belt-and-suspenders check — now **done and confirmed**: on 2026-07-09 a real
interactive sign-in was run against the live enforcing CSP at
`https://arecipe.app/signin.html` with the browser console open; sign-in
completed (forwarded to Cookbook, signed-in) and the console showed **zero**
`Refused to … Content Security Policy` violations. Combined with `auth-live`
passing under CSP hermetically, the interactive path is now verified too.
Deliberately out of scope and named as future items (unchanged): global "sign out
everywhere", dependency-audit automation, SW cache-poisoning hardening, and the
deferred JS frame-buster (clickjacking is undefendable via `<meta>` on Pages).

**Discoveries:** (1) A `<meta>` CSP does not govern inline scripts that *precede*
it (D2) — this drove injecting the meta immediately after `<meta charset>` rather
than the literal "first child" the plan specified; charset stays first, the
policy still precedes every inline script. (2) The OQ1 `https:` `connect-src`
breadth is not just defensible but *necessary*: the hermetic read path contacted
four distinct dynamic PDS hosts a fixed allowlist would have blocked. (3) Three
`@live` tests fail with or without CSP — a no-CSP baseline failed the identical
three, proving they are pre-existing flakiness (real-PDS write consistency,
rate-limits, single-use refresh-token state), not CSP regressions; without the
baseline this would have looked like a CSP break. (4) **Out of scope but real:**
custom fonts 404 in production — `assets/fonts/fonts.css` references
`url(./assets/fonts/X.woff2)` while itself served from `/assets/fonts/`, so the
browser resolves a doubled path and 404s (system-font fallback). CSP-independent;
flagged for separate triage (no `TODO.md` exists in this repo — recorded here and
in the Outcome Summary).
