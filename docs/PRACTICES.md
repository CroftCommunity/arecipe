# arecipe development practices

Successor to the `chasemp/peadoubleueh` lessons docs: operational patterns
proven in this repo, written down so they survive the session that invented
them. Each entry carries the why and the concrete form. Add to this file the
moment a pattern earns its keep twice.

## Deploys prove themselves (build-stamp verification)

Every build embeds its git SHA in `build-info.json` (see
`scripts/build.mjs`). A deploy is DONE when the live origin serves that SHA
— never when CI goes green:

```sh
until curl -s https://croftcommunity.github.io/arecipe/build-info.json \
  | grep -q <sha>; do sleep 15; done; echo "DEPLOYED <sha>"
```

Run it in the background the moment you push. The same artifact powers the
footer stamp, the settings build facts, and (later) the SW cache version and
the signed release manifest — one source of truth for "which build is this."
This kills peadoubleueh's founding pain: never knowing which build you were
looking at.

## Two test tiers, split by what they may touch

- **Hermetic** (push CI, every commit): unit + e2e against the built bundle,
  network stubbed via Playwright route fixtures, zero credentials. The push
  gate.
- **`@live`** (local phase gate / nightly): real PDS, real OAuth, credentials
  from gitignored `.env`. Never in push CI — the third-party consent screen
  and rate limits make it non-hermetic by nature.

`@live` specs must tolerate a missing `.env` at module load: the runner
lists excluded tests by importing the module (learned when CI run #1 failed
on `ENOENT: .env`).

## Write tests are hard-guarded

Anything that writes to a real repo: (1) dedicated test account only, with
the DID **asserted** before any mutation (refuse everything else); (2)
test records carry a marker in a visible field; (3) cleanup is a **pre-run
purge** of marker-matching records, not teardown-only — teardown doesn't
run when a test crashes.

**Guarded multi-collection purge (M4/9a).** The recipe suite matches a
`MARKER` substring in `record.value.name`. The M4 social record types
(`app.arecipe.friend`, and later comment/interaction/mute) carry no
user-facing `name`, so the marker layer does not transfer. There, the
safety boundary is the asserted `TEST_DID` **plus** the fact that the
account is test-only, so every record in those collections is
test-created — the purge deletes the **whole** collection. The shared
helper is `purgeCollection(collection, { handle, appPassword, match? })`
in `tests/e2e/helpers/live.ts`: `match` narrows when a collection supports
a marker; omit it to purge all. Always keep the hard `TEST_DID` assertion.

## Never let a test dump a secret

Playwright failure logs print element state, including a filled password
field's value (this leaked a credential into a session transcript once).
Fill discipline for third-party auth pages: check the field is enabled and
empty before filling; never retry a fill on a filled/disabled field.

## Fixtures are recorded reality

Unit and hermetic e2e run against *captured* responses (`tests/fixtures/`,
each directory with a `PROBE-NOTES.md` recording when/where/how). Never
hand-write a fixture for an external shape — probe it, record it, note the
discrepancies you find (that's how the ULID-vs-`key: tid` and website-vs-
canonical lexicon skews were caught).

## Only write formats you've observed

Before writing a field to the network, find it in a wild record and copy the
observed format (e.g. `recipeCategory: "dessert"` plain-word vs
`cookingMethod: "exchange.recipe.defs#cookingMethodBaking"` token-ref).
"Probably a string" is how interop breaks silently.

## Async renders carry a generation

Any page with more than one async data source guards DOM writes with a
generation counter — the newest user action bumps it; stale completions
check it and drop. Found the hard way: the slow starter feed clobbered a
fast user search seconds after it rendered.

## Storage access is defensive

`localStorage`/`sessionStorage` throw in Safari private mode (and stub out
in some test DOMs). Every read/write is wrapped; failure degrades to
defaults, never crashes. Same posture for `navigator.storage.persist()`:
request, log the answer, never assert it.

## Re-encode user media before it leaves the device

Canvas decode→draw→re-encode strips EXIF (GPS!) by construction — full-size
path included, not just thumbnails. Prove it in the `@live` test by fetching
the uploaded bytes back and scanning for the marker; a real wild recipe
photo shipped iPhone GPS data.

## Look at it before you ship it

Every UI change gets a real-browser screenshot pass (real Chrome via
`channel: 'chrome'`, light AND dark, mobile viewport when nav is involved).
The billboard-photo and boxed-toggle defects were caught by eyes, not tests.
Tampered/error states get screenshotted too (doctor a fixture).

## Service workers vs test fixtures

A SW `fetch` handler that touches cross-origin requests silently bypasses
Playwright route interception. Rule: the SW handles **same-origin only**;
cross-origin passes through untouched. (Phase 8b's cache-first worker is
designed around this.)

## The console is the debugger of a backendless app

Every risky boundary (auth steps, PDS fetches, CID verification, uploads,
SW lifecycle) logs through the leveled `[arecipe]` logger — debug/info
gated behind `?debug=1`/`localStorage.debug`, warn/error always. If a
failure can't be diagnosed from the console, the logging is incomplete.
The `?debug=1` URL flag does not survive OAuth redirects — use the
localStorage flag around auth flows.
