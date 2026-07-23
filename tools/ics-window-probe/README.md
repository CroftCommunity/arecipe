# tools/ics-window-probe

Tooling for **EXP-ICS-WINDOW** (findings: `docs/ICS-WINDOW-PROBE.md`). Experiment
scratch under `tools/` — lint- and typecheck-ignored, **never ships to `main`**.
Only the findings doc is destined for `main`.

- `feed.mjs` — pure builder: `buildProbeIcs(events, opts)`, `cancel(ev)`,
  `toIcalStamp(iso)`. Clock-free (DTSTAMP injected). No product deps.
- `feed.spec.mjs` — 14 unit tests (UID stability, `SEQUENCE` increment,
  `STATUS:CANCELLED`, byte-identical retained events across Feed A/B).
- `generate.mjs` — emits `feeds/*.ics` from the tested builder (fixed base
  `2026-07-23`, so output is byte-reproducible).
- `feeds/` — the four probe files (arm1 A/B = omission, arm2 A/B = cancellation).

## Run

```bash
npx vitest run tools/ics-window-probe/feed.spec.mjs   # tests
node tools/ics-window-probe/generate.mjs              # (re)generate feeds/

# prove A→B changes ONLY E1:
diff tools/ics-window-probe/feeds/arm1-feedA.ics tools/ics-window-probe/feeds/arm1-feedB.ics
diff tools/ics-window-probe/feeds/arm2-feedA.ics tools/ics-window-probe/feeds/arm2-feedB.ics
```
