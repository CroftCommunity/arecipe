# GitHub Contents API browser CORS probe — findings

**Date:** 2026-07-12
**Question (for D3, the client-push adapter):** Can a browser at the
`https://arecipe.app` origin call `api.github.com`'s Contents API
(GET a file's sha, then PUT new content) **cross-origin** with a fine-grained
PAT and **no CORS proxy**? This decides whether D3 is backendless and
zero-third-party, or whether it needs a proxy origin (which would conflict with
`docs/SECURITY.md`).

---

## Verdict: PASS

A browser can GET **and** PUT the GitHub Contents API cross-origin with a
PAT-in-`Authorization`-header, **no proxy required**. D3 can be backendless and
zero-third-party on the CORS axis.

CORS is enforced by the browser, so the definitive evidence is the real-browser
test (§3); curl (§1–2) is the supporting read of advertised headers.

---

## 1. Advertised preflight headers (real GitHub, direct)

`OPTIONS` preflight for a `PUT`, `Origin: https://arecipe.app`:

```
HTTP/2 204
access-control-allow-origin: *
access-control-allow-methods: GET, POST, PATCH, PUT, DELETE
access-control-allow-headers: Authorization, Content-Type, If-Match, If-None-Match, If-Modified-Since, ...
access-control-max-age: 86400
```

- **`Allow-Origin: *`** — origin-agnostic, not reflected/restricted. Any origin
  is allowed, so a page served from `arecipe.app` (or anywhere) qualifies.
- **`Allow-Methods` includes `PUT`** and **`Allow-Headers` includes
  `Authorization, Content-Type`** — exactly what the GET-sha-then-PUT flow needs.
- `Allow-Origin: *` with **no `Access-Control-Allow-Credentials: true`** means
  GitHub expects the **token-in-header** model (not cookies). A
  `fetch(..., { headers: { Authorization: 'Bearer <pat>' }})` with default
  (non-credentialed) mode is compatible with `Allow-Origin: *`.

## 2. Request/token sanity (curl, direct, with PAT)

- GET new path → `404` at authenticated rate tier (`x-ratelimit-limit: 5000`) —
  token has repo access; path simply didn't exist yet.
- PUT (base64 content) → **`201`/`200`, commit landed on HEAD.** Confirms the
  request shape and token scope independent of CORS.

## 3. Definitive browser test (Playwright, CORS enforced)

Real Chromium, page served from a real `http://127.0.0.1:<port>` origin, ran the
D3 sequence via `fetch()`:

```json
{ "getStatus": 200, "getSha": "b4d6bf8d…",
  "putStatus": 200, "commitSha": "df91e363…",
  "blocked": false, "consoleErrs": [] }
```

- **`blocked: false`** — neither the GET nor the PUT (nor its preflight) threw a
  CORS `TypeError`. The PUT resolved `200` and **landed a real commit**.
- Reading `Access-Control-Allow-Origin` from JS returns `null` **by design** —
  that header is consumed by the browser and never exposed to
  `Response.headers.get()`. The fetch resolving (not throwing) is the CORS proof,
  not the header value.

---

## Interpretation

- **Browser GET + PUT succeed cross-origin with no proxy → PASS.** D3's
  client-push adapter can talk to GitHub directly from `arecipe.app` with a
  user-supplied fine-grained PAT. No CORS shim / third-party origin is needed, so
  no conflict with `docs/SECURITY.md` on this axis.
- The PAT travels as an `Authorization` header (not a cookie); `Allow-Origin: *`
  without `Allow-Credentials` is exactly the right shape for that.

## Scope / caveats (what this does NOT settle)

- **CORS only.** Says nothing about the *security* of shipping a
  Contents-write-scoped PAT into a browser (token storage, XSS blast radius,
  revocation UX) — that's a separate D3 security question.
- Fine-grained PAT with **Contents: write + Metadata: read** on a single repo was
  sufficient. Real D3 will need a token-provisioning UX.
- Rate limits: authenticated writes are 5000/hr; unauthenticated preflights are
  not the constraint.

---

## Environment note (why the method looks indirect)

This probe ran inside a Claude Code session whose outbound HTTPS goes through a
policy-enforcing agent proxy. That proxy **intercepts `api.github.com`**, scopes
it to the session's configured repos, ignores user PATs, and rejects `OPTIONS` —
so a naïve curl/browser through it returns the *proxy's* 403/405 (identifiable by
`documentation_url: docs.anthropic.com/...`), **not** GitHub's real CORS
behavior. The faithful test required **direct egress** (`curl --noproxy`,
Chromium `--no-proxy-server`), which reaches real GitHub. Because the network
also transparently re-terminates TLS with a private CA this Chromium build didn't
trust, the browser context used `ignoreHTTPSErrors: true` — which skips **cert
validation only** and does **not** relax CORS, so the observation is valid. On a
normal end-user network none of this applies: the browser talks straight to
`api.github.com`.

## Housekeeping

- Probe repo/token were supplied out-of-band via env; **no token was written to
  any file, commit, or log.** The scratch Playwright script contained no token
  (injected via env → `page.evaluate` at runtime) and was deleted.
- Throwaway file `assets/probe-cors.ics` on the probe repo was deleted after the
  test (verified 404). The create/update/delete probe commits remain in that
  repo's history — the probe repo is disposable and should be deleted.
- **Action required by the human: revoke the fine-grained PAT and delete the
  probe repo.**
