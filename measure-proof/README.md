# measure-proof — RUN-MEASURE-01

Scratch **experiment** repo proving out a counter-based, registry-driven
usage-measurement design for PWA/SPA properties. Deliverables are **findings,
goldens, and harnesses** — not a product. Extraction into a real repo is a
later, explicit step and is **not** part of this run.

The run summary (red→green evidence, all tables, the verify-in-run ledger, and
everything the run could not establish) is at the repo root:
**`../RUN-MEASURE-01-SUMMARY.md`**.

## What it is

- **Counters, not logs.** The client increments named counters in local storage
  and flushes an unordered bag of name→count pairs plus a coarse period. No
  ordering, no session key, no fine timestamp leaves the device.
- **One registry, three artifacts.** `registry/metrics.yaml` generates the typed
  client calls, the disclosure-panel data, and the test fixtures. Drift is a
  failing test.
- **Declared edge counters** (`nav_<a>__to__<b>`) carry aggregate flow;
  individual journeys are never held.

## Layout

```
registry/metrics.yaml     the single source of truth (page/feature/timing/edge)
src/registry/             parse + validate + generate (3 artifacts) + expiry lint
src/corpus/               E0 seeded synthetic ground-truth corpus
src/flow/                 E2 edge counting, first-order reconstruction, divergence
src/attack/               E3 naive receiver, mitigations, A1/A2/A3 attacks
src/client/               E4 boundary (local rich vs wire counts), E5 flush/64KiB, E6 runtime expiry
src/rounding/             E8 nearest-ten dead-feature analysis
src/infra/                E7 Litestream PUT arithmetic + restore-invariant model
harness/                  E5 PWA harness (index.html, client.js, sw.js, server.mjs)
generated/                emitted artifacts + panel golden
findings/                 recorded numbers (E2/E3/E5/E7/E8) + fire-drill
tests/unit/               vitest (E0–E8 logic)
tests/e2e/                Playwright (E5 real browser + service worker)
```

## Running

This project takes **no dependencies of its own** — it reuses the arecipe repo
root `node_modules` (vitest, typescript, playwright) and Node's native TypeScript
type-stripping. Run everything from the **arecipe repo root**:

```bash
# unit (E0–E8 logic)
npx vitest run --config measure-proof/vitest.config.ts

# typecheck
( cd measure-proof && npx tsc --noEmit -p tsconfig.json )

# generate the three artifacts from the registry
( cd measure-proof && node --experimental-strip-types src/registry/cli.ts generate )

# registry check (drift / expiry); add --strict-expiry to fail on expired metrics
( cd measure-proof && node --experimental-strip-types src/registry/cli.ts check )

# E5 real-browser harness (points at /opt/pw-browsers Chromium)
( cd measure-proof && npx playwright test --config playwright.config.ts --reporter=line )
```

`measure-proof/` is excluded from the arecipe app's own lint/vitest gate (two
documented lines in the root `eslint.config.js` and `vitest.config.ts`) so the two
never interfere.
