// Cook (actor) typeahead search (Phase 1). The transcript's question was: how do
// you let someone find a cook without knowing their exact handle, when a client
// can't index 38M accounts? Answer: delegate the prefix match to Bluesky's
// AppView. `app.bsky.actor.searchActorsTypeahead` is a public, CORS-open,
// unauthenticated query purpose-built for this — served from the same origin
// (public.api.bsky.app) the resolver already uses, so no new trust dependency
// and no CSP change.
//
// This path fires on every keystroke, so it degrades SOFT: on any error it logs
// and returns no suggestions, leaving manual handle entry + the (fail-loud)
// "Find recipes" submit untouched. That soft-degrade is the deliberate,
// documented exception to fail-loud (see the plan's Reasoning), mirroring the
// existing meal-plan-palette `collect()` degrade.

import { log } from '../log.js';

/** A cook the AppView suggested for a query. displayName/avatar are optional in
 * the lexicon, so they are absent (not empty) when the actor has none. */
export type ActorSuggestion = {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
};

export type ActorSearchOptions = {
  /** AppView serving app.bsky.actor.searchActorsTypeahead. */
  appView?: string;
  fetchFn?: typeof fetch;
  /** Shortest query that triggers a network request (default 2). */
  minChars?: number;
};

type TypeaheadActor = {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
};

const toSuggestion = (actor: TypeaheadActor): ActorSuggestion => {
  const suggestion: ActorSuggestion = { did: actor.did, handle: actor.handle };
  if (actor.displayName !== undefined) suggestion.displayName = actor.displayName;
  if (actor.avatar !== undefined) suggestion.avatar = actor.avatar;
  return suggestion;
};

export const createActorSearch = (options: ActorSearchOptions = {}) => {
  const appView = options.appView ?? 'https://public.api.bsky.app';
  const fetchFn = options.fetchFn ?? fetch;
  const minChars = options.minChars ?? 2;

  return async (
    query: string,
    opts: { limit?: number; signal?: AbortSignal } = {},
  ): Promise<ActorSuggestion[]> => {
    const q = query.trim();
    // Below the threshold we never touch the network — this is what stops a
    // fetch firing on every keystroke of a partial handle.
    if (q.length < minChars) return [];

    const limit = opts.limit ?? 8;
    const url = `${appView}/xrpc/app.bsky.actor.searchActorsTypeahead?q=${encodeURIComponent(q)}&limit=${limit}`;

    try {
      const res = opts.signal === undefined
        ? await fetchFn(url)
        : await fetchFn(url, { signal: opts.signal });
      if (!res.ok) {
        log.warn('identity', 'actor search failed', { status: res.status, qlen: q.length });
        return [];
      }
      const { actors } = (await res.json()) as { actors?: TypeaheadActor[] };
      const suggestions = (actors ?? []).map(toSuggestion);
      log.debug('identity', 'actor search', { qlen: q.length, count: suggestions.length });
      return suggestions;
    } catch (err) {
      log.warn('identity', 'actor search error', { error: String(err), qlen: q.length });
      return [];
    }
  };
};
