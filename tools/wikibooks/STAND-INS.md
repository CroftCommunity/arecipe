# STAND-INS register

Everything this tool fakes, stubs, or approximates, per the standing directive
"Declared stand-ins register." Each entry: **what it stands in for** and **what
would make it real**.

---

## Test doubles (by design — the suite must make no network calls)

### Fake wiki transport (`FetchLike` in tests)
- **Stands in for:** the real MediaWiki Action API over HTTPS.
- **Where:** every `tests/*.test.ts` except the D12 live smoke.
- **What makes it real:** the D12 live smoke test (`WIKIBOOKS_LIVE=1`) drives the
  *same* etiquette layer (`WikiTransport`) against the real API for three named
  pages. That is the single boundary between stand-in-grade and live-grade.

### Fake PDS (`FakePds` in tests)
- **Stands in for:** a real atproto PDS accepting `com.atproto.repo.applyWrites` /
  `putRecord` / `deleteRecord`.
- **Where:** D10/D11 publish tests.
- **What makes it real:** wiring `WIKIBOOKS_PUBLISH_*` config to a real PDS and
  running `wbsync publish --publish`. Deliberately **not** covered by any live
  test — the brief keeps publish dry (D12: "Do not point the live test at a PDS").

### `FakeClock` (`src/util/clock.ts`)
- **Stands in for:** wall-clock time and real `setTimeout` delays.
- **Where:** etiquette backoff/gap tests; any transform test needing `retrievedAt`.
- **What makes it real:** `realClock` in production wires `Date.now()` and
  `setTimeout`. The transform stage never reads the real clock at all — time is an
  injected input so IR is a pure function of (wikitext, injected time).

---

## Configuration placeholders (owner decisions)

### O2 — licence string
- **Value used:** `CC-BY-SA-4.0`, token `licenseCreativeCommonsBySa`, attribution
  "Wikibooks Cookbook contributors, CC BY-SA 4.0 (older revisions … remain 3.0)".
- **Stands in for:** the owner's final legal attribution string.
- **What makes it real:** the owner confirms/replaces `WIKIBOOKS_LICENSE_*`. The
  value is config; the code only requires that *some* licence is present on every
  record and refuses to publish without one.

### O4 — publish account
- **Value used:** handle `cookbook.arecipe.app` (config), service + app-password
  unset.
- **Stands in for:** the real arecipe-owned publish PDS account.
- **What makes it real:** the account is provisioned and `WIKIBOOKS_PUBLISH_SERVICE`
  + `WIKIBOOKS_PUBLISH_APP_PASSWORD` are set. Until then `--publish` is refused.

---

## Approximations in the transform

_(populated as the transform stage lands — D5–D8)_

---

## Guards that stand in for heavier checks

### O1 build byte-identity
- **Check performed:** static assertion that `scripts/build.mjs` contains no
  `tools/` reference and that no arecipe `src/` file imports from `tools/`.
- **Stands in for:** a full `dist/`-byte-diff before vs after the tool lands.
- **Why it's sound:** `build.mjs` bundles a fixed allowlist of `src/pages/*.ts`
  entry points and copies a fixed asset allowlist; it has no path into `tools/`,
  so its output cannot depend on the tool's presence.
- **What makes it real:** arecipe's own CI runs the real build; a byte-diff there
  would be belt-and-braces.
