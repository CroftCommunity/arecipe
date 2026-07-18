# Agents page — llms.txt + an agent-facing guide to extracting recipes properly

**Status:** ✅ **Implemented 2026-07-18.** TDD-first (red → green: converter
specs and content guards failed on the missing module, then on the DRAFT
skeletons, then went green on the real content). Gate green: lint · typecheck
(both tsconfigs) · 634 unit (32 new: converter + content guards) · build ·
198 hermetic e2e (7 new: endpoints, footer link, mobile-fit on agents.html).
Shipped: `/llms.txt` + `/agents.md` (committed at repo root, allowlist-copied
into dist) + `/agents.html` (generated at build time by
`scripts/md-to-html.mjs`), footer "For AI agents" link (testid `agents-link`)
via `mountBuildStamp`, README row. Content lints are permanent gate tests:
claim-phrase guard, Part A citation-link rule, llms.txt format + anchor
integrity, md↔html parity, no-DRAFT.

**[verify-in-run] recorded — served `.md` content-type:** GitHub Pages serves
`.md` as `text/markdown; charset=utf-8` (probed live against a
`pages-themes.github.io` `.md` on 2026-07-18; this repo deploys with
`.nojekyll`, so `agents.md` ships raw, not Jekyll-rendered). Acceptable per
the llms.txt convention (text/markdown or text/plain).

**Quote verification (D4) — 100% of shipped quotes, verified verbatim against
the fetched primary source during this run:** Circular 33 (copyright.gov PDF,
rev. 03/2021): the seven quoted phrases in Part A §"The U.S. Copyright
Office" (mere-listing sentence, cannot-register sentence, creatively-explains
sentence, "written description or explanation of a process", no-copyrightable
-authorship phrase, "to the text and photographs only", dressing-refusal
sentence) — all verified against the PDF. 17 U.S.C. §102(b): full-text quote
verified against uscode.house.gov. Publications Int'l v. Meredith (Harvard
PDF of 88 F.3d 473): statement-of-facts sentence, "fall squarely within the
class of subject matter specifically excluded from copyright protection",
no-per-se-opinion sentence, "more than simply the directions for producing a
certain dish", "musings about the spiritual nature of cooking" — all
verified. Feist (Cornell LII text of 499 U.S. 340): "the sine qua non of
copyright is originality", facts-not-original sentence, "in no event may
copyright extend to the facts themselves" (LII reads "may copyright extend",
singular — the Harvard Meredith PDF's rendering "copyrights" is that PDF's
own typo) — verified. Tomaydo-Tomahhdo v. Vozary (Sixth Circuit's own
opinion PDF, 15a0705n.06): "the list of ingredients is merely a factual
statement", "a recipe's instructions, as functional directions, are
statutorily excluded from copyright protection" — verified. **Lambing v.
Godiva** (142 F.3d 434, unpublished table decision): no freely linkable
primary text found → NOT quoted, cited through the Tomaydo opinion, exactly
per the D4 fallback. **Harrell v. St. John** dropped from further reading for
the same reason (no linkable primary source; the posture demands primary
links).

Publish an agent-consumable guide on arecipe.app: `/llms.txt` (discovery
index per the llms.txt convention), `/agents.md` (canonical guide, Markdown),
`/agents.html` (human-readable mirror generated at build time). The guide
covers how AI agents can extract, normalize, attribute, and share recipes
properly — including what the primary legal sources say about recipe
copyright — and how to read arecipe's data the way the protocol intends
(public atproto records, not scraped HTML).

**The governing posture (owner ruling): we make no legal claims and only cite
sources, plain and simple.** Every legal statement on the page is a quotation
from or tight attributed paraphrase of a NAMED source. arecipe's own voice
appears only in technical best practices and in describing its own protocol
surface. arecipe never asserts a legal conclusion, never advises, and never
licenses anything on its users' behalf — recipes belong to their authors; the
page DESCRIBES what the protocol makes public and what the sources say.

**Publication gate:** the complete final copy of every shipped document goes
verbatim into the run summary; merging the PR is publishing — the owner reads
before merge.

## llms.txt status honesty (for the record, not the page)

llms.txt is a community convention (proposed by Jeremy Howard, Answer.AI,
September 2024; spec at llmstxt.org), not a standards-body artifact. Adopted
by Anthropic, Stripe, Cloudflare, Vercel and roughly 10% of sites; major LLM
crawlers largely do not fetch it — the real consumers are agentic browsers,
IDE agents, and MCP integrations; Chrome Lighthouse's "Agentic Browsing"
category audits for its presence. robots.txt is a different layer (access,
not comprehension) and this run does not touch it.

## Phase 0 — re-grounding findings (verified against `main` @ 37026bc)

