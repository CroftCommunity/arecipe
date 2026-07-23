// D3: the cheap revalidation primitive. com.atproto.sync.getLatestCommit
// returns the repo's current commit rev + cid — one small request whose answer
// is a string we compare to the manifest rev. This is the whole reason an
// unchanged repo costs one request and zero record fetches.

export type LatestCommit = { rev: string; cid: string };

/** An error carrying the HTTP status, so callers can tell a deactivated/gone
 * repo (4xx) from a transient failure. */
export class GetLatestCommitError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'GetLatestCommitError';
  }
}

export const getLatestCommit = async (opts: {
  fetchFn?: typeof fetch;
  pds: string;
  did: string;
}): Promise<LatestCommit> => {
  const fetchFn = opts.fetchFn ?? fetch;
  const url = `${opts.pds}/xrpc/com.atproto.sync.getLatestCommit?did=${encodeURIComponent(opts.did)}`;
  const res = await fetchFn(url);
  if (!res.ok) throw new GetLatestCommitError(`getLatestCommit HTTP ${res.status} for ${opts.did}`, res.status);
  const body = (await res.json()) as { rev?: string; cid?: string };
  if (typeof body.rev !== 'string') throw new GetLatestCommitError(`getLatestCommit returned no rev for ${opts.did}`, 200);
  return { rev: body.rev, cid: typeof body.cid === 'string' ? body.cid : '' };
};
