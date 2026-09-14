// Community ingredient aliases — PDS tier (plans/2026-09-14-plan-community-
// ingredient-aliases.md; Phase 9 of the ingredient-normalization plan). Public
// per-name app.arecipe.ingredientAlias records { name, key, createdAt } on the
// cook's own repo, mirroring the cookFollow tier: list = public listRecords
// (unauthenticated, CORS-open), publish = adopt-first createRecord, unpublish
// = deleteRecord with the rkey resolved by name, mirror down = a RECONCILING
// upsert + prune into the device-local corrections store (the universal read
// model — every consumer keeps reading the overlay). Writes need the session
// Agent (auth-bearing pages only); reads take an injectable fetchFn.
//
// A record binds the cook and nobody else (LEXICONS.md): a reader keys the name
// to a key it already has, and the vocabulary build treats trusted accounts'
// records as alias CANDIDATES for review, never as truth.
import type { Agent } from '@atproto/api';
import { log } from '../log.js';
import type { IngredientCorrections } from './ingredient-aliases-local.js';

export const INGREDIENT_ALIAS_COLLECTION = 'app.arecipe.ingredientAlias';

export type PdsIngredientAlias = { rkey: string; name: string; key: string; uri: string };

const rkeyFromUri = (uri: string): string => uri.split('/').pop() ?? uri;
const normalizeName = (name: string): string => name.toLowerCase().replace(/\s+/g, ' ').trim();

/** The account's alias records via public listRecords (own repo, unauth).
 *  Skips records missing a string name or key (open-world tolerance). */
export const listIngredientAliases = async (
  target: { pds: string; did: string },
  opts: { fetchFn?: typeof fetch } = {},
): Promise<PdsIngredientAlias[]> => {
  const fetchFn = opts.fetchFn ?? fetch;
  const url = `${target.pds}/xrpc/com.atproto.repo.listRecords?repo=${encodeURIComponent(target.did)}&collection=${INGREDIENT_ALIAS_COLLECTION}&limit=100`;
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`ingredientAlias list failed (HTTP ${res.status})`);
  const body = (await res.json()) as { records?: { uri: string; value?: { name?: unknown; key?: unknown } }[] };
  const out: PdsIngredientAlias[] = [];
  for (const record of body.records ?? []) {
    const name = record.value?.name;
    const key = record.value?.key;
    if (typeof name !== 'string' || typeof key !== 'string') continue;
    out.push({ rkey: rkeyFromUri(record.uri), name: normalizeName(name), key, uri: record.uri });
  }
  return out;
};

/** Adopt-first publish of one correction: if the PDS already has a record for
 *  the name, adopt it (stamp the marker, no write); else createRecord and stamp
 *  the new rkey. Idempotent under double-tap. */
export const publishIngredientAlias = async (
  agent: Agent,
  alias: { name: string; key: string },
  local: IngredientCorrections,
  target: { pds: string; did: string },
  opts: { fetchFn?: typeof fetch } = {},
): Promise<{ rkey: string; adopted: boolean }> => {
  const did = agent.did;
  if (did === undefined) throw new Error('no signed-in account to publish from');
  const name = normalizeName(alias.name);
  const existing = (await listIngredientAliases(target, opts)).find((a) => a.name === name);
  if (existing !== undefined) {
    log.info('ingredient-aliases', 'adopting existing record on publish', { name, rkey: existing.rkey });
    local.markPublished(name, existing.rkey);
    return { rkey: existing.rkey, adopted: true };
  }
  const record = { $type: INGREDIENT_ALIAS_COLLECTION, name, key: alias.key, createdAt: new Date().toISOString() };
  const res = await agent.com.atproto.repo.createRecord({ repo: did, collection: INGREDIENT_ALIAS_COLLECTION, record });
  const rkey = rkeyFromUri(res.data.uri);
  log.info('ingredient-aliases', 'published', { name, key: alias.key, rkey });
  local.markPublished(name, rkey);
  return { rkey, adopted: false };
};

/** Delete the record for a name; a no-op when none exists. */
export const unpublishIngredientAlias = async (
  agent: Agent,
  name: string,
  target: { pds: string; did: string },
  opts: { fetchFn?: typeof fetch } = {},
): Promise<void> => {
  const did = agent.did;
  if (did === undefined) throw new Error('no signed-in account to unpublish from');
  const n = normalizeName(name);
  const match = (await listIngredientAliases(target, opts)).find((a) => a.name === n);
  if (match === undefined) {
    log.debug('ingredient-aliases', 'unpublish skipped — no record', { name: n });
    return;
  }
  await agent.com.atproto.repo.deleteRecord({ repo: did, collection: INGREDIENT_ALIAS_COLLECTION, rkey: match.rkey });
  log.info('ingredient-aliases', 'unpublished', { name: n, rkey: match.rkey });
};

/** Reconcile the PDS aliases into the local store: upsert + stamp every PDS
 *  record; prune marked local rows whose rkey the PDS no longer has (deleted
 *  on another device); leave unmarked (local-only) rows alone. */
export const mirrorIngredientAliasesDown = async (
  local: IngredientCorrections,
  target: { pds: string; did: string },
  opts: { fetchFn?: typeof fetch } = {},
): Promise<{ pulled: number; pruned: number }> => {
  const aliases = await listIngredientAliases(target, opts);
  const rkeys = new Set(aliases.map((a) => a.rkey));
  for (const a of aliases) {
    local.confirm(a.name, a.key);
    local.markPublished(a.name, a.rkey);
  }
  let pruned = 0;
  for (const row of local.all()) {
    if (row.publishedRkey !== undefined && !rkeys.has(row.publishedRkey)) {
      local.remove(row.name);
      pruned += 1;
    }
  }
  log.debug('ingredient-aliases', 'mirrored down', { count: aliases.length, pruned });
  return { pulled: aliases.length, pruned };
};
