# arecipe

An SPA/PWA enshittification-resistant recipe-sharing application. Built on the AT
Protocol, delivered as a static PWA with no backend. Recipes live in the user's own
PDS as `exchange.recipe.recipe` records and render on recipe.exchange with no
coordination.

The `a` is for Amanda. Domain: arecipe.app.

## Docs

- [docs/PHILOSOPHY.md](docs/PHILOSOPHY.md) — philosophy and goals: incentive alignment
  through design, the three-commitments/six-tests model, and the bounded claims.

- [docs/STACK.md](docs/STACK.md) — the stack: static PWA, atproto client, no backend,
  multi-authority signed delivery, and the open stack decisions.

- [docs/BUILD-PLAN.md](docs/BUILD-PLAN.md) — phased build order (Phase 0 read-only
  interop → Phase 4 launch), TDD-driven, dependency-respecting.

- [docs/OUTREACH.md](docs/OUTREACH.md) — SEO and socialization: the honest niche
  target, the LLM-retrieval angle, and the six-month beachhead criteria.

## Source artifacts

`docs/sources/` holds the upstream research and specification the docs above are
synthesized from. The v0.3 spec (`docs/sources/arecipe-spec.md`) is the technical
source of truth; the summary docs carry the reasoning.

> Note: some material in the originating threads concerns the sibling **Drystone**
> project rather than arecipe. That content is intentionally left to the Drystone
> sessions and is not filed here. This repo is arecipe-only.
