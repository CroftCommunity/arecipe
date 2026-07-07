# Brief: Novelty Assessment for arecipe's Composition

author: Chase Pettet

version: 1.0

date: 2026-07-07

purpose: hand this brief to a capable research agent to determine whether the specific assembly of properties in arecipe has already been done, is partially anticipated by prior art, or represents a genuinely novel composition

status: ready to execute

---

## How to use this brief

Paste this document into a capable research agent session (Claude with web search, ChatGPT with browsing and deep research, Perplexity Pro with deep research, or an agent framework with real search access). Ask the agent to work through the deliverables in order.

The critical framing: **the goal is to disprove novelty, not confirm it.** If arecipe's composition has been done before, we want to know. A finding of "not novel, here's the project that already did it" is the most valuable possible output. Only if the disprove effort fails should the agent conclude that the composition is novel.

This is not a marketing brief. It's a due-diligence check on a claim the spec makes. Bias toward the null hypothesis.

---

## 1. The question

Is arecipe's specific assembly of the following properties, targeting the specific scale and delivered through the specific deployment model, already implemented or specified somewhere?

**The individual properties are not the question.** Every property below is well-established in some existing project or paper. Data ownership, signed releases, in-browser storage, PWA delivery, atproto integration are not novel individually. The question is whether the **compositional assembly** has been done.

Two distinct novelty claims exist:

**Compositional novelty**: has anyone assembled these exact properties into a working system?

**Application novelty**: has anyone applied this composition specifically to social recipe sharing, cookbook groups, or similar small-group content collaboration?

The research should test both, separately.

---

## 2. The composition being tested

arecipe is:

- A single-page Progressive Web App

- Served as a static bundle from redundant static-hosting providers with DNS load balancing

- Built on the AT Protocol (atproto)

- With user data stored in user-owned Personal Data Servers as signed records

- Using a shared cross-application lexicon (`exchange.recipe.*`) that produces automatic interop with existing consumer projects

- With no operator-run backend, no database, no analytics warehouse, no aggregated user data

- With signed release attestation via an offline signing key held as one of three independent authorities (DNS, source hosting, offline key)

- With multi-provider source-hosting redundancy so that deplatforming from a single provider does not silence the service

- With a signed status canary published as a record on the application's own PDS providing out-of-band incident signaling

- With WebAuthn-PRF opt-in encryption of refresh tokens layered over an OAuth-plus-DPoP authentication model

- With client-derived moderation inherited from the user's social graph, weighted by interaction affinity, with legibility and reversibility as safety mechanisms

- Targeting private groups at 12-25 person scale, degrading gracefully to ~500

- Where recipe records are Schema.org Recipe-compatible and appear on independently-run consumer sites without coordination

- Where the operator holds domain, code, and signing key but has no unilateral control over user data, moderation policy, or discovery

The composition claim: no such system currently exists. The design's contribution is the assembly, not any individual piece.

Full spec (v0.3) is a companion artifact. The agent should read it if additional context is needed to evaluate any specific claim.

---

## 3. Comparison axes

For each candidate project the agent finds, score against these axes:

**Data ownership model**

- Where does user data physically live?

- Who controls access to it?

- Can the user leave with all their data intact?

- Can the user's data outlive the application's shutdown?

**Infrastructure cost model**

- What does the operator need to run?

- What is the operator's marginal cost per user?

- Can the application run on zero-cost static hosting?

**Update security model**

- Are application updates cryptographically signed?

- How many independent authorities are required to compromise the update path?

- Is there an out-of-band incident signal channel?

- Is the trust anchor separated from any single hosting provider?

**Persistence model**

- What happens to user data when the application shuts down?

- What happens to the code when the maintainer walks away?

- Is source availability decoupled from serve availability?

**Community and moderation model**

- Who defines moderation policy?

- Is moderation legible to affected users?

- Is moderation reversible by affected users?

- Does moderation adapt to the user's community without central authority?

**Deployment model**

- Native app, web app, PWA, terminal app, other?

- Single-page or multi-page?

- Client-side rendering, server-side rendering, or hybrid?

- Auth model (session cookies, OAuth, DPoP, WebAuthn)?

**Scale target and audience**

- Individual? Small group? Public? Federation?

- What scale does the design tighten around and where does it break?

**Interoperability model**

- Do records use a shared cross-application schema?

- Can other applications consume the same records without coordination?

- Is credible exit an implementation reality or an aspiration?

For each candidate, produce a row in a comparison matrix scoring match against each axis: strong match, partial match, different approach, or not comparable.

---

## 4. Categories to search, with specific starting points

The agent should search each category, not skip any. Specific starting projects are named to give concrete anchors; the agent should also find projects not named here.

### 4a. atproto ecosystem projects

- Bluesky Social (the primary AppView)

- Blacksky (algorithmic and community-focused fork infrastructure)

- Frontpage (Hacker-News-like link aggregator on atproto)

- Smokesignal (events on atproto)

