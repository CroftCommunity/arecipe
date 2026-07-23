# wikibooks-cookbook-sync (`wbsync`)

A local CLI that pulls the **en.wikibooks Cookbook** recipe corpus into a
structured local representation, computes intelligent deltas across long gaps,
and publishes the result into a PDS as arecipe-consumable
`exchange.recipe.recipe` records.

Target cadence: run now, run again in six months, and have the second run do the
minimum correct work. `wbsync run` with nothing changed upstream makes ~80 wiki
requests, **zero** fetches, **zero** transforms, and **zero** PDS writes.

## Where it lives (owner decision O1)

Inside arecipe at `tools/wikibooks/`, as a **self-contained subproject with zero
runtime dependencies** — Node builtins only (`node:sqlite`, `node:crypto`,
`fetch`, plain-HTTP XRPC to the PDS). No atproto SDK, no wikitext library, no
native SQLite binding enters any dependency graph. `tests/o1-isolation.test.ts`
enforces that every import is a `node:` builtin or resolves inside this
directory, that the tool declares no runtime deps, and that `scripts/build.mjs`
never references `tools/` (so the arecipe bundle is byte-identical whether or not
the tool exists).

## Three hard-separated stages

```
fetch     ──► raw/          wikitext + metadata, exactly as retrieved (never mutated)
transform ──► ir/           normalized recipe IR, a PURE function of raw/ (no network, no clock)
publish   ──► PDS           records + delta application (dry-run by default)
```

A parser improvement re-runs against `raw/` with **zero** wiki traffic
(`wbsync transform --reparse`). A publish retry never re-transforms.

## Requirements

- **Node 20+** (developed on 22.22; uses `node:sqlite` and native TypeScript
  execution via type-stripping — no build step).
- A **contact string** for the User-Agent. There is no default; the tool refuses
  to start without it. Set `WIKIBOOKS_CONTACT` to an email or URL.

## Configuration (environment)

| Variable | Required for | Meaning |
|---|---|---|
| `WIKIBOOKS_CONTACT` | everything | Contact embedded in the User-Agent. No default. |
| `WIKIBOOKS_API_BASE` | — | Action API endpoint (default en.wikibooks). |
| `WIKIBOOKS_LICENSE_ID` / `_TOKEN` / `_ATTRIBUTION` | publish | Licence on every record (O2). Defaults to CC BY-SA 4.0. |
| `WIKIBOOKS_PUBLISH_HANDLE` / `_SERVICE` / `_APP_PASSWORD` | publish | Publish account (O4: `cookbook.arecipe.app`). Absent → publish refused. |
| `WIKIBOOKS_DISHKEY_MAP` | — | Path to the approved `{approved:{rkey→dishKey}}` map (D14). Stamps `dishKey` so versions of one dish group in arecipe. Built offline in `spike/wikibooks-dishkeys/`; absent → no dishKeys. |
| `WIKIBOOKS_LIVE=1` | — | Enables the single live smoke test (D12), skipped by default. |

### Metadata enrichment (D15)

Beyond text/provenance, records carry controlled-vocabulary metadata derived
from the source (see `MAPPING.md` + `src/transform/enrich-*.ts`):
`suitableForDiet[]` (from dietary categories → defs `diet*` refs),
`recipeCategory`/`recipeCuisine` (bare-lowercase `category*`/`cuisine*` tokens;
unmapped values fall through to `keywords`), `keywords[]`, `nutrition.calories`
(from infobox energy), and `cookingMethod` (inferred, precision-first). All are
pure, deterministic, and omitted when the source doesn't support them.

## Commands (D13)

```
wbsync discover                  # enumerate category + revision sweep, write the delta plan
wbsync fetch                     # fetch new and changed pages only
wbsync transform [--reparse]     # network-free; --reparse walks the local-change axis alone
wbsync plan                      # ledger diff -> plan.json, no writes
wbsync publish --publish         # apply the plan (refused unless a plan exists this run)
wbsync run [--publish]           # all of the above; DRY by default
wbsync status                    # ledger counts, last run, drift summary
```

## Test & typecheck

```
npm run typecheck    # tsc --noEmit (strict, erasableSyntaxOnly)
npm run test         # node --test over tests/**/*.test.ts — NO network
npm run test:live    # WIKIBOOKS_LIVE=1 — the one live smoke test (D12)
```

The suite makes **no network requests** except the `WIKIBOOKS_LIVE`-gated smoke
test, which is skipped by default. Every other test drives a fake transport / fake
PDS and a fake clock.

See `STAND-INS.md` for the register of everything faked, stubbed, or approximated.
