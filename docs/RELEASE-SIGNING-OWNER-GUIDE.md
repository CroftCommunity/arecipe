# Your part: turning on release signing

You do three things, once. Generate a keypair on your own computer, give GitHub
the secret half, and commit the public half. Total time is about five minutes.
Nothing here can break the site: production keeps working unsigned until both
halves are in place, and the build refuses to sign with a mismatched key.

The mechanics and threat model are in `RELEASE-SIGNING.md`; this file is the
walkthrough for the person holding the key.

## Before you start

- You need Node 20 or newer on your machine (`node --version`).
- Do this on your own computer, not in a shared or cloud shell. The secret
  should only ever exist in your terminal output and in GitHub's secret store.
- Have the repo's GitHub page open: https://github.com/CroftCommunity/arecipe

## Step 1. Generate the keypair

Paste this into your terminal. It is one long line. It creates the pair and
prints both halves. It does not write anything to disk.

```
node -e "const{generateKeyPairSync}=require('node:crypto');const{privateKey,publicKey}=generateKeyPairSync('ed25519');const seed=privateKey.export({format:'der',type:'pkcs8'}).subarray(-32);const pub=publicKey.export({format:'der',type:'spki'}).subarray(-32);console.log('SECRET seed (base64):',seed.toString('base64'));console.log('public key (hex): ',pub.toString('hex'))"
```

You get two lines:

```
SECRET seed (base64): <44 characters ending in =>
public key (hex):     <64 hex characters>
```

The first line is the private key. Treat it like a password. The second line
is safe to share anywhere.

The command itself is fine to leave in shell history because the key material
is in the output, not the command. Just don't copy the secret line anywhere
except the box in step 2. When step 2 is done, you can close the terminal.
There is no need to keep the seed. If it is ever lost, generate a new pair and
repeat these steps; that is also the rotation procedure.

## Step 2. Give GitHub the secret half

1. On the repo page, click **Settings** in the top tab bar.
2. Left sidebar: **Secrets and variables**, then **Actions**.
3. Click **New repository secret**.
4. Name: `ARECIPE_SIGNING_SEED`, spelled exactly like that.
5. Value: paste only the base64 string from the SECRET line. Not the label,
   no quotes, no trailing space.
6. Click **Add secret**.

From this moment every merge to `main` produces a signed manifest. The secret
is only exposed to the main-branch deploy job, never to PR builds.

## Step 3. Commit the public half

Open `src/release/keys.ts`. The last line reads:

```ts
export const RELEASE_PUBKEY_HEX: string | null = null;
```

Replace `null` with the hex string from the public key line, in quotes:

```ts
export const RELEASE_PUBKEY_HEX: string | null = '<64 hex characters>';
```

Land it on `main` through a normal PR. Or paste the public key line to an
agent session and have it open the PR for you. Either way, never paste the
SECRET line into a chat, an issue, or a PR.

## Step 4. Confirm it worked

After the public-key PR merges and its deploy finishes, check three things:

1. The deploy job's log on GitHub ends with a line starting
   `release-manifest self-check OK (signed`.
2. https://arecipe.app/release-manifest.json shows a real signature. Search
   the page for `"sig":` and confirm it is a long string, not `null`.
3. On https://arecipe.app open **Account**, scroll to **Release & version**.
   It should say **verified**.

You may need to reload the page once or twice, or accept the update toast, so
that the new version is the one running.

## If you do the steps out of order

- Secret installed, public key not yet committed: deploys are signed but
  browsers say "signing not yet enabled". Quiet, no banner.
- Public key committed, secret not installed: the main build fails its
  self-check and the deploy stops. Fix by finishing step 2. Nothing bad reaches
  production.
- Neither done: everything works, unsigned, no banner.

## What "verified" means with this key

The private key lives in GitHub's secret store, so verified means "this build
came through the repo's CI on main". It catches tampering between CI and the
browser, deploys that bypassed CI, and rollbacks to older builds. It does not
protect against someone who can push to `main` or read the repo's secrets.
Moving the key offline is BUILD-PLAN Phase 3, and when that happens you repeat
these same steps once with the new key.
