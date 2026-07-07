# Brief: Discoverability Strategy for arecipe.app

author: Chase Pettet

version: 1.0

date: 2026-07-07

purpose: hand this brief to a capable research-and-strategy agent to produce an actionable plan for making arecipe.app surface in real search recommendations, both traditional SERPs and LLM-mediated responses

status: ready to execute

---

## How to use this brief

Paste this document into a capable agent session (Claude with web search, ChatGPT with browsing, Perplexity Pro, or an agent framework). Ask the agent to work through the deliverables in order. The verification requirements are load-bearing: the agent must actually search and cite primary sources, not draft from memory and offer to verify after.

If the agent produces recommendations that violate the "what to skip" section, reject and re-prompt. If the agent claims a statistic, publication, or directory exists without a working URL, treat the claim as unverified.

---

## 1. Project context

**arecipe.app** is a recipe-sharing Progressive Web App built on the AT Protocol. It is a static single-page application served from CDN storage. It has no backend, no user database, and no aggregated data asset. User recipes live on user-owned Personal Data Servers as `exchange.recipe.recipe` records that are simultaneously visible on recipe.exchange without coordination.

Design principles, bounded:

- Structurally resistant to Doctorow's enshittification pattern

- Minimum-authority operator (owns domain, code, signing key; cannot silently alter user data or moderation)

- Data survives application shutdown, conditional on user PDSes remaining accessible

- No single compromise silently targets users (three-authority defense: DNS, source, offline signing key)

- Client-derived moderation from graph-weighted inputs, legible and reversible

- Target scale: 12-25 person groups; degrades gracefully to ~500; requires hosted-indexer beyond that

The full specification (v0.2) is a companion artifact. Anyone executing this brief should read the spec first to understand what is honestly being pitched.

Adjacent projects and identities:

- Recipe.exchange: existing atproto AppView for recipes, maintained by Josh Huckabee. Interop partner.

- Croft.ing: sibling project by the same maintainer.

- Drystone: cooperative messaging protocol project by the same maintainer.

The maintainer is Chase Pettet. Personal projects, not employer-affiliated.

---

## 2. Target reality check

Before generating any strategy, the executing agent must internalize what "ranked in search recommendations" realistically means for this project.

**What we are not competing for.** General recipe queries. "Best recipe app," "chicken parmesan recipe," "meal planning app." Allrecipes, Serious Eats, NYT Cooking, Paprika, and Whisk own that space and will continue to. Attempting to compete there produces zero real return.

**What we are competing for.** Niche ecosystem-adjacent queries where the audience genuinely wants what arecipe.app is. Three categories:

- **Atproto ecosystem discovery.** "Atproto apps," "decentralized apps built on AT Protocol," "Bluesky ecosystem projects," "recipe apps on atproto."

- **Data ownership and enshittification-aware queries.** "Recipe app that doesn't sell my data," "self-hosted recipe app," "decentralized recipe sharing," "cookbook app I actually own," "recipe app without ads."

- **Small-group cookbook and family-scale queries.** "Share recipes with family," "private recipe group," "cookbook for friends and family," "collaborative recipe book."

These are lower-volume queries. Total addressable search traffic is small compared to general recipe queries. But conversion intent is high, and the competitive field is thin. This is the beachhead.

**The LLM angle is disproportionately important.** For niche projects, being cited in an LLM response to "what's a decentralized recipe app" is worth substantially more than ranking on page 2 for "recipe app." The training data and retrieval sources for major models weight certain kinds of publications, directories, and cross-linked ecosystem hubs. Getting into those sources is the highest-leverage work.

---

## 3. Strategic objectives, ordered

1. **Presence in atproto ecosystem directories and awesome-lists** such that any developer or user exploring the ecosystem finds arecipe.app within one link of the ecosystem's canonical hubs.

2. **Signed coverage in trusted individual voices** whose writing is heavily weighted in LLM training and retrieval. The audience of Doctorow, Molly White, Anil Dash, Simon Willison, Robin Sloan, and Bluesky-native tech writers is the demographic that would care about this project. One thoughtful post from any of them changes the retrieval landscape.

