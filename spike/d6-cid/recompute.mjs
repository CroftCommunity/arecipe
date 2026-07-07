// D6 probe (throwaway until promoted in Phase 4): recompute an atproto
// record CID from its getRecord lex-JSON and compare to the PDS-reported CID.
import { readFileSync } from 'node:fs';
import * as dagCbor from '@ipld/dag-cbor';
import { CID } from 'multiformats/cid';
import { sha256 } from 'multiformats/hashes/sha2';

// lex-JSON -> IPLD: {$link: s} => CID, {$bytes: s} => Uint8Array (base64).
const fromLexJson = (v) => {
  if (Array.isArray(v)) return v.map(fromLexJson);
  if (v !== null && typeof v === 'object') {
    const keys = Object.keys(v);
    if (keys.length === 1 && keys[0] === '$link') return CID.parse(v.$link);
    if (keys.length === 1 && keys[0] === '$bytes')
      return Uint8Array.from(atob(v.$bytes), (c) => c.charCodeAt(0));
    return Object.fromEntries(keys.map((k) => [k, fromLexJson(v[k])]));
  }
  return v;
};

const fixture = JSON.parse(
  readFileSync(
    '/Users/cpettet/git/chasemp/CroftC/arecipe/tests/fixtures/atproto/getRecord-exchange.recipe.recipe.json',
    'utf8',
  ),
);

const record = fromLexJson(fixture.value);
const bytes = dagCbor.encode(record);
const hash = await sha256.digest(bytes);
const cid = CID.createV1(dagCbor.code, hash);

console.log('reported  :', fixture.cid);
console.log('recomputed:', cid.toString());
console.log('MATCH:', cid.toString() === fixture.cid);
