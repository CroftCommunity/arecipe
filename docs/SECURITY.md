# Security posture

arecipe is a backendless single-page PWA on the AT Protocol: no application
server, static hosting (GitHub Pages behind `arecipe.app`), and OAuth
credentials minted and held entirely in the browser. That trust model is novel
enough that its reasoning deserves to be written down once — for contributors,
for auditors, and for us. This document is that narrative. It is
auth/storage-oriented because that is where the hard, non-obvious decisions
live: how a no-backend browser app safely holds credentials.

For architecture and UI decisions see [DESIGN.md](DESIGN.md); the canonical
*decision record* for credential storage is the "OAuth secret storage" entry in
[plans/2026-07-07-1-plan-build-execution.md](../plans/2026-07-07-1-plan-build-execution.md).
This document references that decision rather than duplicating it.

## Threat model and non-goals

**What we defend against:**

- **Credential theft** — an attacker obtaining stored tokens and replaying them
  from another device.
- **Cross-site scripting (XSS)** — injected script running in our origin. This
  is the designated *primary* defense (see below): because the stored refresh
  token is sender-constrained, the realistic path to abusing a session is an
  active same-origin adversary, i.e. live XSS.
- **Transport downgrade** — credentials or data traveling over non-HTTPS.

**Explicit non-goals (irreducible, documented not defended):**

- **A fully compromised device.** If the OS or browser is owned, a
  non-extractable key does not help.
- **An active same-origin adversary using the key in place.** A non-extractable
  DPoP key cannot be exfiltrated, but code running in our origin can ask the
  browser to *sign with it*. This is the residual threat the XSS budget exists
  to shrink; it cannot be reduced to zero in a browser app.

## The backendless model

There is no application server. `scripts/build.mjs` emits a static bundle to
`dist/`; CI deploys it to GitHub Pages (the `deploy` job in
`.github/workflows/ci.yml`, via `actions/deploy-pages`). The live host sets no
security response headers — confirmed 2026-07-09: `curl -I https://arecipe.app/`
returns `server: GitHub.com` with no `Content-Security-Policy` and no
`X-Frame-Options`. Every security control we ship is therefore delivered
*in the document* (a `<meta http-equiv>` CSP, `integrity=` attributes), not via
response headers. This is a deliberate trust story — the absence of a server is
the point (no server to breach, no database to leak) — but it constrains the
toolbox, and the constraints are called out in "Residual risks" below.

## Authentication

Sign-in is atproto OAuth, run entirely client-side through
`@atproto/oauth-client-browser`'s `BrowserOAuthClient`
(`src/auth/oauth-client.ts:8`, `:72`).

- **DPoP sender-constraint.** Access and refresh tokens are DPoP-bound —
  `client-metadata.json` declares `"dpop_bound_access_tokens": true`. A token
  presented without a matching proof-of-possession signature is rejected by the
  authorization server and PDS. This is what makes an exfiltrated token inert
  off-device.
- **Non-extractable DPoP key.** The proof-of-possession keypair is a
  non-extractable WebCrypto key generated and persisted by the library; the
  application never handles the private key (the library owns key generation and
  its own IndexedDB store — see "Session storage"). This is the premise of the
  locked "OAuth secret storage" decision: an attacker can copy a token but
  cannot copy the key that makes it usable.
- **Loopback vs hosted client.** `authModeFor` (`src/auth/oauth-client.ts:37`)
  picks the OAuth client by origin: loopback hosts (`127.0.0.1`, `localhost`,
  `[::1]` — `isLoopbackHostname`, `:43`) run atproto's loopback client
  (`buildLoopbackMetadata`, `:49`); the production origin `https://arecipe.app`
  (`PRODUCTION_ORIGIN`, `:22`) runs the hosted client-metadata document; every
  other origin gets `none` (read-only). The loopback redirect URI must be an IP
  literal, never `localhost` (`src/auth/oauth-client.ts:6`).
- **Single redirect URI.** The hosted client advertises exactly one:
  `https://arecipe.app/signin.html` (`client-metadata.json` `redirect_uris`).
  Sign-in is a dedicated, full-page redirect to that document — see the sign-in
  model in
  [plans/2026-07-08-2-plan-dedicated-signin-page.md](../plans/2026-07-08-2-plan-dedicated-signin-page.md).
- **Handle resolution during the OAuth flow** uses `https://bsky.social`
  (`handleResolver` default, `src/auth/oauth-client.ts:73`); post-auth identity
  resolution uses `https://public.api.bsky.app` and `https://plc.directory`
  (`src/identity/resolve.ts:45`, `:46`, `src/identity/did.ts:12`). All three are
  fixed origins in the CSP `connect-src` (below).

## Session storage

Session persistence is entirely library-owned and deliberately so.

