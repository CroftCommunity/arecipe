# pwa-check evaluation — gate / periodic / skip?

Read-and-report brief (TODO.md "Tooling / QA"). Evaluates
[`@pwa-today/pwa-check`](https://github.com/pwa-today/pwa-check) against arecipe's
built PWA surface and recommends where (if anywhere) it belongs. **No gate
adoption in this run** — this is the evidence + recommendation only.

_Run 2026-07-16 against the built app (`npm run build` → `dist/`, served on
`127.0.0.1:4173`)._

## What it is

A static PWA validator. It fetches a URL, parses the HTML for the manifest link
and the service-worker registration, fetches the manifest + its icons, and
heuristically scans the SW **source** for handler names. It does **not** launch a
headless browser and does **not** execute the service worker — so it reasons
about the SW's *text*, not its *runtime behavior*.

- **Install / invoke (exact):**
  ```
  npx @pwa-today/pwa-check@0.0.7 --insecure-localhost http://127.0.0.1:4173/
  ```
  Flags: `--json`, `--fail-on-warn`, `--ignore-warn <code>`, `--timeout <ms>`,
  `--insecure-localhost`. Version pinned: **0.0.7** (not published unscoped; the
  scoped package `@pwa-today/pwa-check` is the real one).
- **Determinism:** deterministic — two consecutive `--json` runs were
  byte-identical (`diff` clean). No timing/heuristic flap observed.
- **Hermeticity:** needs a *running static server* for the built `dist/`, but no
  third-party network — it only fetches the target origin + same-origin manifest
  and icons. So it *can* run hermetically (localhost), though it is not a
  zero-process, in-vacuum check: `npx` fetches the package at first use (a
  network dependency at install time).

## Raw findings against arecipe

`Summary: 27 pass, 12 warn, 0 fail.` The 27 passes cover the load-bearing
surface: manifest found + valid JSON, `scope` / `display: standalone` /
`start_url` / `description` / `short_name`, valid `theme_color` +
`background_color`, icons declared with `src`/`type`/`sizes`, a 512×512 icon, all
four icons **reachable**, "meets installability criteria", and the SW's
`install` / `activate` / `fetch` handlers + `waitUntil` + an "appears to cache
assets" heuristic.

The 12 warnings (0 failures), and arecipe's disposition of each:

| Warning | arecipe disposition |
|---------|---------------------|
| No `orientation` member | Intentional — arecipe adapts to any orientation. |
| No `screenshots` | Optional install-UI polish; not used. |
| Missing icon sizes 384×384, 1024×1024 | Cosmetic; 192 + 512 (incl. maskable) satisfy installability (which passes). |
| Missing maskable 384×384, 1024×1024 | Same — maskable 192 + 512 are present. |
| No `shortcuts` | Intentional — no app shortcuts. |
| No `share_target` (`manifest.share-target.missing`) | Intentional — arecipe shares *out*, doesn't receive shares. |
| No `file_handlers` (`manifest.file-handlers.missing`) | Intentional — no file associations. |
| No `handle_links` | Intentional. |
| Viewport missing `viewport-fit=cover` | **Legit, minor** — a real edge-to-edge improvement for notched devices; not a regression. |
| No iOS `apple-touch-startup-image` | Optional iOS splash; not used. |
| SW has no `push` handler (`service-worker.push.missing`) | Intentional — arecipe is zero-backend, no push. |
| SW has no `notificationclick` handler (`service-worker.notificationclick.missing`) | Intentional — no notifications. |

So **10 of 12 warnings are deliberately-omitted optional features**; one
(`viewport-fit=cover`) is a genuine small nicety; none is a defect.

## What it catches that Playwright doesn't — and vice-versa

**pwa-check's unique value (the current suite does *not* assert these):**
- Manifest **schema completeness + validity** — a dropped required member, an
  invalid `theme_color`, a malformed manifest.
- Icon **reachability** — a renamed/404'd icon path. This is a real regression
  class arecipe has no e2e for; pwa-check GETs every declared icon.
- SW handler **presence** — an accidentally-removed `fetch`/`install` handler.

**What Playwright already covers that pwa-check structurally cannot** (it never
runs the SW): actual **offline boot** from the precache (`tests/e2e/offline.spec.ts`),
the **network-first SW navigation** fallback for unknown paths
(`sw-navigation`/`nav` specs, PR #10), runtime caching, and the cache-first SWR
paint. These runtime behaviors are arecipe's *actual* PWA risk, and they are the
part pwa-check is blind to — it would happily pass a SW whose `fetch` handler is
present but broken.

The two tools are **complementary, not redundant**: pwa-check guards the *static
declaration* (manifest + icons + handler presence); Playwright guards the
*runtime effect*.

## False-positive noise + tunability

Noise is **high for arecipe under `--fail-on-warn`**: that flag exits non-zero
(verified: exit 1) on all 12 warnings, ~10 of which are intentional. Worse,
`--ignore-warn <code>` can only silence the **4** warnings that carry a code
(`share_target`, `file_handlers`, `push`, `notificationclick`); the other **8**
(orientation, screenshots, icon sizes, maskable sizes, shortcuts, handle_links,
viewport-fit, iOS startup) emit **no code**, so they cannot be suppressed. There
is no way to get a clean `--fail-on-warn` run without upstream changes to the
tool. The default mode (warnings don't fail; `fail` is reserved for
installability-breaking problems, of which arecipe has 0) is the usable mode.

## Recommendation — **periodic / pre-release, not the hermetic gate**

Reasoning:

1. **Its failing modes are already 0 and its warnings are mostly intentional.**
   `--fail-on-warn` is unusable here (8/12 warnings un-silenceable), and gating on
   the *default* mode would only ever fail on `fail`-level problems — which today
   is an empty set. A gate that can't be tuned to green without ignoring its own
   signal doesn't belong in `npm test`.
2. **It adds an install-time network dependency** (`npx` fetch of an unpinned-in-repo
   package) and a served-build step, cutting against the gate's self-contained,
   offline-friendly posture.
3. **But it is cheap, deterministic, and catches a real class Playwright misses**
   (manifest validity + icon reachability). That value is worth capturing on a
   slow cadence, where the 12-warning list is reviewed by a human rather than
   asserted by CI.

**Concrete suggestion for a later run (out of scope here):** if a hermetic guard
is ever wanted, add a *narrow* one that asserts only `summary.fail === 0`
(installability-breaking problems) via `--json`, and treats warnings as
informational — not `--fail-on-warn`. That captures the regression value (a
404'd icon flips `installability` to fail) without the intentional-omission
noise. Pair it with a periodic full-report run for the manifest-completeness
nudges (e.g. the `viewport-fit=cover` nicety).

**Verdict:** _periodic / pre-release check_ — keep it out of the `npm test` gate.
```
# periodic:
npm run build && (serve dist on 127.0.0.1:4173) && \
  npx @pwa-today/pwa-check@0.0.7 --insecure-localhost http://127.0.0.1:4173/
```
