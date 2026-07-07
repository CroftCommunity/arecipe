# Prior-Art / Novelty Assessment: "arecipe"

**Author:** Chase Pettet

**Date:** 2026-07-07

**Sources consulted:** ~48 primary and secondary sources

**Tools used:** web_search (18 queries), web_fetch (primary-source retrieval), 1 research subagent (recipe.exchange deep-dive), 1 enrichment pass

---

## 1. Executive Summary

**Bottom line: arecipe's compositional assembly is PARTIALLY NOVEL, but the novelty is narrow and fragile. The single most dangerous prior-art candidate is recipe.exchange, which already occupies the same domain (recipe sharing), the same substrate (atproto), and the same lexicon namespace (`exchange.recipe.*`) that arecipe claims. arecipe does NOT own or control that namespace; recipe.exchange does. The recipe application of an atproto recipe lexicon is NOT novel and must not be claimed.**

The composition decomposes into two separable questions, and they get different answers.

First, is the recipe/cookbook APPLICATION on atproto novel? No. recipe.exchange authored and controls the exact `exchange.recipe.*` namespace, stores public recipes as signed records in the user's PDS, uses Schema.org Recipe compatibility, and delegates social features to Bluesky. It is led by Josh Huckabee, who per his Prog.AI profile is "a seasoned software engineer and founder with 17 years of experience" who "currently leads recipe.exchange, a decentralized recipe-sharing platform on the AT Protocol, where he architected the system and open-sourced an AT Protocol OAuth gem" (based in Newburgh, NY). A second atproto recipe app, recipes.blue, also exists (recipes made on one are not visible on the other). On Nostr, nostr.cooking (zap.cooking) and the earlier Recipistr did user-owned recipe sharing over a signed-event social substrate. The recipe-sharing-on-user-owned-decentralized-storage idea is thoroughly anticipated.

Second, is the specific COMPOSITIONAL ASSEMBLY novel — the union of (a) a genuinely backendless static-bundle PWA, (b) multi-provider static hosting with DNS load balancing, (c) a three-independent-authority signed-update model (DNS, source hosting, offline key) with a signed status canary, (d) WebAuthn-PRF-encrypted refresh tokens over OAuth+DPoP, and (e) client-derived social-graph moderation weighted by interaction affinity, all targeted at 12-25 person private groups? Here the answer is a qualified yes: no single project found assembles all of these. But every individual axis, and most PAIRS of axes, are established prior art. The novelty lives entirely in the *combination and the operator-restraint posture*, not in any component and not in the domain.

The strongest reason to reject a broad novelty claim: arecipe differs from recipe.exchange primarily by being MORE architecturally austere (no operator backend, no operator database, static hosting) and by targeting small private groups rather than public sharing. Those are real differences on the deployment, infrastructure-cost, and scale axes. But an examiner hostile to the claim would say arecipe is "recipe.exchange with the backend removed and the update-security model of TUF/Sigstore bolted on" — and that framing is defensible. The composition is best described as a *novel integration of well-established parts*, not a novel invention. Treat the update-security assembly (three independent authorities plus an atproto-native signed canary) and the client-derived affinity-weighted moderation as the two axes with the thinnest prior art and therefore the most defensible novelty.

---

## 2. Composition Matrix

Axes: (1) Data ownership (2) Infra cost (3) Update security (4) Persistence (5) Community/moderation (6) Deployment (7) Scale/audience (8) Interop.

