# arecipe — The Stack

Status: living document. The authoritative technical detail lives in the v0.3 spec
(`docs/sources/arecipe-spec.md`, layers 1–10). This document is the at-a-glance
stack map plus the open stack decisions that are not yet pinned.

The governing constraint: **there is no backend.** Every choice below either runs
in the browser or is a static artifact. Anything that would require a server to
stand up and babysit is out of scope by design (see `PHILOSOPHY.md` §4, commitment b).

---

## 1. Shape at a glance

```
        ┌─────────────────────────────────────────────┐
        │  Static SPA / PWA  (no backend)               │
        │  service worker · IndexedDB · WebCrypto       │
        └───────────────┬───────────────────────────────┘
                        │  atproto OAuth + DPoP
                        ▼
        ┌───────────────────────────────┐   live tail   ┌──────────────┐
        │  User's own PDS                │◀──────────────│  Jetstream   │
        │  exchange.recipe.* records     │   (optional)  │  (fallback:  │
        │  fyi.recipe.* app records      │               │   polling)   │
        └───────────────┬───────────────┘               └──────────────┘
                        │  same records, no coordination
                        ▼
        ┌───────────────────────────────┐
        │  recipe.exchange (public       │   ← credible exit, live proof
        │  AppView, not ours)            │
        └───────────────────────────────┘

  Delivery / trust:  multi-origin static hosting  +  offline Ed25519 signing
                     +  signed status canary  +  Tangled code mirror
```

---

## 2. Client (the whole application)

- **Static single-page PWA.** Served as a static bundle from CDN storage. Service
  worker caches the bundle and controls updates (standard PWA machinery).

- **Persistence: IndexedDB.** Cached records (tagged with CID + a `verified`
  boolean), the user's drafts, and local moderation state. `navigator.storage.persist()`
  requested on first use; drafts also sync to the PDS as `fyi.recipe.draft` records so
  storage eviction cannot destroy work.

- **Keys: WebCrypto.** DPoP private key generated `extractable: false`, stored as a
  `CryptoKey` reference; material never leaves the browser process. The real defense
  against runtime XSS is preventing XSS: strict CSP, subresource integrity, no
  third-party script loads.

- **Search: in-browser index** (MiniSearch or FlexSearch), built at cold-start over
  cached recipes. Sub-100ms at 25-member scale. Known knee at ~500 members.

- **Frontend framework / build tooling: OPEN.** Not pinned by the spec. See §7.

---

## 3. Identity and auth (atproto)

- Handle → DID via DNS TXT or `.well-known/atproto-did`; DID doc → PDS endpoint +
  keys.

- **OAuth**, not app-passwords: PAR + PKCE, DPoP-bound token pair. Every request
  carries the access token plus a DPoP proof signed by the client key.

- Assume the **two-week session ceiling** (the atproto spec's untrusted-public-client
  case); silent re-auth on refresh failure is the primary path. The two-year Bluesky
  case is a UX bonus, not an assumption.

- **PDS migration handling:** detect `invalid_token`/`unauthorized`, re-resolve the
  DID doc, re-run OAuth against the new authorization server, preserve local drafts
  and cache.

- **Auth persistence:** default is plaintext refresh token in IndexedDB + OS device
  lock (works everywhere, no setup). **WebAuthn PRF** encryption is an opt-in
  enhancement, gated on `PublicKeyCredential.getClientCapabilities()`. Cross-tab
  refresh coordinated via `BroadcastChannel` + `navigator.locks` (single-use refresh
  tokens make a leader election necessary).

---

## 4. Data model and lexicons

- **Reused (not ours): `exchange.recipe.*`** — `recipe`, `collection`, `defs`,
  `profile`. Maintained by Josh Huckabee at `recipe.exchange/lexicons/`. A recipe
  written here is bit-identical to one on recipe.exchange. We do **not** claim
  ownership of this namespace.

- **Ours: `fyi.recipe.*`** — app-scoped records for what the shared lexicon does not
  cover: `mute.*` (person/recipe/tag/list/listitem/listblock), `friend` (app-scoped
  follow for users not on Bluesky), `comment`, `interaction.cooked`/`.saved`,
  `starterpack`/`starterpackitem`, `draft`, `group.manifest`, `status` (the signed
  canary), `release`.

- **Cross-record references** use `com.atproto.repo.strongRef` (AT-URI + CID).
  Primary key is the AT-URI so comments/interactions survive recipe edits; a CID
  mismatch surfaces a "references an older version" indicator.

- **Resilience:** the app account's PDS mirrors the `exchange.recipe.*` schemas as
  `com.atproto.lexicon.schema` records, hedging against recipe.exchange domain loss.
  Long-term goal: move the namespace under `lexicon.community` stewardship.

---

