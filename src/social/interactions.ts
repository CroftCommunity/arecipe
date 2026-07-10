// Interactions (Phase 9c). app.arecipe.interaction is our lexicon: a recipe
// strongRef (pinned) + a kind + createdAt.
//   - liked : one-tap public approval — a heart + a friends-scoped count.
//     It is the single collect/approve action; liked recipes surface via the
//     Cookbook "Liked" filter. (The former private `saved` bookmark was removed
//     — legacy `saved` records are read-tolerated: filtered out on read, never
//     errored. `cooked` is deferred.)
// Discovery is friends-scoped like comments: counts come from repos we know
// (recipe author + you + your friends), so "N likes" means "you + friends",
// never a pretend-global number. Reads + pure logic are unit-tested; the
// authenticated add/remove writes are proven @live.

import type { Agent } from '@atproto/api';
import { log } from '../log.js';
import type { StrongRef } from '../recipes/refs.js';

export const INTERACTION_COLLECTION = 'app.arecipe.interaction';

export type InteractionKind = 'liked';
const KINDS: readonly InteractionKind[] = ['liked'];

export type InteractionRecordOut = {
  $type: typeof INTERACTION_COLLECTION;
  kind: InteractionKind;
  recipe: StrongRef;
  createdAt: string;
};

export type Interaction = {
  uri: string;
  cid: string;
  kind: InteractionKind;
  recipe: StrongRef;
  author: string;
  createdAt: string;
};

export type InteractionRepo = { did: string; pds: string };

/** Build a typed record. Fails loud on an unknown kind or incomplete recipe ref. */
export const buildInteractionRecord = (args: {
  kind: InteractionKind;
  recipe: StrongRef;
}): InteractionRecordOut => {
  if (!KINDS.includes(args.kind)) throw new Error(`unknown interaction kind: ${String(args.kind)}`);
  if (args.recipe.uri === '' || args.recipe.cid === '') {
    throw new Error('interaction recipe strongRef (uri+cid) is required');
  }
  return {
    $type: INTERACTION_COLLECTION,
    kind: args.kind,
    recipe: args.recipe,
    createdAt: new Date().toISOString(),
  };
};

/** Read one repo's interactions, optionally narrowed to a recipe and/or kind. */
export const listInteractionsFor = async (
  target: { pds: string; did: string; recipeUri?: string; kind?: InteractionKind },
  opts: { fetchFn?: typeof fetch } = {},
): Promise<Interaction[]> => {
  const fetchFn = opts.fetchFn ?? fetch;
  const url = `${target.pds}/xrpc/com.atproto.repo.listRecords?repo=${encodeURIComponent(target.did)}&collection=${encodeURIComponent(INTERACTION_COLLECTION)}`;
  log.debug('interactions', 'listing interactions', { pds: target.pds, did: target.did });
  const res = await fetchFn(url);
  if (!res.ok) {
    log.warn('interactions', 'listInteractions failed', { status: res.status, did: target.did });
    throw new Error(`listInteractions failed (HTTP ${res.status}) for ${target.did}`);
  }
  const body = (await res.json()) as {
    records?: { uri: string; cid: string; value: Record<string, unknown> }[];
  };
  return (body.records ?? [])
    .map((r) => {
      const value = r.value as { kind?: string; recipe?: StrongRef; createdAt?: string };
      return {
        uri: r.uri,
        cid: r.cid,
        kind: value.kind as InteractionKind,
        recipe: value.recipe ?? { uri: '', cid: '' },
        author: r.uri.split('/')[2] ?? '',
        createdAt: value.createdAt ?? '',
      };
    })
    .filter((i) => KINDS.includes(i.kind))
    .filter((i) => target.recipeUri === undefined || i.recipe.uri === target.recipeUri)
    .filter((i) => target.kind === undefined || i.kind === target.kind);
};

/** Aggregate interactions on a recipe across the known repos (author + you +
 * friends). A failing repo degrades to a warning — never blanks the counts. */
