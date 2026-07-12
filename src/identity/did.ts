// DID-document lookups shared by the recipe page, the starter feed, and
// My recipes (plc.directory is CORS-open, D2-verified).

export type DidFacts = { pds: string; handle: string | null };

type DidDocument = {
  alsoKnownAs?: string[];
  service?: { id: string; type?: string; serviceEndpoint: string }[];
};

export const resolveDidDoc = async (
  did: string,
  fetchFn: typeof fetch = fetch,
): Promise<DidFacts> => {
  const res = await fetchFn(`https://plc.directory/${encodeURIComponent(did)}`);
  if (!res.ok) throw new Error(`DID document fetch failed (HTTP ${res.status}) for ${did}`);
  const doc = (await res.json()) as DidDocument;
  const pds = doc.service?.find((s) => s.id === '#atproto_pds' || s.id.endsWith('#atproto_pds'));
  if (pds === undefined) throw new Error(`DID document for ${did} has no #atproto_pds service`);
  const aka = doc.alsoKnownAs?.find((a) => a.startsWith('at://'));
  return { pds: pds.serviceEndpoint, handle: aka?.slice('at://'.length) ?? null };
};
