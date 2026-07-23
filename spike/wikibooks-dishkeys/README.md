# wikibooks-dishkeys — corpus dishKey alignment (review-first)

Aligns the staged **Wikibooks corpus** (from `tools/wikibooks/` → wbsync) onto the
same `dishKey` keyspace the live `arecipe.bsky.social` recipes already use, so a
Wikibooks "Bouillabaisse" folds into the existing `bouillabaisse` version group
instead of standing alone.

## Why this lives here (not in the tool)

`tools/wikibooks/` is a walled, zero-dependency tool — its `o1-isolation` test
forbids importing anything outside itself, including the canonical dishKey
deriver. So alignment is done **outside** the tool, as an offline job that treats
the live records and the corpus purely as **data**:

```
live arecipe.bsky.social records ─┐
(names + stored dishKey)          │
                                  ├─► propose.mjs ─► review.html ─► YOU approve/decline
staged corpus names               │   (reuses the ONE deriver:      │
(tools/wikibooks/runs/*/plan.json)┘    ../import/dishkeys.mjs)       ▼
                                                          wb-dishkeys.approved.json
                                                          (rkey → dishKey)
                                                                     │
                                          (later) wbsync reads this data file and
                                          stamps dishKey at publish — no code crosses
                                          the tool boundary.
```

The deriver stays single-source in `spike/import/dishkeys.mjs`. The tool never
imports the algorithm; it only ever consumes the approved map.

## Run

```
node spike/wikibooks-dishkeys/build.mjs            # fetch live from arecipe.bsky.social + newest plan.json
node spike/wikibooks-dishkeys/build.mjs --live-cache live.ndjson   # offline, from a cached pull
```

Writes `out/review.html` and `out/proposal.json`. Open `out/review.html` in a
browser.

## The review page

- **Singletons** (unique key, no sibling anywhere) get their derived key
  automatically — no decision, not listed.
- **Merge groups** are the only decisions:
  - *joins-existing* — a corpus recipe whose derived key matches a live group.
  - *new-corpus* — ≥2 corpus recipes sharing a derived key with no live match.
- Each group defaults to **approved**; decline splits its Wikibooks members back
  to standalone (no `dishKey`). Live members already carry the key.
- **Export approved map** downloads `wb-dishkeys.approved.json`
  (`{ rkey → dishKey }`, declined members omitted). This is the input to the
  (future) wbsync stamp step.
- A **near-miss** section lists prefix-overlap candidates for manual merging.

Watch for over-merges: the deriver drops a trailing "with …" clause, so
"Pasta with Corn and Tuna" + "Pasta with Hot Dogs" both key to `pasta` — decline
groups like that. "Easy Nachos" + "Simple Nachos" → `nachos` is a good merge.

## Tests

```
node --test 'spike/wikibooks-dishkeys/*.test.mjs'
```

- `propose.test.mjs` — classification + approved-map computation (pure).
- `render.test.mjs` — HTML structure, escaping, injection-safe embedding.
- `page-behavior.test.mjs` — runs the page's actual inline export script against
  a fake DOM (the page runs the same `computeApproved` the unit tests cover,
  embedded via `.toString()`).

## Not done here (next step)

- **Stamping**: wbsync gains a small hook to read `wb-dishkeys.approved.json` and
  set `dishKey` on each record at build/publish time. That is the only change to
  the walled tool, and it reads data only.
- **primaryVersion**: not set. When a Wikibooks recipe joins a live group, the
  live recipe should likely stay primary; deferred.
- **O4 target**: wbsync docs still say `cookbook.arecipe.app`; the agreed target
  is `arecipe.bsky.social`. Update the tool's O4 config/doc before publish.