3. **A Wikipedia-quality reference article** either as an entry itself (if notability threshold is met) or as a citation on adjacent articles (AT Protocol, decentralized social networking, Bluesky).

4. **Real traditional-SERP presence** for the niche queries in Section 2, sufficient that AI overviews and traditional users both surface arecipe.app.

5. **Cross-linked interop demonstration** with recipe.exchange, such that anyone landing on either site can see the other as a live demonstration of credible exit.

6. **HN and lobste.rs level community awareness** through a well-executed launch post that stands on its own merits and doesn't feel like marketing.

The objectives are ordered by leverage per unit effort. Do them in this order unless the agent identifies a specific reason otherwise.

---

## 4. Constraints and stance

**Ethical floor.** No dark patterns, no AI-generated content mills, no purchased links, no low-quality directory submissions, no comment spam, no Reddit account farming, no fabricated testimonials. If a tactic would embarrass the maintainer if disclosed, don't recommend it.

**Truthfulness floor.** Every claim on the site and in outreach must match the spec's bounded language. Do not overclaim. Do not describe the project as "the first," "the only," or "the ultimate" anything unless that claim is verifiably true.

**Effort budget.** Solo maintainer working part-time. Any recommendation requiring more than roughly 4 hours a week of ongoing effort must be flagged and justified. Any recommendation requiring paid tools or services must be flagged with cost.

**Time horizon.** First real results expected 3-6 months after execution begins. Six-week checkpoints. Anything promising faster results is probably a scam.

**Preference alignment.** The maintainer prefers:

- Primary sources over blog spam

- Bounded claims over confident overclaims

- Long-tail high-intent queries over head-term vanity metrics

- Owned channels (documentation, spec, github) over rented channels (medium, twitter, etc.)

- Legible, reversible tactics over anything that would require sustained maintenance to unwind

---

## 5. Required deliverables, Phase 1: research

The agent produces the following, with every claim backed by a working URL to a primary source. No memorized statistics.

### 5a. Keyword landscape

- Verified search-volume estimates for the query categories in Section 2, using at least two independent sources (Google Keyword Planner if accessible, Ahrefs free tier, SEMrush free tier, or Google Trends). Include exact query strings and per-month estimates.

- Long-tail expansions from each category (aim for 30-50 real queries per category).

- Query intent classification for each: informational, comparison, transactional, ecosystem-discovery.

- Explicit call-outs where volume is too low to justify optimization effort.

### 5b. Competitor and adjacent-project analysis

- Existing atproto recipe or food projects (recipe.exchange is one; any others).

- Existing decentralized or self-hosted recipe applications (Mealie, Tandoor, Grocy). What they rank for, what they own, where the gaps are.

- Existing enshittification-aware software projects that positioned successfully around data ownership (Obsidian, Standard Notes, Nextcloud, Bear). What their positioning language is. What their launch stories looked like.

- Existing atproto-ecosystem project sites that surface well for ecosystem queries (Bluesky itself, blacksky, frontpage, smokesignal, leaflet, statusphere). What structural patterns do they share.

### 5c. Directory and awesome-list audit

- Complete list of atproto and Bluesky-ecosystem awesome-lists, directories, and aggregator sites currently accepting submissions. Verify each is actively maintained (last commit within 90 days).

- Complete list of decentralized-web and self-hosted-software directories (awesomeselfhosted, awesome-decentralized, awesome-privacy). Verify acceptance criteria.

- Recipe-app aggregator sites and lists. Note which are AI-slop content farms and skip them. Note which have real editorial standards.

- For each directory: submission process, acceptance criteria, typical review time, whether the maintainer needs to be a real person with a public identity.

### 5d. Publication and voice targeting