| Project (primary source) | 1 Data own | 2 Infra cost | 3 Update sec | 4 Persistence | 5 Moderation | 6 Deployment | 7 Scale | 8 Interop |
|---|---|---|---|---|---|---|---|---|
| **recipe.exchange** (recipe.exchange) | strong (public recs in PDS) | different (Rails backend+DB+CDN) | different (no signed multi-auth update) | partial (public survives; private in operator DB) | different (Bluesky blocks/mutes) | different (server-rendered Rails + PWA) | different (public/global) | strong (exchange.recipe.*, Schema.org) |
| **recipes.blue** (fediversereport ref) | strong | different | different | partial | different | different | different | partial (own lexicon, not interop w/ recipe.exchange) |
| **nostr.cooking / zap.cooking** (github tijlxyz) | strong (Nostr events) | partial (relays) | different | partial | different (Nostr mute) | different (web client) | different (public) | partial (Nostr kind, own) |
| **Frontpage** (frontpage.fyi) | strong (PDS records) | different (backend AppView) | different | partial | partial (community mod) | different (Next.js server) | different (public) | strong (atproto lexicon) |
| **Statusphere** (atproto.com) | strong (PDS records) | different (server+SQLite) | different | partial | not comparable | different (SSR + OAuth) | not comparable (demo) | strong (xyz.statusphere) |
| **Local-first essay / Automerge** (inkandswitch.com) | strong (local primary copy) | strong (P2P/sync relay) | different | strong (durable local files) | not comparable (single-app) | different (native/CRDT) | different (single user/collab) | different (per-app, no shared graph) |
| **Solid** (solidproject.org) | strong (Pods) | different (pod server) | different | partial (pod outlives app) | not comparable | different (WebID apps) | different (individual) | strong (RDF/linked data) |
| **IndieWeb** (indieweb.org) | strong (own domain) | different (self-host CMS) | different | partial (own site) | partial (Webmention control) | different (varies, Micropub/OAuth) | different (individual) | strong (Microformats, shared schema) |
| **Secure Scuttlebutt / Manyverse** (manyverse) | strong (local log) | strong (P2P, no server) | different | strong (append-only log) | partial (follow-graph, subjective) | different (native/offline) | different (small/social) | partial (SSB feeds) |
| **Nostr (protocol)** (nostr NIPs) | strong (signed events, own keys) | partial (relays cheap) | different | partial (relays may drop) | partial (client-side, mute lists) | different (relay+client) | different (public) | strong (shared event kinds) |
| **TUF** (theupdateframework.io) | not comparable | not comparable | strong (threshold, role sep, offline keys) | not comparable | not comparable | not comparable | not comparable | not comparable |
| **Sigstore** (sigstore.dev) | not comparable | not comparable | strong (transparency log, signing) | not comparable | not comparable | not comparable | not comparable | not comparable |
| **Signed HTTP Exchanges (SXG)** (web.dev) | not comparable | partial (any cache serves) | partial (origin-signed, single cert authority) | partial (offline bundle) | not comparable | different (signed web bundle) | not comparable | not comparable |
| **Warrant canary** (Wikipedia/EFF; SpiderOak) | not comparable | not comparable | partial (out-of-band multi-signer signal) | not comparable | not comparable | not comparable | not comparable | not comparable |
| **Small Web / Kitten** (small-tech.org) | strong (single-tenant, own) | partial (one server per person) | different | partial | not comparable | different (single-tenant server) | different (one person) | different (no shared graph) |
| **Mealie / Tandoor** (mealie.io/tandoor.dev) | partial (self-hosted, DB not portable) | different (Docker server) | different | partial (DB export only) | not comparable (single household) | different (server + PWA wrapper) | different (household) | partial (JSON-LD/Schema.org export) |
| **Farcaster** (farcaster) | strong (signed casts, Hubs) | different (Hubs infra) | different | partial | partial (client-side) | different (Hubs+client) | different (public) | strong (shared schema) |

---

## 3. Per-Category Findings

### 4a. atproto ecosystem projects

