# D2 probe capture — 2026-07-07

Source: public recipe.exchange author `did:plc:26tsx5juuss4yealylyfbj4h`,
PDS `https://morel.us-east.host.bsky.network`, record
`at://did:plc:26tsx5juuss4yealylyfbj4h/exchange.recipe.recipe/01JQJ5RW51ZVEW72XN6GSRWC8D`
(CID `bafyreicjd6v75ykac2ky2ccafulnag6ca47enezqm3kp7be5bhubsdchki`).

All endpoints probed with NO auth header and `Origin: http://127.0.0.1:8080`:

| endpoint | status | CORS |
|---|---|---|
| com.atproto.repo.listRecords | 200 | `access-control-allow-origin: *` |
| com.atproto.repo.getRecord | 200 | `*` |
| com.atproto.sync.getRecord (CAR) | 200 | `*` |
| com.atproto.sync.getRepo | 200 | n/a (not header-probed) |
| com.atproto.sync.getBlob | 200 | `*` |
| plc.directory DID doc | 200 | `*` |

Blob observation: real full-size recipe photo was ~996 KB image/jpeg with
intact GPS EXIF (iPhone). Phase 7 note: client-side EXIF stripping on upload
is a privacy behavior worth adding; cap observation informs the client cap.

Files here are verbatim captured responses (fixtures for Phase 4 read-path
tests). The blob itself was NOT kept (third party's photo + GPS EXIF).