- Individual writers whose coverage would materially move the needle. Include the maintainer's own guesses (Doctorow, Molly White, Anil Dash, Simon Willison, Robin Sloan) plus any others the agent identifies. For each, verify:

  - Current publication venue and cadence

  - Whether they've covered atproto, Bluesky, or adjacent decentralized projects previously

  - Their stated interests and coverage patterns

  - The right way to pitch them (or clear signal that they don't accept pitches)

- Publications with editorial standards that cover the intersection: Ars Technica, The Verge occasionally, 404 Media, Rest of World, Increment (defunct?), The New Stack, LWN. Verify each is actively publishing and what their pitch process is.

- Community forums where thoughtful launches land well: HN, lobste.rs, tildes, the Bluesky app-development channel.

### 5e. Wikipedia landscape

- Existing Wikipedia articles on AT Protocol, Bluesky Social, decentralized social networking, ActivityPub-adjacent topics. What projects are mentioned in each. What the citation standards are.

- Wikipedia notability threshold analysis: can arecipe.app plausibly meet WP:GNG (multiple independent secondary sources with substantial coverage)? What would need to be true first? Which articles could plausibly cite arecipe.app once coverage exists?

### 5f. Technical SEO audit prerequisites

- Current state of PWA-SEO best practices for single-page applications. Sources should be recent (Google Search Central docs, Web.dev, actual case studies).

- Verified working approach for arecipe.app specifically: which pages need to be server-rendered or pre-rendered, which can stay client-rendered, what the tradeoffs are for each.

- Schema.org Recipe structured data implementation. Since `exchange.recipe.recipe` is already Schema.org-compatible, the site should emit proper JSON-LD on any public recipe view. Verify current Google guidelines.

- Core Web Vitals targets for a mobile-first PWA in 2026.

### 5g. LLM training data and retrieval sources

- Which sources do major LLMs (Claude, GPT, Gemini) preferentially retrieve for recommendation queries. Common Crawl coverage patterns, retrieval-augmented weighting, whether ChatGPT web search prefers certain domains.

- Whether being on GitHub trending, Product Hunt front page, or HN front page produces detectable downstream retrieval effects.

- Whether structured data on the site influences whether LLMs cite it (mixed evidence; verify).

- Whether being cited on Wikipedia, on ecosystem-canonical sites (docs.bsky.app, atproto.com blog posts), and in trusted individual voices produces detectable retrieval preference.

---

## 6. Required deliverables, Phase 2: strategy

Based on Phase 1 research, the agent produces the following:

### 6a. Site architecture and content plan

- Sitemap of public pages needed. Minimum plausible set:

  - `/` (landing, positioning, honest value proposition)

  - `/about` (what it is, who made it, why)

  - `/how-it-works` (the layered architecture, in language for a non-technical reader)

  - `/spec` (the technical spec, either directly or as a link to the source repo)

  - `/status` (live status of the app, canary signature, current version)

  - `/verify` (the incident-runbook and verification quick-check)

  - `/blog` (ongoing content)

  - `/recipes/{did}/{rkey}` (server-rendered recipe view for shareable links, with proper Schema.org markup)

  - Per-page metadata targets

- Content plan for the first 12 blog posts. Not filler. Each post should be a real contribution that stands on its own merits. Suggested seeds:

  - "Why I built a recipe app on atproto"

  - "What credible exit actually means"

  - "How to verify your recipe app is not silently compromised"

  - "The three-authority defense pattern, illustrated with cookies"

  - "What a static PWA can do in 2026"

  - The agent proposes the remaining seven with rationale for each

- Cadence: 1-2 posts per month, sustainable indefinitely, not front-loaded and abandoned.

### 6b. Structured data implementation

- Concrete JSON-LD templates for each page type

- Schema.org Recipe emission verified against Google's Rich Results Test

- Organization and WebSite schema for the site itself

- No made-up review counts or ratings

### 6c. Link and citation acquisition roadmap

- Prioritized list of directories and awesome-lists to submit to, in submission order, with the specific submission process for each

- Prioritized list of publications and voices to pitch, with the specific pitch angle for each

- Cross-linking plan with recipe.exchange (needs coordination with Josh Huckabee) and with other atproto ecosystem sites (natural, ask nicely)

- HN launch timing and framing plan. Realistic assessment of whether HN is the right first venue, or whether lobste.rs or the Bluesky community is better

- No purchased links, no guest-post-for-backlink schemes, no low-quality directory carpet-bombing

### 6d. Content calendar

- 90-day calendar with specific publish dates for blog posts, submission dates for directories, and pitch dates for publications

- Explicit slack: nothing scheduled every day; realistic solo-maintainer cadence

### 6e. Launch sequence

- Pre-launch: what needs to be true on the site before public launch (content, structured data, verify-runbook, canary signing ceremony completed)

- Launch week: sequence of visibility moves (HN post day, Bluesky announcement, ecosystem cross-links)

- Post-launch: how to convert initial attention into durable presence (email list? blog subscription? Bluesky account cadence?)

### 6f. Measurement and review

- Metrics that actually indicate progress, not vanity metrics:

  - Presence in Google top 20 for the niche queries in Section 2 (measure via manual check, not just Search Console)

  - Presence in LLM responses to relevant queries (measure via structured spot-check across Claude, ChatGPT, Perplexity monthly)

  - Referral traffic from ecosystem sites and directories

  - Direct navigations (returning users)

  - Signed-canary verification requests as a proxy for real installations

- Six-week review points with go/no-go criteria for each strategy branch

- Explicit criteria for pulling a tactic that isn't working

---

## 7. Verification requirements

Non-negotiable:

- Every keyword volume claim backed by a screenshot or reproducible query from a named source

- Every directory or publication claim backed by a working URL that the agent has actually visited during the session

- No fabricated publication names, contributor names, or citation counts

- If a source is behind a paywall or requires signup, the agent flags this rather than pretending to have accessed it

- If Ahrefs, SEMrush, or similar tools are used, the agent notes the tool tier and any free-tier limitations affecting the numbers

- Separate "verified" claims from "reasonable inference" claims. Do not merge them

- If any recommendation depends on a claim the agent could not verify, the recommendation is flagged as speculative

---

## 8. Output format

Deliver a single structured markdown document with:

- An executive summary of the top five moves, in effort-adjusted priority order

- Full Phase 1 research report

- Full Phase 2 strategy

- A "what to do this week" section with concrete actions

- A "what to do this quarter" section with the six-week checkpoints

- A "what to skip" section explicitly naming the tactics not recommended and why

- References section with every URL cited, dated

Formatting preferences:

- Markdown with blank lines between bullet points

- No em-dashes

- No purple prose

- Metadata header with author, date, sources-consulted-count, tools-used

---

## 9. What to skip

The agent should explicitly not recommend or produce:

- Generic SEO checklist content ("optimize your title tags," "add alt text") without specific application to arecipe.app

- Any form of AI-generated blog content

- Purchased backlinks or paid guest posts on low-DA sites

- Reddit account farming or comment spam

- Fabricated testimonials, reviews, or usage claims

- Aggressive email outreach to writers who haven't opted in

- Any tactic that would require the maintainer to lie about who they are, what the project does, or how many users it has

- Vanity metrics as success criteria (impressions, DA scores, meaningless directory counts)

- Recommendations to "go viral" or "hack the algorithm"

- Any strategy that depends on the site continuing to overclaim what the spec bounds

---

## 10. Success criteria for this brief itself

The output of executing this brief is useful if, six months from execution start:

- arecipe.app appears in Claude, ChatGPT, and Perplexity responses to at least three of the niche queries in Section 2

- arecipe.app appears in the top 10 Google results for at least five of the niche queries in Section 2

- arecipe.app is listed in at least four active atproto or decentralized-web ecosystem directories

- At least two thoughtful pieces of coverage exist from writers whose readership overlaps the target audience

- Referral traffic from ecosystem cross-links is a steady, non-zero baseline

- The site's own content library has grown by at least eight substantive posts

If none of these are true after six months, the strategy needs revision and the agent's initial research was probably wrong somewhere. If most are true, the beachhead is established and the strategy can expand.

---

## 11. Note to the executing agent

The maintainer will read your work with a security professional's skepticism and a spec author's discipline. Every claim will be checked. Every recommendation will be sanity-tested against the effort budget. Overclaiming, fabricating, or padding will be caught quickly and the work discarded.

The correct posture is: this is a real project with a real audience that is smaller than the maintainer of a general recipe app would want, but larger than zero. The job is to find that audience where they already are and give them a reason to notice. Substance over performance. Truthful positioning over hype. Owned channels over rented ones.

If any part of this brief is unclear or contradicts itself, ask before executing. If a specific tactic would work better than what's specified here, propose it with reasoning rather than substituting silently. If the honest answer to a research question is "I couldn't verify this," say so.

Begin with Section 5 and work in order.
