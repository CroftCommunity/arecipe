// Real PDS client — zero-dep atproto XRPC over fetch. Used ONLY by the live
// `wbsync publish --publish` path; never exercised by the test suite (the brief
// keeps publish dry — D12). Registered in STAND-INS.md as the untested boundary.
//
// The brief says: batch via com.atproto.repo.applyWrites "if the pinned SDK
// exposes it; otherwise sequential putRecord with backoff." There is no SDK here
// (zero runtime deps), so we take the sequential-putRecord path — which also
// gives idempotent, resumable application (see publish.ts).
import type { PdsClient } from './publish.ts';
import type { RecipeRecord } from './record.ts';

type Session = { did: string; accessJwt: string };

const xrpc = async (
  service: string,
  method: string,
  body: unknown,
  jwt?: string,
): Promise<unknown> => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (jwt !== undefined) headers.Authorization = `Bearer ${jwt}`;
  const res = await fetch(`${service}/xrpc/${method}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`XRPC ${method} failed: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
  }
  return res.json();
};

const xrpcGet = async (service: string, method: string, params: Record<string, string>, jwt?: string): Promise<unknown> => {
  const headers: Record<string, string> = {};
  if (jwt !== undefined) headers.Authorization = `Bearer ${jwt}`;
  const url = `${service}/xrpc/${method}?${new URLSearchParams(params).toString()}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`XRPC ${method} failed: HTTP ${res.status}`);
  return res.json();
};

export const createSession = async (
  service: string,
  identifier: string,
  password: string,
): Promise<Session> => {
  const out = (await xrpc(service, 'com.atproto.server.createSession', { identifier, password })) as Session;
  return { did: out.did, accessJwt: out.accessJwt };
};

export class HttpPdsClient implements PdsClient {
  private readonly service: string;
  private readonly session: Session;
  constructor(service: string, session: Session) {
    this.service = service;
    this.session = session;
  }

  static async connect(service: string, identifier: string, password: string): Promise<HttpPdsClient> {
    return new HttpPdsClient(service, await createSession(service, identifier, password));
  }

  get did(): string {
    return this.session.did;
  }

  async putRecord(
    repo: string,
    collection: string,
    rkey: string,
    value: RecipeRecord,
  ): Promise<{ cid: string; uri: string }> {
    const out = (await xrpc(
      this.service,
      'com.atproto.repo.putRecord',
      { repo, collection, rkey, record: value },
      this.session.accessJwt,
    )) as { cid: string; uri: string };
    return { cid: out.cid, uri: out.uri };
  }

  async deleteRecord(repo: string, collection: string, rkey: string): Promise<void> {
    await xrpc(
      this.service,
      'com.atproto.repo.deleteRecord',
      { repo, collection, rkey },
      this.session.accessJwt,
    );
  }

  async currentRev(repo: string): Promise<string> {
    const out = (await xrpcGet(this.service, 'com.atproto.sync.getLatestCommit', { did: repo }, this.session.accessJwt)) as {
      rev: string;
    };
    return out.rev;
  }
}
