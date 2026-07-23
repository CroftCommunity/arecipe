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

### `HttpPdsClient` (`src/publish/http-pds.ts`) — untested real code
- **Stands in for:** nothing at test time — it is the REAL PDS client, but it is
  never exercised by the suite (publish stays dry, D12). It is the untested
  boundary: a live `wbsync publish --publish` against `cookbook.arecipe.app` is
  what would exercise it.
- **applyWrites vs putRecord:** the brief says batch via
  `com.atproto.repo.applyWrites` "if the pinned SDK exposes it; otherwise
  sequential putRecord with backoff." There is no SDK (zero runtime deps), so we
  take the **sequential putRecord** path — which also buys idempotent, resumable
  application. Making applyWrites real: add a batched `applyWrites` XRPC call and
  a lexicon check that the PDS accepts it.

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

## Fixtures (D5–D8)

- **31 real wikitext fixtures**, captured live from en.wikibooks via
  `scripts/capture-fixtures.mjs` (the real etiquette layer), committed under
  `tests/fixtures/wikitext/` with a `MANIFEST.json` recording pageid/revid/title.
  Chosen to span the awkward cases: grouped ingredients under sub-headings,
  nested `{{convert}}` in an infobox param, a table-based ingredients list, a
  non-Latin title, no-infobox pages, three-link ingredient lines, etc.
- **Stand-in caveat:** the committed **IR snapshots** (`tests/fixtures/ir/*.json`)
  are generated *by this parser*, so they are a **regression** oracle, not an
  independent correctness oracle. Correctness is pinned separately by the
  hand-written targeted tests in `d5-d8-transform.test.ts`. What would make the
  snapshots independently authoritative: a second, hand-verified IR for a few
  fixtures reviewed against the rendered wiki page.

## Approximations in the transform

- **`optional` detection** is broadened beyond the brief's "leading marker only"
  to also accept the unambiguous trailing `(optional)` / `, optional`, because
  the real corpus overwhelmingly uses the trailing form. Mid-line "optional"
  (e.g. "oil for optional frying") is deliberately NOT treated as a marker.
- **Table-based ingredient/procedure content** (e.g. `afghan-bread`, whose
  ingredients live in a `{|wikitable|}`) is NOT parsed — conservative posture.
  The table is recorded as a `table` parseFlag (never silently dropped); the page
  fails the completeness gate and is `skipped`. Making it real: a wikitable
  row-parser feeding IngredientLines.
- **Non-list prose** inside an Ingredients/Procedure section (e.g. "Equal parts:")
  is preserved as an `ingredients-prose` / `procedure-prose` parseFlag rather than
  modeled structurally. Nothing is lost; it is just not typed.
- **`lead`** (the record description) is a heuristic: the first sentence-shaped
  line of the lead block, skipping breadcrumb/nav lines. A page with an unusual
  intro may yield no lead; the record mapper falls back to a generated summary.
- **`{{convert}}` and other content templates** are stripped from display text
  (and flagged `template-stripped` / `template-in-value`); no quantity or unit
  parsing is done (explicitly out of scope for this run).
- **D15 crosswalks** (`src/transform/enrich-*.ts`) are curated, precision-first
  approximations: diet/category/cuisine map only recognizable source terms to
  controlled tokens; unmapped values are omitted from the token field and kept as
  `keywords`. `cookingMethod` is inferred from title/category keywords (lossy;
  omitted when ambiguous). `nutrition` is calories-only (fat/protein/carb absent
  upstream).
- **D15 images** are resolved LIVE from Wikimedia Commons (not faked). The
  ≤ 1 MB cap picks a server-scaled rendition (no local re-encode); the
  free-culture license allowlist (CC-BY/BY-SA/CC0/PD) is a policy stand-in for a
  full rights review; `Artist` HTML is stripped and the "no machine-readable
  author" boilerplate is dropped. Per-image `credit` is an open-world field.

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
