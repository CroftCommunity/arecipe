# Plan: incremental revalidation via CAR diff (`getRepo?since=`)

**Date:** 2026-08-06 · **Status:** proposed (Phase 0 discovery already executed)

## Problem Statement

Revalidation compares **one rev per repo**. A `rev` in atproto versions the
whole repo, not individual records, so when it moves the client learns *that*
something changed but not *what*. The only safe response today is to refetch
everything:

```
revalidate.ts:99    changed = live.rev !== cook.rev
      ↓ (changed)
revalidate.ts:118   readRecords({ pds, did })
      ↓
read.ts:64-68       createRecipeReader — "the WHOLE repo, so follow the
                    cursor to the end and concatenate every page"
      ↓             41 paginated requests, ~10 MB for 4,041 records
browse.ts:701-703   onChanged → records.map(r => cache.put(r))
                    → 4,041 IndexedDB writes
```

For the small cooks (3–37 records) this is free. For the corpus account at
4,041 records it is **~10 MB and 4,041 database writes, per client, per change**
— triggered by a *single* edited recipe.

This is dormant today only because the snapshot was captured right after the
publish. It is not hypothetical: `wbsync` exists to re-sync the corpus against
Wikibooks, and its ledger is built to compute deltas across long gaps. The first
re-run — even for one corrected recipe — bills every client the full amount.

`revalidate.ts:14` records the original decision and its own revisit trigger:

> *Deliberately uses listRecords, not the getRepo?since= CAR diff: the diff path
> means shipping CAR + DAG-CBOR decoding for a corpus whose whole premise is it
> rarely changes.*

Both halves of that premise have moved: the corpus went from a handful of
records to 4,041, and dag-cbor now ships anyway for CID verification.

## Reasoning

### Why `getRepo?since=`, not a custom version field

The intuitive fix — stamp `updatedAt` (or a version) on each recipe and compare
— does not work. `com.atproto.repo.listRecords` returns
`{uri, cid, value}` with **no projection option**: reading the stamps means
downloading every record body anyway (~1,972 bytes each, ~8 MB for the corpus).
The expensive part is the transfer, not the comparison. A version field makes
the comparison cheaper and leaves the transfer exactly where it was.

There is also already a per-record version: `cid`, returned on every row and
changing whenever the record changes. The missing capability was never
versioning — it was reading versions without dragging bodies along.

`com.atproto.sync.getRepo?since=<rev>` is that capability, and it is part of the
protocol rather than something to invent.

Rejected alternative: **a repo-resident manifest record** mapping rkey → cid,
fetched in one call. It works, but it hand-rolls change detection the protocol
already provides, and `wbsync` would have to maintain it in lockstep or it would
silently go stale and lie.

### The deletion problem (the reason this is its own plan)

Phase 0 measured how each mutation appears in the CAR:

| mutation | diff size | blocks | record block in CAR |
|---|---:|---:|---|
| create | 3,495 B | 9 | **yes** (`note="created"`) |
| update | 3,495 B | 9 | **yes** (`note="updated"`) |
| delete | 3,323 B | 8 | **no** |

Creates and updates are trivial: decode the block, upsert. **Deletes carry no
tombstone** — the record block is simply absent and the MST is one node lighter.

That makes deletion detection a statement about the *tree*, not the records.
And because a `since` diff carries only the MST nodes that **changed**, the full
key set is not reconstructible from the CAR alone — so "which keys disappeared?"
cannot be answered by decoding the diff in isolation.

Two viable strategies, and choosing between them is this plan's central design
question (Open Question 1):

- **(a) Cache MST nodes and walk from the new commit root.** Unchanged nodes
  come from the local cache. Fully incremental and correct, but it means holding
  a Merkle tree client-side, not just records — a materially larger model than
  "decode and upsert."
- **(b) Cheap diff for the common case, periodic full reconcile for deletions.**
  Use `since` for creates/updates; occasionally (on a schedule, or when a
  heuristic fires) fall back to `listRecords`/full `getRepo` to catch removals.
  Far simpler, at the cost of a bounded window where a deleted recipe lingers.

Leaning **(b)**: deletions in a Wikibooks-derived corpus are rare, the existing
code already handles a full refetch correctly, and (a) puts MST correctness on
the critical path of every boot. But (b) has a real user-visible failure mode —
a recipe deleted upstream stays visible until the next reconcile — and that is
the tradeoff to decide deliberately.