The run spec's grounded context drifted from the tree in two places that
change what Part B may claim:

- **F1 — there is NO shopping-list normalization module.** The spec's
  "practice-what-we-publish symmetry" names a shipped shopping-list
  normalization grammar (unit synonym table, unicode fractions, ranges,
  conservative name folding). No such module exists anywhere in the repo —
  `shopping`/synonym/fraction greps come up empty in `src/`. **Adapt:** Part B
  describes only practices the repo performs; the normalization-grammar
  section is DROPPED (nothing to mirror). If a shopping-list feature ships
  later, the page can grow that section then.
- **F2 — the JSON-LD importer is spike ops tooling, and its ladder is
  narrower than the spec claims.** `spike/import/extract-jsonld.mjs`
  (NON-PRODUCTION, lint/typecheck-ignored, unit-tested via `node --test`)
  is the extractor. Its real tolerances: first `@type: Recipe` node found by
  walking any JSON-LD shape (incl. `@graph`, type arrays); `recipeIngredient`
  as a string array; `recipeInstructions` walked across the shape zoo —
  plain string, arrays, HowToStep (`text` ?? `name`), HowToSection
  (`itemListElement` recursion); `recipeYield` string/number/array; ISO-8601
  time strings. There is **no legacy `ingredients`-key fallback** — that
  claim is drift and does not go on the page. The extractor deliberately
  does NOT take the source's `description` prose (expressive text; authored
  fresh downstream) — this is the strongest practice-what-we-publish line
  and Part B says it. **Adapt:** Part B describes this actual ladder and
  practice, attributed to what our own import tooling does.
- **F3 — no mechanized banned-phrase guard exists yet as precedent.** The
  house "banned" precedent is a copy rule in `docs/DESIGN.md` ("Verified" is
  banned from primary UI copy), enforced by review, not a committed lint
  test. The D3 claim-phrase guard is therefore the first mechanized one; it
  follows the committed-guard pattern of `tests/unit/icons.spec.ts` (the
  contrast guard: a unit test that parses committed artifacts and asserts).
- Confirmed seams: `scripts/build.mjs` allowlist-copies root statics
  (`client-metadata.json`, `CNAME`, `manifest.webmanifest`; `friends.html` /
  `calendar-setup.html` show the static-page + CSP-injection pattern —
  calendar-setup is the exact precedent for a JS-less page using the hashed
  stylesheet + SRI + CSP). Footer seam: `src/build-stamp.ts#mountBuildStamp`
  renders the site-wide footer on every page (stamp + colophon) — the "For
  AI agents" link lands there. `docs/LEXICONS.md` is current and rich; Part C
  draws from it and `src/recipes/read.ts` (required fields: `name`, `text`,
  `ingredients[]`, `instructions[]`, `createdAt`, `updatedAt`; open-world
  tolerance for the rest) and `src/identity/resolve.ts` (handle → DID via
  `com.atproto.identity.resolveHandle`; DID doc via plc.directory /
  did:web well-known; PDS from the `#atproto_pds` service entry).
- Toolchain: Node 22 (local + CI) — no native TS execution for build
  tooling, so the md→html converter is a plain `.mjs` module beside
  `build.mjs` with a hand-written `.d.mts` declaration so typechecked vitest
  specs can import it. `scripts/` is linted (only `spike/`, `tools/`, etc.
  are eslint-ignored).

## Locked design

- **D1 Endpoints.** `/llms.txt` spec-shaped: `# arecipe` H1, blockquote
  summary, short guidance paragraph pointing agents at agents.md, then H2
  sections of `- [Title](URL): description` links (agents.md, the
  data-access anchor, docs/LEXICONS.md, reading-order basics); absolute
  HTTPS URLs. `/agents.md` is CANONICAL; `/agents.html` generated from it at
  build time by `scripts/md-to-html.mjs` — a minimal, unit-tested converter
  for exactly the Markdown subset the doc uses; no runtime parser, no new
  dependency. Site chrome + site-wide footer link "For AI agents". A parity
  test asserts every content sentence of agents.md appears in agents.html.
- **D2 Voice separation (the ruling, mechanized).** agents.md has four
  parts. **Part A — What the sources say:** legal content ONLY as quotation
  or attributed paraphrase; every paragraph names and links its source
  inline; no sentence in arecipe's voice draws a legal conclusion. **Part B —
  Best practices for extraction** (our technical voice): prefer structured
  data (schema.org/Recipe JSON-LD, the tolerant ladder per F2); extract the
  data; re-express instructions in your own functional language; take no
  headnotes, stories, or photographs; attribute (name, author, link);
  respect robots.txt and rate limits; cache courteously. **Part C — Reading
  arecipe the right way:** public atproto records, worked examples (resolve
  handle → DID → PDS, `listRecords?collection=exchange.recipe.recipe`,
  `getRecord`), lexicon pointers, recipes belong to their authors and
  arecipe grants nothing on their behalf, courtesy note on request volume.
  **Part D — Plain notice:** informational only, not legal advice; all cited
  sources are US; links go to primary sources; verify anything that matters
  with counsel. Short, unhedged, once.
