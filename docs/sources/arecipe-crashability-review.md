# Crashability Review of arecipe Spec

author: Chase Pettet (with Claude)

version: 0.3 (reviewing spec v0.3)

date: 2026-07-07

purpose: track what was flagged in the original review, what got fixed across spec v0.2 and v0.3, and what remains open

---

## 0. Preamble

This document was created alongside the arecipe spec v0.1 to identify weaknesses honestly. Spec v0.2 incorporates most of what this review surfaced. This version of the review updates the status of each finding and preserves the reasoning trail for future revisions.

Each item is tagged with status:

- `RESOLVED` — spec v0.2 addresses the issue

- `PARTIAL` — spec v0.2 makes progress but design work remains

- `OPEN` — deferred, not addressed in v0.2

- `INHERENT` — cannot be fully fixed by design; acknowledged as bounded risk

---

## 1. Assumptions That May Not Hold

### 1a. OAuth session lifetimes will remain generous — RESOLVED

v0.2 assumes the two-week case as the primary code path. The two-year Bluesky-specific lifetime is a UX bonus, not a load-bearing assumption.

### 1b. Jetstream will remain available — RESOLVED

v0.2 explicitly treats Jetstream as an optimization, not a dependency, and specifies a poll-based fallback.

### 1c. `exchange.recipe.*` lexicon will remain maintained — PARTIAL

v0.2 adds lexicon-mirroring in the application account's own PDS. Long-term risk (single-maintainer governance) remains. Mitigation is to lobby for `lexicon.community` stewardship. Not resolved but hedged.

### 1d. WebAuthn PRF browser support is broad enough — RESOLVED

v0.2 makes PRF opt-in rather than default. Users on browsers without PRF get the default flow (unencrypted plus OS device lock) with no interruption.

### 1e. Users are also on Bluesky — RESOLVED

v0.2 introduces `fyi.recipe.friend` as an app-scoped follow lexicon. Users not on Bluesky have a first-class social graph path.

### 1f. Non-extractable CryptoKey as "protection" — RESOLVED

v0.2 Layer 4 correctly bounds the claim: non-extractability protects against exfiltration, not against runtime abuse by same-origin adversaries. Real defense against runtime XSS is preventing XSS.

### 1g. Signed release verification circumvention — RESOLVED

v0.2 Layer 3 is honest about the bound: existing users are protected against silent updates, new installs during a compromise window have TOFU exposure. The multi-authority model (DNS + source + offline key) closes most of the gap by making single-authority attacks unable to distribute a valid bundle.

---

## 2. Technical Obstacles Understated

### 2a. OAuth redirects in installed PWAs — RESOLVED

v0.2 Layer 1 addresses this with explicit design guidance: popup flows where supported, full-page redirect fallback, `postMessage` or `BroadcastChannel` for return-leg coordination.

### 2b. `@atproto/oauth-client-browser` maturity — OPEN

Cannot be resolved by design; requires testing at prototype time. Flagged as a prototype-phase task.

### 2c. WebAuthn PRF UX friction — RESOLVED

v0.2 makes PRF opt-in after successful login, not required at onboarding. Friction is contained to users who explicitly choose the stronger security path.

### 2d. Cross-tab session coordination — RESOLVED

v0.2 Layer 5 specifies `navigator.locks` for leader election and `BroadcastChannel` for token distribution across tabs.

### 2e. DPoP proof generation performance — INHERENT

Real cost, probably fine for target scale, flagged. No design change needed at v0.2.

### 2f. IndexedDB eviction — RESOLVED

v0.2 Layer 4 addresses this with `navigator.storage.persist()` request plus draft-sync-to-PDS as the survival path for user work.

### 2g. Service worker update semantics — PARTIAL

v0.2 doesn't specify a service worker library, but the update verification flow (Layer 3) is now detailed enough that a Workbox-based implementation could follow it directly. Recommend using Workbox at implementation time.

### 2h. Content-addressable rendering across edits — RESOLVED

v0.2 Layer 2 specifies `strongRef` (AT-URI + CID) for all cross-record references, with rendering behavior: primary key is the AT-URI, CID mismatch surfaces a "referenced older version" indicator.

---

## 3. Claims to Walk Back — RESOLVED across the board

v0.2 bounds all four overclaims from v0.1:

- "No operator" → "minimum-authority operator"

- "Uninshittifiable" → "structurally resistant to Doctorow's specific pattern"

- "Data survives" → "data survives conditional on user PDSes remaining accessible"

- "Client-derived moderation" → "client-derived from graph-weighted, potentially-adversarial inputs, with legibility and reversibility as safety mechanisms"

Novelty section (Section 14) explicitly names where each claim does not reach.

---

## 4. Underspecified Areas

### 4a. Comments architecture — RESOLVED