- `BrowserOAuthClient` hard-codes its own IndexedDB session store; its options
  type `Omit`s `sessionStore` and `stateStore`
  (`node_modules/@atproto/oauth-client-browser/dist/browser-oauth-client.d.ts:8`),
  so the application cannot — and does not — substitute its own. `session-provider.ts`
  adds no storage of its own (`src/auth/session-provider.ts:1`–`8`).
- **No at-rest token encryption, by design.** Encrypting the token at rest adds
  almost nothing over a non-extractable key (the key, not the token, is the
  thing that must not leave the device) and is not even expressible under
  `BrowserOAuthClient`'s library-owned store. The trade-off is recorded in the
  locked "OAuth secret storage" decision.
- **Cross-tab refresh** is serialized by the library via `navigator.locks`; the
  app only requests a refresh (`src/auth/session-provider.ts:39`, `forceRefresh`
  at `:69`).
- **The session hint is not a credential.** A boolean `localStorage` flag
  `arecipe-session` (`src/auth/session-hint.ts:8`) lets zero-auth pages redirect
  a signed-in visitor (read in `index.html`'s landing script and `src/nav.ts:44`).
  It carries no token material; worst case its forgery sends a visitor to a page
  that then finds no session and falls back.

## XSS prevention — the primary defense

Because the stored refresh token is inert off-device, the realistic residual
threat is an active same-origin adversary. The security budget therefore goes to
preventing XSS. Four controls, each with its current implementation status
(flipped as the hardening phases land):

- **Strict Content-Security-Policy, meta-delivered.** `default-src 'none'` with
  explicit allowlists per directive; `script-src 'self'` plus the exact
  `sha256` hashes of our three inline scripts (theme pre-paint, the index
  landing block, the `friends.html` redirect stub); no `'unsafe-inline'` and no
  `'unsafe-eval'` (the built bundle contains no `eval`/`new Function`/
  `WebAssembly`). Because GitHub Pages cannot set response headers or mint
  per-request nonces, the policy is computed at build time and injected
  immediately after `<meta charset>` in every document, before any inline script
  — a `<meta>` CSP does not govern inline scripts that precede it. **Status:
  IMPLEMENTED (enforcing).** Generated by
  `scripts/build.mjs` and injected into every built document (including
  `friends.html`, copied outside the HTML loop); the meta is placed immediately
  after `<meta charset>` so charset stays first while the policy still precedes
  every inline script. Gated by `tests/e2e/csp.spec.ts`, which loads all 9
  documents under the enforcing policy and asserts zero `securitypolicyviolation`.
- **Subresource Integrity (SRI).** `integrity=` on the entry ES module and both
  stylesheets, computed from the same bytes the build hashes. Scope is bounded:
  code-split `import()` chunks carry no HTML tag, so HTML `integrity` is not
  expressible on them — documented, not silently skipped. **Status:
  IMPLEMENTED.** `scripts/build.mjs` adds `integrity="sha384-…"
  crossorigin="anonymous"` to the entry ES module and both stylesheets
  (`styles.css` and `assets/fonts/fonts.css`) from the served bytes;
  `tests/e2e/csp.spec.ts` asserts the attributes are present and that nothing
  fails its integrity check at load.
- **Zero third-party scripts.** Every script is first-party, same-origin, and
  in the small auditable bundle. **Status: ENFORCED BY TEST.**
  `tests/e2e/csp.spec.ts` guards every built document: no `<script src>` may be
  cross-origin, and each `script-src` must contain only `'self'` + sha256 inline
  hashes — no host allowlist, scheme, wildcard, or `'unsafe-*'` can creep in.
- **Small, auditable bundle.** A minimal dependency surface keeps the code an
  auditor can actually read. Ongoing discipline, not a single control.

The `connect-src` policy is `'self' https://bsky.social
https://public.api.bsky.app https://plc.directory https:` and `img-src` is
`'self' data: blob: https:`. The `https:` breadth is deliberate: atproto
accounts live on arbitrary PDS hosts (`src/identity/resolve.ts:39` builds
`https://<pds-host>/…` from the DID document), so a fixed allowlist would break
any self-hosted account and contradict arecipe's "works with any atproto
account" promise. This breadth is an accepted trade-off, not an oversight — the
DPoP non-extractable key is what neutralizes token exfil; `connect-src`'s
residual job here is blocking non-HTTPS/downgrade channels. See "Residual
risks."

## Blast radius

- **Per-session sign-out.** `signOut` revokes the currently restored session
  (`src/auth/session-provider.ts:62`–`68`) and clears the session hint. There is
  **no global "sign out everywhere"** today — token lifetimes and refresh are
  library-owned. A cross-device revocation UI is a named future item, out of
  scope for the current hardening work.
- **Diagnostic surface.** `forceRefresh` (`src/auth/session-provider.ts:69`) is a
  debug-mode console hook, not an ambient capability.

## Residual risks and limitations

- **Active same-origin adversary.** The irreducible non-goal above. The XSS
  controls shrink the attack surface; they cannot eliminate in-place key use.
- **Clickjacking is undefendable on Pages.** `frame-ancestors` is ignored when a
  CSP is delivered via `<meta>`, and GitHub Pages sets no `X-Frame-Options`
  (confirmed 2026-07-09). A JS frame-buster is deferred; the only sensitive flow,
  sign-in, is a full-page OAuth redirect rather than a framed action, which
  bounds the exposure.
- **SRI does not cover code-split chunks.** HTML `integrity` is not expressible
  on dynamically `import()`-ed chunks (notably the deferred `@atproto/api`
  chunk). Those chunks are same-origin and first-party; the residual gap is that
  a same-origin tamper of a chunk would not be caught by SRI.
- **`connect-src` allows all HTTPS.** The `https:` fallback (above) is the
  accepted cost of supporting arbitrary PDS. It weakens `connect-src` as an
  exfiltration control; the non-extractable key is the control that actually
  makes exfiltrated tokens useless.
- **No CSP violation reporting.** With no backend, there is no `report-uri` /
  `report-to` endpoint to receive violation reports, so production CSP
  violations are not centrally observed. The compensating control is a pre-ship
  hermetic "no violations" pass: every document is loaded in a headless browser
  under the enforced policy and asserted to fire zero
  `securitypolicyviolation` events before a build can deploy.

## Calendar publish (opt-in, advanced) — a deliberate carve-out

One optional, **off-by-default**, device-local feature relaxes the invariant this
document otherwise holds: publishing a subscribable meal-plan `.ics` to the
user's own GitHub Pages requires a GitHub fine-grained **PAT held in the
browser** (`src/publish/*`, account page). A PAT is a **bearer** credential — it
is *not* DPoP-bound, so unlike the OAuth token it is usable off-device if
exfiltrated. That breaks "an exfiltrated credential is inert." We ship it anyway,
consciously and bounded, because it is the only backendless way to deliver a
calendar a client can *subscribe* to. The reasoning and the rejected
alternatives are recorded in
[D3-BROWSER-PAT-SECURITY.md](D3-BROWSER-PAT-SECURITY.md); the three probes behind
it are [PAGES-ICS-PROBE.md](PAGES-ICS-PROBE.md),
[GITHUB-CORS-PROBE.md](GITHUB-CORS-PROBE.md), and that memo.

How the blast radius is bounded:

- **Off by default; explicit opt-in per device.** Nothing exists until the user
  enables it and pastes a token.
- **Default storage keeps the token out of page memory.** The token is handed to
  the service worker, which holds it in memory and injects `Authorization` on
  `api.github.com` requests (`src/sw.ts`); the page never reads it back, so an
  XSS can *drive* a write but cannot *exfiltrate* the token — the same
  use-in-place-but-can't-take-it property DPoP gives the OAuth key. The opt-in
  "remember on this device" toggle trades this for localStorage persistence
  (XSS-readable), stated plainly in the UI.
- **Device-local, never synced.** The token and config live only on the client
  that set them; they are **never written to the PDS** (a bearer secret must not
  travel through a readable repo record).
- **Guided minimal scope.** The setup guide (`calendar-setup.html`) steers the
  user to a *dedicated, Actions-disabled repo*, a fine-grained PAT scoped to that
  one repo with **Contents: write + Metadata: read**, a **short expiry**, and an
  in-product revoke link. We cannot enforce this — it is documented, not
  guaranteed.
- **CSP unchanged.** `connect-src` already admits `api.github.com` via its
  `https:` fallback and `worker-src 'self'` admits the token-holding worker — no
  new origin or relaxation was introduced for this feature.

Residual: an active same-origin adversary (live XSS) can still trigger writes
through the SW-held token, and the "remember on this device" path additionally
exposes the token to exfiltration. This is the accepted, bounded cost of an
optional feature — not a change to the default posture above.

## References

- **Credential-storage decision (canonical):** the "OAuth secret storage" entry
  in [plans/2026-07-07-1-plan-build-execution.md](../plans/2026-07-07-1-plan-build-execution.md).
- **Sign-in model:** [plans/2026-07-08-2-plan-dedicated-signin-page.md](../plans/2026-07-08-2-plan-dedicated-signin-page.md).
- **Architecture and trust surface:** [DESIGN.md](DESIGN.md).
- **CSP/SRI hardening plan:** [plans/2026-07-09-1-plan-security-posture-and-csp-hardening.md](../plans/2026-07-09-1-plan-security-posture-and-csp-hardening.md).