### Why the bundle objection no longer applies

Measured marginal cost of adding a CAR reader, on top of what already ships:

| bundle | gz |
|---|---:|
| `dag-cbor` + `multiformats` (already shipped, `cache.ts:9-11`) | 11,966 B |
| + `@ipld/car` `CarReader` | 14,342 B |
| **marginal** | **+2,376 B** |

That is **9.7%** of the 24 KB per-entry budget (`build.mjs:324`).

### Expected savings

| scenario | today | with `since=` |
|---|---:|---:|
| nothing changed | 1 cheap `getLatestCommit` | unchanged |
| one recipe changed | ~10 MB, 41 requests, 4,041 IDB writes | **~3.5 KB, 1 request, 1 write** |
| full resync | ~10 MB, 41 requests | 9.19 MB, **1 request** |

## Verified Assumptions

All probed against the live corpus repo
(`did:plc:spfl4xaktvvchr2cqp2r2xvp`, PDS `phellinus.us-west.host.bsky.network`)
on 2026-08-06, using an isolated Node 22.23.2.

| Assumption | Evidence |
|---|---|
| `listRecords` always returns full values | probe: keys `['uri','cid','value']`, 1,972 B for one value; no projection param |
| `getRepo?since=` is supported and honoured | HTTP 200, `application/vnd.ipld.car` |
| Diff is proportional to real change | 59 B unchanged · 8.59 MB across a 3,695-record boundary · 9.19 MB full |
| One-record diff ≈ 3.5 KB / 9 blocks | probe: create and update both 3,495 B |
| Create and update embed the record block | decoded CAR contained `$type: app.arecipe.probe` with the new value |
| **Delete omits the record block** | decoded CAR: 8 blocks, record block absent, no tombstone |
| CAR reader marginal bundle cost | esbuild + gzip: +2,376 B gz (`@ipld/car` 5.4.7) |
| dag-cbor already ships | `src/recipes/cache.ts:9-11`, `package.json` deps |
| Per-entry bundle budget | `scripts/build.mjs:324` — `PAGE_ENTRY_GZ_BUDGET = 24 * 1024` |

**Unverified / explicitly not claimed:**
- Whether a **partial** `since` diff ever contains enough MST nodes to derive
  the deleted key set without a cached tree. Untested; assumed not.
- Behaviour when `since` names a rev the PDS has **garbage-collected** or does
  not recognise (very old snapshot, or a repo migrated between hosts). Must
  degrade to a full sync, not throw.
- Whether non-Bluesky PDS implementations honour `since` identically. The corpus
  is Bluesky-hosted, but other cooks are not necessarily.
- Cost of MST-walking (strategy (a)) — not prototyped.

## Documentation Impact

- `src/snapshot/revalidate.ts:14-16` — the comment recording why `listRecords`
  was chosen becomes stale the moment this ships. Updated in the phase that
  changes the fetch path, not later; it should retain the history and note what
  changed rather than being deleted.
- `plans/2026-08-06-2-plan-snapshot-sharding-and-image-cache.md` — its Open
  Question 4 points here; no edit needed beyond the pointer already added.
- `docs/DESIGN.md` — grepped for `revalidat`, `listRecords`: no references
  found, so no change.
- `CLAUDE.md` — no change; this is internal sync behaviour with no convention
  impact.

## Concurrency Map

**All phases sequential.** Each phase reads what the prior wrote: the CAR reader
must exist before the diff path can consume it, and the deletion strategy must
be chosen before the fallback can be wired. The write-sets also overlap heavily
on `src/snapshot/revalidate.ts`, which alone forces sequencing.

## Phases

### Phase 0: Discovery — **COMPLETE (2026-08-06)**

Executed during planning rather than deferred, because the deletion question
could have invalidated the whole approach.

- [x] **D1: Does `getRepo?since=` work, and is the diff proportional?**
  Yes — 59 B / 8.59 MB / 9.19 MB. *Disposition: throwaway.*
- [x] **D2: What does a CAR reader cost the bundle?**
  +2,376 B gz, 9.7% of budget. *Disposition: throwaway.*
- [x] **D3: How are updates and deletes represented?**
  Updates embed the new record block; **deletes omit it, with no tombstone**.
  This reshaped the plan — see Open Question 1. *Disposition: throwaway.*
