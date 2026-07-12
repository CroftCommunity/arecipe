# D4 probe capture — 2026-07-07

Lexicon JSON fetched from `https://recipe.exchange/lexicons/<nsid>.json`
(HTTP 200, application/json) for: recipe, collection, defs, profile.

Canonical resolution ALSO works: `_lexicon.recipe.exchange` DNS TXT →
`did=did:plc:4cx7ts7lqgjtsfquo53qo3sz` → PDS
`poisonpie.us-west.host.bsky.network` → `com.atproto.repo.getRecord`
`com.atproto.lexicon.schema/exchange.recipe.recipe` (HTTP 200; captured as
`canonical-lexicon.schema-record-*.json`).

## exchange.recipe.recipe field map (defs.main.record)

- type `record`, key **`tid`** (declared)
- **required:** name, text, ingredients, instructions, createdAt, updatedAt
- name: string maxLen=255 · text: string maxLen=3000
- ingredients: string[] · instructions: string[]
- attribution: union · embed: ref → #imagesEmbed (blob images)
- prepTime/cookTime/totalTime, recipeYield, recipeCategory, recipeCuisine,
  cookingMethod: string · nutrition: object · suitableForDiet/keywords:
  string[] · createdAt/updatedAt: string (datetime)
- langs: string[] maxLen=3 — **website-only** (not yet in the canonical
  PDS record; only diff between the two sources; optional field)

## Discrepancies observed (spec-vs-practice)

1. **Website lexicon vs canonical record skew:** website adds `langs`;
   otherwise byte-identical structure. Treat the website as the leading
   edge; open-world validation makes the skew harmless.
2. **`key: tid` is declared but not practiced:** real recipe.exchange
   records use 26-char ULIDs as rkeys (e.g. `01JQJ5RW51ZVEW72XN6GSRWC8D`),
   not 13-char TIDs. PDSs don't enforce the declared key type. Phase 6
   decision: match practice (ULID) or spec (TID) when arecipe writes —
   flagged in the plan.

---

# `.ics` Content-Type probe on GitHub Pages — 2026-07-12

**Question.** What `Content-Type` does the live arecipe.app (GitHub Pages)
origin serve for a `.ics` file? Decides whether a committed/snapshot `.ics`
on Pages is usable by calendar clients, or whether a proxy is needed to fix
the header.

**Method.** A minimal valid iCalendar file (CRLF) was committed at
`assets/calendar-probe.ics` — `assets/` is the one path `scripts/build.mjs`
copies recursively into `dist/`, so it survives the allowlist build (a
root-level `.ics` would be dropped). Deployed to the live site via the normal
`ci.yml` `deploy` job (push to `main` → `upload-pages-artifact` +
`deploy-pages@v4`); there are no preview deploys. Probed after the deploy
Action reported success.

- Probe commit: `9ea1cc97c681ebc6c4aaec2451f1081ef7a7e7c7`
- Published URL: `https://arecipe.app/assets/calendar-probe.ics`

**Observed — GitHub Pages (`curl -sS -D - -o /dev/null`):**

```
HTTP/2 200
server: GitHub.com
content-type: text/calendar
cache-control: max-age=600
content-length: 239
# (no x-content-type-options header)
```

Body intact — `curl … | head` returned `BEGIN:VCALENDAR … END:VEVENT`.
Second hit served from cache (`x-cache: HIT`); header stable across hits.

**Contrast — raw.githubusercontent.com (same committed file):**

```
HTTP/2 200
content-type: text/plain; charset=utf-8
cache-control: max-age=300
x-content-type-options: nosniff
content-length: 239
```

**Conclusion: PASS.** Pages labels `.ics` as `text/calendar` — correct.
A snapshot `.ics` on Pages is viable *on the content-type axis*: calendar
clients will accept the served media type. No proxy/function is required to
fix the header.

Notes:
- Pages sends **no `X-Content-Type-Options: nosniff`**, so sniffing isn't a
  factor here anyway — but it's moot since the label is already correct.
- `raw.githubusercontent.com` is the opposite (`text/plain` + `nosniff`) and
  is NOT usable directly by calendar clients — that host is not the delivery
  path, Pages is.
- **Scope:** this settles only content-type. A committed `.ics` is a frozen
  snapshot that changes only on commit/deploy — a PASS means a correctly
  labeled static file, NOT a subscribable live feed.

Cleanup: `assets/calendar-probe.ics` removed in the follow-up commit that
recorded this finding; the finding is kept.