v0.2 switches to `fyi.recipe.comment` app-scoped lexicon. Decouples recipe-app social behavior from Bluesky rendering.

### 4b. PDS migration — RESOLVED

v0.2 Layer 1 specifies detection via `invalid_token` responses, DID document re-resolution, and fresh OAuth flow against the new authorization server.

### 4c. Recipe versioning — RESOLVED

`strongRef` with AT-URI as primary key, CID as version pin. Covered in Layer 2.

### 4d. Search — RESOLVED

In-browser index using MiniSearch or FlexSearch. Built at cold-start hydration. Sub-100ms query latency at target scale. Explicit scale-limit acknowledgment in Section 14.

### 4e. Blob handling — RESOLVED

Upload flow (client thumbnail generation, blob upload to PDS, CID reference in record), fetch flow, cache management (~100MB thumbnail cap, on-demand full-size fetch), placeholder for missing blobs. Covered in Layer 2.

### 4f. Multi-device sync — RESOLVED

Each device subscribes to its own DID via Jetstream, sees writes from other devices echoed. Push notifications deferred to a v2 with explicit acknowledgment of infrastructure cost.

### 4g. PRF authenticator loss — RESOLVED

Fresh OAuth flow, new passkey registration, drafts survive via PDS-sync. Suggested UX to register multiple passkeys at setup.

### 4h. Rate limits — RESOLVED

Exponential backoff, per-endpoint concurrency limits, adaptive polling, explicit UI for rate-limited state. Layer 6.

---

## 5. Scale Limits — RESOLVED (acknowledged)

v0.2 Section 14 explicitly bounds the "novel adaptive moderation" claim to target scale (12-25 person groups). Cold-start knee at ~500 members, immune system computation cost, and Sybil resistance are all named as scale limits with the hosted-indexer path called out as a v2 option that would break the "no server" story.

---

## 6. Existential Risks

### 6a. atproto ecosystem shifts — PARTIAL

v0.2 design depends on atproto the protocol, not Bluesky the company. Jetstream fallback is specified. OAuth is treated at spec minimums. Remaining risk: if the protocol itself changes significantly (unlikely but possible), design assumptions may shift.

### 6b. Lexicon disappearance — PARTIAL

Lexicon mirroring in the application account's PDS addresses immediate resolution. Long-term governance risk (single-maintainer `recipe.exchange`) remains. Recommend lobbying for `lexicon.community` stewardship.

### 6c. WebAuthn PRF adoption stalling — RESOLVED

v0.2 doesn't oversell the PRF path. Default flow works without it.

### 6d. Legal exposure — OPEN

Not resolvable by design. v0.2 flags it explicitly as requiring legal review before any public launch beyond a private group of known people.

### 6e. Adversarial usage — INHERENT (at target scale, non-issue)

v0.2 acknowledges the immune system doesn't scale to web adversaries. For target scale, the risk is negligible. For any deployment beyond that, additional design work required.

---

## 7. Multi-Authority Defense (v0.2 origin, v0.3 refinement)

The three-authority model (DNS, source hosting, offline signing key) plus the auxiliary incident-communication channel is v0.2's substantive addition. It converts the "signed release" primitive from a single-point defense into a compose-of-independent-defenses model.

The specific property established: **no single compromise cascades to silent user targeting.** Each authority can be compromised in isolation without producing a successful attack; recovery paths exist through the remaining authorities. Verifiability preserved through independent channels including the incident runbook.

This addresses the v0.1 review's flag on "load-bearing" single-authority verification more thoroughly than any single fix could have. It also gives the pitch a defensible strong claim that survives scrutiny.

Real-world dependency: the developer must actually maintain credential independence across the authorities. If DNS registrar, GitHub, and offline key all sit behind the same password manager with the same recovery email, the three-authority model collapses to one authority. Independence hardening (Layer 3) spells out what independence looks like in practice.

### v0.3 refinement: source hosting internally redundant

Spec v0.3 refines Authority 2 (source hosting) from single-provider to internally redundant. The change:

- Multiple independent providers each hold an identical signed bundle. DNS load-balances across them with health-check failover.

- Providers selected for genuine corporate independence (different ownership, different jurisdictions where practical). Candidate pool includes GitHub Pages, Cloudflare Pages, Bunny.net static, and Tangled sites (pending custom-domain support).

- Source code mirrored across GitHub and Tangled as independent git remotes. Code availability and serve availability decoupled: anyone can rebuild the signed bundle from either code mirror even if all serving origins are unreachable.

- Deplatforming by a single hosting provider is now explicitly listed as a defended threat.

The refinement does not add a new authority. It hardens Authority 2 internally so that provider-level failure or hostile deplatforming (a real thing that happens to real projects) does not silence the service. Trust anchor remains the offline signing key; any origin serving a mis-signed bundle fails verification and updates are refused.