**recipe.exchange** (https://recipe.exchange/) — THE decisive candidate. Confirmed via primary sources: it is a server-rendered Ruby on Rails app (fresh per-page CSRF tokens on every fetch; developer's Rails-heavy stack) with PWA meta tags layered on, NOT a static client-only bundle. It runs its own backend/AppView with a search index, a trending "firehose" feed, and an image CDN.

Public recipes are published as signed records to the user's own PDS under `exchange.recipe.recipe`; private and attributed recipes are stored only in recipe.exchange's own database ("stored securely on recipe.exchange," "completely separate from the AT Protocol network"). Auth is atproto OAuth (Huckabee open-sourced a Ruby `atproto_auth` gem; atproto OAuth mandates DPoP) plus Bluesky app passwords for programmatic access.

Moderation/social is delegated to Bluesky: as of Jan 18 2025 they retired their own like/comment lexicons and now use Bluesky's post/like lexicons, respecting Bluesky blocks and mutes. The `exchange.recipe.*` namespace is vendor-controlled by Huckabee (listed in awesome-lexicons as a directory entry, NOT governed by lexicon.community's `community.lexicon.*` TSC). As of May 23 2026 the lexicons became atproto-resolvable via a `_lexicon.recipe.exchange` DNS TXT record pointing to DID `did:plc:4cx7ts7lqgjtsfquo53qo3sz`. Schema.org Recipe compatibility is explicit. This is the same domain, same substrate, same namespace arecipe claims. **Verdict: Bucket 2 (compositional near-match, differs on backend/infra/scale axes).**

**recipes.blue** (referenced by fediversereport.com) — a second, independent atproto recipe app using its own lexicon; recipes made on recipe.exchange are not visible on recipes.blue and vice versa. Confirms the recipe-on-atproto space is already multi-project and already suffers the lexicon-fragmentation problem arecipe's shared-namespace approach claims to solve. UNVERIFIED on deployment specifics (could not fetch primary source directly). **Verdict: Bucket 2/3.**

