// GitHub Contents API write client (create/update a single file). The read
// probe (docs/GITHUB-CORS-PROBE.md) proved the browser can GET a file's sha and
// PUT new content cross-origin with no proxy. This module is the typed, tested
// version of that flow: GET sha → PUT (create if absent, update with sha if
// present), with a single retry on a stale-sha 409.
//
// AUTH-AGNOSTIC BY DESIGN: it makes requests through an injected `fetchFn` that
// is already authorized (the token provider's authorized fetch, or the service
// worker that injects `Authorization`). The token never passes through here —
// that keeps the secret in one place (Phase 3) and this module trivially
// testable with a fake fetch.

import { log as defaultLogger, type Logger } from '../log.js';

const API = 'https://api.github.com';

/** 401/403 from GitHub — the token is missing, wrong, or lacks Contents:write. */
export class GithubAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GithubAuthError';
  }
}

/** Any other non-2xx from a Contents write. */
export class GithubWriteError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'GithubWriteError';
    this.status = status;
  }
}

const contentsUrl = (repo: string, path: string, ref?: string): string =>
  `${API}/repos/${repo}/contents/${encodeURI(path)}${ref !== undefined ? `?ref=${encodeURIComponent(ref)}` : ''}`;

/** Base64 of the UTF-8 bytes of `text` (GitHub wants base64 `content`). Not
 * `btoa(text)` — that is latin1 and corrupts any non-ASCII recipe name. */
const toBase64Utf8 = (text: string): string => {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
};

export type PutFileArgs = {
  /** `owner/repo`. */
  repo: string;
  path: string;
  branch?: string;
  /** File contents as text (UTF-8); base64-encoded here. */
  contentUtf8: string;
  message: string;
  /** Authorized fetch (defaults to global `fetch`; injected in tests). */
  fetchFn?: typeof fetch;
  logger?: Logger;
};

export type PutFileResult = { commitSha: string | undefined; contentSha: string | undefined };

const raiseForStatus = (res: Response, action: string): void => {
  if (res.status === 401 || res.status === 403) {
    throw new GithubAuthError(
      `GitHub ${action} unauthorized (HTTP ${res.status}) — check the token has Contents:write on this repo, or re-enter it.`,
    );
  }
};

/** Current blob sha of the file, or `null` if it does not exist (404 ⇒ create). */
const getSha = async (
  fetchFn: typeof fetch,
  repo: string,
  path: string,
  branch?: string,
): Promise<string | null> => {
  const res = await fetchFn(contentsUrl(repo, path, branch), {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (res.status === 404) return null;
  raiseForStatus(res, 'read');
  if (!res.ok) throw new GithubWriteError(`GitHub read failed (HTTP ${res.status})`, res.status);
  const body = (await res.json()) as { sha?: unknown };
  return typeof body.sha === 'string' ? body.sha : null;
};

const putOnce = (fetchFn: typeof fetch, args: PutFileArgs, sha: string | null): Promise<Response> => {
  const payload: Record<string, unknown> = {
    message: args.message,
    content: toBase64Utf8(args.contentUtf8),
    ...(sha !== null ? { sha } : {}),
    ...(args.branch !== undefined ? { branch: args.branch } : {}),
  };
  return fetchFn(`${API}/repos/${args.repo}/contents/${encodeURI(args.path)}`, {
    method: 'PUT',
    headers: { Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
};

/** Create or update `path` in `repo`. Idempotent: GET the sha first, PUT with it
 * (update) or without it (create); on a 409 (someone else moved the sha), re-GET
 * once and retry. Throws `GithubAuthError` on 401/403 and `GithubWriteError`
 * otherwise. Never logs the token (it never sees it). */
export const putFile = async (args: PutFileArgs): Promise<PutFileResult> => {
  const fetchFn = args.fetchFn ?? fetch;
  const logger = args.logger ?? defaultLogger;

  let sha = await getSha(fetchFn, args.repo, args.path, args.branch);
  let res = await putOnce(fetchFn, args, sha);
  if (res.status === 409) {
    logger.debug('calendar-publish', 'stale sha, retrying once', { repo: args.repo, path: args.path });
    sha = await getSha(fetchFn, args.repo, args.path, args.branch);
    res = await putOnce(fetchFn, args, sha);
  }
  raiseForStatus(res, 'write');
  if (!res.ok) throw new GithubWriteError(`GitHub write failed (HTTP ${res.status})`, res.status);

  const body = (await res.json()) as { commit?: { sha?: string }; content?: { sha?: string } };
  logger.info('calendar-publish', 'file written', { repo: args.repo, path: args.path });
  return { commitSha: body.commit?.sha, contentSha: body.content?.sha };
};