- [x] **D4: MST overhead on a one-record diff?**
  ~3.5 KB, 9 blocks. *Disposition: throwaway.*

Probe writes went to a throwaway `app.arecipe.probe` collection and were
deleted; the corpus was untouched. The repo rev moved as a result
(`3msem3zmjej2v` → `3msgkzc7urp2g`), which self-corrects on the next deploy.

---

### Phase 1: CAR decode primitive

**Goal:** Turn a CAR byte stream into typed records, with no revalidation
behaviour changed yet.
**Changes:**
- [ ] `package.json` — add `@ipld/car`.
- [ ] `src/snapshot/car.ts` — new: `decodeRepoDiff(bytes)` → `{ records, root }`,
      returning the record blocks it can decode.
- [ ] `tests/unit/snapshot/car.spec.ts` — decodes a **fixture CAR captured from
      the real PDS** (create, update, and delete cases from Phase 0) rather than
      a hand-built one.

**Call chain:** none yet — this phase is deliberately inert. Phase 2 wires it.
**Wiring test:** none, and that is intentional: this phase ships a pure decoder
behind no caller. Its Done-when is the bundle-budget check, so it cannot become
dead weight unnoticed.
**Depends on:** Phase 0.
**Read-set:** `src/recipes/cache.ts`, `scripts/build.mjs`.
**Write-set:** `package.json`, `src/snapshot/car.ts`,
`tests/unit/snapshot/car.spec.ts`.
**Shared-state contract:** No shared mutable state beyond the write-set.
**Risks:** The dependency lands before its consumer. Keep this phase and Phase 2
in the same branch so a bundle grows only alongside the feature that needs it.
**Done when:**
1. **Behavioral:** A real captured CAR decodes to the expected records.
2. **Verification:** `npx vitest run tests/unit/snapshot/car.spec.ts` and
   `npm run build` staying inside `PAGE_ENTRY_GZ_BUDGET`.

**Validation:** Narrow — pure function over real fixtures.

---

### Phase 2: Diff-first revalidation with full-sync fallback

**Goal:** A changed cook fetches only its delta.
**Changes:**
- [ ] `src/snapshot/revalidate.ts` — on `changed`, try `getRepo?since=<cook.rev>`
      and decode; fall back to the existing `readRecords` path on any failure
      (unrecognised `since`, decode error, non-Bluesky PDS).
- [ ] `src/snapshot/sync.ts` — add the `getRepo` call beside `getLatestCommit`.
- [ ] `tests/unit/snapshot/revalidate.spec.ts` — diff path used when available;
      **fallback exercised** when `since` is rejected; existing outcomes
      (`unchanged`/`gone`/`error`) unaffected.

**Call chain:** boot → `revalidateCooks` → `getLatestCommit` → rev differs →
`getRepo?since=` → `decodeRepoDiff` → `store.putDelta` → `onChanged` → cache.
**Wiring test:** an integration test driving revalidation against a stub PDS
serving a real captured CAR, asserting only the changed record is written and
the full-list path is **not** called.
**Depends on:** Phase 1.
**Read-set:** `src/pages/browse.ts`, `src/recipes/read.ts`,
`src/snapshot/store.ts`.
**Write-set:** `src/snapshot/revalidate.ts`, `src/snapshot/sync.ts`,
`tests/unit/snapshot/revalidate.spec.ts`.
**Shared-state contract:** No shared mutable state beyond the write-set.
**Risks:** The fallback is load-bearing — a `since` the PDS cannot honour must
degrade to a full sync, never throw. `revalidate.ts` already promises "a failed
revalidation is not an error state."
**Done when:**
1. **Behavioral:** A cook with one changed record refetches ~3.5 KB rather than
   its whole repo, and an unsupported `since` still completes via full sync.
2. **Verification:** `npx vitest run tests/unit/snapshot/revalidate.spec.ts`.

**Validation:** Broad — includes a live check against the real corpus repo,
since the fallback exists precisely for real-world PDS variation.

---

### Phase 3: Deletion handling

**Goal:** A recipe deleted upstream stops being displayed, within a defined
window.
**Changes:** Strategy **(b)** confirmed — reconcile bookkeeping, no MST walking:
- [ ] `src/snapshot/revalidate.ts` — track `lastReconciledAt` per cook; force a
      full sync when the window lapses, and prune records absent from it.