**Verified source**: Tangled hosting documentation at `docs.tangled.org/hosting-websites-on-tangled`. Confirmed that custom domains are not yet supported, which caps the immediate redundancy story: Tangled currently functions as code mirror and fallback origin at `arecipe.tngl.sh`, not yet as a direct DNS-load-balancing target for `arecipe.app`. Full inclusion pending Tangled custom-domain support.

**Operational cost**: publishing to multiple providers on each release. Small if the release pipeline handles it; not free. Providers must all receive the same signed bundle at approximately the same time so that DNS load balancing does not return stale content across origins.

---

## 8. New Contribution in v0.2: Signed Status Canary

The `fyi.recipe.status` record published under the application account's PDS, refreshed periodically, signed by the offline key. Read by every running service worker on every update check.

Provides an out-of-band cryptographic signal that operates on different infrastructure than the origin serving the bundle. An attacker compromising the origin cannot forge a valid status record. An attacker compromising the application account's PDS credentials cannot produce a valid signature.

The canary transforms the trust model from "trust the origin because it's signed" to "trust the composite state across origin and canary because independent verifications converge."

Small implementation cost. Meaningful defense-in-depth.

---

## 9. Priorities for Implementation

Ordered by cost and value. Numbering aligned to a suggested build order.

### First prototype (goal: prove the read path)

1. Static HTML/JS/CSS PWA served from GitHub Pages.

2. Handle resolution, DID doc resolution, PDS discovery.

3. Read-only fetching of `exchange.recipe.recipe` records from a specified list of DIDs.

4. IndexedDB caching of fetched records.

5. Basic rendering.

**Success criterion**: display recipes from three known DIDs on load, cache them, survive reload.

### Second prototype (goal: prove the write path with real OAuth)

6. Full atproto OAuth flow (PAR + PKCE + DPoP) via `@atproto/oauth-client-browser`.

7. Refresh token storage with default plaintext-plus-device-lock strategy.

8. Cross-tab session coordination via `BroadcastChannel` and `navigator.locks`.

9. Recipe write: `com.atproto.repo.putRecord` for `exchange.recipe.recipe`.

10. Draft persistence: local IndexedDB plus PDS-sync as `fyi.recipe.draft`.

**Success criterion**: authenticated user writes a recipe from device A, sees it on device B via Jetstream.

### Third prototype (goal: social overlay)

11. `fyi.recipe.comment` implementation with `strongRef` versioning.

12. `fyi.recipe.friend` app-scoped follows and interaction tracking.

13. Basic interaction records (`cooked`, `saved`).

14. Search index via MiniSearch.

**Success criterion**: two-user comment thread on a shared recipe, with recipe edits triggering the "older version" indicator.

### Fourth prototype (goal: multi-authority attestation)

15. Offline signing key generation ceremony.

16. Signed release manifest publication.

17. Service worker verification against pinned pubkey.

18. `fyi.recipe.status` canary publication and verification.

19. Multi-channel pubkey publication (DID doc, well-known files, cross-domain mirror).

20. Redundant serving: identical signed bundle deployed to at least two independent hosting providers with DNS health-check failover.

21. Source-code mirror on Tangled and documented fallback origin at `arecipe.tngl.sh` in the incident runbook.

22. Incident runbook drafted and hosted.

**Success criterion**: verified user can install a signed update; a simulated compromise scenario (offline key held, source modified on one origin) results in the running client refusing the malicious update on that origin while continuing normally when DNS routes to a clean origin.

### Fifth prototype (goal: immune system)

21. Mute list primitives (`fyi.recipe.mute.person`, etc.).

22. Explicit user mutes applied client-side.

23. Contact identification and mute-list fetching.

24. Affinity computation.

25. Threshold-based inheritance with legibility UI.

**Success criterion**: a group of 5-10 test users demonstrates coordinated moderation of a spam account without central authority.

### Later work (deferred)

26. PRF opt-in.

27. Third-party starter pack adoption UI.

28. Larger-scale performance testing.

29. Legal review.

30. Public launch prep.

---

## 10. Bottom Line

Spec v0.3 addresses the substantive concerns from v0.1 and hardens the multi-authority story further with source-hosting internal redundancy. The pitch is now defensible where before it was overreaching. The multi-authority architecture is a real contribution, not a slogan. The scale is bounded honestly. Deplatforming by any single hosting provider is now genuinely a defended threat rather than a "hope for the best" case.

Remaining open items are mostly outside the design's reach: legal exposure at scale, ecosystem stability, single-maintainer lexicon risk. Design can hedge but cannot solve these. That's fine and honest.

The composition still works, and now the composition is defensible.

Build the first prototype. See what breaks.
