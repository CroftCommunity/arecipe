// D1 helper (throwaway): createSession with the main credential, then mint a
// scoped app-password for the automated probes (D5 + later @live tests).
// Reads credentials from the repo's gitignored .env. Never prints secrets.
import { readFileSync, appendFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync('/Users/cpettet/git/chasemp/CroftC/arecipe/.env', 'utf8')
    .split('\n').filter(Boolean).map((l) => l.split(/=(.*)/s).slice(0, 2)),
);

const res = await fetch('https://bsky.social/xrpc/com.atproto.server.createSession', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ identifier: env.BSKY_TEST_HANDLE, password: env.BSKY_TEST_PASSWORD }),
});
const body = await res.json();
if (!res.ok) {
  console.log('createSession FAILED:', res.status, body.error, body.message);
  process.exit(1);
}
console.log('createSession OK. did:', body.did, '| emailAuthFactor:', body.emailAuthFactor ?? false);

const ap = await fetch('https://bsky.social/xrpc/com.atproto.server.createAppPassword', {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${body.accessJwt}` },
  body: JSON.stringify({ name: 'arecipe-phase0-tests' }),
});
const apBody = await ap.json();
if (!ap.ok) {
  console.log('createAppPassword FAILED:', ap.status, apBody.error, apBody.message);
  process.exit(1);
}
appendFileSync('/Users/cpettet/git/chasemp/CroftC/arecipe/.env', `BSKY_TEST_APP_PASSWORD=${apBody.password}\n`);
console.log('app-password minted (name: arecipe-phase0-tests) and appended to .env as BSKY_TEST_APP_PASSWORD');
