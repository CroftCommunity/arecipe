# Verified installs — consent-only upgrades, a key pin, and the strongest claim each install can carry

Date: 2026-09-14
Status: **proposed** (successor to `2026-07-16-4-plan-signed-releases.md`, which landed 2026-09-14 in #107; nothing here is built)

## Problem statement

The owner wants to tell a cook three things:

1. You can install arecipe and it will not upgrade unless you say so.
2. Every upgrade is checked against the key your install was made with; a different
   key warns you and you can decline.
3. If someone does not hold that key, they cannot change your app.

Signed releases as landed make (2) partly true and (1) and (3) false, and the reason is
structural, not a bug. The build verifies the manifest, gates the update toast, and routes
content back to the last verified cache. But every check is *our code*, and the thing that
installs a new service worker is *the browser*, which fetches `sw.js` itself, byte-compares
it, installs any difference as waiting, and activates it when the last tab closes. No
browser offers integrity pinning on service-worker registration. So today the key is a gate
on what our worker will accept as content, and the domain alone is a gate on the worker.
Whoever holds arecipe.app can replace the worker, and the worker takes the content with it.

Second, the alerts we do raise all read the manifest from arecipe.app, the origin a domain
attacker holds. Short of forging the signature they cannot make a bad build read as
verified, but they can serve a frozen old signed release forever, and nothing tells a cook.

Third, the current verification scope is the manifest signature, version identity, build
number, and the hash of the entry bundle only. A tampered secondary chunk, including the
runtime-cached heavy one, is not checked.

## Approach

Alice installs arecipe. Her page registers a worker whose file name carries its own hash,
`sw-<hash>.js`, and that file never changes. The browser re-fetches it on every launch, sees
the same bytes, and never installs anything on its own. When a new release ships, Alice's
page (not the browser) notices a newer signed manifest, verifies its signature against the
fingerprint her install stored at first install, verifies the new worker's hash, and only
then offers the toast. No tap, no `register()`, no upgrade. If the manifest is signed by a
different key, the offer becomes a warning naming both fingerprints, with decline as the
default.

Mallory takes arecipe.app and replaces `sw-<hash>.js`. Alice launches while online: her
good worker serves the app from cache first, her page calls `register()`, the browser
fetches the altered file and starts installing it as waiting, and `updatefound` fires on
Alice's page while her good version is still the one running. The page hashes the newcomer
against the signed manifest, and against the status record the arecipe account published
on its PDS, and shows a full-screen stop: reject keeps the good version for this session
and tells her not to reopen until the arecipe Bluesky account says the site is fixed;
ignore continues at her own risk. The waiting worker cannot activate while her page is
open. If Alice launches offline, nothing can be fetched and nothing changes. Meanwhile a
scheduled job outside any browser fetched the live manifest and worker, saw the mismatch,
paged the owner, and posted from the arecipe account.

Bob wants the unconditional version of claim 3. He installs the Isolated Web App build,
where Chromium derives the origin from the release key and refuses any update it did not
sign. The Release panel tells Bob, Alice, and a cook in a plain browser tab exactly which
tier they have and the one sentence that tier supports.

### The two-gate table this plan is measured against

| Change | Today (#107) | After Phases 1–3 | Isolated Web App |
|---|---|---|---|
| Replace content, honest deploy path | domain + key | domain + key | key |
| Replace content, hostile bytes at origin | domain (worker replaced first) | domain + key, or warned stop | key |
| Replace the worker | domain, silent | domain, **warned before activation** | key |
| Freeze on an old signed release | undetected | detected via PDS status | key |

"Warned before activation" rests on the browser only checking for a new worker when our
page runs `register()`, on a 24-hour navigation check, or on push/sync events arecipe does
not use. Spec and Chromium behavior as understood; **device-verified in Phase 6 before it
enters any user-facing claim.**

## Decisions

- **D1 Immutable per-version workers.** The worker is emitted as `sw-<contenthash>.js`;
  the page registers that exact URL and migrates the registration by calling `register()`
  with the next version's URL after consent. The browser keeps its install/precache
  lifecycle; we stop reimplementing it. Supersedes the "stable bootstrap" alternative,
  which would have rebuilt download-verify-switch by hand and made every bootstrap bug a
  loud worker change.
- **D2 Trust on first use.** At first install the page stores the fingerprint it verified
  against in the release config (IDB) and the installed version bakes the same fingerprint.
  Every offer must match the stored pin. Rotation is a warned, declinable act whose copy
  points at the arecipe account's announcement. The pin is device-local like the other
  release settings.
- **D3 Any `updatefound` we did not initiate is an alarm.** A legitimate release never
  changes the registered file. The page verifies the newcomer's hash on `updatefound`
  (and on `registration.installing` at `register()` resolution, in case the event beat
  the listener); a mismatch or an unsigned manifest raises the stop screen. Reject does
  not unregister: unregistering removes our worker too and re-registering would fetch from
  the compromised origin. Reject keeps this session on the good version and states plainly
  what closing the app will do.
- **D4 Full per-file refuse mode.** The worker serves an app file from the network only if
  the verified manifest names its hash. Closes the pass-through injection path for
  controlled clients. Hashing happens at cache-fill, never per request.
- **D5 The second origin.** `app.arecipe.status` on the arecipe account's PDS (planned
  row in `docs/LEXICONS.md` since #107): current build number, worker hash, key
  fingerprint, and a max age. The page compares what the domain serves against what the
  account published. Freeze detection and key revocation both ride on it. The account's
  security becomes load-bearing and is treated like the signing key.
- **D6 Owner-side monitor.** A scheduled GitHub Action fetches the live manifest and
  worker, verifies signature and hashes, and on mismatch pages the owner and posts from
  the arecipe account. Runs outside any browser, so it does not race the takeover.
- **D7 Tiered claims, one codebase.** The panel detects the install tier at runtime and
  shows one sentence per tier, never stronger than the tier supports. Isolated Web App is
  the same build packaged as a signed web bundle.
- **D8 Tripwire on honest loads.** Every verified page load audits registrations, caches,
  and IDB databases against the expected set and names anything foreign, offering removal
  and sign-out. Cheap; catches the sloppy case.
- **D9 "Ignore" gets a way back.** Continuing past a warning sets a remind-on-next-launch
  flag; the tripwire runs regardless.

## Phases

Each phase lands on its own branch, gate-green, TDD-first, with fixtures before consumers.

**Phase 1 — immutable workers + consent-only upgrade (D1).** Build emits
`sw-<hash>.js`; `sw-register` registers the exact URL from build-info and migrates
registrations only after the toast; the manifest names the worker file. Unit: the
migration decision as a pure function; e2e: a routed newer manifest produces a toast and
no `updatefound` until the tap. [verify-in-run] that registering a different script URL
on the same scope is treated as an update by Chromium, WebKit, and Gecko.

**Phase 2 — trust on first use (D2).** Config gains `pinnedFingerprint`; first verified
install writes it; `shouldOfferUpdate` compares; rotation copy names both fingerprints
with decline as default. Unit on the gate; e2e on the warning.

**Phase 3 — the alarm and refuse mode (D3, D4, D8, D9).** `updatefound` hashing, the
stop screen with reject/ignore, per-file refuse mode in the worker, the tripwire, the
remind flag. Unit for every decision; e2e for the screen states using routed workers.
[verify-in-run] whether Playwright can serve a divergent `sw-<hash>.js` to trigger a real
`updatefound` in the hermetic suite.

**Phase 4 — the second origin and the monitor (D5, D6).** Lexicon act 1 investigation is
already recorded for `app.arecipe.status`; publish the schema per `LEXICONS.md`; page-side
comparison with the manifest; freeze detection from max age; revocation copy. The monitor
workflow with a fixture-driven test of its verify step. [verify-in-run] posting from the
arecipe account from CI without putting an app password in Actions (a scoped OAuth
client, or a human-held step) — if it needs a long-lived secret in CI, the post is deferred
and only the page stays.

**Phase 5 — tiered claims (D7).** Tier detection (`isolated-app:` origin, display-mode
standalone, else tab); three sentences in the panel and on the treatise page; the
`RELEASE-SIGNING.md` threat table extended with the table above.

**Phase 6 — Isolated Web App spike.** Three probes, each a FINDING before any code:
(a) reach — Chromium desktop/ChromeOS; Android and consumer installation outside
enterprise policy against current Chrome; (b) sign-in — atproto OAuth on an
`isolated-app://` origin, whether a native-style client with a custom-scheme redirect is
accepted by real PDSes; (c) content policy — no inline or remote scripts, everything in the
bundle, fonts and CSP hashes. Then a signed web bundle from the same dist, with a dedicated
IWA key documented in `RELEASE-SIGNING.md`.

**Phase 7 — device verification.** The Phase-1 and Phase-3 sequences on a real phone,
installed and in-tab, online and offline: launch after a server-side worker swap must
show the stop screen before anything activates. Recorded per `TESTBED.md`, and only then
does the "warned before activation" sentence enter the panel.

## Acceptance

- A release never changes the registered worker file; the browser fires no `updatefound`
  on an honest deploy (Phase 1 e2e).
- No upgrade applies without the toast tap, pinned or not (Phase 1).
- An offer signed by a different fingerprint warns with both fingerprints and declines by
  default (Phase 2).
- A divergent worker at the origin raises the stop screen while the good version still
  serves; reject keeps it for the session; ignore sets the remind flag (Phase 3, then
  Phase 7 on a device).
- A network response for an app file whose hash the manifest does not name is never
  served or cached (Phase 3).
- A frozen old signed release is reported when the PDS status names a newer build or the
  max age passes (Phase 4).
- The monitor fails loudly on a fixture mismatch (Phase 4).
- The panel shows the tier and only that tier's sentence; a tab never reads the installed
  sentence (Phase 5).
- The IWA probes produce written findings whether or not the bundle ships (Phase 6).
- Bundle-split guard, mobile-fit, a11y, and the full gate stay green at every boundary.

## What we will say to a cook, per tier

- **Isolated Web App:** No one can change this app without the arecipe release key.
- **Installed app:** It stays on this version until you tap update. Updates are checked
  against the key your install was made with; a different key warns you and you can say
  no. If the website is ever taken over, you are warned at your next launch and can stop.
- **Browser tab:** Same as installed, but a hard reload or a long-unused browser can bypass
  the checks. Install it for the stronger claim.

## Still outside this plan (named so nobody assumes otherwise)

- A load with no worker: first visit, hard reload, storage eviction. Installing removes the
  last two in practice.
- Foreign code that already ran in the origin can use the DPoP-bound session for the
  token's lifetime. Short lifetimes and tripwire sign-out shrink it.
- Repo or CI compromise signs valid releases until the offline key ceremony (BUILD-PLAN
  Phase 3). Branch protection on `gh-pages`, hardware-key 2FA, deploy-job-only writes are
  the controls until then.
- Signing attests delivery, not content: supply chain is `SUPPLY-CHAIN.md`'s dimension.
- Recipe data is not covered; the app does not verify atproto repo proofs.
- iOS has no Isolated Web App path; the installed-PWA tier is its ceiling. A native shell
  with bundled content and signed over-the-air updates is the only route to the
  unconditional claim there, and it is not a PWA. Parked, not planned.
