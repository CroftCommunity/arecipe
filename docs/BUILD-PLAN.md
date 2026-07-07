# arecipe — Build Plan

Status: living document. Sequencing derived from the spec's dependency-respecting
layer order (`docs/sources/arecipe-spec.md` §3) and its stated next milestone (§17).
This is the *order of work* and its rationale; the spec is the *what*.

> **Executable version:** this document is the narrative rough plan. The
> fine-grained, TDD-first executable plan (phases, wiring tests, milestones,
> Phase 0 discovery findings) lives at
> `plans/2026-07-07-1-plan-build-execution.md`.

Development follows TDD: a failing test before production code, small known-good
increments, working state at every step. The layers are already dependency-ordered,
so the build order tracks the layer order.

---

## Guiding constraints

- Every phase ends in a demoable, working state. No phase depends on a later phase.

- Read before write: prove interop against real `exchange.recipe.*` records before
  writing any.

- The no-backend commitment is load-bearing. Any phase that seems to want a server is
  a signal to stop and re-derive, not to add one.

- Ship the signed-delivery machinery (Phase 3) *before* public launch, never after.

---

## Phase 0 — Read-only interop (the stated first milestone)

Goal: prove the credible-exit story is real by rendering existing recipe.exchange
records, before writing anything.

- Layer 1 (subset): handle → DID → PDS resolution; OAuth+PKCE+PAR+DPoP flow to obtain
  a DPoP-bound token pair. Read scope only.

- Layer 2 (read-only): fetch and render `exchange.recipe.recipe` and
  `exchange.recipe.collection` from a real PDS. No `fyi.recipe.*` writes yet.

- Layer 4 (subset): IndexedDB cache with CID + `verified` tagging; non-extractable
  DPoP key in WebCrypto.

- **Two-device same-user test** (the spec's explicit milestone target): sign in on two
  devices, confirm both render the same records from the same account.

Exit criteria: a recipe authored on recipe.exchange renders in arecipe, verified
against its CID, on two devices. Immune system and PRF opt-in deferred.

---

## Phase 1 — Authoring and write path

Goal: write recipes and app-scoped records that show up on recipe.exchange with no
coordination.

- Recipe create/edit writing `exchange.recipe.recipe` (Schema.org-compatible) to the
  user's PDS; confirm it appears on recipe.exchange.

- Blob (image) handling: client thumbnail via canvas, `uploadBlob` full-size +
  thumbnail, embed both CIDs; `getBlob` fetch with placeholder on failure.

- Recipe versioning via `strongRef` (AT-URI primary, CID mismatch indicator).

- Drafts: two-tier (IndexedDB + `fyi.recipe.draft` sync) so eviction cannot lose work.

- Auth persistence default (plaintext + OS lock) and cross-tab coordination
  (`BroadcastChannel` + `navigator.locks`).

Exit criteria: author a recipe end-to-end on-device, see it on recipe.exchange, edit
it, recover a draft after simulated storage eviction.

---

## Phase 2 — Social graph, comments, and the immune system

Goal: the small-group experience — friends, comments, cooked/saved signals, and
client-derived moderation.

- Layer 7: `fyi.recipe.friend` (app-scoped follow, primary for non-Bluesky users) +
  optional `app.bsky.graph.follow` inheritance; interaction-weighted affinity.

- `fyi.recipe.comment`, `interaction.cooked`, `interaction.saved`.

- Layer 6 data flow: Jetstream live tail with polling fallback; unsigned→verified
  promotion; rate-limit handling.

- Layer 8 immune system: inherited mutes weighted by affinity, applied client-side,
  with legibility (show the inheritance path for any hidden subject). Tuned for
  12–25; bounded claim honored.

- In-browser search (MiniSearch/FlexSearch) over cached recipes.

Exit criteria: a 12–25 person group can share, comment, cook-mark, and moderate
entirely client-side, with legible moderation and working live updates plus polling
fallback.

---

## Phase 3 — Multi-authority delivery and trust (pre-launch gate)

Goal: the signed-delivery machinery must exist before any public exposure.

- Offline Ed25519 key ceremony (air-gapped generation, one-way transfer).

- Release manifest (monotonic version, per-file SHA-256, pubkey fingerprint, canary
  URI, signature) published at origin + as `fyi.recipe.release`.

- Signed status canary `fyi.recipe.status`, service-worker update flow that verifies
  manifest agreement (origin vs PDS), signature against pinned pubkey, canary status,
  monotonic version, and per-file hashes before install.

- Multi-origin static hosting (≥2 independent origins) with DNS health-check
  failover; Tangled code mirror + `arecipe.tngl.sh` fallback origin.

- Application account: `did:web:arecipe.<tld>`, split keys in the DID doc
  (`#atproto` online, `#recipe-attestation` offline), canonical baseline mute list +
  starter pack.

- Layer 10: `.well-known` files, cross-domain pubkey publication, and the public
  **incident runbook** ("How to verify arecipe is uncompromised") with a
  non-technical quick-check.

Exit criteria: an update signed by the offline key installs; a tampered bundle on one
origin is refused; a non-`normal` canary pauses updates; the runbook is live at
multiple origins.

---

## Phase 4 — Launch and durability

Goal: honest public launch and the checkable durability commitment.

- Public pages per `OUTREACH.md` (landing, about, how-it-works, spec, status, verify,
  blog, pre-rendered `/recipes/{did}/{rkey}` with Schema.org JSON-LD).

- 1.0 durability pledge, stated in three layers: structural floor (records survive on
  the PDS regardless of arecipe), 10-year prepaid domain (fact) + high-confidence
  static-hosting commitment, and a 2-year LTS freeze on record format + verify
  procedures (security fixes continue).

- Execute the outreach beachhead (directories, ecosystem cross-links, thoughtful
  launch post) per `OUTREACH.md`.

Exit criteria: launched, verifiable, and honestly positioned — every public claim
matches the spec's bounded language.

---

## Deferred (post-1.0, with rationale)

From the spec's open-questions list — parked deliberately, not forgotten:

- **Non-browser / native clients.** Different key-storage model; PRF has a mobile
  analog with a different API. v2.

- **Sybil resistance at scale.** Not needed at target scale; needs proof-of-personhood
  or reputation for public deployments.

- **Discovery beyond the graph.** Starter-pack adoption is the current answer;
  `app.bsky.feed.generator` feeds are a future option.

- **Cross-app moderation compatibility.** Whose mutes apply when multiple apps share
  `exchange.recipe.*` records.

- **Cold-start beyond ~500 members.** Would need a hosted indexer, which breaks the
  no-backend claim — a philosophy-level decision, not a routine feature.

- **Legal review before any high-visibility public launch.** Near-zero risk for small
  private groups; real risk with visible attention.
