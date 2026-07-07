# Phase 2 identity fixtures — captured 2026-07-07

Recorded live responses (see the executable plan, Phase 2):

- `resolveHandle-ngvalidation2112.json` — HTTP 200 from
  `https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle`
- `resolveHandle-unresolvable.json` — HTTP 400
  `{"error":"InvalidRequest","message":"Unable to resolve handle"}`
- `plc-diddoc-ngvalidation2112.json` — HTTP 200 from
  `https://plc.directory/did:plc:xyfhcaweaeyew3zrgk6jaln7`
  (#atproto_pds → stropharia.us-west.host.bsky.network; Multikey signing key)

Synthetic (shape per the DID spec, NOT captured — no convenient live did:web
atproto account at capture time):

- `didweb-diddoc-synthetic.json` — did:web document with #atproto_pds
