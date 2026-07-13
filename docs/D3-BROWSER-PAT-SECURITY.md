# D3 security memo — a Contents-write PAT in the browser

**Date:** 2026-07-12
**Context:** The CORS probe ([GITHUB-CORS-PROBE.md](GITHUB-CORS-PROBE.md))
established that a browser at `arecipe.app` *can* GET+PUT the GitHub Contents API
cross-origin with a fine-grained PAT and no proxy — so a client-push adapter (D3)
that snapshots a file (e.g. a meal-plan `.ics`) to a Pages-serving repo is
*mechanically* backendless. This memo answers the deferred question: **is it
safe to hold a Contents-write PAT in the browser?** Storage, XSS blast radius,
revocation.

Read against [SECURITY.md](SECURITY.md), whose vocabulary (XSS budget, DPoP
non-extractable key, blast radius) this memo uses.

---

## Verdict: NO-GO as the default mechanism

A browser-held Contents-write PAT **breaks the central invariant that makes
arecipe's no-backend model defensible** — *"an exfiltrated credential is inert
off-device."* It should not be the **default** D3 path. But it is not
dismissible either: it uniquely enables one real, specific capability — a
**stable `.ics` URL a calendar client (Google Calendar) subscribes to and
re-polls**, updated in place on each republish. That "subscribe once, it updates
when I republish" feed is **not** served by the on-demand-download alternative
(you can't subscribe Google Calendar to a `blob:`), nor by the PDS record URL
(XRPC JSON, not `text/calendar`). So the correct landing is a genuine trade-off,
not a "don't": ship the download path as the default, and offer the browser-PAT
client-push as a **hardened, opt-in** "publish to my own GitHub Pages" feature
for the users who specifically want a subscribable URL. A fully *hosted, live*
feed with app-side revocation is still backend territory.

---

## The core tension: bearer token vs the "inert if stolen" invariant

SECURITY.md's whole narrative rests on one property:

- OAuth tokens are **DPoP sender-constrained** and the proof-of-possession key is
  a **non-extractable WebCrypto key** the app never handles. *"An attacker can
  copy a token but cannot copy the key that makes it usable."*
- Consequently **credential theft / replay from another device** — listed as a
  *defended* threat — is closed, and **XSS becomes the designated *primary*
  defense**, because the only way left to abuse a session is an active
  same-origin adversary using the key **in place** (the irreducible,
  *bounded* non-goal).

A GitHub fine-grained PAT is the **exact inverse**:

| Property | OAuth token (today) | Contents-write PAT |
|---|---|---|
| Sender-constrained | Yes (DPoP) | **No — pure bearer** |
| Usable if exfiltrated | **No** (needs non-extractable key) | **Yes, anywhere, immediately** |
| Extractable from browser | Key: never; token: inert anyway | **Fully — it's an opaque string** |
| Bound to the user's session/device | Yes | **No — outlives the tab** |
| Revocable by the app | `signOut` revokes | **No backend → user must revoke manually** |

Introducing it **re-opens the #1 defended threat** (theft + off-device replay)
that DPoP closed, and **downgrades the irreducible non-goal**: an XSS today can
misuse the key *in place* (bounded to this device/session); an XSS with a
readable PAT can **exfiltrate a portable, reusable credential** that works from
the attacker's machine and persists until manual revocation or expiry. That is
categorically worse, and it lands on the highest-value XSS target in the app.

The property that saves the OAuth model — *non-extractability* — **cannot be
applied to a PAT.** A PAT is a bearer string, not a key; there is no
"non-extractable PAT." Every mitigation below is therefore strictly weaker than
the invariant it would replace.

## XSS blast radius

The XSS budget (strict meta-CSP, SRI, zero third-party scripts, small bundle)
exists precisely to shrink the same-origin-adversary surface. A readable PAT
means **one successful XSS = full, portable GitHub-write-credential theft**, with
no DPoP backstop. Concretely, a stolen Contents-write PAT — even best-case scoped
to a single repo — lets an attacker:

- **Rewrite `.github/workflows/*`** in that repo → arbitrary code execution in
  the victim's GitHub Actions (Pages deploy *is* an Action) → exfiltrate any
  other secrets in that repo, pivot, or serve malware from the victim's trusted
  Pages domain. Contents:write alone is enough to author the workflow file.
- **Deface / weaponize the victim's Pages site** (phishing under their domain).
- Worst case — if the user over-scopes (all-repos, extra permissions, or a
  *classic* PAT) — access far beyond the one repo.

The single-repo, single-permission fine-grained scope is the *only* thing
bounding this, and it depends entirely on the **user** provisioning a minimal
token correctly — a control arecipe cannot enforce.

## Storage options — none make a bearer PAT XSS-safe

- **localStorage / IndexedDB (plaintext):** readable by any same-origin JS. One
  XSS → token gone. Worst option; also the easiest.
- **In-memory only (not persisted):** not stealable after tab close, but readable
  by same-origin JS while present, and forces re-entry every session (poor UX).
  XSS during the session still wins.
- **Encrypted at rest under a non-extractable key:** the app must decrypt to use
  it, so at point-of-use it's plaintext in JS memory and XSS reads it then. Adds
  friction, not a boundary — the *same* reasoning SECURITY.md already gives for
  not encrypting the OAuth token at rest.
- **Held in a Service Worker, never exposed to the page:** the best available
  option. The SW attaches the token to outbound `api.github.com` requests so
  page-context XSS can't read the literal string — this **mimics DPoP's
  exfil-resistance**. But it does **not** stop *misuse in place*: page XSS can
  still issue the fetch and let the SW sign it, so writes still happen. It mimics
  the DPoP property **without the cryptographic guarantee**, and a persisted
  malicious SW is its own hazard. Weaker than the invariant it imitates.

Net: the ceiling is "as good as DPoP's exfil-resistance, minus the crypto, plus
in-place misuse" — i.e. strictly below today's model.

## Revocation UX

- **No backend → arecipe cannot revoke on the user's behalf.** On suspected
  compromise the *user* must delete the PAT in GitHub settings; there's an
  exposure window until they act. Contrast OAuth `signOut` (revokes the session)
  and the fact that a stolen OAuth token is inert regardless.
- **Auto-expiry is the only automatic bound.** Fine-grained PATs support a custom
  expiry; a short one (days, not a year) is essential — traded against
  re-provisioning friction.
- SECURITY.md already flags "no global sign-out-everywhere" as a known gap for
  OAuth. A PAT makes revocation *more* load-bearing (stolen = usable) while
  providing *less* automatic support. That is the wrong direction.

## What the capability is actually worth

Two distinct user needs, often conflated:

- **Import once** (a static snapshot into a calendar) — fully served by the
  DPoP-safe alternatives below (on-demand client-side `.ics` download, or the
  existing PDS share `meals.html?mealplan=<id>&user=<did>`). No PAT needed.
- **Subscribe and auto-update** (Google Calendar's "add by URL", which re-polls a
  stable URL on its own schedule and picks up republished events) — **this is the
  git use case, and it is real.** It is *not* interchangeable with the first: you
  cannot subscribe a calendar client to a `blob:` download, and you cannot point
  it at the PDS record (XRPC returns JSON, not `text/calendar`). The two probes
  together show this works: Pages serves `.ics` as `text/calendar`
  ([PAGES-ICS-PROBE.md](PAGES-ICS-PROBE.md)) and same-path republish propagates on
  deploy (edge purge proven), while a browser can PUT the update in place
  ([GITHUB-CORS-PROBE.md](GITHUB-CORS-PROBE.md)).

So the earlier "frozen snapshot, not a live feed" framing was about the *file*,
and it undersold the *subscription*: a stable URL that is republished in place is,
from the subscriber's side, a self-updating feed — eventually-consistent, bounded
by the client's poll interval (Google's is slow and not user-controllable, often
hours), not by our `max-age=600`. That is a genuine capability that **no
backendless path other than client-push-to-Pages delivers.** The security cost is
equally genuine — a browser PAT trades a third-party *origin* (a proxy) for a
third-party *credential class* (a portable bearer token) that breaks the local
threat model. Neither cancels the other; hence: default to the safe path, gate the
subscribable-URL capability behind the opt-in hardened flow.

