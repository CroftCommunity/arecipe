# GitHub Pages `.ics` Content-Type Probe — Findings

**Date:** 2026-07-12
**Repo:** CroftCommunity/arecipe
**Probe commits:** `9ea1cc9` (add fixture) · `6bc28d9` (record + cleanup)
**Question:** What `Content-Type` does the live arecipe.app (GitHub Pages) origin
serve for a `.ics` file — and is a committed `.ics` on Pages usable by calendar
clients, or does it need a proxy to fix the header?

> Terse machine-capture of the same result also lives in
> `tests/fixtures/lexicons/PROBE-NOTES.md`. This file is the readable write-up.

---

## Verdict: PASS

GitHub Pages serves `.ics` as **`text/calendar`**. No proxy or function is
required on the content-type axis. A committed `.ics` on Pages is directly
consumable by calendar clients — **as a snapshot, not a live feed.**

---

## How files reach arecipe.app (pipeline)

- **Pages source:** GitHub **Actions** (`upload-pages-artifact` + `deploy-pages@v4`
  in `.github/workflows/ci.yml`), publishing the built `dist/` directory.
- **Deploy trigger:** the `deploy` job runs **only on push to `main`**
  (`if: github.ref == 'refs/heads/main' && github.event_name == 'push'`).
  No `gh-pages` branch, no `/docs` serving, **no preview deploys** — this is the
  live production site.
- **Build is an allowlist copy:** `scripts/build.mjs` copies only enumerated files
  into `dist/`. A root-level `.ics` **would be dropped**. The `assets/` directory
  is copied recursively, so that is the one path an `.ics` survives the build
  without touching build code.
  - Probe lived at `assets/calendar-probe.ics`
  - Published URL: `https://arecipe.app/assets/calendar-probe.ics`
- Confirmed locally: the CRLF `.ics` built into `dist/assets/` **byte-identical**
  (content-length 239) — the pipeline does not mangle or drop the extension.

---

## Observed headers

### GitHub Pages — `https://arecipe.app/assets/calendar-probe.ics`

```
HTTP/2 200
server: GitHub.com
content-type: text/calendar
last-modified: Sun, 12 Jul 2026 15:53:47 GMT
access-control-allow-origin: *
etag: "6a53b88b-ef"
cache-control: max-age=600
content-length: 239
x-cache: MISS        (HIT on second request — header stable)
# no x-content-type-options header
```

Body intact: `BEGIN:VCALENDAR … END:VEVENT`.

| Axis | Value |
|---|---|
| **Content-Type** | **`text/calendar`** (PASS) |
| **X-Content-Type-Options** | *absent* (no `nosniff`) |
| **Cache-Control** | `max-age=600` (10 min) |
| **Status** | `200` |

### Contrast — `raw.githubusercontent.com` (same committed bytes)

```
HTTP/2 200
content-type: text/plain; charset=utf-8
cache-control: max-age=300
x-content-type-options: nosniff
content-length: 239
```

`raw` is the **opposite** (`text/plain` + `nosniff`) and is **not** usable
directly by calendar clients — but `raw` is not the delivery path. Pages is.

---

## Interpretation

- **Pages labels `.ics` correctly.** No proxy/function needed to fix the header.
- **`nosniff` is absent on Pages, but moot** — the label is already correct, so
  content sniffing never comes into play.
- The correct home for such a file is **under `assets/`** (recursively copied);
  a repo-root `.ics` would be silently dropped by the allowlist build.

---

## Same-path updates (does re-publishing work?)

**Yes — after a deploy, a GET/HEAD at the same path returns the new version.**

- The `.ics` path is **not** hash-renamed (only JS/CSS bundles get the
  content-hash cache-buster), so a re-commit **overwrites it in place**.
- GitHub Pages **purges its Fastly edge cache on every deploy.** Proven by this
  probe: immediately after the cleanup deploy, the *same path* flipped
  `200 → 404` with `x-cache: MISS` — fresh, not a stale HIT.
- HEAD returns the same headers/validators (`ETag`, `Last-Modified`) as GET, so
  conditional refetches work.

**Caveats that keep this from being a live feed:**

1. **`cache-control: max-age=600`** — the deploy purges *GitHub's* edge, not an
   end user's browser cache or a corporate/ISP proxy. A client that already
   fetched the file may hold a stale copy for up to 10 minutes on its own.
   Calendar clients also refetch on their own (often hourly) schedule.
2. **Updates require a commit + Action deploy** (~2–3 min). Cadence is
   *deploy-driven*, not data-driven.

---

## Scope / bottom line

This probe settles **only** the content-type question.

- **Go** — if the need is a static, correctly-labeled `.ics` snapshot you
  re-publish on change (e.g. republish when a meal plan changes). Content-type is
  correct, same-path updates propagate on deploy, no proxy required.
- **Not yet** — if the need is a subscribable feed reflecting changes in real
  time. A committed file changes only on commit/deploy, and the 600s max-age means
  even post-deploy freshness isn't instant for clients that already have it. That
  requires dynamic generation / a real feed endpoint — out of scope here.

---

## Housekeeping

- Throwaway probe file removed in follow-up commit `6bc28d9`; live URL now 404.
- No product code or dependency changes were made for this spike.