- [ ] `src/snapshot/revalidate.ts` — **merge** diff records into the held set
      rather than replacing it. This is the correctness trap: today
      `onChanged` (`browse.ts:703`) does
      `entriesByDid.set(did, records.map(...))` — it **replaces** the cook's
      whole list, which is correct only because `readRecords` returns the
      complete current set (so deletions vanish by construction). A CAR diff
      returns only *changed* records, so calling the same path with them would
      **wipe every unchanged recipe for that cook**. The diff path must merge;
      only the reconcile may replace.
- [ ] `tests/unit/snapshot/revalidate.spec.ts` — a delete is invisible to the
      diff path and **is** caught by the reconcile; the window is respected.

**Call chain:** boot → revalidate → window lapsed → full sync → removed records
pruned from the store → view updates.
**Wiring test:** delete a record in a stub repo, run revalidation past the
window, assert the record disappears from the rendered feed — not merely from
the store.
**Depends on:** Phase 2; Open Question 1.
**Read-set:** `src/snapshot/store.ts`, `src/pages/browse.ts`.
**Write-set:** `src/snapshot/revalidate.ts`,
`tests/unit/snapshot/revalidate.spec.ts`.
**Shared-state contract:** No shared mutable state beyond the write-set.
**Risks:**
- This is the phase most likely to be skipped once Phase 2 shows a big win — and
  skipping it means deleted recipes linger indefinitely. Phase 2 must not ship
  without it.
- **Replace-vs-merge is the sharp edge.** `onChanged`'s replace semantics are
  load-bearing today; feeding it a partial diff silently deletes the rest of the
  cook's recipes from view. A test must pin merge-on-diff and replace-on-
  reconcile explicitly.
- **Deltas may accumulate.** `store.ts:70` keys rows `buildId|did|rev`, so every
  new rev writes another row, and `purge.ts` only cleans **Cache Storage** by
  build id — it does not touch the IndexedDB `deltas` store. Incremental
  revalidation makes revs move more often, so verify whether stale delta rows
  are cleaned anywhere; if not, this phase should bound them.
**Done when:**
1. **Behavioral:** A recipe deleted upstream disappears from the feed within the
   defined window.
2. **Verification:** `npx vitest run tests/unit/snapshot/revalidate.spec.ts -t delete`.

**Validation:** Moderate — plus one real end-to-end deletion against a test repo.

## Open Questions

- **[RESOLVED — strategy (b)]** Deletion strategy: **cheap diff for
  creates/updates, periodic full reconcile to catch deletions.** Confirmed by
  the owner 2026-08-06. Consequences now baked into the plan:
  - Phase 1's decoder stays a **flat record decoder** — no MST walking, no
    client-side Merkle tree. This is the larger de-risking: strategy (a) would
    have put tree correctness on the critical path of every boot.
  - Phase 3 becomes reconcile-window bookkeeping rather than tree diffing.
  - **Accepted tradeoff:** a recipe deleted upstream stays visible until the
    next reconcile. That window is a deliberate staleness budget, not a bug —
    but it must be bounded and tested, or "rare deletions" silently becomes
    "deletions never propagate."
- **[RECOMMENDED: PHASE-GATED (Phase 3)] How long is the reconcile window?**
  *Rationale: with (b) chosen this is the visible-staleness budget for
  deletions. Needed before Phase 3 is written, not before work starts. Worth
  noting the reconcile costs a full sync (9.19 MB for the corpus), so the window
  trades deletion latency against bandwidth — a per-cook window scaled to repo
  size may beat one global number.*
- **[RECOMMENDED: ADVISORY] Do non-Bluesky PDS hosts honour `since` identically?**
  *Rationale: the fallback covers it either way, so this affects how often the
  fast path is taken, not correctness.*

## Review Log

### Pass 1 + Phase 0 — 2026-08-06
Promoted out of
`plans/2026-08-06-2-plan-snapshot-sharding-and-image-cache.md` Open Question 4,
after that plan's walk-through established the cost was real rather than
theoretical.

Phase 0 ran **before** the plan was committed to, and changed it: the deletion
finding (D3) turned "swap listRecords for a CAR diff" into a plan whose central
question is how deletions are detected at all. Had discovery been deferred, that
would have surfaced mid-implementation, after the decoder and fetch path were
already built.

D2 also retired the stated reason the diff path was originally rejected: the
marginal bundle cost is 2,376 B gz, not the dual dag-cbor + CAR cost the
original comment anticipated.
