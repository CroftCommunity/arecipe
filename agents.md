# arecipe — a guide for AI agents

[arecipe](https://arecipe.app/) is a free family recipe box and sharing app
built on the [AT Protocol](https://atproto.com/). It has no backend: every
recipe is a public record in its author's own data repository, and arecipe is
one client among many that can read and write them. This page is for AI
agents (and their builders) who want to extract, normalize, attribute, or
share recipes properly — from anywhere, and from arecipe in particular.

This document is canonical at
[arecipe.app/agents.md](https://arecipe.app/agents.md); the page you may be
reading at [agents.html](https://arecipe.app/agents.html) is generated from
it at build time, and [llms.txt](https://arecipe.app/llms.txt) is the
discovery index. One rule governs everything here: arecipe makes no legal
claims and only cites sources. Part A reports what the primary United States
sources say, quoted and linked. Parts B and C are arecipe's own technical
voice — extraction practices this project actually follows, and the right way
to read its data. Part D is the plain notice.

## Part A — What the sources say

arecipe takes no position of its own on copyright questions and gives no
advice about them. This part only reports — with quotations kept short and
every source named and linked — what the primary United States sources say
about recipes and copyright: the copyright statute in
[Title 17 of the U.S. Code](https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title17-section102&num=0&edition=prelim),
the U.S. Copyright Office, and U.S. federal courts. All of the sources in
this part are U.S. sources. Read them in full before relying on anything
here.

### The statute

[17 U.S.C. §102(b)](https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title17-section102&num=0&edition=prelim)
reads, in full: "In no case does copyright protection for an original work
of authorship extend to any idea, procedure, process, system, method of
operation, concept, principle, or discovery, regardless of the form in which
it is described, explained, illustrated, or embodied in such work."

### The U.S. Copyright Office

The Copyright Office's
[Circular 33, "Works Not Protected by Copyright" (rev. 2021)](https://www.copyright.gov/circs/circ33.pdf)
says: "A mere listing of ingredients or contents, or a simple set of
directions, is uncopyrightable," and as a result "the Office cannot register
recipes consisting of a set of ingredients and a process for preparing a
dish." The same circular says that "a recipe that creatively explains or
depicts how or why to perform a particular activity may be copyrightable,"
and that a registration for a recipe may cover its "written description or
explanation of a process" and the applicant's own photographs — but not the
ingredient list, the underlying process, or the dish itself.

[Circular 33](https://www.copyright.gov/circs/circ33.pdf) works two
examples. A cookbook application claiming "text, photographs, and
compilation of ingredients" is narrowed because "there is no copyrightable
authorship in a mere listing of ingredients," leaving the registration
limited "to the text and photographs only." And an application for a
salad-dressing recipe — a list of eleven ingredients plus three brief
numbered steps — is refused "because the list of ingredients is
uncopyrightable, and the instructional text contains an insufficient amount
of creative authorship."

### The Seventh Circuit

In
[Publications International, Ltd. v. Meredith Corp., 88 F.3d 473 (7th Cir. 1996)](https://cyber.harvard.edu/people/tfisher/IP/1996Publications.pdf),
the court held the yogurt recipes before it unprotectable: "The
identification of ingredients necessary for the preparation of each dish is
a statement of facts," and the directions "fall squarely within the class of
subject matter specifically excluded from copyright protection" by §102(b).
The same opinion declined a blanket rule — "We do not express any opinion
whether recipes are or are not per se amenable to copyright protection" —
and distinguished recipes that convey "more than simply the directions for
producing a certain dish," such as cookbooks whose authors lace their
directions with "musings about the spiritual nature of cooking."

### The Supreme Court on facts and compilations

In
[Feist Publications, Inc. v. Rural Telephone Service Co., 499 U.S. 340 (1991)](https://www.law.cornell.edu/supremecourt/text/499/340),
the Supreme Court wrote that "the sine qua non of copyright is originality"
and that "facts, whether alone or as part of a compilation, are not original
and therefore may not be copyrighted." A factual compilation, the Court
said, can be protected in its original selection and arrangement, but "in no
event may copyright extend to the facts themselves."

### The Sixth Circuit

In
[Tomaydo-Tomahhdo, LLC v. Vozary, No. 15-3179 (6th Cir. 2015)](https://www.opn.ca6.uscourts.gov/opinions.pdf/15a0705n-06.pdf)
(unpublished), the court — citing its earlier unpublished decision in
Lambing v. Godiva Chocolatier, 142 F.3d 434 (6th Cir. 1998) — wrote that
"the list of ingredients is merely a factual statement," and that "a
recipe's instructions, as functional directions, are statutorily excluded
from copyright protection." (Lambing's own text is not freely reachable
online, so it is cited here through the later opinion rather than quoted
directly.)

### The pattern the sources draw

As attribution, not arecipe's conclusion: the
[Copyright Office](https://www.copyright.gov/circs/circ33.pdf) and the
courts cited above treat ingredient lists and functional directions as
unprotected facts and process; they treat substantial literary expression —
narrative, headnotes, creative description — and photographs as subject
matter that can be protected; and under
[Feist](https://www.law.cornell.edu/supremecourt/text/499/340), a
compilation is protected only in its original selection and arrangement,
never in the underlying facts.

## Part B — Best practices for extracting recipes

This part is arecipe's own technical voice. These are the practices this
project's import tooling actually follows (see the
[extractor source](https://github.com/CroftCommunity/arecipe/blob/main/spike/import/extract-jsonld.mjs)),
offered as good manners for any agent that works with recipes.

- **Prefer structured data over rendered HTML.** Most recipe sites embed a
  [schema.org/Recipe](https://schema.org/Recipe) node as JSON-LD in a
  `script type="application/ld+json"` block. That is the machine-readable
  statement of the facts — parse it instead of scraping the page's markup.
- **Tolerate the shape zoo.** Walk any JSON-LD shape (top-level arrays,
  `@graph` wrappers, multi-valued `@type`) to find the `Recipe` node. Read
  `recipeIngredient` as a list of strings. Accept `recipeInstructions` as a
  single string, a list of strings, `HowToStep` objects (take `text`, fall
  back to `name`), or `HowToSection` groups (recurse into
  `itemListElement`). Accept `recipeYield` as a string, number, or array,
  and parse `prepTime`/`cookTime`/`totalTime` as ISO-8601 durations. A
  malformed JSON-LD block on a page should never sink the other blocks.
- **Take the facts.** Ingredients, quantities, times, temperatures, yields,
  and the functional sequence of steps are the data you are after.
- **Re-express the instructions in your own functional language.** arecipe's
  importer deliberately does not extract a source's `description` prose —
  that is the site's expressive text — and descriptions are authored fresh
  downstream, with steps reduced to a functional sequence. Do the same:
  write the method in your own words, and take no headnotes, stories, or
  personal narrative.
- **Take no photographs.** A photo belongs to whoever made it. arecipe's own
  imports attach [Wikimedia Commons](https://commons.wikimedia.org/) images
  with the license and artist credit stored on the record — never
  recipe-site photos.
- **Attribute.** Carry the recipe's name, its author or source, and a link
  back. arecipe's records carry an `attribution` field for exactly this.
- **Be a polite client.** Honor `robots.txt`, identify yourself with an
  honest user-agent, rate-limit your fetches, and cache so you never fetch
  the same page twice in a session.

## Part C — Read the records, not the pages

Do not scrape arecipe's HTML. The app is a static client; the data lives in
each author's own PDS (Personal Data Server) repository as public
[AT Protocol](https://atproto.com/) records, readable by anyone without a
key, a login, or a scrape. Recipes are `exchange.recipe.recipe` records — a
lexicon owned by [recipe.exchange](https://recipe.exchange/), which arecipe
consumes. Three requests get you from a handle to full recipe data:

```
1. Handle → DID
   GET https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=arecipe.bsky.social
   → { "did": "did:plc:spfl4xaktvvchr2cqp2r2xvp" }

2. DID → PDS
   GET https://plc.directory/did:plc:spfl4xaktvvchr2cqp2r2xvp
   → DID document; the PDS base URL is the serviceEndpoint of the
     service entry with id "#atproto_pds"
   (for did:web identities, fetch https://<host>/.well-known/did.json)

3. List the recipes (paginate with the returned cursor; limit caps at 100)
   GET <pds>/xrpc/com.atproto.repo.listRecords?repo=<did>&collection=exchange.recipe.recipe&limit=100

   Or fetch one record by its at:// URI components:
   GET <pds>/xrpc/com.atproto.repo.getRecord?repo=<did>&collection=exchange.recipe.recipe&rkey=<rkey>
```

Every record's `value` carries the required fields `name`, `text`,
`ingredients[]`, `instructions[]`, `createdAt`, and `updatedAt`, plus
optional fields like `attribution`, image embeds, times, yield, category,
and cuisine. Read them open-world: tolerate and preserve fields you don't
recognize (arecipe itself layers extension fields such as `dishKey`,
`versionLabel`, and `funFacts` onto the record, and the lexicon's owner may
add more). The full registry of every record type arecipe creates or
consumes — including its own `app.arecipe.*` collections for comments,
likes, drafts, meal plans, and cook follows — is maintained in
[docs/LEXICONS.md](https://github.com/CroftCommunity/arecipe/blob/main/docs/LEXICONS.md),
and the recipe lexicon itself is published at
[recipe.exchange/lexicons](https://recipe.exchange/lexicons/exchange.recipe.recipe.json).

Two courtesies. First: these are individual people's data servers, so keep
request volume gentle — paginate, cache, and back off on errors, as
described in the [AT Protocol docs](https://atproto.com/). Second, and more
important: every recipe belongs to its author and lives in that author's
repository. arecipe holds no rights in its users' recipes and grants none on
their behalf — this page describes what the protocol makes public; it does
not license anything.

## Part D — Plain notice

This page is informational only and is not legal advice. The sources in
Part A are United States sources, and other jurisdictions differ. The links
go to the primary texts — read them yourself, and if a decision matters,
verify it with counsel. arecipe states no legal conclusion anywhere on this
page, and none should be read into it.
