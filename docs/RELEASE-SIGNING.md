# Release signing — the interim key (runbook)

Every push to `main` deploys via GitHub Actions, and the build additionally
emits **`release-manifest.json`** at the site root: the build number (a
monotonic commit count), the display version, a SHA-256 for every file in the
deployed bundle, the signing pubkey's fingerprint, and an **Ed25519 signature**
over the canonical JSON of all of that. Clients (the Account → "Release &
version" panel, the service worker's self-check) verify the signature against
the pubkey pinned in the build they are running.

**This is the INTERIM tier.** The private seed lives in a GitHub Actions
secret, so "verified" here means *"produced by this repository's
protected-branch CI"* — it defends against a tampered or substituted bundle on
the hosting path (Pages/CDN/mirror), and against a deploy that didn't come
through CI. It does **not** defend against an attacker who controls the GitHub
repository or its Actions secrets. BUILD-PLAN Phase 3 rotates this to an
offline-ceremony key, which removes that trust in CI. The app's UI copy labels
the key as interim for exactly this reason — keep it honest.

## One-time setup (the only manual steps, ever)

1. **Generate the keypair locally** (requires Node ≥ 20; run anywhere, ideally
   not in a shared shell history — prefix with a space or run in a throwaway
   shell):

   ```
   node -e "const{generateKeyPairSync}=require('node:crypto');const{privateKey,publicKey}=generateKeyPairSync('ed25519');const seed=privateKey.export({format:'der',type:'pkcs8'}).subarray(-32);const pub=publicKey.export({format:'der',type:'spki'}).subarray(-32);console.log('SECRET seed (base64):',seed.toString('base64'));console.log('public key (hex): ',pub.toString('hex'))"
   ```

2. **Install the secret**: repo → Settings → Secrets and variables → Actions →
   New repository secret → name `ARECIPE_SIGNING_SEED`, value = the base64
   seed line. Never commit the seed, never paste it into an issue/PR.

3. **Commit the public key**: paste the hex line into
   `src/release/keys.ts` (`RELEASE_PUBKEY_HEX = '<hex>'`). This is the pin
   clients verify against. Until it's committed, clients report
   "signing not yet enabled" (no banner); once committed, the build FAILS if
   the secret and the pin ever diverge — they can't silently drift.

## First-deploy checklist

CI can't be exercised from a working tree, so the first real deploy carries
the proof:

- [ ] `ARECIPE_SIGNING_SEED` secret installed (step 2 above).
- [ ] Pubkey committed to `src/release/keys.ts` (step 3) and merged to `main`.
- [ ] Push/merge anything to `main`; the deploy job's build log ends with
      `release-manifest self-check OK (signed, fingerprint …)`.
- [ ] `curl -s https://arecipe.app/release-manifest.json | head -c 200` shows
      a non-null `sig`.
- [ ] Account → "Release & version" on https://arecipe.app shows **verified**.
- [ ] A PR preview (`…/pr-preview/pr-N/`) still shows **unsigned** with no
      banner — previews are not releases; that's correct.

## Rotation (and the path to the Phase-3 offline key)

1. Generate a new keypair (step 1). 2. Update the `ARECIPE_SIGNING_SEED`
secret and `src/release/keys.ts` in the same change; merge. 3. Old installs
verify new manifests only after they update to a build pinning the new key —
expect "couldn't check" (not "invalid") from stale installs in between; the
UI treats an unknown-key manifest as uncheckable, not as an attack.

The Phase-3 ceremony key follows the same rotation mechanics; the difference
is where the seed lives (air-gapped, never in CI) and that signing becomes a
deliberate release act rather than a side effect of merging.

## What this defends against — and what it doesn't

| Threat | Covered? |
|---|---|
| Tampered/substituted files on Pages, a CDN, or a mirror serving the app | ✅ manifest hash + signature mismatch → client refuses/warns |
| A deploy that bypassed CI (pushed straight to `gh-pages`) | ✅ unsigned or wrong-key manifest → warned |
| Rollback to an older signed release | ✅ buildNumber monotonicity check |
| A compromised GitHub repo / Actions secrets | ❌ interim tier signs in CI — Phase 3 (offline key) addresses this |
| Malicious code merged through normal review | ❌ signing attests delivery, not intent |
| A compromised client device | ❌ out of scope |

Client-side behavior (verified/unsigned/invalid states, the
install-only-verified default, the version pin) is documented in the plan:
`plans/2026-07-16-4-plan-signed-releases.md`.
