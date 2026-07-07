# arecipe — Philosophy and Goals

Status: living document. Synthesized from the v0.3 spec and the fellow-travelers
gradient analysis in `docs/sources/`. When this document and the spec disagree,
the spec (`docs/sources/arecipe-spec.md`) is the technical source of truth; this
document carries the *why*.

The `a` is for Amanda.

---

## 1. What arecipe is

arecipe is a recipe-sharing social app delivered as a static single-page PWA on
the AT Protocol. Recipes are written as `exchange.recipe.recipe` records into the
user's own PDS, where they are simultaneously visible on recipe.exchange with no
coordination between the two projects. There is no backend, no user database, and
no aggregated data asset.

The recipe domain was chosen deliberately: non-controversial, high value per
record, and it already has a working lexicon (`exchange.recipe.*`) with a live
public consumer (recipe.exchange). That makes the interoperability story concrete
rather than theoretical.

Target scale is small-group: 12–25 person groups (a family, a supper club, a
neighborhood). It degrades gracefully to roughly 500 members; beyond that it would
need a hosted indexer, which would break the no-backend claim.

---

## 2. The thesis: incentive alignment realized through design

The design goal is structural resistance to the enshittification pattern Cory
Doctorow named: the progressive extraction of value from users by an operator
answering to shareholders. Doctorow's decay requires four structural conditions:

- An operator with unilateral control over platform behavior

- Data lock-in that makes leaving expensive

- Aggregated user data held as a proprietary asset

- Network effects that make individual defection irrational

Remove any one and the pattern stalls. Remove all four and it cannot begin.
arecipe removes all four:

- **No operator with unilateral behavioral control.** An operator exists (someone
  owns the domain, maintains the code, signs releases) but their levers are
  minimum-authority. Users can unadopt any decision the operator publishes.

- **No lock-in.** Records live in users' own PDSes. Any conforming consumer renders
  them.

- **No aggregated data asset.** The application holds nothing. No database, no user
  table, no analytics warehouse.

- **Network effects operate at the protocol layer.** Users can adopt a competing
  app and take their social graph, content, and moderation preferences with them.

The point is incentive alignment, not restraint. An operator with no data, no
marginal cost per user, and no chokepoint has neither the motive nor the mechanism
to extract. The good behavior is structural, not promised.

---

## 3. Not a novelty claim — an emergent property of the full stack

The components are deliberately boring and proven: a static-bundle PWA, atproto
records in user PDSes, WebAuthn, OAuth+DPoP, The Update Framework's multi-authority
signing model, warrant canaries, client-side social-graph moderation, Schema.org
Recipe. Each has been realized in isolation by a fellow traveler moving toward the
same goal.

Unenshittifiability is the emergent property that appears only when the full layer
stack is assembled. Prior art realizing pieces in isolation is a feature of the
argument, not a threat to it: it demonstrates the parts are sound. Existing
approaches (recipe.exchange, Nostr/zap.cooking, SSB, Solid, IndieWeb, local-first,
Small Web, Cooklang, TUF/Sigstore/canaries) are fellow travelers who realized the
goal in sections, not competitors on a leaderboard. It is a mutual goal, differently
realized.

The honest structural claim: only the *conjunction* removes both the incentive and
the ability to enshittify.

---

## 4. Three commitments, six tests

The design is often described as six structural conditions. Honestly, those six are
better understood as **six tests across three coupled design commitments** — the
conditions are not fully independent axes.

The three commitments:

```
  (a) Put data AND judgment at the client / user store
  (b) Eliminate the backend
  (c) Restrict any residual central function to signed durability
```

The six tests each commitment must pass, and the capture lever each closes:

| # | Condition                                      | Closes lever                          |
|---|------------------------------------------------|---------------------------------------|
| 1 | Data authority to the user                     | lock-in / no credible exit            |
| 2 | Judgment (moderation) authority to the user    | unilateral moderation / deplatforming |
| 3 | Central function scoped to safety/durability   | rent extraction + algo manipulation   |
| 4 | Near-zero hosting cost                          | cost pressure (+ weakens investor claw-back) |
| 5 | No data collection                             | surveillance monetization             |
| 6 | Safety parity with a centralized alternative   | (viability constraint, not a lever)   |

Conditions 4 and 5 both fall out of one decision (no backend). Conditions 1 and 2
are linked in practice (data at the user store makes client-derived judgment
natural). Condition 6 is not a lever-closer; it is the viability constraint —
without it the system is unenshittifiable but unusable, and users route around it
to a centralized alternative, which is enshittification by the back door.

---

## 5. Bounded honestly — what this does NOT claim

"Uninshittifiable" is bounded to Doctorow's specific pattern. The design does not
resist, and the spec says so plainly:

- **Author burnout.** No mechanism makes an abandoned project un-abandoned.

- **Third-party value extraction.** Public records can be indexed and monetized by
  anyone. This is a feature (credible exit) and a limit on what "un-extractable"
  means.

