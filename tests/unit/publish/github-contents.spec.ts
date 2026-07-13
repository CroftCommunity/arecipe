// GitHub Contents write client. Behaviors (injected fake fetch):
//  - create: GET 404 → PUT without sha
//  - update: GET 200(sha) → PUT with that sha
//  - 409 stale sha → re-GET → retry PUT once
//  - 401/403 → GithubAuthError; other non-2xx → GithubWriteError(status)
//  - content is base64 of UTF-8 bytes (non-ASCII round-trips)
import { describe, expect, it, vi } from 'vitest';
import { GithubAuthError, putFile } from '../../../src/publish/github-contents.js';

type Call = { url: string; init?: RequestInit };

/** A fake fetch that replays a queue of responses and records calls. */
const fakeFetch = (responses: Response[]): { fn: typeof fetch; calls: Call[] } => {
  const calls: Call[] = [];
  let i = 0;
  const fn = ((url: string, init?: RequestInit): Promise<Response> => {
    calls.push({ url, init });
    const res = responses[i++];
    if (res === undefined) throw new Error(`unexpected fetch #${i}: ${url}`);
    return Promise.resolve(res);
  }) as unknown as typeof fetch;
  return { fn, calls };
};

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const args = (over = {}) => ({
  repo: 'me/cal',
  path: 'meals.ics',
  contentUtf8: 'BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n',
  message: 'update',
  ...over,
});

const putBody = (call: Call | undefined): Record<string, unknown> => {
  if (call?.init?.body == null) throw new Error('expected a request body');
  return JSON.parse(String(call.init.body)) as Record<string, unknown>;
};

describe('putFile', () => {
  it('creates a new file (GET 404 → PUT without sha)', async () => {
    const { fn, calls } = fakeFetch([
      json(404, { message: 'Not Found' }),
      json(201, { commit: { sha: 'c1' }, content: { sha: 'b1' } }),
    ]);
    const res = await putFile(args({ fetchFn: fn }));
    expect(res).toEqual({ commitSha: 'c1', contentSha: 'b1' });
    expect(calls[1]?.init?.method).toBe('PUT');
    expect(putBody(calls[1])).not.toHaveProperty('sha');
  });

  it('updates an existing file (GET sha → PUT with sha)', async () => {
    const { fn, calls } = fakeFetch([
      json(200, { sha: 'old' }),
      json(200, { commit: { sha: 'c2' }, content: { sha: 'b2' } }),
    ]);
    const res = await putFile(args({ fetchFn: fn }));
    expect(res.commitSha).toBe('c2');
    expect(putBody(calls[1]).sha).toBe('old');
  });

  it('retries once on a 409 stale sha', async () => {
    const { fn, calls } = fakeFetch([
      json(200, { sha: 'old' }),
      json(409, { message: 'is at ... but expected ...' }),
      json(200, { sha: 'fresh' }),
      json(200, { commit: { sha: 'c3' }, content: { sha: 'b3' } }),
    ]);
    const res = await putFile(args({ fetchFn: fn }));
    expect(res.commitSha).toBe('c3');
    expect(calls).toHaveLength(4);
    expect(putBody(calls[3]).sha).toBe('fresh');
  });

  it('maps 401/403 to GithubAuthError', async () => {
    const { fn } = fakeFetch([json(401, { message: 'Bad credentials' })]);
    await expect(putFile(args({ fetchFn: fn }))).rejects.toBeInstanceOf(GithubAuthError);
  });

  it('maps other non-2xx to GithubWriteError with the status', async () => {
    const { fn } = fakeFetch([json(404, {}), json(500, { message: 'boom' })]);
    await expect(putFile(args({ fetchFn: fn }))).rejects.toMatchObject({
      name: 'GithubWriteError',
      status: 500,
    });
  });

  it('encodes content as base64 of UTF-8 bytes (non-ASCII round-trips)', async () => {
    const { fn, calls } = fakeFetch([
      json(404, {}),
      json(201, { commit: { sha: 'c' }, content: { sha: 'b' } }),
    ]);
    const content = 'SUMMARY:Crêpes brûlée 🍮\r\n';
    await putFile(args({ fetchFn: fn, contentUtf8: content }));
    const b64 = String(putBody(calls[1]).content);
    // Decode base64 → UTF-8 and compare.
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    expect(new TextDecoder().decode(bytes)).toBe(content);
  });

  it('never logs the file content or a token substring', async () => {
    const { fn } = fakeFetch([
      json(404, {}),
      json(201, { commit: { sha: 'c' }, content: { sha: 'b' } }),
    ]);
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    await putFile(args({ fetchFn: fn, logger: logger as never }));
    const logged = JSON.stringify([logger.debug.mock.calls, logger.info.mock.calls]);
    expect(logged).not.toContain('BEGIN:VCALENDAR');
  });
});
