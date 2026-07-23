# RUN-MEASURE-01 — run summary

**Counter-based, registry-driven usage measurement: proof-out experiments.**
Date: 2026-07-23 · branch `claude/measurement-kit-proof-out-dqsmdc` ·
scratch repo `measure-proof/` (findings, goldens, harnesses — **not** a product
build; extraction is a later, explicit step).

Gate as run: **48 unit tests (vitest) + 4 e2e (Playwright, real Chromium) all
green; measure-proof typecheck clean.** The arecipe app's own gate is untouched
(root lint clean, typecheck clean, 961 app unit tests still pass) — `measure-proof/`
is excluded via two documented lines in the root `eslint.config.js` and
`vitest.config.ts`.

> Everything below is reproducible from the seeded corpus (`seed 42`). Raw numbers
> are pinned under `measure-proof/findings/*.json`.

---

## Red→green evidence per phase

TDD, red first, was honoured for all model/logic phases. Each phase's test file
was written and observed **red** (import error or failing assertion) before the
implementation made it **green**. The honest carve-outs where test-first was not
applicable are called out explicitly.

| Phase | First red observed | Green |
|---|---|---|
| **E0** corpus | `Cannot find module '../../src/corpus/generate.ts'` | 7/7 `e0-corpus.test.ts` |
| **E1** registry | module-missing red on `src/registry/index.ts` | 9/9 `e1-registry.test.ts` (incl. 3 named invariants) |
| **E2** flow | module-missing red on `flow/edges.ts`, `flow/reconstruct.ts` | 4/4 `e2-flow.test.ts` |
| **E3** re-linkage | module-missing red on `attack/*` | 6/6 `e3-relinkage.test.ts` |
| **E4** boundary | module-missing red on `client/store.ts` | 5/5 `e4-boundary.test.ts` |
| **E5** lifecycle (unit) | module-missing red on `client/flush.ts` | 4/4 `e5-lifecycle.test.ts` |
| **E6** expiry | module-missing red on `client/counters.ts` | 3/3 `e6-expires.test.ts` |
| **E7** infra | module-missing red on `infra/put-math.ts` | 6/6 `e7-infra.test.ts` |
| **E8** rounding | module-missing red on `rounding/round.ts` | 4/4 `e8-rounding.test.ts` |

Two mid-run reds that were genuine bugs (not just missing modules), fixed to
green, worth recording:
- **E0**: `nextPage` read `.page` from a `{from,to}` transition record → `TIMINGS[page]
  is not iterable`. Fixed to `.to`.
- **E7**: my first test asserted "daily cadence never crosses 1M" — **wrong**; at a
  1 s sync the interval ceiling (2.59M) is over budget, so daily *does* cross, at
  ~33 k sites. The code was right; the test's assumption was the bug. Corrected to
  the real finding.

**Where test-first was NOT honest (declared):**
- **E5 landing rates** are exploratory *measurement*, not a pinned assertion. The
  harness was built, then the rate observed; the spec asserts only that beacons
  demonstrably land, because the point is to record the rate, not fix it. The
  **no-unload-listeners** invariant and the **64 KiB** behaviour *were* test-first
  (unit).
- **E7 fire-drill** against live infra is a **paper drill**; only the logical
  restore *invariant* was test-first.
- The findings-producing scripts (E2/E3/E7/E8 tables) are measurement runs over
  functions that were themselves built test-first.

---

## Declared stand-ins

Anything simulated rather than real, and what a live version would change:

| Stand-in | What it fakes | A live version would… |
|---|---|---|
| Synthetic corpus (E0) | real user traffic | use owner-supplied sessions; transition probabilities and feature rates would differ |
| Profile ranges: small 100–1000, medium 40k–60k / month | real monthly volumes | be set from the pilot site's analytics |
| Sitemap transition model | real arecipe flow | be measured, not assumed |
| Hand-rolled YAML **subset** parser | a spec-complete YAML lib (no external deps taken) | swap in a real YAML parser; the registry is authored to the subset |
| Dead-feature set (E8: `feat_print`, …) | declared-but-unused counters | be the owner's real "is anyone using this?" set |
| Synthetic `visibilitychange`/`pagehide` (E5) | real OS backgrounding | fire from real app/tab backgrounding, esp. iOS PWA |
| localStorage counter store, no eviction (E5) | durable device storage under pressure | face real iOS eviction; IndexedDB vs localStorage choice would be re-tested |
| Receiver + Litestream + R2 + systemd (E7) | real infra | run the real destroy/restore against R2; only the restore *invariant* is executed here |
| `today` injected into client & lint | the device wall clock | read the real clock |

---

## E2 — do edge counters recover flow?