- Statusphere (Bluesky's tutorial reference app)

- Leaflet (long-form documents on atproto)

- Skylight (video on atproto)

- Ouranos (browser-based Bluesky client)

- Symm (feed generator infrastructure)

- Streamplace (live streaming on atproto)

- PDSls (repository browser)

- recipe.exchange (existing recipe AppView; interop partner)

- Tangled (git forge on atproto)

- standard.site / standards.site (formats and specs on atproto)

- Anything else in `github.com/lexicon-community/awesome-lexicons` or similar directories

For each, ask: does this application match arecipe's composition, or does it differ on specific axes?

### 4b. Local-first and Ink & Switch projects

- The "Local-first software" essay by Kleppmann, Beynon-Davies, van Renen, Alvaro (2019)

- Automerge and Automerge-based projects

- Muse (the local-first note-taking app)

- Actual Budget (local-first personal finance)

- Zed (editor with local-first sync design)

- CRDT-based collaborative apps generally

For each, ask: is this a "single application per user's data" or a "shared social graph over user-owned data" model? Only the latter matches arecipe.

### 4c. P2P and decentralized social

- Secure Scuttlebutt (SSB) ecosystem: Manyverse, Patchwork, Patchfoo, Oasis

- Nostr ecosystem: Damus, Amethyst, Snort, Iris, Coracle

- Beaker Browser and Hyper protocol projects (Rotonde, Fritter)

- Farcaster clients: Warpcast, Yup

- Lens Protocol clients

- Mastodon and ActivityPub ecosystem apps (specifically recipe-related if any)

- Ecos.social or other niche ActivityPub servers

- DeSo, Steemit (historical)

For each, note the substrate (SSB, Nostr, ActivityPub, blockchain, atproto) and evaluate whether the substrate itself provides the same properties arecipe achieves through atproto.

### 4d. Self-hosted personal-data apps

- Mealie (self-hosted recipe manager)

- Tandoor Recipes (self-hosted recipe manager)

- Grocy (self-hosted meal planning)

- Recipesage

- Cookbook (any of several by that name)

- Nextcloud Recipes

- Home Assistant (as an architectural comparison, not domain)

- Standard Notes (data ownership stance)

- Obsidian (local-first with cloud sync)

For each, note: is data really user-owned or just self-hosted? Is there interop with other consumers? Is the delivery model a PWA or a traditional server-rendered app?

### 4e. Signed release and update security prior art

- The Update Framework (TUF): `theupdateframework.io`

- Sigstore ecosystem: `sigstore.dev`, cosign, rekor

- Docker Notary

- Debian apt-secure

- The reproducible builds movement

- Mobile app store signing (iOS, Android, Play Protect)

- Homebrew's bottle signing

- Web app manifest signing proposals (there have been several; find them)

For each, note the trust model. Does the design assemble multi-authority defense the way arecipe's Layer 3 does, or does it rely on a single signing authority?

### 4f. Web 3 and blockchain-based social

- Farcaster (Hubs architecture)

- Lens Protocol

- Mirror.xyz

- Steemit (historical, on the Steem blockchain)

- DeSo

For each, note: data ownership via chain is a different tradeoff (censorship resistance at the cost of privacy, storage cost, and consensus overhead). Not the same composition, but worth noting where the properties converge.

### 4g. Historical decentralization projects and manifestos

- Tim Berners-Lee's Solid Project

- The IndieWeb movement (Webmention, Micropub, IndieAuth)

- XMPP-era social apps

- Diaspora, GNU Social, StatusNet

- Anil Dash's "The Web We Lost" and related writing

- Doctorow's enshittification essays (target this project responds to)

- Ink & Switch's local-first essay and related work

- The "Small Web" movement

- Aral Balkan's Small Technology Foundation

For each, note: what did they specifically propose, and did it get built? Failed projects still count as prior art if they specified the composition.

### 4h. Adjacent recent projects worth checking

- Ghost's stance on data ownership (traditional but principled)

- Beehiiv, Substack (comparison for creator ownership rhetoric)

- ClassicPress and other WordPress forks that took anti-enshittification stances

- The "boring web" movement generally

Any project that positioned around data ownership plus operator restraint, whether or not it succeeded.

---

## 5. Verdict rubric

For each candidate project or paper, place in exactly one of the following buckets. If uncertain, err toward the more critical bucket.

**Bucket 1: Full compositional match.** Same properties assembled the same way, same or similar deployment model, same scale target. If this bucket has any entries, arecipe's novelty claim fails. Name the project, cite the primary source, describe the match.

**Bucket 2: Compositional near-match with one or two axes different.** Same properties assembled similarly, but at least one axis (deployment model, scale, substrate) differs materially. Note which axes match and which do not.

**Bucket 3: Same properties, different composition.** The individual properties are present but assembled differently. Includes cases where similar properties are achieved through a different substrate (Nostr instead of atproto, for example).

**Bucket 4: Same composition, different domain.** Someone built this exact composition but for a different content type (not recipes). arecipe's application to recipes may still be novel, but the composition itself is prior art.

**Bucket 5: Related but distinct.** Shares aspiration or philosophy but differs on most axes. Interesting context; does not challenge novelty.

**Bucket 6: Not comparable.** Different problem space entirely.

Aim for a distribution across buckets. If everything lands in bucket 5 or 6, the search was probably not thorough enough; go deeper.

---

## 6. Anti-bias instructions

The natural bias for this kind of research is to find validation of the novelty claim. Actively resist it.

- Search terms should be neutral. Do not phrase queries to find "the first" or "novel" work. Search for the properties themselves and see what turns up.

- If a candidate looks close, dig deeper before dismissing. "Not quite the same" is usually the researcher's bias; check whether the difference actually matters.

- If a candidate is in an obscure venue (a defunct blog, an abandoned GitHub repo, a graduate thesis, a workshop paper), it still counts. Novelty is not the same as "no one else has publicized it."

- If a candidate is in a language other than English, it still counts. Language should not be a filter.

- If the composition has been proposed but never implemented, that counts as prior art for the design. If the composition has been implemented but abandoned, that also counts.

Explicit instruction: if you have to strain to find a difference between arecipe and a candidate, do not report that difference as novelty. Report the match instead.

---

## 7. Verification requirements

Non-negotiable:

- Every project named must have a working URL to a primary source (project website, GitHub repository, paper venue).

- Every claim about a project's design must be sourced to project documentation, source code, or the developer's own writing. Not to third-party summaries or LLM-generated descriptions.

- If a claim cannot be verified because the source is unreachable or unclear, mark it as unverified rather than presenting it as known.

- Do not fabricate project names. If unsure whether a project exists, do not name it.

- Distinguish clearly between "this project claims X" and "this project actually does X." The gap is often material.

- Include the year each project was created and last active. Abandoned projects still count as prior art but should be marked as such.

---

## 8. Output format

Deliver a single structured markdown document with:

### Executive summary

Two to four paragraphs. Bottom line: is arecipe's composition novel, partially novel, or not novel? Which projects most closely anticipate it? What is the honest strength of the novelty claim?

Do not soften this section. The rest of the document is nuance. The executive summary is the verdict.

### The composition matrix

A table with rows for each candidate project and columns for each comparison axis. Cell values: strong match, partial match, different approach, not comparable. Include primary source URL for each row.

### Per-category findings

One subsection per category from Section 4. For each, list projects found, describe each in one paragraph with primary sources, and score against the composition matrix.

### Prior art that anticipates arecipe

Explicit section listing every project or paper that plausibly anticipates any part of arecipe's composition. Ordered by strength of anticipation.

### What remains genuinely novel (if anything)

Explicit section listing what, if anything, arecipe assembles that no found prior art matches. Be conservative. If nothing does, say so.

### Recommendations for spec language

Based on findings, recommend how arecipe's spec should bound its novelty claims. Specific text changes if the current language overreaches.

### References

Every URL cited, dated. Note when each was last accessed.

Formatting preferences:

- Markdown with blank lines between bullet points

- No em-dashes

- No purple prose

- Metadata header with author, date, sources-consulted-count, tools-used

---

## 9. What to skip

The agent should not produce:

- Vague comparisons ("similar in spirit") without axis-by-axis evaluation

- LLM-generated summaries of projects rather than primary-source-derived descriptions

- Aspirational statements about what a project "wants to be" versus what it actually is

- Claims about a project's popularity or influence without traffic or citation evidence

- Novelty verdicts based on ignorance of prior art (if a category was skipped, say so; do not conclude)

- Padding. If a category has no relevant projects, one sentence saying so is fine.

- Speculation about what arecipe should do. This is a due-diligence brief, not a product strategy brief.

---

## 10. Success criteria for this brief

The output is useful if:

- At least 30 distinct projects or papers have been evaluated across the categories in Section 4

- Every claim in the output has a working URL to a primary source

- The verdict rubric distribution is honest (not everything in bucket 5 or 6)

- The executive summary gives a clear, defensible answer to the novelty question

- The spec-language recommendations are concrete enough to apply directly to the current spec

- If the composition turns out to be not novel, the output identifies exactly which project or paper it duplicates

- If the composition turns out to be novel, the output identifies exactly which axes make it novel and defends that conclusion against the strongest counter-examples found

If the output cannot support a defensible verdict on novelty, the research was insufficient. Continue searching before writing conclusions.

---

## 11. Note to the executing agent

The maintainer of this project is a security professional with strong source discipline. Overclaims and fabricated citations will be caught quickly and the work discarded. The correct posture is: assume the composition has probably been anticipated somewhere. Look hard for the anticipation. If it exists, name it. If it does not exist after thorough search, say so with the specific search paths taken.

Prior art from the following classes should be given particular attention because their principles most closely align with arecipe's stance and are the most likely places for anticipation:

- Ink & Switch's local-first work

- The IndieWeb movement's protocols and manifestos

- Tim Berners-Lee's Solid Project

- The atproto ecosystem itself (any existing recipe or cookbook AppView)

- Doctorow's essays and any projects that responded to them with implementation

- The Small Web / Small Technology writing

If any of these classes has been under-explored, go back and explore them further before finalizing conclusions.

Begin with Section 4 and work through the categories in order. Do not skip categories. Report progress by category before assembling the executive summary.
