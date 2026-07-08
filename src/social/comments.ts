// Threaded comments (Phase 9b). app.arecipe.comment is our lexicon (D8):
//   - recipe:  a com.atproto.repo.strongRef (uri+cid) — PINNED, for provenance
//              (detects a comment made on an older recipe revision)
//   - text:    the comment body
//   - parent?: the parent comment's AT-URI — MUTABLE, so threads follow the
//              latest revision of an edited parent
//   - createdAt
// Discovery is friends-scoped (backendless: no global index of app.arecipe.*):
// the recipe page reads comments only from repos it knows — the recipe author,
// you, and your friends (see the plan's 9b "Shape confirmed" note). Pure/read
// logic is unit-tested; the authenticated write (addComment) is proven @live.

import type { Agent } from '@atproto/api';
import { log } from '../log.js';
import { isStale, type StrongRef } from '../recipes/refs.js';

export const COMMENT_COLLECTION = 'app.arecipe.comment';

export type CommentRecordOut = {
  $type: typeof COMMENT_COLLECTION;
  recipe: StrongRef;
  text: string;
  parent?: string;
  createdAt: string;
};

/** A comment as read back from a repo. */
export type Comment = {
  uri: string;
  cid: string;
  /** The commenter's DID (from the record's AT-URI). */
  author: string;
  text: string;
  recipe: StrongRef;
  /** Parent comment AT-URI, or null for a top-level comment. */
  parent: string | null;
  createdAt: string;
};

/** A comment with its nested replies (client-side thread build). */
export type CommentNode = Comment & { replies: CommentNode[] };

/** A repo to read comments from (the recipe author, you, or a friend). */
export type CommentRepo = { did: string; pds: string };

/** Build a typed app.arecipe.comment record. Fails loud on empty text or an
 * incomplete recipe strongRef. */
export const buildCommentRecord = (args: {
  recipe: StrongRef;
  text: string;
  parent?: string;
}): CommentRecordOut => {
  const text = args.text.trim();
  if (text === '') throw new Error('comment text is required');
  if (args.recipe.uri === '' || args.recipe.cid === '') {
    throw new Error('comment recipe strongRef (uri+cid) is required');
  }
  const record: CommentRecordOut = {
    $type: COMMENT_COLLECTION,
    recipe: args.recipe,
    text,
    createdAt: new Date().toISOString(),
  };
  if (args.parent !== undefined) record.parent = args.parent;
  return record;
};

/** Read one repo's comments on a specific recipe (public: comments are public). */
export const listCommentsFor = async (
  target: { pds: string; did: string; recipeUri: string },
  opts: { fetchFn?: typeof fetch } = {},
): Promise<Comment[]> => {
  const fetchFn = opts.fetchFn ?? fetch;
  const url = `${target.pds}/xrpc/com.atproto.repo.listRecords?repo=${encodeURIComponent(target.did)}&collection=${encodeURIComponent(COMMENT_COLLECTION)}`;
  log.debug('comments', 'listing comments', { pds: target.pds, did: target.did });
  const res = await fetchFn(url);
  if (!res.ok) {
    log.error('comments', 'listComments failed', { status: res.status, did: target.did });
    throw new Error(`listComments failed (HTTP ${res.status}) for ${target.did}`);
  }
  const body = (await res.json()) as {
    records?: { uri: string; cid: string; value: Record<string, unknown> }[];
  };
  return (body.records ?? [])
    .map((r) => {
      const value = r.value as {
        recipe?: StrongRef;
        text?: string;
        parent?: string;
        createdAt?: string;
      };
      return {
        uri: r.uri,
        cid: r.cid,
        author: r.uri.split('/')[2] ?? '',
        text: value.text ?? '',
        recipe: value.recipe ?? { uri: '', cid: '' },
        parent: value.parent ?? null,
        createdAt: value.createdAt ?? '',
      };
    })
    .filter((c) => c.recipe.uri === target.recipeUri);
};

/** Aggregate comments on a recipe across the known repos (author + you +
 * friends). A failing repo degrades to a warning — never blanks the thread. */
export const loadRecipeComments = async (
  recipeUri: string,
  repos: CommentRepo[],
  opts: { fetchFn?: typeof fetch } = {},
): Promise<Comment[]> => {
  const perRepo = await Promise.all(
    repos.map(async (repo) => {
      try {
        return await listCommentsFor({ ...repo, recipeUri }, opts);
      } catch (err) {
        log.warn('comments', 'repo comments unavailable', { did: repo.did, error: String(err) });
        return [];
      }
    }),
  );
  // De-dup by AT-URI (a repo could appear twice — e.g. author is also a friend).
  const byUri = new Map<string, Comment>();
  for (const c of perRepo.flat()) byUri.set(c.uri, c);
  return [...byUri.values()];
};

/** Build the reply tree. Keyed on AT-URI, so an edited parent (new CID, same
 * URI) still nests its replies. An orphaned parent (URI not present) renders
 * at top level — never dropped. Ordered oldest-first at every level. */
export const buildThread = (comments: Comment[]): CommentNode[] => {
  const sorted = [...comments].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const nodes = new Map<string, CommentNode>();
  for (const c of sorted) nodes.set(c.uri, { ...c, replies: [] });
  const roots: CommentNode[] = [];
  for (const c of sorted) {
    const node = nodes.get(c.uri)!;
    if (c.parent !== null && nodes.has(c.parent)) {
      nodes.get(c.parent)!.replies.push(node);
      continue;
    }
    if (c.parent !== null) {
      log.warn('comments', 'orphaned parent — rendering at top level', {
        uri: c.uri,
        parent: c.parent,
      });
    }
    roots.push(node);
  }
  return roots;
};

/** Did the recipe move on since this comment pinned it? (both edges matter) */
export const commentOnStaleRevision = (comment: Comment, currentRecipeCid: string): boolean =>
  isStale({ pinnedCid: comment.recipe.cid, currentCid: currentRecipeCid });

/** Post a comment (or reply, when `parent` is set) to the signed-in repo. */
export const addComment = async (
  agent: Agent,
  args: { recipe: StrongRef; text: string; parent?: string },
): Promise<{ uri: string; cid: string }> => {
  const did = agent.did;
  if (did === undefined) throw new Error('no signed-in account to comment from');
  const record = buildCommentRecord(args);
  log.info('comments', 'posting comment', { recipe: record.recipe.uri, parent: args.parent });
  const res = await agent.com.atproto.repo.createRecord({
    repo: did,
    collection: COMMENT_COLLECTION,
    record,
  });
  log.info('comments', 'posted comment', { uri: res.data.uri });
  return { uri: res.data.uri, cid: res.data.cid };
};
