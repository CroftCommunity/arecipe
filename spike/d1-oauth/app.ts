// D1 probe app (throwaway). Runs at http://127.0.0.1:8127, loopback client.
import { BrowserOAuthClient } from '@atproto/oauth-client-browser';
import { Agent } from '@atproto/api';

// Loopback client with explicit scope: the bare loopback default is just
// `atproto`, which cannot call appview-proxied RPCs (D1 finding). In 0.4.6,
// scope is requested via the loopback client_id's query string, turned into
// metadata with atprotoLoopbackClientMetadata.
import { atprotoLoopbackClientMetadata } from '@atproto/oauth-types';
const loopbackClientId = `http://localhost?redirect_uri=${encodeURIComponent(
  'http://127.0.0.1:8127/',
)}&scope=${encodeURIComponent('atproto transition:generic')}`;
const client = new BrowserOAuthClient({
  handleResolver: 'https://bsky.social',
  clientMetadata: atprotoLoopbackClientMetadata(loopbackClientId),
});

const state: {
  initResult: unknown;
  session: any;
  events: string[];
} = { initResult: 'pending', session: null, events: [] };

// v0.4.6: OAuthClient is not an EventTarget (README's addEventListener API is
// from a newer version). Record what event-ish surface exists instead.
state.events.push(
  `client-surface:${Object.getOwnPropertyNames(Object.getPrototypeOf(client)).join(',')}`,
);

const initPromise = client
  .init()
  .then((r) => {
    state.initResult = r ? { did: r.session.did, cameFromCallback: r.state !== undefined } : null;
    state.session = r?.session ?? null;
    return r;
  })
  .catch((err) => {
    state.initResult = `INIT-ERROR: ${String(err)}`;
    return null;
  });

(window as any).d1 = {
  state,
  ready: () => initPromise.then(() => state.initResult),
  signIn: (handle: string) => {
    // never resolves (redirect); fire and let the navigation happen
    client.signIn(handle).catch((err) => state.events.push(`signIn-reject:${String(err)}`));
    return 'redirecting';
  },
  read: async () => {
    const agent = new Agent(state.session);
    const prof = await agent.getProfile({ actor: agent.accountDid });
    return { handle: prof.data.handle, did: prof.data.did };
  },
  tokenInfo: async (force: boolean) => {
    const info = await state.session.getTokenInfo(force ? true : 'auto');
    return {
      expiresAt: info.expiresAt?.toISOString() ?? null,
      expired: info.expired ?? null,
      scope: info.scope,
      iss: info.iss,
    };
  },
  sessionSurface: () => ({
    keys: Object.keys(state.session ?? {}),
    proto: state.session
      ? Object.getOwnPropertyNames(Object.getPrototypeOf(state.session))
      : [],
  }),
  dumpIdb: async () => {
    const dbs = await indexedDB.databases();
    const out: Record<string, unknown> = {};
    for (const dbInfo of dbs) {
      if (dbInfo.name === undefined) continue;
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(dbInfo.name!);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const stores: Record<string, unknown> = {};
      for (const storeName of Array.from(db.objectStoreNames)) {
        const entries = await new Promise<unknown[]>((resolve, reject) => {
          const rows: unknown[] = [];
          const cur = db.transaction(storeName).objectStore(storeName).openCursor();
          cur.onsuccess = () => {
            const c = cur.result;
            if (c) {
              rows.push({ key: String(c.key), valueKeys: typeof c.value === 'object' && c.value !== null ? Object.keys(c.value) : typeof c.value });
              c.continue();
            } else resolve(rows);
          };
          cur.onerror = () => reject(cur.error);
        });
        stores[storeName] = entries;
      }
      out[dbInfo.name] = { version: dbInfo.version, stores };
      db.close();
    }
    return out;
  },
};

document.getElementById('app')!.textContent = 'd1 probe ready';