- **D3 Claim-phrase guard.** A committed unit lint greps agents.md + the
  generated agents.html for assertive legal-claim phrasings in our voice —
  at minimum: "is legal", "it is legal", "you may legally", "legally safe",
  "we guarantee", "you cannot be sued", "no risk", "fair use allows" — list
  committed, extended as near-misses surface. Structural lint: every Part A
  paragraph contains at least one source link.
- **D4 Quote verification.** Every quotation fetched and verified verbatim
  (whitespace-tolerant) against its primary source during this run; each
  verification recorded in the run summary. Unreachable source → cite
  without quoting. No secondary-source quotes presented as primary.
- **D5 Discoverability.** Footer "For AI agents" link (testid `agents-link`)
  → agents.html; README one-liner; llms.txt at root. No robots.txt changes,
  no sitemap, no meta-tag games.
- **D6 Deferred (verbatim from the run spec):** agent-permissions.json
  (still a research proposal); skill.md; non-US legal sections;
  translations; an arecipe MCP server (the natural successor to Part C);
  marking individual recipe pages with machine-readable pointers back to
  agents.md.

## The citation set (Part A raw material)

- US Copyright Office, Circular 33, "Works Not Protected by Copyright" —
  https://www.copyright.gov/circs/circ33.pdf ("no copyrightable authorship
  in a mere listing of ingredients"; the dressing-recipe refusal example;
  the cookbook registration limited to "the text and photographs").
- 17 U.S.C. §102(b) — statutory exclusion of ideas, procedures, processes
  (uscode.house.gov).
- Publications Int'l, Ltd. v. Meredith Corp., 88 F.3d 473 (7th Cir. 1996) —
  https://cyber.harvard.edu/people/tfisher/IP/1996Publications.pdf.
- Lambing v. Godiva Chocolatier, 142 F.3d 434 (6th Cir. 1998)
  (unpublished) — locate a linkable copy in Phase 2; if unreachable,
  attribute via a citing court document rather than quoting.
- Feist Publications v. Rural Telephone, 499 U.S. 340 (1991).
- Further reading: Harrell v. St. John, 792 F. Supp. 2d 933 (S.D. Miss.
  2011); Tomaydo-Tomahhdo v. Vozary, 629 F. App'x 658 (6th Cir. 2015).

All sources are US; the page says so plainly.

## Phases

- **Phase 1 — plumbing + guards (red first).** RED: e2e dist presence for
  the three endpoints; llms.txt format lint (H1 first, blockquote, absolute
  HTTPS links, sections parse); D3 claim-phrase guard; Part A citation-link
  lint; converter unit specs; parity test. GREEN: allowlist rows, converter,
  skeleton files passing structure lints with content clearly marked DRAFT.
- **Phase 2 — content.** Draft agents.md per D2 in full; fetch and verify
  every quote per D4; replace placeholders; all lints green on REAL content;
  Part B cross-checked against the shipped tooling (F2).
- **Phase 3 — mirror + link.** agents.html generation in the build; footer
  link (`agents-link`); e2e: endpoints reachable with sane content, footer
  link navigates, mobile-fit on agents.html.
- **Phase 4 — closeout.** [verify-in-run] the served .md content-type
  (record the answer; text/markdown and text/plain both acceptable). Plan
  Status; README line; run summary with the full verbatim shipped copy of
  llms.txt AND agents.md, the quote-verification table, the final
  banned-phrase list, and the explicit MERGE = PUBLICATION line.

## Acceptance criteria

1. `/llms.txt`, `/agents.md`, `/agents.html` ship in dist, spec-shaped;
   html mirror passes parity with the canonical md.
2. Every legal statement is a verified quotation or attributed paraphrase
   with an inline primary-source link; the summary's quote table covers
   100% of quotes.
3. Claim-phrase guard + citation-link lint are permanent gate tests passing
   on real content; no legal conclusion in arecipe's voice anywhere.
4. Part B matches what the repo's import tooling actually does; Part C's
   worked atproto examples are correct against the live protocol surface.
5. The page describes and never licenses: user recipes belong to their
   authors; no rights granted on their behalf.
6. Footer link + README line ship; robots.txt and sitemap untouched; gate
   green throughout; full copy in the run summary for the owner's pre-merge
   read.
