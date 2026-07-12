# arecipe

An SPA/PWA enshittification-resistant recipe-sharing application. Built on the AT
Protocol, delivered as a static PWA with no backend. Recipes live in the user's own
PDS as `exchange.recipe.recipe` records and render on recipe.exchange with no
coordination.

The `a` is for Amanda. Domain: arecipe.app.

## Building / development

Vanilla TypeScript (strict) + esbuild; no framework. Tests: Vitest (unit) +
Playwright (e2e against the built bundle).

```sh
npm install                 # dev dependencies
npx playwright install chromium   # once, for the e2e browser

npm test                    # the full hermetic gate: lint + typecheck +
                            # unit + build + e2e (what CI runs on push)
npm run build               # static bundle -> dist/
npm run serve               # serve dist/ at http://127.0.0.1:4173
```

Two test tiers: the **hermetic** tier above needs no credentials or network
beyond localhost and runs in CI on every push. The **`@live`** tier (real-PDS
suites, arriving with the auth phase) needs the out-of-band test-account
credential in a gitignored `.env` and runs locally as a phase gate — never in
push CI.

### Meal-plan calendar feed (`.ics`)

A subscribable iCalendar feed publishes a configured account's meal plans to
Google Calendar (or any calendar app) as one continuously-extending calendar.
Because the app is backendless, the feed can't be served by client JS (Google
fetches server-side, runs no JS) or by the PDS (returns JSON), so it is produced
by a **scheduled GitHub Action** (`.github/workflows/ics-feed.yml`, daily) that
reads the public PDS and commits `calendars/<did>.ics` into the deployed output
**only on diff** — no always-on backend, and **no credentials** (the meal-plan
data is public).

```sh
npm run build:ics           # generate calendars/<did>.ics for each configured DID
```

- **Allowlist:** `config/ics-feeds.json` (per-DID; start with one). The Action
  reads the same file; the meals.html "Add to Google Calendar" control appears
  only for a DID on it. Arbitrary any-user on-demand subscribe is **out of scope**
  (it needs an always-on edge function, which breaks the backendless posture) —
  noted as a future option, not built.
- **Anti-drift invariant:** feed dates are produced by the **same**
  `deriveDatedSlots` derivation the planner renders with
  (`src/recipes/meal-plan-calendar.ts`), so the calendar and the app cannot
  diverge. A test asserts feed dates equal app-rendered dates.
- **Reproducible:** `DTSTAMP` comes from each record's `updatedAt` (never
  wall-clock), so an unchanged run writes byte-identical files and the Action
  commits nothing.
- **Content type:** the feed must serve as `text/calendar`. GitHub Pages' default
  `.ics` MIME is **verified after deploy** (`docs/PRACTICES.md` deploy-proof
  discipline), not assumed.
- This job is network-touching and deliberately **outside** the hermetic push-CI
  gate (`ci.yml`). Details: `plans/2026-07-12-1-plan-ics-meal-plan-feed.md`.

Page-per-destination (no router): each top-level surface is its own document —
`index.html` (Browse), `cookbook.html` (Cookbook — your own recipes plus a
bounded reach: starter cooks + who you follow/your followers on Bluesky, and
their recipes; `?did=<did>` is a shareable public view of anyone's cookbook.
The legacy `friends.html` redirects here), `mine.html` (Alchemy — your drafting
workspace; account-free; no longer hosts the login form), `meals.html` (Meals —
a weekly meal planner: assign recipes to days, repeat weeks onto a calendar),
`signin.html` (the dedicated
sign-in page — atproto OAuth, forwards to Cookbook on success),
`settings.html`, plus `recipe.html`, `dish.html` (compare a dish's alternative
versions side by side — the recipe page's "View All"), and `editor.html`.

Diagnostic logging: append `?debug=1` (or set any `localStorage` `debug`
entry) to see `[arecipe]` debug/info console logs; production stays quiet
except warn/error.

The executable build plan lives at
[plans/2026-07-07-1-plan-build-execution.md](plans/2026-07-07-1-plan-build-execution.md).

## Docs

- [docs/SECURITY.md](docs/SECURITY.md) — security posture: the backendless
  atproto trust model, DPoP-bound credentials and library-owned storage, and the
  CSP/SRI/zero-third-party XSS defense.

- [docs/PHILOSOPHY.md](docs/PHILOSOPHY.md) — philosophy and goals: incentive alignment
  through design, the three-commitments/six-tests model, and the bounded claims.

- [docs/STACK.md](docs/STACK.md) — the stack: static PWA, atproto client, no backend,
  multi-authority signed delivery, and the open stack decisions.

- [docs/BUILD-PLAN.md](docs/BUILD-PLAN.md) — phased build order (Phase 0 read-only
  interop → Phase 4 launch), TDD-driven, dependency-respecting.

- [docs/PRACTICES.md](docs/PRACTICES.md) — development practices proven in this
  repo (deploy verification, test tiers, guarded writes, fixture discipline);
  successor to the peadoubleueh lessons docs.

- [docs/OUTREACH.md](docs/OUTREACH.md) — SEO and socialization: the honest niche
  target, the LLM-retrieval angle, and the six-month beachhead criteria.

## Source artifacts

`docs/sources/` holds the upstream research and specification the docs above are
synthesized from. The v0.3 spec (`docs/sources/arecipe-spec.md`) is the technical
source of truth; the summary docs carry the reasoning.

> Note: some material in the originating threads concerns the sibling **Drystone**
> project rather than arecipe. That content is intentionally left to the Drystone
> sessions and is not filed here. This repo is arecipe-only.