## 5. Data flow

- **Cold start:** direct `listRecords`/`getRecord` against each member's PDS, in
  parallel (1–3s for 25 members over broadband). Signed and authoritative.

- **Live tail:** Jetstream WebSocket (filter by DID + collection NSID). Treated as an
  **optimization, not a dependency** — it is a Bluesky operational service, not part
  of the protocol. Fallback is polling each member's PDS (default 60s) against a
  cursor.

- **Verification policy:** Jetstream events are unsigned, rendered immediately for
  UX, then promoted to `verified` by a background refetch from the author's PDS. At
  target scale verification can be deferred; beyond a private group it must be
  enforced.

- **Rate limits:** exponential backoff on 429, max 6 parallel fetches per PDS host,
  adaptive polling, explicit UI (never silent failure).

- **No push notifications.** Push would require a backend service, contradicting the
  no-backend story. Deferred with acknowledged cost.

---

## 6. Delivery and multi-authority trust

The trust anchor is the **offline signing key**, not any origin.

- **Three independent authorities:** (1) DNS/registrar, (2) source hosting, (3)
  offline Ed25519 signing key. Plus an auxiliary signaling authority (incident
  channels). No single compromise silently targets users; each has an independent
  detection + recovery path.

- **Source hosting is internally redundant.** At least two independent origins in
  production, each serving an identical signed bundle, DNS load-balanced with
  health-check failover. Candidate origins: GitHub Pages, Cloudflare Pages,
  Bunny.net static, Tangled sites (pending custom-domain support).

- **Tangled** is currently an atproto-native **code mirror** and a documented
  **fallback origin** (`arecipe.tngl.sh`). Code availability and serve availability
  are decoupled: anyone can rebuild the signed bundle from either git mirror even if
  all serving origins are down. Tangled joins the DNS pool directly once it ships
  custom domains.

- **Release manifest** (monotonic version, per-file SHA-256, attestation pubkey
  fingerprint, canary URI, signature) published at the origin and as a
  `fyi.recipe.release` PDS record.

- **Signed status canary** (`fyi.recipe.status`): expected version + pubkey,
  operational flag (`normal` / `incident-pause-updates` / `emergency-see-mirror`),
  optional mirror URL, signature. Service worker fetches it on every update check and
  refuses non-`normal` updates.

- **Key ceremony:** air-gapped generation, one-way transfer of signed artifacts,
  dual-signed transition manifests for rotation, hard-fork with out-of-band pubkey
  distribution for compromise recovery.

---

## 7. Open stack decisions (not yet pinned)

These are real decisions, tracked here so they are not silently defaulted:

- **Frontend framework — DECIDED (2026-07-07): none.** Plain HTML5 + CSS + JS
  (vanilla, optionally TS for type safety). No reactive framework. Rationale: the app
  is small enough to be excellent without one, and a framework-free bundle is the
  smallest and most auditable signed artifact (which is a trust-surface benefit, not
  just a size one). Web platform primitives (Web Components / templates, `fetch`,
  IndexedDB, WebCrypto, service worker) carry the app. Revisit only if complexity
  genuinely outgrows vanilla — a deliberate change, not a drift.

- **OAuth client registration — DECIDED (2026-07-07):** loopback/localhost client for
  TDD and local iteration (atproto's loopback client exception); a real hosted
  client-metadata document is a separate, explicit plan item for milestone/staging
  testing (see the build plan's milestone map). Do not block local TDD on the hosted
  client.

- **Build + signing toolchain.** With a vanilla stack the build can be minimal
  (esbuild/plain bundling, or none). Still open: how the deterministic, reproducible
  signed bundle is produced and how per-file SHA-256 + Ed25519 signing wire into CI
  while keeping the key offline.

- **Server-rendered public recipe views.** For shareable links with Schema.org
  JSON-LD and for LLM/crawler discoverability, `/recipes/{did}/{rkey}` likely needs
  pre-rendering (GPTBot/ClaudeBot/PerplexityBot do not execute JS — see `OUTREACH.md`).
  How to pre-render without introducing a live backend is an open question (build-time
  prerender vs. edge function) and touches the no-backend claim; resolve deliberately.

- **A custom AppView / Rust service is explicitly NOT in scope.** A local AppView
  server (Rust or otherwise) was briefly considered and set aside: arecipe is
  backendless and reuses **recipe.exchange as the public AppView**. Revisit only if the
  no-backend commitment is ever deliberately relaxed (e.g. a hosted indexer past ~500
  members), which would be a philosophy-level change, not a stack tweak.

- **Language note for any auxiliary tooling.** If offline/CLI tooling is ever built
  (signing helper, canary publisher, migration probe), Rust is the natural fit per
  the maintainer's conventions. That tooling is not part of the shipped app.
