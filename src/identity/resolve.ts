// Handle → DID → PDS resolution (Phase 2).
//
// Browsers cannot read DNS TXT records and cross-origin
// `.well-known/atproto-did` fetches are CORS-blocked for most handle
// domains, so handle→DID goes through a configurable resolver service
// (XRPC com.atproto.identity.resolveHandle). The resolver is a deliberate
// third-party dependency — configurable so it isn't a hard Bluesky-infra
// coupling. DID→document: plc.directory for did:plc (CORS-open, verified
// in Phase 0), the well-known path for did:web.

import { log } from '../log.js';

export type ResolvedIdentity = {
  handle: string;
  did: string;
  /** PDS base URL from the #atproto_pds service entry. */
  pds: string;
  /** publicKeyMultibase of the #atproto verification method, when present. */
  signingKey?: string;
};

export type ResolverOptions = {
  /** Service running com.atproto.identity.resolveHandle. */
  handleResolver?: string;
  plcDirectory?: string;
  fetchFn?: typeof fetch;
};

type DidDocument = {
  id?: string;
  service?: { id: string; type: string; serviceEndpoint: string }[];
  verificationMethod?: { id: string; publicKeyMultibase?: string }[];
};

const didDocumentUrl = (did: string, plcDirectory: string): string => {
  if (did.startsWith('did:plc:')) return `${plcDirectory}/${did}`;
  if (did.startsWith('did:web:')) {
    const host = did.slice('did:web:'.length);
    return `https://${decodeURIComponent(host)}/.well-known/did.json`;
  }
  throw new Error(`unsupported DID method: ${did}`);
};

export const createResolver = (options: ResolverOptions = {}) => {
  const handleResolver = options.handleResolver ?? 'https://public.api.bsky.app';
  const plcDirectory = options.plcDirectory ?? 'https://plc.directory';
  const fetchFn = options.fetchFn ?? fetch;

  return async (handle: string): Promise<ResolvedIdentity> => {
    log.debug('identity', 'resolving handle', { handle, handleResolver });

    const handleRes = await fetchFn(
      `${handleResolver}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`,
    );
    if (!handleRes.ok) {
      const body = (await handleRes.json().catch(() => ({}))) as { message?: string };
      const message = body.message ?? `handle resolution failed (HTTP ${handleRes.status})`;
      log.warn('identity', 'handle resolution failed', { handle, status: handleRes.status, message });
      throw new Error(message);
    }
    const { did } = (await handleRes.json()) as { did: string };

    const docUrl = didDocumentUrl(did, plcDirectory);
    log.debug('identity', 'fetching DID document', { did, docUrl });
    const docRes = await fetchFn(docUrl);
    if (!docRes.ok) {
      log.warn('identity', 'DID document fetch failed', { did, status: docRes.status });
      throw new Error(`DID document fetch failed for ${did} (HTTP ${docRes.status})`);
    }
    const doc = (await docRes.json()) as DidDocument;

    const pdsService = doc.service?.find(
      (s) => s.id === '#atproto_pds' || s.id === `${did}#atproto_pds`,
    );
    if (pdsService === undefined) {
      log.warn('identity', 'DID document has no #atproto_pds service', { did });
      throw new Error(`DID document for ${did} has no #atproto_pds service`);
    }

    const signingKey = doc.verificationMethod?.find(
      (m) => m.id === `${did}#atproto` || m.id === '#atproto',
    )?.publicKeyMultibase;

    const identity: ResolvedIdentity = signingKey === undefined
      ? { handle, did, pds: pdsService.serviceEndpoint }
      : { handle, did, pds: pdsService.serviceEndpoint, signingKey };
    log.debug('identity', 'resolved', { handle, did, pds: identity.pds });
    return identity;
  };
};