## Alternatives, ranked

1. **Keep the PDS path; generate the `.ics` client-side on demand** from the
   published meal-plan record and hand it to the user as a `blob:`/data-URL
   download or import. No GitHub write, no token, **security model intact.**
   Serves the *import-once* need — but **not** the *subscribe-and-auto-update*
   need (you can't subscribe a calendar client to a download). Correct default;
   not a substitute for the feed use case.
2. **User-driven manual publish.** App produces the `.ics`; the user commits it to
   their own repo via GitHub's UI or `git`. Zero app-held credential; highest
   friction.
3. **GitHub App + short-lived token broker (a real backend).** The *correct*
   security answer for a hosted, auto-updating feed — installation tokens minted
   server-side, never a long-lived PAT in the browser. Cost: it **is** a
   backend/third-party origin, the thing the no-backend posture avoids. If a
   hosted subscribable feed is a hard requirement, this is its honest price.
4. **If a browser PAT is shipped anyway — mandatory hardening (all of):**
   - **Dedicated, isolated repo** holding nothing else, Pages-only, **Actions
     disabled** (kills the workflow-rewrite → RCE escalation).
   - Fine-grained scope = **that one repo**, **Contents:write + Metadata:read
     only**, **shortest usable expiry**.
   - Token **held in a Service Worker, never localStorage**, to blunt literal
     exfiltration.
   - **In-product "revoke now" deep-link** to the GitHub token-settings page and
     explicit revocation guidance; token entry treated as a sensitive flow on a
     dedicated page under the strict CSP.
   - A written **SECURITY.md carve-out** stating this feature relaxes the
     "exfiltrated credential is inert" invariant, with the blast radius bounded to
     the isolated, Actions-disabled repo.

## Recommendation

**Default:** ship **alternative 1** (on-demand client-side `.ics`, DPoP-safe) for
the import-once need — most users want exactly that, and none of them should be
handed a bearer token to get it.

**Opt-in:** offer the browser-PAT client-push as an explicit "advanced: publish a
subscribable calendar to my own GitHub Pages" feature, built to **alternative
4's** hardening (isolated Actions-disabled repo, single-repo
Contents:write+Metadata:read, short expiry, SW-held token, in-product revoke
link) with the SECURITY.md carve-out. The subscribe-and-auto-update use case is
real and backendless-only via this path, so this is a justified feature — not a
default, and not a dismissal. A fully *hosted, live* feed with app-side
revocation is alternative 3's territory (a real backend). Don't let the "no proxy
needed" CORS result be read as "no security cost" — but don't let the security
cost be read as "the feed use case isn't real," either.

## Scope note

This is a design/threat analysis, not an empirical probe — no code was changed
and no token was involved in producing it. It settles the *should-we* question the
CORS probe deliberately deferred; it does not itself build or preclude any D3
implementation.
