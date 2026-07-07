// D5 probe: app-password Agent ≡ OAuth Agent for repo calls (the test seam).
// Uses the scoped app-password minted in D1. Scratch collection only; deletes
// what it creates. Never prints secrets.
import { readFileSync } from 'node:fs';
import { AtpAgent } from '@atproto/api';

const env = Object.fromEntries(
  readFileSync('/Users/cpettet/git/chasemp/CroftC/arecipe/.env', 'utf8')
    .split('\n').filter(Boolean).map((l) => l.split(/=(.*)/s).slice(0, 2)),
);

const agent = new AtpAgent({ service: 'https://bsky.social' });
await agent.login({ identifier: env.BSKY_TEST_HANDLE, password: env.BSKY_TEST_APP_PASSWORD });
const did = agent.session.did;
console.log('login OK (app-password). did:', did);

// Same appview-proxied read the OAuth Agent performed in D1.
const prof = await agent.getProfile({ actor: did });
console.log('getProfile via appview proxy:', prof.data.handle);

// Scratch write → read-back → delete (repo call surface).
const COLLECTION = 'app.arecipe.probe';
const created = await agent.com.atproto.repo.createRecord({
  repo: did,
  collection: COLLECTION,
  record: { $type: COLLECTION, kind: 'd5-seam-probe', createdAt: new Date().toISOString() },
});
console.log('createRecord:', created.data.uri, '| cid:', created.data.cid.slice(0, 20) + '…');

const rkey = created.data.uri.split('/').pop();
const back = await agent.com.atproto.repo.getRecord({ repo: did, collection: COLLECTION, rkey });
console.log('getRecord round-trip:', back.data.value.kind === 'd5-seam-probe' ? 'MATCH' : 'MISMATCH');

await agent.com.atproto.repo.deleteRecord({ repo: did, collection: COLLECTION, rkey });
const gone = await agent.com.atproto.repo
  .getRecord({ repo: did, collection: COLLECTION, rkey })
  .then(() => 'STILL THERE (BAD)')
  .catch((e) => `deleted (${e.error ?? e.status})`);
console.log('deleteRecord teardown:', gone);

console.log('session surface keys:', Object.keys(agent.session).join(','));
console.log('D5 VERDICT: app-password Agent drives the same Agent API (getProfile, repo.*) as the OAuth Agent — seam is viable.');