- **Legal shutdown.** A court order against the domain owner ends the frontend.
  Data survives; the pitch does not.

- **Simultaneous compromise of 2+ of the three primary authorities** (DNS, source
  hosting, offline signing key). State-level territory, out of scope.

The honest weak points inside the model itself, largest first:

- **Single-operator governance — the biggest partial.** The structural levers are
  minimized, but there is still one person who owns the domain, holds the offline key,
  and decides what ships. That is not enshittification (there is no data, no rent, no
  chokepoint to extract through), but it is concentrated authority, and it is the most
  significant honest residual. Closing it is not a code change; it is a **governance
  escalation** — moving domain, signing, and release authority toward multi-party
  stewardship (co-signers, a threshold key ceremony, a namespace under community
  stewardship). That escalation is entirely fair to ask for and is explicitly
  hoped-for, not resisted. The design keeps the door open (split keys, dual-signed
  rotation, lexicon mirroring toward `lexicon.community`) precisely so the operator
  can become plural over time.

- **Safety parity (condition 6) is scope-contingent.** Client-side social-graph
  moderation is strongest at 12–25 and gets Sybil-fragile at scale. The parity
  claim is defensible within the target scope and would fail if asserted globally.

- **The forced-update lever (vi) is PARTIAL, not CLOSED — but arecipe's PARTIAL is
  at least as strong as its peers', arguably stronger.** This is where the
  three-independent-authority signed-update model plus the atproto status canary do
  their work. It is reduced, not eliminated. The additional reduction comes from the
  LTS stance: a malicious or coerced update needs an update channel that fires often
  enough to hide in, and arecipe deliberately removes the *reason* to update
  frequently. With no value to extract there is no engagement to chase, so there is no
  treadmill of engagement-driven releases. After 1.0 the intended cadence is near-zero
  (security fixes only) under a 2-year freeze on the record format and verify
  procedures. A near-silent update channel is a small, legible attack surface: any
  update is an event, not background noise, which scopes the exposure window down
  sharply. The stance is deliberately countercultural — reach a good interface, then
  let it be useful — and it is genuinely hard to hold against the industry default of
  constant iteration. And PARTIAL is the correct *ceiling* here, not a gap waiting to
  be closed: there is no such thing as complete update safety. Updates introduce
  change, change surface introduces risk, by nature. A design that claimed CLOSED on
  the update lever would be lying. The honest work is to shrink the surface and make
  every update legible, not to pretend the risk can reach zero.

- **The near-zero-cost claim exports a residual.** The static bundle is near-zero
  to serve, but the user's PDS is hosted somewhere and someone pays. If users park
  on a Bluesky-operated PDS, a residual cost and a soft identity-control lever sit
  with that PDS operator, not with arecipe.

---

## 6. Corrections to the gradient analysis

The fellow-travelers gradient in `docs/sources/arecipe-enshittification-gradient.md`
is broadly right but scored two things without full sight of the spec. Recorded here
so the comparison is not taken as final.

- **It missed the specced label / moderation element.** The gradient scored
  condition 2 (judgment authority) as FULL on the strength of client-side muting
  alone. The spec goes further: an explicit, optional **labeler** (the
  `#recipe-labeler` split key in the app-account DID document), **canonical baseline
  mute lists and starter packs** that are opt-in and always overridable, and the
  **Layer 8 immune system** that inherits mutes from the graph weighted by affinity
  with a legible inheritance path. So the moderation story is not just "client-derived
  muting" — it is a full, adoptable, reversible shared-moderation layer that keeps all
  authority with the user. Condition 2 is realized through a real mechanism, not left
  implicit.

- **The distribution/update PARTIAL is stronger than a like-for-like PARTIAL.** See
  §5, lever vi: the LTS stance (no engagement to chase → no reason to ship often →
  near-zero cadence after 1.0) shrinks the update channel to a small, legible surface.
  arecipe's PARTIAL at least matches its peers' PARTIAL and is arguably better for
  this reason, even though it stays honestly PARTIAL rather than CLOSED.

## 7. Goals, in priority order

1. A working private-group cookbook that a non-technical family can actually use.

2. Credible exit that is a live demonstration, not a promise: recipes render on
   recipe.exchange today, from the same records.

3. Minimum-authority operator: the operator cannot silently alter user data, cannot
   silently change adopted moderation, cannot lock users in, and cannot silently
   target users through any single compromise.

4. A durability commitment a reader can check: the domain is prepaid for 10 years
   (a settled fact, not a promise) and, at 1.0, the record format and verify
   procedures are frozen for a 2-year LTS window. Security fixes continue.

5. Positioning that survives a security professional's skepticism: bounded claims
   over confident overclaims, everywhere.

See `STACK.md` for how these are built, `BUILD-PLAN.md` for the order of work, and
`OUTREACH.md` for how the project is socialized honestly.
