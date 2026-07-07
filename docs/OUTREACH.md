# arecipe — Outreach (SEO and Socialization)

Status: living document. This is the working plan distilled from the full
discoverability brief at `docs/sources/arecipe-discoverability-brief.md` (v1.0),
which is the document to hand to a research-and-strategy agent for the deep pass.
This file is the standing summary the maintainer works from.

Governing stance: substance over performance, truthful positioning over hype, owned
channels over rented ones. Every claim in outreach must match the spec's bounded
language. If a tactic would embarrass the maintainer if disclosed, it is not on this
list.

---

## 1. The honest target

**Not competing for:** general recipe queries ("best recipe app," "chicken parmesan
recipe"). Allrecipes, Serious Eats, NYT Cooking, Paprika, and Whisk own that space.
Attempting to compete there returns zero.

**Competing for** three niche, high-intent, thin-competition query families:

- **Atproto ecosystem discovery** — "atproto apps," "Bluesky ecosystem projects,"
  "recipe apps on atproto."

- **Ownership / enshittification-aware** — "recipe app that doesn't sell my data,"
  "decentralized recipe sharing," "cookbook app I actually own," "recipe app without
  ads."

- **Small-group cookbook** — "share recipes with family," "private recipe group,"
  "collaborative recipe book."

Lower volume, high conversion intent, thin field. This is the beachhead.

**The LLM angle is disproportionate.** For a niche project, being cited in an LLM
answer to "what's a decentralized recipe app" is worth more than page-2 SERP ranking.
Getting into the sources those models retrieve from is the highest-leverage work.

---

## 2. Hard technical precondition

**GPTBot, ClaudeBot, and PerplexityBot do not execute JavaScript.** A pure
client-side SPA is invisible to exactly the LLM crawlers this strategy targets. So
public pages (landing, about, how-it-works, and especially `/recipes/{did}/{rkey}`)
must be server-rendered or pre-rendered with proper Schema.org Recipe JSON-LD. This is
a build decision flagged as OPEN in `STACK.md` §7 — resolve it before launch, and
resolve it without introducing a live backend.

---

## 3. Objectives, ordered by leverage per unit effort

1. **Ecosystem-directory presence** so any developer or user exploring atproto finds
   arecipe within one link of the canonical hubs (awesome-atproto, Bluesky Community
   Showcase are the top two moves — both one link from canonical hubs, both feed LLM
   retrieval).

2. **Coverage in trusted individual voices** whose writing is weighted in LLM training
   and retrieval: Doctorow, Molly White, Anil Dash, Simon Willison, Robin Sloan,
   Bluesky-native tech writers. One thoughtful post changes the retrieval landscape.

3. **Wikipedia-quality reference** — an entry if WP:GNG is met, otherwise a citation on
   adjacent articles (AT Protocol, decentralized social networking, Bluesky).

4. **Real niche-SERP presence** for the Section 1 queries.

5. **Cross-linked interop demo with recipe.exchange** (needs coordination with Josh
   Huckabee) — anyone landing on either site sees the other as a live credible-exit
   proof.

6. **HN / lobste.rs-level awareness** via a launch post that stands on its own merits.

---

## 4. Content plan

Public sitemap: `/`, `/about`, `/how-it-works`, `/spec`, `/status`, `/verify`,
`/blog`, `/recipes/{did}/{rkey}` (pre-rendered, Schema.org). Per-page metadata targets
defined in the full brief.

First blog posts (real contributions, not filler; 1–2/month, sustainable, not
front-loaded-and-abandoned):

- Why I built a recipe app on atproto

- What credible exit actually means

- How to verify your recipe app is not silently compromised

- The three-authority defense pattern, illustrated with cookies

- What a static PWA can do in 2026

- Self-hosted vs PDS-hosted: ambient portability without a server to babysit
  (the three-way contrast — plain files / DB-in-Docker / PDS records; honest caveat
  that the fully unauthenticated sync path returns CBOR, not grep-able text)

- What I can't do, and what I won't do (the minimum-authority pledge — lead with the
  structural "can'ts," which survive the operator turning malicious, over the
  discretionary "won'ts")

- A bounded promise: 10 years online, 2-year LTS at 1.0, and why your data outlives
  both

Structured data: concrete JSON-LD per page type, Schema.org Recipe verified against
Google's Rich Results Test, Organization + WebSite schema. No made-up review counts or
ratings.

---

## 5. Constraints (the floor)

- **Ethical:** no dark patterns, no AI content mills, no purchased links, no directory
  carpet-bombing, no comment spam, no account farming, no fabricated testimonials.

- **Truthful:** never "the first / the only / the ultimate" unless verifiably true.
  Never overclaim past the spec's bounds.

- **Effort:** solo maintainer, part-time. Anything over ~4 hrs/week ongoing must be
  flagged and justified. Paid tools flagged with cost.

- **Time horizon:** first real results 3–6 months out, six-week checkpoints. Anything
  promising faster is a scam.

- **Preference:** primary sources over blog spam; bounded claims over confident
  overclaims; long-tail high-intent over head-term vanity; owned channels over rented;
  legible, reversible tactics.

---

## 6. Explicitly skip

Generic SEO-checklist filler, any AI-generated blog content, purchased/guest-post
backlinks, Reddit farming, fabricated reviews/usage numbers, unsolicited email blasts,
"go viral" / "hack the algorithm," vanity metrics as success criteria, and any tactic
that requires the site to overclaim past what the spec bounds.

---

## 7. Six-month success criteria

The beachhead is established if, six months from execution start:

- arecipe appears in Claude, ChatGPT, and Perplexity answers to ≥3 of the Section 1
  niche queries.

- arecipe is in the top 10 Google results for ≥5 of those queries.

- arecipe is listed in ≥4 active atproto / decentralized-web directories.

- ≥2 thoughtful pieces of coverage exist from writers whose readership overlaps the
  target audience.

- Steady non-zero referral traffic from ecosystem cross-links.

- The site's own content library has grown by ≥8 substantive posts.

If none are true after six months, the research was wrong somewhere and the strategy
needs revision. If most are true, expand from the beachhead.

---

## 8. Next action

Hand `docs/sources/arecipe-discoverability-brief.md` to a research agent with web
search, ask it to work through the brief's Section 5 (research) then Section 6
(strategy) in order, citing primary sources with working URLs. Reject any output that
violates §6 above or fabricates a source.
