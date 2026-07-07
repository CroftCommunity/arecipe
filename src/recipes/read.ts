// Public read path for exchange.recipe.recipe (Phase 4a). D2-verified: the
// PDS serves listRecords unauthenticated and CORS-open, so cold-start reads
// need no session. Boundary validation follows atproto's open-world model:
// unknown extra fields are tolerated and preserved; missing or mistyped
// REQUIRED fields (per the D4 schema) fail loud.

import { log } from '../log.js';

export const RECIPE_COLLECTION = 'exchange.recipe.recipe';

/** Required fields of exchange.recipe.recipe per the D4 lexicon capture. */
const REQUIRED_STRING_FIELDS = ['name', 'text', 'createdAt', 'updatedAt'] as const;
const REQUIRED_ARRAY_FIELDS = ['ingredients', 'instructions'] as const;

export type RecipeValue = {
  name: string;
  text: string;
  ingredients: string[];
  instructions: string[];
  createdAt: string;
  updatedAt: string;
  /** Open-world: everything else the record carries is preserved. */
  [key: string]: unknown;
};

export type RecipeRecord = { uri: string; cid: string; value: RecipeValue };

const validateRecipeValue = (uri: string, value: Record<string, unknown>): RecipeValue => {
  for (const field of REQUIRED_STRING_FIELDS) {
    if (typeof value[field] !== 'string') {
      throw new Error(`invalid ${RECIPE_COLLECTION}: required field "${field}" missing or not a string in ${uri}`);
    }
  }
  for (const field of REQUIRED_ARRAY_FIELDS) {
    if (!Array.isArray(value[field])) {
      throw new Error(`invalid ${RECIPE_COLLECTION}: required field "${field}" missing or not an array in ${uri}`);
    }
  }
  return value as RecipeValue;
};

export type ReadRecipesTarget = { pds: string; did: string };

/** Single-record fetch (5d cold links): same validation, fail loud. */
export const createRecordReader = (options: { fetchFn?: typeof fetch } = {}) => {
  const fetchFn = options.fetchFn ?? fetch;
  return async (target: { pds: string; did: string; rkey: string }): Promise<RecipeRecord> => {
    const url = `${target.pds}/xrpc/com.atproto.repo.getRecord?repo=${encodeURIComponent(target.did)}&collection=${RECIPE_COLLECTION}&rkey=${encodeURIComponent(target.rkey)}`;
    log.debug('recipes', 'fetching record', { did: target.did, rkey: target.rkey });
    const res = await fetchFn(url);
    if (!res.ok) {
      log.warn('recipes', 'getRecord failed', { status: res.status, rkey: target.rkey });
      throw new Error(`getRecord failed (HTTP ${res.status}) for ${target.rkey}`);
    }
    const body = (await res.json()) as {
      uri: string;
      cid: string;
      value: Record<string, unknown>;
    };
    return { uri: body.uri, cid: body.cid, value: validateRecipeValue(body.uri, body.value) };
  };
};

export const createRecipeReader = (options: { fetchFn?: typeof fetch } = {}) => {
  const fetchFn = options.fetchFn ?? fetch;

  return async (target: ReadRecipesTarget): Promise<RecipeRecord[]> => {
    const url = `${target.pds}/xrpc/com.atproto.repo.listRecords?repo=${encodeURIComponent(target.did)}&collection=${RECIPE_COLLECTION}`;
    log.debug('recipes', 'fetching recipes', { pds: target.pds, did: target.did });
    const res = await fetchFn(url);
    if (!res.ok) {
      log.warn('recipes', 'listRecords failed', { status: res.status, did: target.did });
      throw new Error(`listRecords failed (HTTP ${res.status}) for ${target.did}`);
    }
    const body = (await res.json()) as {
      records: { uri: string; cid: string; value: Record<string, unknown> }[];
    };
    const records = body.records.map((r) => ({
      uri: r.uri,
      cid: r.cid,
      value: validateRecipeValue(r.uri, r.value),
    }));
    log.debug('recipes', 'recipes fetched', { count: records.length });
    return records;
  };
};