**Claim (recovery) and counter-claim (a first-order matrix cannot distinguish path
populations) both tested.** Divergence = total-variation distance between the true
distribution of length-L journeys and the first-order (bigram) reconstruction,
conditioned on L so the independent length-draw cancels and only *flow* fidelity
is measured.

**Divergence by path length** (`findings/e2-flow.json`):

| Profile | len 2 (paths / TVD) | len 3 | len 4+ |
|---|---|---|---|
| small (641 sess) | 25 / **0.092** | 66 / **0.177** | 161 / **0.389** |
| medium (52 022 sess) | 26 / **0.014** | 121 / **0.034** | 4 317 / **0.164** |

**Reading it honestly:** divergence grows with path length **but falls sharply
with more data at every length** (small→medium). If the growth were first-order
*model mismatch*, more data would not help. It does — so the degradation here is
**sampling sparsity** (long paths are rare), not a failure of first-order recovery.
Caveat, stated plainly: the E0 generator **is** first-order Markov, so it cannot
exhibit model-mismatch degradation; the lossy mechanism is demonstrated directly
by the falsification pair below rather than by the corpus.

**The falsification pair (identical matrix, different journeys):**

```
Population A:  A→B→C ,  D→B→E
Population B:  A→B→E ,  D→B→C
```

Both have the identical first-order edge multiset `{A→B, B→C, D→B, B→E}` (asserted
equal in `e2-flow.test.ts`) yet are genuinely different journeys (A leads to C vs
A leads to E). **The matrix cannot tell them apart — that ambiguity is the privacy
property.** The pair exists, so the matrix does *not* carry more individual
information than the design assumes.

**`other` bucket:** with the 10 declared edges, undeclared transitions are counted
as volume without identity. Conservation holds (`declared + other == all pairs`):
small 770 declared + **507 other** = 1277 (39.7% undeclared); medium 69 468 +
**37 082 other** = 106 550 (34.8%). No undeclared `from->to` pair ever appears as
its own key — asserted.

---

## E3 — adversarial re-linkage (the experiment most likely to fail)

Naive receiver stores each flush with everything the transport hands it: source
IP, receipt timestamp, arrival order; coarse geo derived from IP at ingest. Small
profile, 641 flushes over 233 devices. Scores vs the ground-truth oracle
(`findings/e3-attacks.json`). A1 = pairwise precision/recall of device clustering;
A2 = fraction of adjacent flush pairs correctly ordered (0.5 ≈ chance); A3 =
smallest dimension combo isolating one contributor / how many flushes are isolable
at ≤3 dims.

| Scenario | A1 prec | A1 rec | A1 f1 | A2 acc | A3 minCombo | A3 isolable |
|---|---|---|---|---|---|---|
| **naive baseline** | 0.979 | 1.000 | **0.989** | **1.000** | 1 | 66 (10.3%) |
| + jittered flush | 0.979 | 1.000 | 0.989 | **0.581** | 1 | 81 |
| + IP dropped | 0.004 | 0.157 | **0.008** | 1.000 | 1 | 66 |
| + no per-flush id | 0.979 | 1.000 | 0.989 | 1.000 | 1 | 66 |
| + coarse time (1 day) | 0.979 | 1.000 | 0.989 | 1.000 | 1 | **19 (3.0%)** |
| + min-count suppression (≥2) | 0.979 | 1.000 | 0.989 | 1.000 | 1 | 113 |
| **ALL mitigations** | 0.004 | 0.114 | **0.008** | **0.581** | 1 | 49 (7.6%) |

**Residual-linkage statement (honest, including the blocking check):**

