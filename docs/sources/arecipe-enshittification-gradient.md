# arecipe on the Enshittification Gradient: A Fellow-Travelers Comparison Across Six Structural Conditions

**Author:** Chase Pettet

**Date:** 2026-07-07

**Sources consulted:** 43

**Tools used:** web_search (18 queries), web_fetch, run_blocking_subagent (1), enrich_draft (1)

---

## 1. Framing note

This is a gradient comparison, not a novelty assessment and not a race. arecipe's components are deliberately well-established: a static-bundle PWA, atproto records in user PDSes, WebAuthn, OAuth+DPoP, The Update Framework's multi-authority signing model, warrant canaries, client-side social-graph moderation, and Schema.org Recipe. Each of these is proven, and each has been realized in isolation by a fellow traveler moving toward the same goal: a user-owned system that an operator cannot degrade. The thesis under test is that unenshittifiability is an emergent property of the FULL STACK. It appears only when six structural conditions hold together, closing every lever an operator could pull. Prior art realizing pieces in isolation is a feature of the argument, not a threat to it: it demonstrates the parts are sound.

Accordingly, the ordering of candidates below is descriptive of layer coverage, not a ranking of quality or merit. A project that realizes two conditions superbly (say, Nostr's data authority) is not "worse" than arecipe; it has simply made different scope choices. The claim is narrow and structural: only the conjunction removes both the incentive and the ability to enshittify.

## 2. The gradient matrix (six structural conditions)

Legend: FULL = fully realized, PART = partially realized, NO = not realized, N/A = not applicable. Conditions: (1) Data authority to user; (2) Judgment/moderation authority to user; (3) Centralized function scoped to safety/durability only; (4) Near-zero hosting cost; (5) No data collection (utility not extraction incentive); (6) Safety parity with a centralized alternative.

| Candidate | 1 Data | 2 Judgment | 3 Central scope | 4 Fiscal | 5 No-collection | 6 Safety parity |
|---|---|---|---|---|---|---|
| **arecipe** | FULL: signed records in user PDS | FULL: client-derived social-graph | PART: durability layer, but operator holds domain+code+key | FULL: backendless static bundle | FULL: no backend to collect | PART: aspirational at 12-25 scale |
| **Nostr / zap.cooking** | FULL: user-held keys, events | FULL: client mute lists, WoT | PART: relays durable but can drop data | FULL: relays cheap, client static | FULL: no central collector | PART: spam/abuse hard |
| **recipe.exchange** | PART: public in PDS, private in operator DB | NO: operator AppView + Bluesky | NO: server backend is a capture surface | NO: operator server + DB + images | NO: operator holds private data | PART: operator moderation available |
| **Bluesky / atproto** | FULL: signed repos, DID portability | PART: composable labelers + default | PART: PLC + relay are soft chokepoints | NO: relay/AppView costly at scale | NO: AppView aggregates | FULL: centralized-grade T&S |
| **Secure Scuttlebutt / Manyverse** | FULL: local append-only log | FULL: follow-graph subjective | FULL: pubs/rooms are optional relays | FULL: peer-to-peer, no server | FULL: no data monetization | PART: Sybil/discovery weak |
| **Solid** | FULL: Pods, app/data separation | N/A: no shared social layer | PART: Pod host can be operator | PART: Pod hosting has cost | FULL: consent-scoped access | N/A: no social scale |
| **IndieWeb** | FULL: own domain, own content | PART: per-site, no shared judgment | PART: DNS + host are levers | PART: static hosting cheap not zero | FULL: no aggregator | NO: no shared moderation |
| **Local-first (Ink & Switch)** | FULL: primary copy on device | N/A: single-app, not social | FULL: sync server is optional | FULL: local, sync optional | FULL: data stays local | N/A: not a shared graph |
| **Small Web (Balkan)** | FULL: single-tenant, you own server | N/A: no shared social graph | PART: server is single-owner | PART: single-tenant hosting cost | FULL: no surveillance | N/A: no social scale |
| **Mealie / Tandoor** | PART: self-hosted but DB-locked | FULL: you run it, you decide | NO: the app IS the server | NO: you run a server | FULL: no vendor collection | N/A: household scale |
| **Cooklang** | FULL: plain-text files you own | N/A: not social | FULL: no server at all | FULL: files, no hosting | FULL: no collection | N/A: not social |
| **TUF / Sigstore / SXG / canaries** | N/A: durability layer only | N/A | FULL: this IS "durability without capture" | N/A | N/A | FULL: proven safety primitives |

## 3. The capture-lever closure table (Framework B)

Levers: (i) data lock-in / no credible exit; (ii) rent extraction once locked in; (iii) unilateral moderation/deplatforming; (iv) surveillance/data aggregation; (v) algorithmic feed manipulation; (vi) forced-move / unilateral update; (vii) hosting-cost pressure; (viii) shareholder/investor claw-back. OPEN = available to a hostile operator; CLOSED = removed by design; PARTIAL = reduced but not eliminated.

| Candidate | i lock-in | ii rent | iii mod | iv surveil | v algo | vi update | vii cost | viii investor |
|---|---|---|---|---|---|---|---|---|
| **arecipe** | CLOSED | CLOSED | CLOSED | CLOSED | CLOSED | PARTIAL | CLOSED | CLOSED |
| **Nostr / zap.cooking** | CLOSED | CLOSED | CLOSED | CLOSED | CLOSED | PARTIAL | CLOSED | CLOSED |
| **recipe.exchange** | PARTIAL | OPEN | OPEN | OPEN | OPEN | OPEN | OPEN | OPEN |
| **Bluesky / atproto** | PARTIAL | PARTIAL | PARTIAL | OPEN | PARTIAL | OPEN | OPEN | OPEN |
| **SSB / Manyverse** | CLOSED | CLOSED | CLOSED | CLOSED | CLOSED | PARTIAL | CLOSED | CLOSED |
| **Solid** | CLOSED | PARTIAL | N/A | PARTIAL | N/A | PARTIAL | PARTIAL | PARTIAL |
| **IndieWeb** | CLOSED | CLOSED | PARTIAL | CLOSED | CLOSED | PARTIAL | PARTIAL | CLOSED |
| **Local-first** | CLOSED | CLOSED | N/A | CLOSED | N/A | PARTIAL | CLOSED | PARTIAL |
| **Small Web** | CLOSED | CLOSED | N/A | CLOSED | N/A | PARTIAL | PARTIAL | CLOSED |
| **Mealie / Tandoor** | PARTIAL | CLOSED | CLOSED | CLOSED | CLOSED | PARTIAL | OPEN | CLOSED |
| **Cooklang** | CLOSED | CLOSED | N/A | CLOSED | N/A | CLOSED | CLOSED | CLOSED |

The arecipe row is the claim under test. It marks seven of eight levers CLOSED and one (vi, forced update) PARTIAL. The forced-update lever is where arecipe's three-independent-authority signed update model plus atproto-record status canary does its work, and it is analyzed honestly in Section 6.

## 4. Doctorow-remedy mapping (Framework A)

Doctorow's mechanism: platforms decay by shifting value from users, to business customers, to shareholders, clawing back surplus once all sides are locked in. In his Defcon 31 talk ("An Audacious Plan to Halt the Internet's Enshittification," delivered August 12, 2023), he describes the three-stage decay ("first, it is good to its users, then, it abuses its users to make things better for its business customers; finally, it abuses those business customers to claw back all the value for itself") and names the enabling conditions and the remedies: the end-to-end principle, interoperability and adversarial interoperability, credible exit / low switching costs, competition, worker power, and regulation/privacy law. In "The Internet Con" and the IEEE Spectrum interview, he frames the master remedy as reducing switching costs via mandated interoperability plus a "Right to Exit."

The critical mapping is this: Doctorow locates most of his remedies in LAW, COMPETITION, and LABOR because he is prescribing how to reverse enshittification of incumbent platforms that already hold market power. arecipe substitutes STRUCTURE for law. Where Doctorow would use regulation to force interoperability and a right to exit, arecipe makes exit structurally free (data already in the user's PDS) and makes the operator functionally incapable of lock-in. The six conditions map onto Doctorow's remedies:

- Condition 1 (data authority) and 2 (judgment authority) together implement Doctorow's end-to-end principle and credible exit structurally rather than by mandate.

- Condition 3 (narrow central scope) implements "no chokepoint to abuse," the structural analog of competition and interoperability.

- Conditions 4 and 5 (near-zero cost, no collection) remove the shareholder-claw-back and surveillance incentives that Doctorow says regulation must otherwise restrain.

- Doctorow's worker-power remedy has no structural analog in arecipe; a single-maintainer utility has no workforce to empower. This is a genuine gap where the structural approach simply does not engage one of his levers.

Masnick's "Protocols, Not Platforms" (Knight First Amendment Institute, August 21, 2019) is the closest primary-source articulation of the incentive-through-design thesis. Masnick argues a protocol system would "push the power and decision making out to the ends of the network, rather than keeping it centralized among a small group of very powerful companies," letting "end users determine their own tolerances for different types of speech," with competition disciplining behavior because "the lowered switching costs of moving from one implementation to another would create less lock-in." arecipe is a maximalist implementation of Masnick's argument, moving nearly all judgment to the client.

## 5. Per-candidate gradient placement

**recipe.exchange (closest in-domain fellow traveler, realizes fewest full-stack layers).** Confirmed by primary sources (its own docs and updates, verified via targeted subagent research): public recipes are written as atproto records to the user's PDS using custom lexicons (exchange.recipe.recipe, .collection, .profile, .defs, canonically published under did:plc:4cx7ts7lqgjtsfquo53qo3sz), and it is Schema.org Recipe compatible (its technical guide offers "hybrid approaches using our Schema.org compatibility" and links to schema.org/Recipe). But its own visibility-settings documentation (last updated Jan 5, 2025) states private recipes "are stored securely on recipe.exchange" and "remain completely separate from the AT Protocol network." It runs an operator server-side backend (functionality confirms website scraping, OCR photo import, and bidirectional Bluesky like/comment sync; the founders are Josh Huckabee and Stephen Hunter). The specific backend framework is UNVERIFIED (page markup carries Rails-style `authenticity_token` CSRF tags, but no developer statement confirms it), and the private-store database technology and image-storage location are likewise UNVERIFIED. It targets global public scale ("Share Your Kitchen with the World"; public is the default for original recipes). Realized: public data authority (condition 1, partial) and Schema.org compat. Left open: private data lives with the operator, moderation is operator/AppView-mediated, and there is a full server carrying cost, collection, and update levers. It is the in-domain proof that you can put public recipes in PDSes, and simultaneously the proof that a partial assembly reopens most levers.

**nostr.cooking / zap.cooking (strongest cross-substrate fellow traveler).** Nostr users hold their own keys; events are user-authored and portable across relays; moderation is client-side via mute lists and web-of-trust. zap.cooking's own "why" page states "Your recipes belong to you. Your relationships move with you," and frames itself explicitly against extraction ("Most food content today lives inside platforms designed to extract attention"). On the six conditions it scores nearly identically to arecipe: data authority FULL, judgment FULL, relays are narrow durability infrastructure, cost near zero, no central collection. Its weak points are the same as arecipe's: safety parity (spam, unsolicited content, Sybil) is genuinely hard. André Staltz, in Manyverse's May 2023 update (manyver.se/blog/2023-05-05), writes of the decentralized-social space that "they are having to hire content reviewers, do a lot of centralized moderation, and both Nostr and Bluesky are easily flooded by a wall of unsolicited nudes. This is an inherent property of social media, be it centralized or decentralized." nostr.cooking realizes essentially the same sections as arecipe; the differences are substrate (Nostr relays vs atproto PDS) and the update-security layer, which arecipe formalizes and Nostr clients generally do not.

**Bluesky / atproto.** atproto's design goals explicitly include "credible exit," and Bluesky's own engineers frame the company as a "future adversary." Bryan Newbold, in "Reply on Bluesky and Decentralization" (whtwnd.com, December 13, 2024), writes that "we mean it seriously when we say 'the company is a future adversary'... The bar we are shooting for is to convince people that atproto is legitimate and useful even if Bluesky and the team adopt the worst of intentions," while conceding "Technically, Bluesky PBC is still operating the PLC directory (we are actively exploring how to change this)." Data lives in self-authenticating signed repos with DID-based portability. But Christine Lemmer-Webber, in "How decentralized is Bluesky really?" (dustycloud.org, November 22, 2024), notes that did:plc and the DNS handle system leave the company with control: "Even if a user wishes to switch away from Bluesky's infrastructure, Bluesky probably has effective permanent control over that user's identity destiny, removing the reassurance that one need not trust Bluesky as a corporation in the long term." At scale almost everyone uses Bluesky's PDS, relay, and AppView, and the relay carries real cost (Newbold has noted the main relay requires on the order of 16 TB of fast NVMe and grows with network content). Moderation is composable (labelers) but a default provider dominates. Bluesky Social PBC is a venture-funded public-benefit corporation whose usage has fluctuated (per company figures cited on Wikipedia, roughly 1.5 million daily active users as of September 2025, down from about 2.5 million in March 2025). Bluesky realizes strong data authority and a genuine speech/reach separation; it leaves open surveillance (AppView), cost pressure, and investor claw-back. It is the large-scale proof that user-owned data and centralized-grade safety can coexist (condition 6 FULL), which is exactly the section arecipe cannot yet prove at small scale.

**Solid.** Berners-Lee's Pods separate apps from data and grant time-bound, revocable, consent-scoped access; the composition (data authority, app/data separation, shared vocabularies via W3C standards) is specified even where adoption stalled. It is the manifesto-level proof that condition 1 and consent-scoped access are designable. It has no shared social-graph layer, so conditions 2 and 6 are N/A, and a Pod host can still be an operator (condition 3 partial).

**IndieWeb.** Own-domain identity, Micropub and IndieAuth (OAuth over your domain, using DNS as a replacement for client registration), Microformats as shared schema, and POSSE (Publish on Own Site, Syndicate Elsewhere) give a genuine credible exit. It realizes data authority and no-aggregation strongly. It has no shared moderation model (condition 6 NO) and DNS plus host remain levers (condition 3 partial). It is the proof that credible exit and shared schema work in practice.

**Secure Scuttlebutt / Manyverse.** SSB is the purest realization of conditions 1-5 simultaneously: local append-only logs, follow-graph subjective moderation (each user's view is shaped by chosen follows and blocks with no canonical global state), no server (pubs/rooms are optional), no monetization, offline-first. Manyverse even caps private messages at a small group. It is the closest existing thing to arecipe's full ethos minus the update-security formalization. Its unresolved weakness is exactly condition 6 and usability at scale: the ACM ICN 2019 paper ("Secure Scuttlebutt: An Identity-Centric Protocol for Subjective and Decentralized Applications") formalizes its subjective model, but discovery, onboarding, and Sybil resistance remain hard, and its own community has partly migrated to Nostr.

**Small Web (Aral Balkan / Small Technology Foundation).** "On the Big Web we trust servers and distrust clients; on the Small Web, we distrust servers and trust clients" (ar.al, August 7, 2020) is the exact operator-restraint principle arecipe adopts; Balkan adds "we treat servers as dumb delivery mechanisms. The client... is the only trusted environment." Single-tenant, one owner per server. It realizes conditions 1, 3, and 5 by philosophy. It has no shared social graph, so 2 and 6 are N/A, and single-tenant hosting is a real (if small) per-person cost.

**Local-first (Ink & Switch, Kleppmann et al. 2019).** The seven ideals (fast/"no spinners," multi-device, offline/"network is optional," collaboration, longevity/"the long now," privacy-and-security by default, "you retain ultimate ownership and control") are the canonical statement of data authority (condition 1). The essay itself notes that of surveyed technologies "none are able to satisfy them all," and proposes CRDTs (and Automerge) as the foundation. Crucially it is single-app, not a shared social graph, so conditions 2 and 6 are N/A. It is the proof that condition 1 is achievable and rigorous.

**Mealie / Tandoor (self-hosted recipe apps).** These are the in-domain reminder that self-hosted is not the same as user-authoritative in the credible-exit sense. Cooklang's own comparison (cooklang.org/blog) notes "all three store your recipes in their database, not in files you own directly," and "backups require running the application's export process, not just copying files." Delivery is server-rendered, not a static bundle. You control the instance (condition 2 FULL) but data is DB-locked (condition 1 PART), and you run a server (conditions 3, 4 fail). Cooklang itself, by contrast, is plain-text .cook files you own outright with "no database, no server, no Docker container to maintain," which scores like Local-first: condition 1 FULL, no server at all.

**TUF / Sigstore / SXG / warrant canaries (durability-without-capture layer, as a group).** These are not competitors; they are the proven components of arecipe's condition-3 layer. The Update Framework provides multi-signature, threshold, offline-key update security specifically designed so that compromising one key does not compromise the system ("Trust should not be granted equally to all parties"; root keys "MUST be kept very secure and thus should be kept offline"). TUF was first developed at the University of Washington in 2009 by Justin Samuel and Justin Cappos, became the CNCF's first security and first academic-led project to graduate (December 2019), and is adopted by Docker Content Trust (via Notary), PyPI (PEP 458), the IEEE/ISTO-standardized Uptane automotive system (IEEE-ISTO 6100.1.0.0, 2019), and organizations including Google, Amazon, Microsoft, VMware, and Cloudflare. Warrant canaries are the proven pattern for signaling coercion: rsync.net has published a cryptographically signed weekly canary since 2006, and SpiderOak implemented a three-PGP-signer scheduled canary in August 2014 (so that forcing an update would require coercing all three remotely located signers). Signed HTTP Exchanges decouple content authority from delivery, but are single-authority and were rejected as "harmful" by Mozilla and Safari because one origin acting for another "without a client ever contacting the authoritative server" breaks the web security model. Their collective existence is the evidence that "centralized functions limited to safety/durability without capture" is realizable from known parts. SXG's single-authority rejection is exactly why arecipe uses a three-authority model instead.

## 6. The emergent-property analysis

The claim is that the conjunction of the six conditions yields enshittification-resistance no proper subset yields, because each condition closes a specific capture lever and removing any one reopens it. Mapping condition to lever:

- Condition 1 (data authority) closes lever i (lock-in / no credible exit). Remove it (recipe.exchange's private store) and the operator holds the data hostage: exit is no longer free. This is Doctorow's central switching-cost mechanism.

- Condition 2 (judgment authority) closes lever iii (unilateral moderation/deplatforming). Remove it and the operator can deplatform or shadow-rank. Bluesky's default labeler is the soft version of this lever left ajar.

- Condition 3 (narrow central scope) closes levers ii and v (rent extraction, algorithmic manipulation). If the only central functions are safety and durability, there is no chokepoint through which to meter access or manipulate discovery. Remove it (any operator AppView or feed service) and both reopen.

- Condition 4 (near-zero cost) closes lever vii (cost pressure) and structurally weakens lever viii (investor claw-back). If marginal cost per user is near zero, there is no fiscal imperative forcing monetization. This is the fiscal-alignment argument.

- Condition 5 (no collection) closes lever iv (surveillance monetization) and reinforces the utility-not-extraction incentive. No data pipe means no ad or resale business to build.

- Condition 6 (safety parity) is not a lever-closer; it is the viability constraint. Without it the system is unenshittifiable but unusable, and users route around it to a centralized alternative, which is enshittification by the back door.

**Are the six independent and jointly sufficient?** They are not fully orthogonal. Conditions 4 and 5 are causally entangled: a backendless system with no server has neither cost pressure nor a collection apparatus, so one architectural choice (no backend) satisfies both. Conditions 1 and 2 are also linked in practice: if data is in the user's store, client-derived judgment follows naturally. So the true "independent" design decisions are roughly three: (a) put data and judgment at the client/user store; (b) eliminate the backend; (c) restrict any residual central function to signed durability. The six conditions are better understood as six TESTS across three design commitments than as six independent axes. This is an honest weakening of the "six independent conditions" framing, and it should be stated plainly: the emergent property comes from three coupled commitments, expressed as six checks.

**Jointly sufficient?** For the incentive half of the claim, yes: with no data, no cost, and no chokepoint, the operator has neither motive nor mechanism to extract. For the ability half, nearly: the residual is lever vi.

**The weakest link.** There are two honest weak points, and I judge condition 6 (safety parity) to be the aspirational condition and lever vi (forced update) to be the residual structural gap.

First, safety parity. The literature is consistent that decentralized/client-side moderation trades away safety at scale. The Carnegie Endowment report "New Paradigms in Trust and Safety: Navigating Defederation on Decentralized Social Media Platforms" (Samantha Lai, Yoel Roth, Kate Klonick, Mallory Knodel, Evan Prodromou, and Aaron Rodericks, April 2025, based on a June 2024 workshop of eighteen experts) finds that defederation "introduces trade-offs between speech and safety." Multiple arXiv surveys and Staltz's own remarks converge: subjective/social-graph moderation handles small trusted graphs well but struggles with Sybil attacks, discovery-time abuse, and the burden on individuals. arecipe's mitigation is scope: it targets private groups of 12-25 degrading to ~500, precisely the regime where social-graph moderation is strongest and centralized-grade T&S is least necessary. Within that scope the parity claim is defensible; asserted at global scale it would fail. So condition 6 is not false, but it is scope-contingent, and that contingency should be foregrounded, not buried.

Second, "near-zero hosting cost" and who bears it. The static bundle is genuinely near-zero to serve. But the user's PDS must be hosted somewhere, and someone pays for it. If most users park on a Bluesky-operated PDS, the cost and a soft identity-control lever (the did:plc / DNS critique above) sit with that PDS operator, not with arecipe. arecipe's fiscal claim holds for the arecipe operator but exports the residual cost and a residual identity lever to the PDS layer. This is real and should be conceded.

Third, and most important, lever vi: the operator controls the domain, the code, and a signing key. In principle the operator could push a hostile update or let the domain lapse. This is the one lever a pure client-side design cannot close by data ownership alone, because the client bundle itself is delivered by the operator. arecipe's structural mitigation is the three-independent-authority signed update model (DNS + source hosting + offline key) plus an atproto-record status canary. My judgment: this does not fully CLOSE the lever; it converts a unilateral capability into a multi-party one and makes silent capture detectable. To push a hostile update the operator must compromise or coerce three independent authorities simultaneously (the TUF insight: no single key compromise suffices). To let the system rot silently, the operator must defeat the canary, and a missing canary is an observable signal (the rsync.net / SpiderOak pattern). So lever vi moves from OPEN to PARTIAL, not CLOSED. That is the correct, honest mark. It is a strong mitigation grounded in proven primitives (TUF's threshold model, the canary pattern), but it reduces rather than eliminates the residual operator capability, and it depends on users (or their clients) actually verifying signatures and noticing a dead canary.

## 7. Quantification attempt (honest, bounded)

A defensible descriptive summary is the count of capture levers CLOSED (counting PARTIAL as 0.5, N/A excluded from the denominator, out of 8). This is layer-coverage, not merit.

- arecipe: 7 CLOSED + 1 PARTIAL = 7.5 / 8.

- SSB / Manyverse: 7 CLOSED + 1 PARTIAL = 7.5 / 8.

- Nostr / zap.cooking: 7 CLOSED + 1 PARTIAL = 7.5 / 8.

- Cooklang: 8 / 8 (but N/A on the social conditions; it is not a shared social system).

- IndieWeb: about 6 / 8.

- Local-first, Small Web: high on applicable levers, several N/A.

- Bluesky / atproto: about 3.5 / 8 on the eight levers, but uniquely FULL on condition 6.

- Mealie / Tandoor: about 5 / 8, but fails the two server-dependent levers hardest.

- recipe.exchange: about 1.5 / 8.

The honest reading: arecipe is NOT uniquely high on this count. SSB and Nostr score identically. What distinguishes arecipe is not a higher number but the SPECIFIC COMBINATION: it pairs SSB/Nostr-grade lever closure with (a) the atproto substrate that Bluesky is proving can reach centralized-grade safety, (b) a formalized TUF-style update-security layer that the P2P social apps generally lack, and (c) Schema.org interop for portability. The number does not capture this; the qualitative gradient does. I therefore decline to present a single "arecipe wins" figure. The count shows arecipe sits in the top cluster alongside SSB and Nostr, and the differentiator is the assembly, not the score.

## 8. What arecipe's assembly demonstrates

The sections were each realized before: SSB proved client-side subjective moderation with no server; Local-first proved rigorous data authority; Solid proved app/data separation; IndieWeb proved credible exit and shared schema; Nostr and zap.cooking proved user-owned social recipe data on an open substrate; Bluesky proved user-owned data can reach centralized-grade safety at scale; TUF, Sigstore, and warrant canaries proved durability-without-capture from known parts; recipe.exchange proved recipes specifically can live as portable records in user PDSes.

What the full-stack assembly demonstrates that no section did alone is that incentive alignment can be achieved STRUCTURALLY, from proven parts, such that the operator neither wants to nor is able to enshittify. "Neither wants to" comes from conditions 3, 4, and 5: with no data, no cost, and no chokepoint, the extraction business does not exist. "Nor is able to" comes from conditions 1 and 2 plus the update-security layer: the user already holds the data and the judgment, and the one residual lever (forced update) is reduced to a detectable, multi-party action rather than a unilateral one.

Bounded to what the evidence supports: the claim holds for the incentive half unconditionally, and for the ability half with one honest residual (lever vi is PARTIAL, not CLOSED) and two scope caveats (safety parity is defensible only at the 12-25 to ~500 scale it targets, and near-zero cost holds for the arecipe operator while exporting residual PDS-hosting cost and a soft identity lever to the PDS layer). Within those bounds, the emergent-property thesis is sound: unenshittifiability is a property of the conjunction, the parts are all proven, and the fellow travelers realized it in sections precisely because no single section is the whole.

## 9. Recommendations

Staged, concrete next steps, with the benchmarks that would change them:

1. **Foreground the scope contract, not a decentralization slogan.** State in the design docs that safety parity (condition 6) is claimed only within the 12-25 to ~500 regime. Benchmark to revisit: if a deployment exceeds ~500 members or observes Sybil/abuse the social graph cannot absorb, re-open condition 6 and treat it as unmet until a labeler-style safety layer is added.

2. **Close the residual identity/cost export at the PDS layer.** The strongest remaining lever is not in arecipe but beneath it: whoever runs the PDS holds cost and (per Lemmer-Webber) a soft identity lever via did:plc/DNS. Recommend documenting a self-hosted-PDS path and tracking Bluesky's stated work to move the PLC directory out of its sole control. Threshold: treat the fiscal (4) and lock-in (i) claims as fully met only when a user can trivially run or migrate their own PDS.

3. **Harden lever vi from PARTIAL toward CLOSED.** The three-authority update model plus canary is sound but depends on client-side verification actually happening. Recommend that signature verification and canary-freshness checks be enforced by the client bundle itself and fail closed, and that the three authorities be demonstrably independent (different legal entities/jurisdictions where possible, per the TUF threshold rationale and the SpiderOak multi-signer precedent). Threshold: only when a hostile update provably requires compromising all three, and a stale canary halts updates automatically, should lever vi be marked CLOSED.

4. **Position against fellow travelers honestly.** Do not claim a higher lever-closure count than SSB or Nostr, because it is not higher. Claim the assembly: atproto substrate + formalized update security + Schema.org portability. Benchmark: if Nostr clients adopt a comparable TUF-style update layer, the differentiator narrows to substrate choice, and the messaging should adjust accordingly.

5. **Retire the "six independent conditions" framing in favor of "three commitments, six tests."** This is more defensible and pre-empts the obvious critique that 4/5 and 1/2 overlap.

## 10. Caveats

- Several claims about recipe.exchange rest on its own documentation and page markup surfaced via subagent research; its backend framework, private-store database, and image-storage location are explicitly UNVERIFIED. The confirmed facts are that public recipes go to the user's PDS as atproto records, private recipes are stored on recipe.exchange "separate from the AT Protocol network," it is Schema.org compatible, and it targets public scale.

- Bluesky usage figures and relay-storage figures are drawn from company-cited numbers and an engineer's statement, not independent audit; treat them as order-of-magnitude.

- The lever-closure marks for arecipe describe the design as specified, not an audited deployment. "CLOSED by design" is a claim about architecture; it is only as good as the implementation, which this analysis did not review.

- Warrant canaries have contested legal force (Schneier and the SpiderOak 2018 episode both illustrate that a canary can be ambiguous or defeated); the canary reduces the probability of silent capture, it does not make coercion impossible.

- The quantification in Section 7 is a descriptive coverage summary, not a merit score, and PARTIAL-as-0.5 is an arbitrary convention chosen for legibility; do not over-read the decimals.

- This analysis treats "the operator" as a single arecipe maintainer. A different governance structure (multiple maintainers, a foundation) would change the investor-pressure (viii) and worker-power analysis and should be reassessed if arecipe's stewardship changes.

## 11. References

- recipe.exchange — https://recipe.exchange/ ; https://recipe.exchange/docs/technical ; https://recipe.exchange/docs/visibility-settings (accessed 2026-07-07)

- zap.cooking / nostr.cooking — https://zap.cooking/why ; https://github.com/github-tijlxyz/nostr.cooking (accessed 2026-07-07)

- Bryan Newbold, "Reply on Bluesky and Decentralization" — https://whtwnd.com/bnewbold.net/entries/Reply%20on%20Bluesky%20and%20Decentralization (accessed 2026-07-07)

- Christine Lemmer-Webber, "How decentralized is Bluesky really?" — https://dustycloud.org/blog/how-decentralized-is-bluesky/ (accessed 2026-07-07)

- AT Protocol — https://atproto.com/ ; https://atproto.com/guides/self-hosting (accessed 2026-07-07)

- Cory Doctorow, Defcon 31 talk "An Audacious Plan to Halt the Internet's Enshittification" — https://pluralistic.net/2023/08/16/rat-choice/ (accessed 2026-07-07); "The Internet Con" / IEEE Spectrum interview — https://spectrum.ieee.org/internet-con (accessed 2026-07-07); enshittification definition — https://en.wikipedia.org/wiki/Enshittification (accessed 2026-07-07)

- Mike Masnick, "Protocols, Not Platforms: A Technological Approach to Free Speech" — https://knightcolumbia.org/content/protocols-not-platforms-a-technological-approach-to-free-speech (accessed 2026-07-07)

- Aral Balkan, "What is the Small Web?" — https://ar.al/2020/08/07/what-is-the-small-web/ ; https://small-tech.org/ (accessed 2026-07-07)

- Local-first software (Kleppmann et al., 2019) — https://www.inkandswitch.com/essay/local-first/ ; https://martin.kleppmann.com/papers/local-first.pdf (accessed 2026-07-07)

- Solid — https://solidproject.org/ (accessed 2026-07-07)

- IndieWeb — https://indieweb.org/ ; https://micropub.spec.indieweb.org/ (accessed 2026-07-07)

- Secure Scuttlebutt / Manyverse — https://www.manyverse.social/ ; https://manyver.se/blog/2023-05-05 ; ACM ICN 2019 "Secure Scuttlebutt" — https://dl.acm.org/doi/10.1145/3357150.3357396 (accessed 2026-07-07)

- Cooklang recipe-manager comparison — https://cooklang.org/blog/42-tandoor-vs-mealie-vs-kitchenowl/ ; Mealie — https://mealie.io/ ; Tandoor — https://tandoor.dev/ (accessed 2026-07-07)

- The Update Framework — https://theupdateframework.io/ ; https://theupdateframework.io/docs/security/ ; https://en.wikipedia.org/wiki/The_Update_Framework (accessed 2026-07-07)

- Sigstore — https://www.sigstore.dev/ (accessed 2026-07-07)

- Signed HTTP Exchanges — https://web.dev/articles/signed-exchanges ; https://caniuse.com/sxg ; mozilla/standards-positions #29 (accessed 2026-07-07)

- Warrant canary — https://en.wikipedia.org/wiki/Warrant_canary ; SpiderOak multi-signer canary (2014); rsync.net canary (2006) (accessed 2026-07-07)

- Carnegie Endowment, "New Paradigms in Trust and Safety: Navigating Defederation on Decentralized Social Media Platforms" (Lai, Roth, Klonick, Knodel, Prodromou, Rodericks, April 2025) — https://carnegieendowment.org/research/2025/04/new-paradigms-in-trust-and-safety-navigating-defederation-on-decentralized-social-media-platforms (accessed 2026-07-07)