**Frontpage** (https://frontpage.fyi/) — HN-style link aggregator on atproto by Tom Sherman; defines its own lexicon `fyi.unravel.frontpage.*`, stores records in user PDS, runs a Next.js backend AppView, and has grappled publicly with community moderation at scale. Same architecture pattern (custom lexicon + PDS records + AppView) but different domain and a real operator backend. **Verdict: Bucket 4 (same composition family, different domain), with the caveat that it has an operator backend arecipe lacks.**

**Statusphere** (https://atproto.com/guides/statusphere-tutorial) — Bluesky's official reference app. Publishes `xyz.statusphere.status` records to the user's PDS via OAuth, listens to the firehose, renders server-side. It is the canonical template showing PDS-records + OAuth + custom lexicon + firehose. Cloudflare published a "serverless Statusphere" running on Workers/KV/D1 with "zero servers." Establishes the base atproto app pattern as thoroughly prior art. **Verdict: Bucket 4 (composition template, different/no domain).**

**Smoke Signal, Skylights, Bookhive, Leaflet, WhiteWind, Linkat, PinkSea, Pastesphere** (github.com/lexicon-community/awesome-lexicons) — the broader ATmosphere. Each defines a custom lexicon, stores records in the user PDS, and runs an AppView. They collectively establish that "custom lexicon + user-owned PDS records + independent AppView + automatic interop for anyone who adopts the schema" is the standard, well-documented atproto pattern — not novel. The fediversereport analysis explicitly names recipes, reviews, and pastebins as domains where multiple non-interoperable lexicons already coexist. **Verdict: Bucket 4/5.**

**lexicon.community / `community.lexicon.*`** (lexicon.community) — a TSC-governed neutral namespace for shared cross-app lexicons. Directly relevant: arecipe's claim of a "shared cross-application lexicon producing automatic interop" is precisely what lexicon.community was created to enable, and it already exists as infrastructure. If arecipe uses `exchange.recipe.*` it is using recipe.exchange's vendor namespace, not a neutral shared one. **Verdict: Bucket 4 (the shared-schema-for-interop concept is prior art).**

### 4b. Local-first and Ink & Switch

**"Local-first software" essay** (https://www.inkandswitch.com/essay/local-first/, Kleppmann, Wiggins, van Hardenberg, McGranaghan, Onward! 2019) — the foundational statement of user-owned data with seven ideals (fast, multi-device, offline, collaboration, longevity, privacy, user control). Crucially, it is oriented toward "single application per user's data" with CRDT sync, NOT a shared social graph over user-owned data. It proposes the *values* arecipe embodies but not arecipe's composition (no shared cross-app schema, no social-graph moderation, no web-delivery/update-security model). **Verdict: Bucket 5 (shared philosophy, different composition).**

**Automerge / Hypermerge / Muse / Actual Budget / Zed** — CRDT-based local-first apps. Each is single-application data ownership with sync; none provides a shared social graph over user-owned records or the update-security composition. **Verdict: Bucket 5/6.**

### 4c. P2P and decentralized social

**Nostr (protocol + clients Damus, Amethyst, Snort, Coracle)** (nostr NIPs, nostrapps.com) — signed events under user-held keys, relays as interchangeable transport, shared event-kind schemas giving cross-client interop, client-side moderation via mute lists. Nostr's substrate provides several arecipe properties (user-owned signed records, shared schema, credible exit, client-side moderation) through a different substrate than atproto. **Verdict: Bucket 3 (same properties, different substrate).**

**nostr.cooking / zap.cooking** (https://github.com/github-tijlxyz/nostr.cooking) — a recipe-sharing client on Nostr. Explicit marketing: "We shouldn't post a recipe online & have it disappear because the website went away or the account got banned... allowing us to truly own our recipe data and social graph in one delicious app." This is arecipe's exact thesis, in the exact domain, on a different substrate, shipped earlier. **Verdict: Bucket 3 (recipe app + user-owned data + social graph; different substrate) — very strong anticipation of the DOMAIN + PHILOSOPHY.**

**Recipistr** (stacker.news reference) — an earlier Nostr recipe experiment that defined a custom event kind (8000) and built two interoperable clients around it. Anticipates "shared schema → automatic interop between independent recipe clients." **Verdict: Bucket 3/4.**

**Secure Scuttlebutt / Manyverse / Patchwork** (manyverse) — append-only signed logs held locally, offline-first, subjective moderation derived from the follow graph. SSB's follow-graph-derived, subjective, per-user moderation is a genuine precedent for arecipe's "client-derived moderation inherited from the social graph." **Verdict: Bucket 3 (social-graph moderation + user-owned data, different substrate).**

**Farcaster, Lens, DeSo, Steemit** — web3 social. Signed content, shared schemas, portable identity; converge on user-owned-content and interop but differ by using blockchain/Hubs infra with different cost/persistence tradeoffs. **Verdict: Bucket 3/5.**

### 4d. Self-hosted personal-data apps

**Mealie, Tandoor, KitchenOwl, RecipeSage, Nextcloud Cookbook, Cooklang** (mealie.io, tandoor.dev, cooklang.org) — self-hosted recipe managers. Data is self-hosted but locked in an application-managed database inside a Docker volume ("You cannot grep your collection. You cannot put a single recipe in Git"); export is backup-only. They support Schema.org Recipe scraping and JSON-LD import/export (real interop on the schema axis) and household multi-user models (a small-group scale precedent). But delivery is a server-rendered app (some with a PWA wrapper), not a backendless static bundle, and data is not truly user-owned in the credible-exit sense. Cooklang is the exception on portability (plain-text .cook files, git-versionable) but has no social graph. **Verdict: Bucket 5 (recipe domain + partial data ownership, different composition on most axes).**

### 4e. Signed release and update security

**The Update Framework (TUF)** (https://theupdateframework.io/) — the canonical multi-authority update-security system: role separation, threshold signatures, offline keys, expiration, compromise-resilience. TUF is direct prior art for the *principle* behind arecipe's "multiple independent authorities to compromise the update path." arecipe's three-authority model (DNS + source hosting + offline key) is a specific instantiation of TUF-style multi-authority defense, adapted to web/PWA delivery. **Verdict: Bucket 4 on the update-security axis (same multi-authority principle, different deployment target).**

**Sigstore (cosign, rekor, fulcio)** (sigstore.dev) — signing + public transparency log for software artifacts. Establishes transparency-log-backed signed releases as standard practice. **Verdict: Bucket 4 (update-security axis).**

**Signed HTTP Exchanges / Web Packaging / Web Bundles** (https://web.dev/articles/signed-exchanges, wicg.github.io/webpackage) — origin-signed web content that decouples the origin/authority of a resource from its delivery mechanism; a page can be served from any cache/CDN while the browser verifies the origin signature. This is the closest existing web-native analog to arecipe's "static bundle served from redundant hosts, authority separated from hosting provider." But SXG relies on a single signing certificate authority (a cert carrying the CanSignHttpExchanges extension, with a maximum 7-day lifetime), not a multi-authority model, and browser support never consolidated. Per BleepingComputer, "SXG is already supported by the Opera web browser, still under evaluation by the Microsoft Edge team, while Mozilla Firefox considers it harmful, and the Safari team already expressed its skepticism." Mozilla's official standards-positions repository formally labeled SXG "harmful" (mozilla/standards-positions #29), and Apple/WebKit's Maciej Stachowiak concurred: "we are pretty uncomfortable with this approach, for similar reasons to Mozilla... it also seems like a worrisome change to the web security model." **Verdict: Bucket 4 (authority-decoupled web delivery; single authority, not multi).**

**Warrant canary** (https://en.wikipedia.org/wiki/Warrant_canary; EFF; rsync.net's first commercial canary, 2006; SpiderOak's multi-signer canary, 2014) — signed, scheduled, out-of-band incident signaling. SpiderOak's implementation is a direct precedent for a multi-party signed canary on a fixed cadence. Per its Aug 15 2014 announcement, the canary is "a specific plain text signed with multiple GPG keys. The GPG keys belong to different SpiderOakers which we've selected based on geolocation. So besides doing all the legal... things an adversary would need to do... they'll also need to compel three people around the globe to sign a message at a specific moment in time." Per TechCrunch (Aug 14 2014), "every 6 months, they'll re-publish this page with an 'All clear!' message. Three PGP signatures will sign the page for authenticity — so if someone wanted to force SpiderOak to update the page, they'd have to get all three (remotely located) signers to help." arecipe's "signed status canary published as a record on the app's own PDS" is a warrant-canary pattern relocated to an atproto record — novel in VENUE (atproto record), not in concept. **Verdict: Bucket 4 (canary concept, including multi-signer and scheduled variants, is established prior art; atproto-record venue is the only new element).**

**Debian apt-secure, Homebrew bottle signing, Android/iOS app signing, reproducible builds** — all establish signed releases as baseline; most rely on a single or small signing authority. **Verdict: Bucket 4/5.**

### 4f. Web3 / blockchain social

Covered in 4c. Farcaster's Hubs, Lens, Mirror.xyz, DeSo — converge on user-owned content and shared schemas; diverge on infra cost and persistence (chain/Hub costs). **Verdict: Bucket 3/5.**

### 4g. Historical decentralization projects and manifestos

**Solid** (https://solidproject.org/, Berners-Lee, MIT/Inrupt, 2016–) — user data in personal "Pods," apps request access, WebID auth, RDF/linked-data interop. Proposes user-owned data stores + app/data separation + cross-app interop via shared vocabularies — a very close philosophical and architectural ancestor of the atproto PDS model. Solid specified the composition (user-owned store + credible exit + interop) even where adoption stalled; as prior art, a specified-but-underbuilt composition still counts. **Verdict: Bucket 5 (specified the data-ownership+interop composition; different substrate and no social-graph moderation or update-security model).**

**IndieWeb** (https://indieweb.org/, Micropub, Webmention, IndieAuth, Microformats2, POSSE) — own-your-domain publishing with shared HTML-embedded schemas (Microformats), OAuth-based Micropub posting, and cross-site interop via Webmention. A strong precedent for "user-owned data + shared cross-application schema + standard auth (OAuth/IndieAuth) + credible exit." Micropub explicitly uses OAuth 2.0 Bearer tokens. **Verdict: Bucket 5 (data-ownership + shared-schema + OAuth composition; different substrate, no social-graph moderation).**

**Doctorow "enshittification"** (https://en.wikipedia.org/wiki/Enshittification, 2022; book Oct 2025) — the target arecipe responds to. Defines the three-stage platform-decay pattern and prescribes the end-to-end principle + interoperability + "credible exit" as remedies. arecipe is an implementation-shaped response to this critique; the critique itself is prior art for the *motivation*, not the composition. **Verdict: Bucket 6 (framing/motivation, not comparable as a build).**

**Diaspora, GNU Social, StatusNet, XMPP-era social** — earlier federated social; user-hosted data, federation, but no shared-record substrate or update-security composition. **Verdict: Bucket 5/6.**

### 4h. Small Web and adjacent

**Small Web / Small Technology Foundation (Aral Balkan; Kitten, Domain, Site.js)** (https://ar.al/2020/08/07/what-is-the-small-web/, small-tech.org) — single-tenant web ("one server hosts one application that serves just one person"), "distrust servers, trust clients," treat servers as "dumb delivery mechanisms." A strong philosophical precedent for arecipe's operator-restraint and client-trust posture, and Site.js/Kitten are concrete builds. But Small Web is explicitly single-tenant (no shared social graph, no multi-person groups) and not atproto-based. **Verdict: Bucket 5 (operator-restraint + client-trust philosophy; different composition, single-tenant).**

**Ghost, Beehiiv/Substack ownership rhetoric, ClassicPress, "boring web"** — data-ownership positioning around publishing; none assembles arecipe's composition. **Verdict: Bucket 6.**

---

## 4. Prior Art That Anticipates arecipe (ordered by strength)

1. **recipe.exchange** — strongest. Same domain, same substrate (atproto), same `exchange.recipe.*` namespace, PDS-stored signed records, Schema.org compatibility, OAuth+DPoP, Bluesky-delegated moderation. Differs from arecipe mainly by running an operator Rails backend + database + CDN, targeting public/global sharing, and lacking the multi-authority update model. **This project makes the recipe-on-atproto APPLICATION non-novel and makes the exchange.recipe lexicon someone else's property.**

2. **nostr.cooking / zap.cooking** — recipe app + "own your recipe data and social graph" thesis, verbatim, on Nostr. Makes the recipe + user-owned-data + social-graph combination non-novel across substrates.

3. **Statusphere + the atproto app pattern** — establishes PDS-records + custom lexicon + OAuth + firehose + independent-AppView interop as documented, standard, non-novel. Cloudflare's serverless Statusphere establishes near-zero-backend atproto delivery.

4. **TUF / Sigstore** — establish multi-authority, threshold, offline-key, transparency-backed update security as mature prior art for the update-security axis.

5. **Signed HTTP Exchanges / Web Packaging** — establish authority-decoupled, signed, cache-servable web delivery (the closest web-native analog to arecipe's redundant-static-hosting-with-verified-origin idea), though single-authority and largely rejected by non-Chromium vendors.

6. **Warrant canary (rsync.net 2006; SpiderOak multi-signer, 2014)** — establishes signed, scheduled, out-of-band incident signaling, including multi-signer and geographically distributed variants.

7. **Solid** — specified user-owned data stores + app/data separation + shared-vocabulary interop + credible exit (the PDS model's ancestor).

8. **IndieWeb** — user-owned data + shared cross-app schema (Microformats) + OAuth (IndieAuth/Micropub) + POSSE credible exit.

9. **Secure Scuttlebutt** — follow-graph-derived subjective moderation over user-owned append-only signed logs.

10. **Local-first essay (Ink & Switch)** — the canonical statement of the data-ownership values, though single-app not social-graph.

11. **Small Web / Small Technology Foundation** — operator-restraint, single-tenant, "trust the client, distrust the server."

---

## 5. What Remains Genuinely Novel (conservative)

After hard search, the following remain un-anticipated *as an assembled whole*, though each component is individually prior art:

- **The specific three-authority update-security model (DNS + source hosting + offline key) applied to a backendless static-bundle PWA, combined with an atproto-record status canary.** No project found assembles TUF-style multi-authority update defense + SXG-style authority-decoupled web delivery + a warrant-canary-style out-of-band signal into one web-app update-security posture. This is the single most defensible novel axis. It is an *integration*, not an invention.

- **The union of true operator restraint (no backend, no database, no analytics, static hosting only) WITH a shared social graph over user-owned records AND social-graph-derived, affinity-weighted, legible/reversible moderation.** Local-first and Small Web have operator restraint but no shared social graph; atproto apps (recipe.exchange, Frontpage) have the shared social graph but run operator backends. Holding BOTH simultaneously — genuinely no operator backend while still offering social/group features — is the compositional core that no candidate fully matches. recipe.exchange is the closest and explicitly fails it (Rails backend + operator DB for private data).

- **The small-private-group scale target (12-25, degrading to ~500) for an atproto recipe app.** Every recipe-on-decentralized-substrate project found targets public/global sharing (recipe.exchange, recipes.blue, nostr.cooking) or single-household self-hosting (Mealie/Tandoor). The private-small-group cookbook niche on atproto appears genuinely unoccupied.

What is NOT novel and must not be claimed: the recipe application on atproto; the `exchange.recipe` lexicon (owned by recipe.exchange); PDS-stored signed records; Schema.org Recipe compatibility; OAuth+DPoP auth; WebAuthn-PRF token encryption (Bitwarden shipped PRF-based passwordless vault decryption to all plans, and per Corbado (2026) "1Password has rolled out PRF support across their platforms" and "Dashlane recently adopted the WebAuthn PRF extension"); the shared-cross-app-lexicon-for-interop concept (lexicon.community); client-side/social-graph moderation (SSB, Nostr); the warrant canary; authority-decoupled signed web delivery (SXG); multi-authority update security (TUF).

---

## 6. Recommendations for Spec Language

1. **Delete any claim to novelty of the recipe application on atproto.** Replace with explicit acknowledgment: "recipe.exchange (Huckabee) and recipes.blue already implement recipe sharing on atproto; arecipe differs in architecture (backendless) and scale target (private small groups), not in domain."

2. **Do not claim to author, own, or introduce the `exchange.recipe.*` lexicon.** It is a vendor-controlled namespace owned by recipe.exchange (publishing DID `did:plc:4cx7ts7lqgjtsfquo53qo3sz`, resolvable via `_lexicon.recipe.exchange` DNS TXT). If arecipe consumes it for interop, frame it as *adopting recipe.exchange's existing public schema* — a strength (real interop), not an invention. If arecipe wants a neutral shared schema, use or propose a `community.lexicon.*` namespace via lexicon.community and say so.

3. **Reframe the headline novelty claim** from "novel composition" to: "a novel *integration* of established components (atproto PDS storage, TUF-style multi-authority update security, SXG-style authority-decoupled delivery, warrant-canary signaling, SSB-style social-graph moderation) applied under a strict no-operator-backend constraint to the previously unoccupied niche of private small-group recipe collaboration."

4. **Scope the update-security novelty precisely.** Claim: "we are not aware of prior art assembling three independent update authorities (DNS, source hosting, offline key) plus an atproto-record status canary for a backendless static-bundle PWA." Cite TUF, Sigstore, SXG, and warrant canaries (including SpiderOak's multi-signer, scheduled variant) as the components being integrated, so the claim survives scrutiny.

5. **State the operator-restraint claim as the load-bearing differentiator,** and defend it against recipe.exchange explicitly: "Unlike recipe.exchange, which runs a Ruby on Rails AppView, an operator database for private recipes, and an image CDN, arecipe runs no operator backend, no database, and no analytics; all data lives in user PDSes and delivery is static."

6. **Downgrade WebAuthn-PRF, OAuth+DPoP, and Schema.org compatibility from 'novel' to 'standard components we adopt.'** These ship in Bitwarden/1Password/Dashlane, the atproto OAuth profile, and across the recipe ecosystem respectively.

7. **Add a "Prior Art" section to the spec** naming recipe.exchange, nostr.cooking, Statusphere, TUF, SXG, Solid, IndieWeb, and SSB, so the novelty claim is bounded and credible rather than overreaching. A security-professional reviewer will trust a bounded claim far more than a blanket one.

---

## 7. References

- recipe.exchange — https://recipe.exchange/ ; /about ; /docs/technical ; /docs/visibility-settings ; /lexicons/ ; /updates/enhancing-social-features-with-bluesky-integration ; /updates/now-in-french-plus-language-aware-recipes-and-open-lexicons (accessed 2026-07-07)

- Josh Huckabee — https://joshhuckabee.com/ ; https://github.com/jhuckabee (atproto_auth gem) ; https://getprog.ai/profile/4247 (accessed 2026-07-07)

- awesome-lexicons — https://github.com/lexicon-community/awesome-lexicons (accessed 2026-07-07)

- lexicon.community — https://lexicon.community/ (accessed 2026-07-07)

- fediversereport, "ATProto Explained – Lexicons and video" (recipes.blue reference) — https://fediversereport.com/atproto-explained-lexicons-and-video/ (accessed 2026-07-07)

- AT Protocol docs — https://atproto.com/ ; https://atproto.com/guides/lexicon ; https://atproto.com/guides/statusphere-tutorial ; https://docs.bsky.app/docs/advanced-guides/atproto (accessed 2026-07-07)

- Frontpage — https://frontpage.fyi/ ; https://atprotocol.dev/tech-talk-frontpage-link-aggregator/ (accessed 2026-07-07)

- Serverless Statusphere — https://blog.cloudflare.com/serverless-atproto/ (accessed 2026-07-07)

- nostr.cooking — https://github.com/github-tijlxyz/nostr.cooking (accessed 2026-07-07)

- Recipistr — https://stacker.news/items/178216 (accessed 2026-07-07)

- Nostr NIPs — https://nips.nostr.com/ ; https://nostrapps.com/ (accessed 2026-07-07)

- Local-first software — https://www.inkandswitch.com/essay/local-first/ ; https://martin.kleppmann.com/papers/local-first.pdf (accessed 2026-07-07)

- Solid — https://en.wikipedia.org/wiki/Solid_(web_decentralization_project) (accessed 2026-07-07)

- IndieWeb — https://indieweb.org/ ; https://micropub.spec.indieweb.org/ ; https://spec.indieweb.org/ (accessed 2026-07-07)

- TUF — https://theupdateframework.io/ ; https://theupdateframework.io/docs/security/ ; https://en.wikipedia.org/wiki/The_Update_Framework (accessed 2026-07-07)

- Signed HTTP Exchanges — https://web.dev/articles/signed-exchanges ; https://wicg.github.io/webpackage/draft-yasskin-http-origin-signed-responses.html ; https://developer.chrome.com/blog/signed-exchanges ; https://www.bleepingcomputer.com/news/google/google-chrome-adding-support-for-signed-http-exchanges/ ; mozilla/standards-positions #29 (accessed 2026-07-07)

- Warrant canary — https://en.wikipedia.org/wiki/Warrant_canary ; https://www.cloudflare.com/learning/privacy/what-is-warrant-canary/ ; SpiderOak announcement (Medium/@SpiderOak, Aug 15 2014); TechCrunch (Aug 14 2014) (accessed 2026-07-07)

- WebAuthn PRF — https://developer.mozilla.org/en-US/docs/Web/API/Web_Authentication_API/WebAuthn_extensions ; https://bitwarden.com/blog/prf-webauthn-and-its-role-in-passkeys/ ; https://www.corbado.com/blog/passkeys-prf-webauthn ; https://blog.millerti.me/2023/01/22/encrypting-data-in-the-browser-using-webauthn/ (accessed 2026-07-07)

- Enshittification — https://en.wikipedia.org/wiki/Enshittification (accessed 2026-07-07)

- Small Web — https://ar.al/2020/08/07/what-is-the-small-web/ ; https://small-tech.org/about/ (accessed 2026-07-07)

- Self-hosted recipe managers — https://mealie.io/ ; https://tandoor.dev/ ; https://cooklang.org/blog/18-open-source-recipe-managers-2026/ (accessed 2026-07-07)

- Secure Scuttlebutt / Manyverse — https://www.manyverse.social/ (accessed 2026-07-07)