- **A1 re-linkage is entirely a transport-metadata problem, not a counter-design
  problem.** Source IP re-links flushes at f1 **0.989**; dropping the IP collapses
  it to **0.008**. Nothing else moves A1. The design's core bet — that the counter
  bag itself does not enable re-linkage — **holds**. The blocking condition ("A1
  high after mitigation") does **not** occur, *provided the receiver truly drops or
  truncates the IP before any write.* That mitigation is not optional; it is the
  whole game for A1.
- **A2 ordering** is real and killed by jitter alone: fixed cadence recovers order
  perfectly (1.000); a jittered flush schedule pushes it to **0.581 ≈ chance**.
  Coarse time bucketing does *not* fix A2 by itself (arrival order survives) — you
  need jitter, or to stop storing arrival order.
- **A3 singling-out is stubborn** and the honest negative of this run. Coarse time
  is the best single measure (66→19 isolable), but even after **all** mitigations
  **~7.6% of flushes (49/641) remain isolable to a unique record** by a ≤3-dimension
  combination (coarse geo + rare-counter presence). Two things bound the damage,
  and both matter: (1) isolating one *record* is not identifying a *person*; (2)
  once the IP is gone, an isolated record **cannot be linked to that contributor's
  other flushes** (A1 f1 0.008). Singling-out-one-record survives; cross-flush
  linkage does not. Note the min-count-suppression row is *not* a clean win — it
  recomputes which counters are "rare" and can add content fingerprints; it is not
  a substitute for coarse geo/time and small-population caution.

---

## E4 — what crosses the boundary

Local store is rich (ordered events, fine timestamps, session + device identity —
none transmitted). The flush serialiser reads **only** the counter bag + coarse
period, so it cannot leak the rest even by accident.

- **Wire schema** asserted: `{ v, period, counts }` only; counts are non-negative
  integers; period matches the declared bucket (`YYYY-MM`). A payload that smuggles
  an `order` field or a fine timestamp is rejected.
- **Property test over 200 generated local states**: no session/device id, no
  per-event timestamp, no `events` array, no page label ever appears on the wire.
- **`local-stays-local`** named invariant: every field present only in the local
  view is absent from the serialised payload.
- **Round-trip impossibility demonstrated**: two different ordered histories with
  the same counter multiset collapse to byte-identical payloads — order is
  unrecoverable from the wire.

---

## E5 — PWA lifecycle reality (real Chromium + real service worker)

Browser: **headless Chromium build 1194** via Playwright, real SW precache,
localhost same-origin beacon sink (`findings/e5-lifecycle.json`).

| Event | Landed | Rate |
|---|---|---|
| `visibilitychange`→hidden | 20/20 | **100%** |
| `pagehide` | 20/20 | **100%** |
| real cross-navigation | 0/1 | inconclusive (n=1) |

**These are an upper bound, not a field rate**: visibility/pagehide were
dispatched **synthetically**, so we measured the listener→`sendBeacon` delivery
path on localhost, not real OS backgrounding. Published field rates (~95.8%
`sendBeacon` on unload-family events; ~82.9% for all four unload events) are the
*expectations to check in the field*, not something this harness reproduces.

- **`no-unload-listeners`** invariant asserted across `harness/client.js`,
  `harness/sw.js`, and the generated client — no `unload`/`beforeunload`
  registration anywhere (they break bfcache).
- **Offline**: counters persisted in localStorage while offline (`page_home == 2`
  held), and flushed on reconnect (landed 1).
- **64 KiB**: a registry-sized bag (~40 counters) is <2 KB — nowhere near the cap.
  A pathological cardinality is **chunked** (chosen behaviour, tested), each chunk
  ≤64 KiB, no counter dropped. The 64 KiB figure is the widely-documented Chromium
  `sendBeacon` limit (MDN, *Navigator.sendBeacon()*; WHATWG Fetch Standard defines
  that `sendBeacon` returns `false` when the UA cannot queue the data).

---

## E7 — receiver / infra fit

**Structural fact (confirms & corrects the prior run):** Litestream R2 PUTs are
bounded by its **sync interval**, not directly by flush cadence — each sync
interval containing ≥1 write uploads ~1 WAL segment. So WAL PUTs/month ≤
`2,592,000 / syncIntervalSec`, independent of write volume.

**WAL-PUT ceilings by sync interval** (`findings/e7-put-math.json`):

| Sync interval | PUTs/month ceiling | vs 1M free tier |
|---|---|---|
| 1 s | **2,592,000** | over (matches the prior box's ~2.6M) |
| 3 s | 864,000 | under |
| 10 s | 259,200 | under |
| 30 s | 86,400 | under |
| 60 s | 43,200 | under |

**Crossover (where PUTs/month exceed 1M), medium sites @ 1 s sync:**

| Cadence | Crossover (sites) |
|---|---|
| per-session | **~20** |
| hourly | ~1,389 |
| daily | ~33,331 |
| any cadence @ **≥3 s** sync | **none** (ceiling < 1M) |

**Statement:** at a 1 s sync interval the flush cadence sets the crossover
(per-session saturates the budget at just ~20 medium sites). **Raising the sync
interval to ≥3 s removes the crossover entirely** for any cadence or site count.
So: keep Litestream sync ≥3 s (≥10 s for margin) and the measurement service stays
inside the R2 free tier regardless of load; the low-write summary workload never
approaches the continuous-write 2.6M figure unless deliberately saturated.

**Destroy/restore drill:** paper drill (`findings/e7-fire-drill.md`, declared
stand-in — no live Caddy/systemd/Litestream/R2 here). The **restore invariant** it
rests on **is** executed (`e7-infra.test.ts`): committed-before-replication data
survives a destroy+restore exactly; the only loss is the unreplicated tail (the
last sync window), and it is bounded and explicit, never silent.

---

## E8 — the rounding question, answered with a number

CNIL's recommended technical measure for anonymous statistics is nearest-ten
rounding (0–4→0, 5–14→10, …). Cost measured: the "dead-feature signal" — telling a
genuinely-unused feature (0) from a lightly-used one — because both round to 0.
Dead features modelled as declared-but-unused counters (stand-in).

**The table the owner reads** (`findings/e8-rounding.json`):

| Profile | sessions/mo | dead (true 0) | live features rounding to 0 | signal destroyed? |
|---|---|---|---|---|
| small | 641 | 5 | **1** | **yes** — 0 no longer means "dead" |
| medium | 52,022 | 5 | **0** | **no** — every live feature clears the floor |

**Traffic threshold** (sweep, held-fixed corpus): the dead-feature signal flips
from **destroyed to intact between 1,600 and 3,200 sessions/month** (first intact
sweep point: 3,200). Mechanism: the rarest live feature needs ≥5 hits to round to
≥10; at ~0.0016 hits/session that lands around ~3,200 sessions/month.

*(Per the directive: numbers only, no recommendation. The rounding-vs-exact
decision is the owner's, gated on this table.)*

---

## Verify-in-run ledger (observed answers)

1. **`visibilitychange`→hidden reliability for an installed iOS PWA vs a tab —
   COULD NOT DETERMINE.** No iOS in the harness; only synthetic events on headless
   Chromium (100% there, but that is not the iOS field answer). Stand-in.
2. **localStorage vs IndexedDB under eviction — COULD NOT DETERMINE.** Headless
   Chromium does not reproduce real iOS eviction. The harness uses localStorage;
   offline *survival* held for it (counters intact across an offline window), but
   durability *under eviction pressure* was not exercised, so the choice was not
   decided.
3. **`sendBeacon` >64 KiB — NOT OBSERVED IN-BROWSER (design sidesteps it).** The
   client chunks so it never hands `sendBeacon` >64 KiB; the unit test proves the
   chunker. Per the Fetch Standard, `sendBeacon` returns `false` when the UA cannot
   queue the payload, and the client clears only what it successfully queued — but
   the actual >64 KiB browser return value was not directly triggered here.
4. **Litestream PUT math for a low-write workload — HOLDS, with a correction.** The
   ~2.6M/month figure is the *continuous-write, 1 s sync* ceiling. A low-write
   summary workload sits far below it because WAL PUTs are capped by the sync
   interval, not the write count; crossover established (E7). The write pattern
   *does* change the arithmetic — favourably.
5. **Beacon coalescing under rapid visibility flapping — COULD NOT DETERMINE.**
   Synthetic dispatch landed 1:1 (20/20), but that does not measure real UA
   coalescing/dropping under fast flapping.

---

## Open items for the owner (§11)

- **Pilot site:** arecipe (real feature surface, a genuine "which views are dead"
  question, no child-safety scrutiny). Skylite last. The E0/E8 model already homes
  on the arecipe surface.
- **Rounding vs exact counts:** gated on the E8 table above.
- **Local history retention:** the rich local view (E4) is readable by whoever
  holds the device. Needs a bound, a clear control, and a default-retention
  decision — unaddressed by this run by design.
- **Does `edge` sit inside the three-event ceiling? — recorded both ways, not
  decided:**
  - *Inside:* an `edge` is a `feature` use with its destination recorded, which is
    within the page/feature/timing ceiling as CNIL's July 2025 self-assessment tool
    frames it. (Source attribution per the run directive; owner to verify the exact
    tool reference.)
  - *Outside:* an `edge` is a distinct fourth event type (an explicit `from→to`
    transition), arguably beyond the three-event ceiling.
  This run does not resolve it.
- **Kit name:** still a placeholder.

---

## What the run could not establish (plain statement)

- Real iOS PWA background-flush reliability (ledger 1).
- localStorage-vs-IndexedDB durability under real eviction (ledger 2).
- Real in-browser `sendBeacon` behaviour at >64 KiB (ledger 3) — sidestepped by
  chunking, not observed.
- Real beacon coalescing under rapid visibility flapping (ledger 5).
- The single real-navigation beacon did not land (0/1) — inconclusive at n=1,
  flagged for follow-up, not a field measurement.
- A live Litestream↔R2 round-trip and systemd/Caddy re-provision (E7 fire-drill is
  a paper drill; only the restore invariant is executed).
- Real traffic profiles and real transition probabilities (owner-supplied).
- Model-mismatch flow degradation (E2): the generator is first-order Markov, so the
  corpus cannot show it; the falsification pair demonstrates the lossy mechanism
  instead.