export const loadRecipeInteractions = async (
  recipeUri: string,
  repos: InteractionRepo[],
  opts: { fetchFn?: typeof fetch } = {},
): Promise<Interaction[]> => {
  const perRepo = await Promise.all(
    repos.map(async (repo) => {
      try {
        return await listInteractionsFor({ ...repo, recipeUri }, opts);
      } catch (err) {
        log.warn('interactions', 'repo interactions unavailable', { did: repo.did, error: String(err) });
        return [];
      }
    }),
  );
  const byUri = new Map<string, Interaction>();
  for (const i of perRepo.flat()) byUri.set(i.uri, i);
  return [...byUri.values()];
};

/** Friends-scoped summary: like count (deduped by author) + the viewer's own
 * state. A signed-out viewer (null) owns nothing. */
export const summarize = (
  interactions: Interaction[],
  viewerDid: string | null,
): { likeCount: number; youLiked: boolean } => {
  const likers = new Set(interactions.filter((i) => i.kind === 'liked').map((i) => i.author));
  return {
    likeCount: likers.size,
    youLiked: viewerDid !== null && likers.has(viewerDid),
  };
};

/** The rkey of the viewer's own matching interaction (for toggling off), or null. */
export const findInteractionRkey = (
  ownInteractions: Interaction[],
  recipeUri: string,
  kind: InteractionKind,
): string | null => {
  const match = ownInteractions.find((i) => i.recipe.uri === recipeUri && i.kind === kind);
  return match === undefined ? null : (match.uri.split('/').pop() ?? null);
};

/** Optimistically apply the viewer's OWN toggle to a loaded interactions list,
 * so the recipe UI reflects a like/save the instant the write resolves — without
 * depending on an immediate re-read, which can race the PDS's read-after-write.
 * Drops any existing own-interaction of the same kind on the same recipe first
 * (idempotent), then appends `added` (or nothing, when removing). Other repos'
 * interactions are untouched; a later background/full read reconciles. */
export const withOwnInteraction = (
  interactions: Interaction[],
  viewerDid: string,
  recipeUri: string,
  kind: InteractionKind,
  added: Interaction | null,
): Interaction[] => {
  const without = interactions.filter(
    (i) => !(i.author === viewerDid && i.kind === kind && i.recipe.uri === recipeUri),
  );
  return added === null ? without : [...without, added];
};

/** Add an interaction (like/save) to the signed-in repo. */
export const addInteraction = async (
  agent: Agent,
  args: { kind: InteractionKind; recipe: StrongRef },
): Promise<{ uri: string; cid: string }> => {
  const did = agent.did;
  if (did === undefined) throw new Error('no signed-in account to interact from');
  const record = buildInteractionRecord(args);
  log.info('interactions', 'adding', { kind: args.kind, recipe: record.recipe.uri });
  const res = await agent.com.atproto.repo.createRecord({
    repo: did,
    collection: INTERACTION_COLLECTION,
    record,
  });
  return { uri: res.data.uri, cid: res.data.cid };
};

/** Remove the viewer's interaction of a kind on a recipe (toggle off). */
export const removeInteraction = async (
  agent: Agent,
  args: { recipeUri: string; kind: InteractionKind },
): Promise<void> => {
  const did = agent.did;
  if (did === undefined) throw new Error('no signed-in account to interact from');
  const res = await agent.com.atproto.repo.listRecords({
    repo: did,
    collection: INTERACTION_COLLECTION,
    limit: 100,
  });
  const own: Interaction[] = res.data.records.map((r) => {
    const value = r.value as { kind?: string; recipe?: StrongRef; createdAt?: string };
    return {
      uri: r.uri,
      cid: typeof r.cid === 'string' ? r.cid : '',
      kind: value.kind as InteractionKind,
      recipe: value.recipe ?? { uri: '', cid: '' },
      author: did,
      createdAt: value.createdAt ?? '',
    };
  });
  const rkey = findInteractionRkey(own, args.recipeUri, args.kind);
  if (rkey === null) {
    log.warn('interactions', 'remove: no matching interaction', args);
    return;
  }
  log.info('interactions', 'removing', { kind: args.kind, rkey });
  await agent.com.atproto.repo.deleteRecord({ repo: did, collection: INTERACTION_COLLECTION, rkey });
};
