# Red-team review — verified installs (plan of 2026-09-14, #109)

Date: 2026-09-14
Status: **review complete; no production code changed.** Experiments live in
`tests/red-team/` (README there; results in `tests/red-team/results/`).
Reviewed: `plans/2026-09-14-plan-verified-installs.md` (merged in #109),
`plans/2026-07-16-4-plan-signed-releases.md` + `RUN-SIGNED-RELEASES-SUMMARY.md` (#107),
`docs/RELEASE-SIGNING.md`, `src/sw.ts`, `src/sw-nav.ts`, `src/sw-register.ts`,
`src/release/*`, `scripts/build.mjs`, `scripts/pages-deploy.sh`, the four workflows,
`client-metadata.json`, `tests/unit/release/*`, `tests/e2e/release.spec.ts`.

**Problem statement.** The plan wants to make three per-tier promises to a cook. Each
rests on platform behaviour the plan marks "as understood" and on code paths the plan
describes rather than cites. This review tries to break the promises with exactly one of
two attackers — the domain, or the signing key — and reports where the promises and the
platform disagree.

**Approach.** Read the plan, the landed code, and the runbook against each other; run
the load-bearing browser assumptions as real experiments in the repo's pinned engines
(Chromium 149.0.7827.55, Firefox 151.0, WebKit 26.5 via Playwright 1.61.1); read the
live site and the repository's GitHub settings; cite spec text where an experiment is
impossible from a working tree.

**Reasoning.** A promise a cook cannot check must be true in the platform, not in our
code. Where our code is the only thing standing between the cook and the attacker, the
promise has to say so.

---

## 0. Grounding facts (read live on 2026-09-14/15, not assumed)

| Fact | Value | Consequence |
|---|---|---|
| `https://arecipe.app/release-manifest.json` | `sig: null`, `pubkeyFingerprint: null`, build #400 | **Signing is not on in production.** `keys.ts` pins `null`; the update gate treats `no-pinned-key` as "offer normally". Every "verified" claim today is vacuous. |
| Repository secrets | none (`ARECIPE_SIGNING_SEED` not installed) | The interim key does not exist yet; the item-15 analysis below is about the moment it does. |
| Branch protection: `main`, `gh-pages` | none; rulesets: `[]` | The plan's "controls until then" (branch protection on `gh-pages`, deploy-job-only writes) **do not exist**. |
| Collaborators | one admin | Any second write collaborator, or a compromise of the one account, is both gates at once (F7). |
| Actions | `sha_pinning_required: true`, default token `read`, fork-PR approval `first_time_contributors` | Good baseline; `security.yml` still calls a reusable workflow `@main`. |
| Pages | branch `gh-pages` / root, `https_enforced: false`; `http://arecipe.app/` answers `200` with content, no redirect, no HSTS | Low finding F12. |
| Pages response headers | `cache-control: max-age=600`, nothing else; no way to set headers | A GitHub-hosted domain attacker cannot send `Clear-Site-Data`; a DNS/hosting-level one can (F6). |
| arecipe account | `arecipe.bsky.social` = `did:plc:spfl4xaktvvchr2cqp2r2xvp`, PDS `phellinus.us-west.host.bsky.network`; no `_atproto.arecipe.app` TXT, no `/.well-known/atproto-did` | The second origin is genuinely off the domain **if the build pins the DID**, not the handle (F10). |
| `client-metadata.json` | `client_id: https://arecipe.app/client-metadata.json`, `redirect_uris: [https://arecipe.app/signin.html]`, DPoP | The OAuth client's identity *is* the domain (F8). |
| Worker registration | `register('./sw.js')`, scope `/`, default `updateViaCache`; registered from every page | The production worker's scope covers `/pr-preview/…` (F3). |

---

## 1. Verdict per claim

**Installed app — false as written.** "It stays on this version until you tap update":
today, someone who controls the website can change what the app shows without touching
the worker and without any tap, because the worker copies the website's new home page into
its own cache in the background and serves it on the next launch (F1). After the plan,
the same person can still change the app at every ordinary release, because the browser
fetches the new worker with a header our page cannot send, so the website can hand the
browser different bytes than it hands our check (F4). "A different key warns you and you
can say no" holds only if the check is against the key baked into the app, not the one
saved on the device, because any page from the website can rewrite the saved one (F13);
and the warning is a click-through surface a legitimate rotation teaches the cook to
click (F9). "If the website is ever taken over, you are warned at your next launch and can
stop" is true for exactly one launch, and only if the takeover happened while the cook was
online with the app running: the launch after the warning runs whatever the website now
serves, in every engine, because closing the app or restarting the browser activates the
waiting worker (F2). "Stop" means "remove the app from this device"; the plan's reject
button does not do that.

**Isolated Web App — holds for the app's code, with two conditions the sentence hides.**
Chromium only lets an update through with the release key, so "no one can change this
app without the arecipe release key" is true of the bytes. But no cook can install one
today: the shipped paths are enterprise-managed ChromeOS (Chrome 128), an
enterprise-managed Windows rollout (Chrome 161), and a developer flag; there is no Android
build and no consumer store (A16). And signing in still goes through arecipe.app: the
atproto client identity is a URL on the domain, the redirect must land on the domain, and
a normal browser tab cannot navigate into an IWA (F8, A16). So the sentence should end
"…and signing in still depends on the arecipe.app website."

**Browser tab — same as installed, and the tab is the attack surface.** Everything above
applies. In addition a hard reload bypasses the worker, `Clear-Site-Data` from a
hosting-level takeover wipes the install (F6), and a link to any address on arecipe.app
that is not one of our pages opens a tab the worker hands to the network, where the
website's code runs with the install's full storage and sign-in authority (F3).

---

## 2. Findings, most severe first

Classification: **design** = the plan's own logic; **platform** = the browser or GitHub;
**gap** = landed code differs from what the plan or runbook says. "Today" = main at
`bf0c450` (#109). Attacker A = domain only; B = key only.

### F1 — A, today. The good worker copies the website's home page into its own cache and serves it next launch. No worker change, no tap, no warning.
- **Sequence.** (1) Cook has the installed app, worker `sw.js` v400 controlling. (2) The
  website's `index.html` is replaced. (3) Cook opens the app while online: the worker
  serves the cached good shell (a "known document") and, in the background, fetches the
  network copy and **writes it into its own cache** (`sw.ts` `fetchNetwork` →
  `cache.put(event.request, fresh.clone())`, reached from `sw-nav.ts`'s exact-hit
  branch). (4) Cook opens the app again: the worker serves the attacker's HTML,
  cache-first. The attacker's HTML carries its own CSP and references its own hashed
  script names, which the worker fetches from the network and caches (subresource path,
  `fresh.ok`). No `updatefound`, no toast, no banner; the Release panel, if signing were
  on, would still read "verified" because the manifest is untouched.
- **Cook sees.** Step 3: the normal app. Step 4: whatever the attacker drew.
- **Breaks.** Assumption 7. The plan's two-gate "Today" column says a hostile origin needs
  the worker replaced first; it does not.
- **Class.** Gap today; the plan's D4 would close it **only** if per-file refuse covers
  the navigation revalidate and the worker serves solely from caches it owns (see F13).
- **Evidence.** `tests/red-team/e6-real-dist-revalidate-poison.mjs` against the real
  `dist/`, steps 2–3, all three engines: `step3_second_reload.title = "PWNED"`,
  `controller = "sw.js"`, one registration, one cache (`results/e6.txt`).

### F2 — A, today and after the plan. The warning lasts one session. Closing the app, navigating away, or restarting the browser activates the waiting hostile worker before any page code runs.
- **Sequence.** (1) Website swaps `sw.js`. (2) Cook launches online; `register()` makes
  the browser fetch the new bytes; they install as *waiting*; `updatefound` fires; the
  plan's stop screen shows; cook taps reject. (3) Cook backgrounds the app, the phone
  reclaims it, or the browser restarts. (4) Next launch: the waiting worker is now
  *active* and serves the launch navigation. Our page code runs, if at all, inside the
  attacker's shell.
- **Cook sees.** One stop screen, then on the next launch the attacker's app, with no
  second warning (the page never sees an `updatefound`; the events list is empty).
- **Breaks.** Assumptions 1, 2, 4. The plan's narrative admits "tells her not to reopen",
  but the per-tier sentence promises a warning "at your next launch"; the launch after
  the warning is the one that matters and is silent.
- **Class.** Platform limit, correctly stated in the spec; design flaw in the reject
  copy. Spec: *Try Activate* activates when "no service worker client is using
  registration"; *Handle User Agent Shutdown*: "If registration's waiting worker is not
  null, then in parallel: Invoke Activate with registration."
- **Evidence.** `e1-restart-activates-waiting.mjs`, all three engines: step 3
  (navigate to another origin and back) → `servedBy: "v2"`; step 5 (persistent profile
  closed and relaunched with v3 waiting) → Chromium and WebKit `servedBy: "v3"` with
  `events: []`; Firefox `controllerVersion: "v3"` (`results/e1.txt`). Device check that
  would settle the phone case: install the PWA on the Samsung, swap the worker
  server-side, launch once (see stop screen), swipe-kill, relaunch, read the served-by
  stamp. The engine result predicts the phone result but does not replace it.
- **Recommendation.** Reject should offer, as the default, to *wipe this install*
  (unregister, delete caches, clear the release config, sign out and revoke the session).
  D3's reason for not unregistering (re-registering fetches from the compromised origin)
  is true but the alternative is worse: a waiting hostile worker with the DPoP session
  still in IndexedDB.

### F3 — A, today. Any in-scope address that is not one of our pages hands a tab to the website, and that tab owns the install: it can unregister the worker, wipe and poison caches, rewrite the release config, and use the sign-in session.
- **Sequence.** (1) Attacker posts or DMs a link `https://arecipe.app/recipes/holiday`
  (any path not in the precache). (2) Cook opens it online. The worker's rule for an
  unknown navigation is network-first (`sw-nav.ts`), so the website's HTML runs in the
  origin, controlled by our worker but not served by it. (3) That page calls
  `getRegistrations()` and `unregister()`, `caches.delete()`, writes
  `arecipe-release` in IndexedDB, and can call the PDS with the DPoP-bound session the
  OAuth client keeps in IndexedDB (non-extractable key, fully usable by same-origin
  code). (4) Next launch is a bare fetch from the website.
- **Cook sees.** A page on arecipe.app. Then, next launch, the attacker's app or a
  blank one.
- **Breaks.** Assumptions 7 and 8. Also: the PR-preview mechanism is a *first-party*
  delivery of unreviewed code to exactly this surface — `preview.yml` builds any
  same-repo PR head and publishes it under `/pr-preview/pr-N/` on the production
  origin, sharing storage with every production install (the "read-only, no sign-in"
  note on previews is about *offering* sign-in; it does not stop a preview page from
  using an existing session).
- **Class.** Design (the co-hosting rule in `sw-nav.ts` was written to keep previews
  working, and it opens this).
- **Evidence.** `e4-subpath-page-owns-root.mjs`, all three engines: the foreign page
  sees `registrations: ["/"]`, `unregistered: [true]`, `cachesDeleted: [true]`;
  `next_launch.controller: null` (`results/e4.txt`). Cache poisoning from such a page:
  `e6` step 4 (`servedBodyHead: "window.__chunkPwned=1;"`) — the worker's global
  `caches.match()` serves a cache named `evil` for the not-yet-cached heavy chunk.
- **Recommendation.** Serve the app shell for **every** in-scope navigation (a pinned
  install already does this — `sw.ts`'s override path — which is an inconsistency worth
  noting: the pin closes F3, the default does not). Move previews to a different origin
  (`croftcommunity.github.io` already is one; the app classifies it as `preview`).

### F4 — A, after the plan. The page cannot see the bytes the browser installs. The browser's worker fetch carries `Service-Worker: script`; the website serves it different bytes than it serves our check.
- **Sequence.** (1) A legitimate release ships: manifest signed, names `sw-<h2>.js`.
  (2) The cook's page verifies the manifest, hashes its own `fetch()` of `sw-<h2>.js`
  (matches), offers the toast; the cook taps. (3) The page calls `register('sw-<h2>.js')`;
  the browser fetches the URL with `Service-Worker: script`; the website answers that
  request with hostile bytes. (4) The hostile worker installs and, with consent,
  activates. Every check passed.
- **Cook sees.** A normal update toast for a real release. Nothing else.
- **Breaks.** Assumption 4/6 as the plan uses them: D3 "the page verifies the newcomer's
  hash on `updatefound`" and Phase 1 "verifies the new worker's hash" describe something
  a page cannot do. Only `installing.scriptURL` is observable; the script body never is.
  The D6 monitor has the same blind spot unless it sends the header.
- **Class.** Platform (spec, *Update* algorithm: "Append `Service-Worker`/`script` to
  request's header list … Set request's service-workers mode to 'none'"); design flaw
  in D1/D3/D6 as written.
- **Evidence.** `e5-service-worker-header-split.mjs`, all three engines:
  `page_fetch_sees: "// sw.js v1"`, `browser_installed.waitingVersion: "HOSTILE"`, the
  origin log shows the browser's fetch with `swHeader: "script"` and the page's with
  `null` (`results/e5.txt`).
- **Consequence for the table.** "Replace content, honest deploy path — domain + key"
  is wrong. The key gates the *offer*; honest offers happen at every release; the domain
  gates the *bytes*. A domain attacker who waits for a release needs no key.
- **Recommendation.** Drop hashing from D3; the alarm is simply "an `updatefound` (or a
  `waiting`/`installing` at `register()` resolution) that this page did not initiate".
  For the consented path there is no browser-side fix; state it. The monitor must fetch
  the worker **with** `Service-Worker: script` and compare against a plain fetch.

### F5 — A, today. The update toast is an attacker-driven consent path: keep the real signed manifest, swap `sw.js`, and our own gate offers the hostile worker as "verified".
- **Sequence.** (1) Website keeps `release-manifest.json` exactly as CI published it and
  replaces `sw.js`. (2) Cook launches online; the browser installs the new worker as
  waiting; `offerUpdate` runs `shouldOfferUpdate`, which fetches the (real) manifest,
  gets `verified` (same version) and returns `offer: true` (`update-gate.spec.ts`:
  "verified (same version — e.g. a re-check) is offered"). (3) Toast; tap;
  `SKIP_WAITING`; reload into the attacker's worker.
- **Breaks.** Assumption 4: the gate binds the *manifest at the origin*, not the *bytes
  the browser installed*.
- **Class.** Gap today. The plan's "Today" row says "domain, silent"; it is "domain,
  silent, or with our toast inviting the tap". Phase 1 semantics (the toast comes only
  from a page-noticed newer manifest) remove the invitation but not F4.
- **Evidence.** Code reading of `sw-register.ts` + `update-gate.ts`; the E5 request
  log shows the same origin can distinguish the two fetches. Reproduction would be E5
  plus the real `sw-register`; not run because the code path is unambiguous.

### F6 — A at DNS/hosting level. One response header from the website wipes the registration, the caches and IndexedDB from under a running page; the next launch is a bare fetch.
- **Sequence.** (1) Attacker controls what `arecipe.app` serves at the TLS level (DNS
  or hosting takeover; GitHub Pages itself cannot set headers, so a `gh-pages`-only
  attacker cannot do this). (2) Cook launches online. The worker's activate path fetches
  `./release-manifest.json` with `cache: 'reload'`; every page fetches
  `build-info.json`; both are pass-through by design ("always live"). (3) The response
  carries `Clear-Site-Data: "storage"`. (4) The browser unregisters the worker and deletes
  Cache Storage and IndexedDB — the pin, the last-verified cache, the TOFU fingerprint,
  the OAuth session. (5) Next navigation: no worker, network HTML.
- **Cook sees.** Nothing at step 3–4 (the current page keeps rendering). Next launch:
  the attacker's site.
- **Breaks.** Assumption 5's sibling ("offline launches cannot change the registration"
  holds; *online* launches can lose it with no page code involved) and assumption 8.
- **Class.** Platform, by design (Clear-Site-Data §3.2: applied to any credentialed
  network response, fetch() included; §4.2.5: "Execute unregister() on registration").
- **Evidence.** `e3-clear-site-data.mjs` (`results/e3.txt`). Chromium 149: registration,
  caches and IDB all gone for all three deliveries (page fetch, the worker's own fetch,
  and the worker-script update response — that last one aborts the update job and still
  clears). Firefox 151: registration, caches and IDB gone for both fetch deliveries; the
  header on the worker-script response hung `update()` and cleared nothing. WebKit 26.5:
  caches and IDB gone in all three; the registration survives — with an empty cache the
  surviving worker serves the network, which is the same outcome one launch later.
- **Recommendation.** No client-side defence exists. Name it in the threat table as the
  hosting-level case, and make the monitor (D6) fetch the manifest and worker with
  credentials and fail on any `Clear-Site-Data` header.

### F7 — A and B together, from one GitHub write permission. Write access to the repository is the domain and the key at once, without touching `main`.
- **Sequence (domain).** (1) A collaborator, or anyone holding a collaborator's token,
  pushes a branch that edits `scripts/pages-deploy.sh` (or adds a workflow step) and
  opens a same-repo PR. (2) `preview.yml` fires on `pull_request`, checks out the **PR
  head**, and runs `bash scripts/pages-deploy.sh` *from that checkout* with
  `contents: write`. The edited script publishes to the `gh-pages` **root**. No review,
  no `main`, no protection to bypass (none exists on `gh-pages`).
- **Sequence (key, once the seed is installed).** Repository secrets are readable by
  any `push`-triggered workflow on any branch (GitHub: "Any user with write access to
  your repository has read access to all secrets configured in your repository"). A
  workflow on a throwaway branch prints the seed.
- **Breaks.** Assumption 15. The plan's "Still outside" list names branch protection on
  `gh-pages`, hardware-key 2FA and deploy-job-only writes as the interim controls; the
  first and third are absent (`gh api …/branches/gh-pages/protection` → "Branch not
  protected"; rulesets empty).
- **Class.** Gap (ops), and a design fact the two-gate table must show: until the
  offline ceremony **and** a preview path that does not run PR-head code with a write
  token, "domain + key" is one gate.
- **Evidence.** `preview.yml` lines "Check out … ref: steps.resolve.outputs.sha" and
  "Deploy preview … bash scripts/pages-deploy.sh"; `ci.yml` deploy job
  `secrets.ARECIPE_SIGNING_SEED` with no `environment:`; `gh api` outputs in §0.
- **Recommendation.** Move the seed to an **environment** secret restricted to `main`
  with a required reviewer; give `gh-pages` a ruleset that allows only the
  `github-actions` deploy path; in `preview.yml`, run the deploy script from `main`'s
  checkout, not the PR's, and refuse targets other than `pr-preview/pr-N`; move previews
  off the origin (F3). Note `security.yml` calls a reusable workflow `@main` despite
  `sha_pinning_required` (low).

### F8 — A. The sign-in flow is anchored to the domain, not to the key, and the plan does not say so.
- **Sequence (new sign-ins).** (1) Domain attacker edits `client-metadata.json`
  (`redirect_uris`, `scope`) and serves their own `signin.html`. (2) Cook signs in. The
  PDS fetches the client metadata from the domain at authorization time (atproto OAuth:
  "fetched dynamically by Authorization Servers as part of the authorization request")
  and shows the consent screen for **the real client** — `client_id` *is*
  `https://arecipe.app/client-metadata.json`, `client_name: arecipe`. (3) Tokens are
  DPoP-bound to the attacker's key. Nothing signing does is consulted by the PDS.
- **Sequence (existing sessions).** Any same-origin code (F1, F3, F6-then-next-launch)
  uses the stored DPoP session directly.
- **Breaks.** Assumption 11. The plan mentions OAuth only for the IWA probe; the runbook
  threat table has no row for it.
- **Class.** Design omission. Inside/outside: **outside** anything signing can cover, and
  the plan must say so. The only levers are short token lifetimes, a tripwire sign-out,
  and the PDS's own consent UI.
- **Evidence.** `client-metadata.json`; atproto OAuth spec §client metadata; the
  sessions live in the OAuth client's IndexedDB in this origin.

### F9 — A (and B for a replay). Key rotation is a cook-judged warning; a domain attacker with any key of their own presents the same warning, and the legitimate rotation teaches the click. Also: the runbook and the code disagree about what a foreign key means.
- **Sequence.** (1) Attacker serves a manifest signed by *their* key naming *their*
  fingerprint, plus matching content. (2) Under D2 the page shows "the key changed —
  old …, new … — decline is the default", pointing at a Bluesky announcement the cook
  probably will not open. (3) A real rotation, some months earlier, showed the identical
  screen and the cook clicked through because the app then worked.
- **Contradiction.** `docs/RELEASE-SIGNING.md` § Rotation: "expect 'couldn't check'
  (not 'invalid') from stale installs … the UI treats an unknown-key manifest as
  uncheckable, not as an attack." `verify.ts` returns `invalid: fingerprint-mismatch`,
  the banner says "release check FAILED", `shouldOfferUpdate` withholds the update. On
  today's code a real rotation strands every install on the old key (they only escape via
  F2's restart activation, which is the bug doing the work of a feature).
- **Class.** Design (D2), gap (runbook vs code).
- **Recommendation.** A rotation is offered **only** when the PDS status record (D5)
  names the new fingerprint; otherwise a foreign key is a stop, not a choice. Publish the
  retired interim key as revoked in the same record: it lived in Actions and must be
  assumed leaked after the ceremony, and a leaked old key plus the domain passes every
  install that never accepted the rotation (assumption 13, downgrade-then-upgrade).

### F10 — A. The second origin is only as strong as three details the plan leaves implicit.
- The account must be identified by **DID** (`did:plc:spfl4xaktvvchr2cqp2r2xvp`) baked
  into the build, never by handle. Today the handle resolves through `bsky.social` and
  the PDS is on `bsky.network`, so a domain attacker cannot redirect it — but a handle
  under `arecipe.app` (a natural future change) would hand `_atproto` TXT or
  `/.well-known/atproto-did` to the domain attacker.
- The record must be trusted by **PDS provenance** (fetched from the DID document's PDS
  over TLS), not by a signature the release key makes; a status record that is merely
  "signed by the release key and fetched from anywhere" is forgeable by B and deliverable
  by A.
- `builtAt` max age is judged against the **device clock**. A phone with a wrong clock
  raises a false "frozen release" stop, and a false stop trains the click (F9). Compare
  build numbers between manifest and status record; use age only as advisory copy.
- The posting/publishing credential for the account must never enter Actions; the plan
  already says so for the post. If publishing `app.arecipe.status` needs a CI credential,
  D5 collapses into F7.
- The monitor is blind to F4-style split serving unless it sends `Service-Worker: script`.
- **Class.** Design gaps; hypotheses (no PDS status exists yet to test).

### F11 — Runbook vs code. The threat table claims detections the client does not perform, and none of it is live.
- "Tampered/substituted files on Pages, a CDN, or a mirror → ✅ manifest hash + signature
  mismatch": the client verifies the **signature, version identity and build number**
  (the panel says exactly this). No file hash is checked by any client path; F1 and F3
  run entirely inside that gap. The plan's own line "the hash of the entry bundle only"
  refers to browser SRI on the entry `<script>` tag, which the (unverified) HTML carries.
- "A deploy that bypassed CI → ✅ unsigned or wrong-key manifest": a bypass deploy that
  keeps the previously signed manifest and swaps files is undetected.
- "Rollback to an older signed release → ✅ buildNumber monotonicity": defeated by F2
  (the older worker activates on restart and verifies the older manifest against its own
  build number).
- And the whole table describes a state production is not in (§0: `sig: null`).
- **Class.** Gap (documentation makes stronger claims than the code).

### F12 — Network attacker (weaker than A). `http://arecipe.app/` serves the site in clear, without redirect or HSTS.
- Pages reports `https_enforced: false`; `curl http://arecipe.app/` returns `200` with
  the app. A coffee-shop attacker can serve a look-alike at the http origin. It is a
  different origin (no storage, no worker, not a secure context), so this is a phishing
  surface, not an install compromise. Turn on "Enforce HTTPS". Low.

### F13 — A. Trust on first use as written pins a value any page from the website can rewrite, and the version pin is a persistence mechanism.
- IndexedDB `arecipe-release` is same-origin-writable. A page reached via F3 (or the
  bare first launch after F6) can set `requireVerified: false`, set `lockedVersion` to a
  cache it created, or — under D2 — set `pinnedFingerprint` to its own key. The only
  trustworthy pin is the fingerprint **baked into the running worker**; the stored value
  can be advisory at most.
- Today, the pin makes the compromise permanent: `overrideVersionFor` routes every
  navigation to `arecipe-<lockedVersion>`; `shouldDeleteCache` keeps that cache across
  every future version; the panel reports "version locked at vevil".
- **Evidence.** `e6` step 5, all three engines: after a page wrote cache `arecipe-evil`
  and `{lockedVersion:'evil'}`, `/account.html` rendered `PINNED-PWNED` from the good
  worker (`results/e6.txt`).
- **Class.** Design (D2 as written; D4 "hashing at cache-fill, never per request"
  inherits it: a page can write the worker's cache after the fill).
- **Recommendation.** The worker bakes the manifest's file hashes into its own bundle
  (the worker is content-addressed anyway) and verifies **at serve time** from caches it
  names; never `caches.match()` globally; never route by an IDB value without checking the
  routed bytes.

### F14 — Hypotheses (no reproduction; listed so nobody mistakes silence for safety)
- Chrome's installed-PWA manifest update check loads the app in a hidden context;
  if that context counts as a client that then closes, it could be the "last client"
  that activates a waiting worker with no cook present. Device check: watch the origin
  log for `Service-Worker: script` fetches while the app is closed.
- Back/forward cache: E7 (Chromium, bfcache enabled) did not restore the page from
  bfcache and did not activate the waiting worker while another controlled client
  existed; Chromium documents `ServiceWorkerVersionActivation` as a bfcache eviction
  reason, i.e. a bfcached page does not hold activation back. Untested.
- Android process kill after backgrounding ≡ E1 step 5 by mechanism; needs the phone.
- `form-action 'self'` is allowed by the CSP; a POST navigation to the origin is
  pass-through (`method !== 'GET'`). Same class as F3, one more entry point.

---

## 3. Assumption ledger

| # | Assumption | Status | How |
|---|---|---|---|
| 1 | Update checks only on `register()`, 24 h navigation, push/sync | **Refuted as sufficient.** Those are the fetch triggers, but *activation* of an already-waiting worker also happens on last-client-close and on browser restart, with no fetch at all. | E1 steps 3, 5 (3 engines); spec *Try Activate*, *Handle User Agent Shutdown*. Untested: hidden manifest-update loads (F14). |
| 2 | A waiting worker cannot activate while the old page is open | **Verified literally, refuted as a defence.** Navigate away → activates; restart → activates; bfcache inconclusive. | E1, E7. Phone check named in F2. |
| 3 | `register()` with a different URL updates the same registration, old worker keeps control until `skipWaiting` | **Verified**, all three engines; one registration; `updatefound` fires; same-URL re-register is a no-op. | E2 (`results/e2.txt`). |
| 4 | `updatefound` reliably fires / `installing` observable at resolution | **Verified while the page is alive; refuted across restart** (events empty, worker already active). The gate today binds the origin manifest, not the installed bytes. | E1 step 5, E5; `sw-register.ts`. |
| 5 | Offline launches cannot change the registration | **Verified by spec**; no fetch, no job. HTTP cache cannot pin a worker: the browser's worker fetch went out with `max-age=0`/`no-cache` in all three engines. A captive portal answering the worker fetch with HTML fails the spec's MIME check ("If this MIME type … is not a JavaScript MIME type, then: Invoke Reject Job Promise"). MITM on https = A. | E5 request log; spec *Update*. |
| 6 | Worker-script fetches bypass the worker | **Verified**: spec sets service-workers mode "none" and adds `Service-Worker: script`; the origin log shows the direct fetch. `importScripts`: none in our bundle. `Service-Worker-Allowed`: needs a header GitHub Pages cannot send; a hosting-level A owns the root anyway. | E5; spec. |
| 7 | Refuse mode closes network pass-through | **Refuted today.** Pass-throughs that yield code in the origin: unknown navigations (F3), background revalidate of *known* documents (F1), any uncached hashed subresource incl. the runtime-cached heavy chunk (F1 step 4 of E6), POST navigations, `/pr-preview/*`. Non-executable pass-throughs: `build-info.json`, `release-manifest.json` (parsed by boundary validators), cross-origin. Range/304/opaque: not distinct paths here. | E4, E6. |
| 8 | TOFU pin in IDB + baked fingerprint | **Refuted for the IDB half**: any same-origin page writes it (E6 step 5); fresh pins after F6 or on first visit come from an attacker page. Only the baked fingerprint is trustworthy. | E6; `config.ts`. |
| 9 | PDS status as second origin | **Untested (nothing to test yet)**; analysed in F10. Domain attacker cannot block a cross-origin fetch the worker never touches, cannot redirect a DID-pinned lookup; can redirect a handle-based one if the handle ever moves under the domain. | Live DID/PDS resolution. |
| 10 | Monitor + Bluesky post | **Untested**; A defeats the monitor by split-serving unless it sends the SW header (F4); A cannot suppress a post; a CI-held posting credential is F7. | Analysis. |
| 11 | OAuth client metadata on the domain | **Refuted as "coverable"**: outside signing by construction; plan silent. | F8; atproto OAuth spec. |
| 12 | Fake stop screen | **Plausible, not reproduced as UI**: any unknown path renders attacker UI in the origin (E4 shows such a page executing); a "re-sign in" there is a *real* OAuth consent for the real client identity (F8). | E4 + F8. |
| 13 | Freeze detection, clocks, replay, rotation | **Analysed**: device clock → false stops; replay of an older signed release → F2 makes it stick; leaked old key + domain → passes every install that skipped the rotation. | F9, F10. |
| 14 | Rotation copy | **Refuted**: cook-judged warning is a click-through surface; runbook/code contradiction. | F9. |
| 15 | Interim tier permissions | **Verified**: write = key + domain; preview runs PR-head deploy script with a write token; no branch protection. | `gh api`; workflow text; GitHub docs. |
| 16 | IWA reach and OAuth | **Researched, not run** (no IWA can be built or installed from this tree): enterprise ChromeOS (M128), enterprise Windows rollout (M161), dev-mode flag; Android "not compiled in"; no consumer path; CSP allows `connect-src https:` (data from the domain reaches the app) and blocks remote script; cross-origin navigation into an IWA is disallowed; atproto native redirects must be a reverse-domain scheme of the `client_id` host (`app.arecipe:/…`), which a web app cannot register, or an https URL on the same origin as `client_id` — i.e. the domain. | chromestatus 5146307550248960; WICG IWA README/Scheme.md; developer.chrome.com/docs/iwa; atproto.com/specs/oauth. |

---

## 4. The corrected two-gate table

"Gate" = what the attacker must hold. "A(host)" = DNS/hosting-level domain control
(can set headers); "A" = any control of served bytes, including `gh-pages` write.

| Change | Today (#109 main) | After Phases 1–3 as written | After Phases 1–3 with the fixes below | IWA |
|---|---|---|---|---|
| Replace content, honest deploy path | A, timed to any release (F4/F5), no warning | A, timed to a release (F4), no warning | domain + key for the *offer*; **bytes still A** at release time (platform) — say so | key (app bytes); sign-in still domain |
| Replace content, hostile bytes at origin | **A, silent, worker untouched** (F1, F3) | A unless D4 covers revalidate and serves only from owned caches with serve-time hashes (F13) | domain + key | key |
| Replace the worker | A, silent, or via our toast (F5) | A; **warned once**, active at the launch after the warning (F2) | same; reject can wipe the install | key |
| Run code in the origin once | A (unknown path, preview subpath, revalidate) | A (unknown path remains) | closed: shell for every in-scope navigation; previews off-origin | n/a |
| Wipe the install | A(host) via `Clear-Site-Data` (F6) | same | same (no client defence) | key |
| Persist through version turnover | A via the pin cache (F13) | same unless serve-time hashing | closed | key |
| Freeze on an old signed release | undetected | detected via PDS status (DID-pinned) | same | key |
| Sign a cook in as the real client | **A** (F8) | A | A | A |
| Obtain both gates from GitHub | **one write permission** (F7) | same until env-scoped seed + preview fix + ceremony | ceremony key + env secret + preview fix | IWA key, same caveat |

**Fixes referenced.** (a) Serve the shell for every in-scope navigation; never write a
network response for a known document into the cache. (b) Bake the release manifest's
file hashes into the worker bundle and verify at serve time; serve only from caches the
worker names. (c) The alarm is "an update this page did not start"; no page-side
hashing. (d) Reject wipes the install. (e) Rotation only with PDS confirmation; retired
keys published as revoked. (f) Seed as an environment secret scoped to `main`;
`gh-pages` ruleset; `preview.yml` runs the deploy script from `main`, targets only
`pr-preview/`; previews off the origin. (g) Monitor sends `Service-Worker: script`,
fails on `Clear-Site-Data`, and fetches with credentials.

---

## 5. Recommended wording

**Installed app.** "This app keeps running the version you have until you tap update.
Updates are checked against the release key built into the app, and a change of key is
refused unless the arecipe account has announced it. If the arecipe.app website is ever
taken over while you are online, you will get one warning the next time you open the
app; the safe choice then is to remove the app from this device, because the launch
after that would run whatever the website now serves. Your recipes live in your own
account and are not affected. Signing in always goes through the arecipe.app website,
and no app version can protect that."

**Isolated Web App** (only once a cook can actually install one; today none can):
"This app's code can only be changed with the arecipe release key. Signing in still goes
through the arecipe.app website."

**Browser tab.** "A tab checks the same things as the installed app, but a hard reload,
clearing site data, or a long time unused resets it, and any arecipe.app link that is not
one of our pages is served by the website, not by the app. Install it for the stronger
claim."

The plan's current sentences overreach in four places: "stays on this version until you
tap update" (F1, F2, F4); "a different key warns you and you can say no" (F9, F13);
"warned at your next launch and can stop" (F2: one warning, then compromise); and the
IWA sentence's silence on sign-in (F8) and on reach (A16).

---

## 6. Contradictions between plan, runbook and code (findings in their own right)

1. Plan "Today" column: hostile bytes at origin "domain (worker replaced first)" — E6
   shows no worker replacement is needed (F1).
2. Runbook threat table ✅ for per-file tampering and for a CI-bypass deploy — the client
   checks signature, version and build number only; the panel copy says so (F11).
3. Runbook rotation: "couldn't check, not invalid" — `verify.ts` returns
   `invalid: fingerprint-mismatch`, banner "FAILED", update withheld (F9).
4. Plan D3 / Phase 1: "verifies the new worker's hash" — a page cannot read the
   installed script; the origin can split bytes on the `Service-Worker` header (F4).
5. Plan "Still outside": branch protection on `gh-pages` and deploy-job-only writes as
   the interim controls — neither exists (F7).
6. Plan two-gate row "replace the worker — domain, warned before activation" — warned
   once; activated at the following launch in all three engines (F2).
7. #107 summary: previews are "read-only (no live sign-in)" — a preview page shares the
   production origin's storage, including existing sessions (F3).
8. Runbook first-deploy checklist is unticked and production reads `sig: null` — every
   user-facing "verified" today is "signing not yet enabled", and the gate offers any
   update in that state (§0).
9. Plan Phase 3 [verify-in-run] asks whether Playwright can serve a divergent
   `sw-<hash>.js` to trigger a real `updatefound` hermetically — yes: not via routes,
   but via a controllable origin; `tests/red-team/harness.mjs` is the template (E1, E5).

## 7. Experiments (all under `tests/red-team/`, results in `results/`)

| Id | File | Question | Engines |
|---|---|---|---|
| E1 | `e1-restart-activates-waiting.mjs` | Does a waiting worker activate on navigate-away and on restart? | Chromium 149, Firefox 151, WebKit 26.5 |
| E2 | `e2-register-different-url.mjs` | Is `register(other.js)` an update of the same registration? | same |
| E3 | `e3-clear-site-data.mjs` | Does `Clear-Site-Data: "storage"` on a fetch / worker fetch / worker-script response wipe the install? | same |
| E4 | `e4-subpath-page-owns-root.mjs` | Can an unknown-path page unregister the root worker and wipe caches? | same |
| E5 | `e5-service-worker-header-split.mjs` | Can the origin serve different worker bytes to the browser than to the page? | same |
| E6 | `e6-real-dist-revalidate-poison.mjs` | Against the real `dist/`: revalidate poisoning, foreign-cache serving, pin persistence | same |
| E7 | `e7-bfcache.mjs` | Does bfcache hold activation back? (inconclusive: page not restored from bfcache) | Chromium |

Each engine version is the one Playwright 1.61.1 pins (`playwright-core/browsers.json`:
chromium 1228, firefox 1532, webkit 2311). E3's result file contains each row twice
(printed incrementally and in the final table) after a re-run with per-step timeouts;
the first run hung on Firefox's worker-script-update variant, which is itself the
recorded result for that cell.
