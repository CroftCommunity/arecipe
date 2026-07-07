# The Uninshittifiable App

author: Chase Pettet

version: 0.3 (revised to add source-hosting redundancy)

date: 2026-07-07

working name: arecipe (candidate namespaces: arecipe.app, arecipe.fyi, arecipe.croft.ing)

status: draft, for discussion

changes from v0.2:

- Made source hosting (Authority 2) internally redundant across multiple independent providers

- Added Tangled as an atproto-native code mirror and documented fallback origin, pending Tangled custom-domain support for direct DNS inclusion

- Elevated deplatforming by any single hosting provider to the defended-threats list

- Documented the fallback URL in the incident runbook

changes from v0.1:

- Bounded the "uninshittifiable" and "no operator" claims to what is actually defensible

- Reframed the delivery-attestation story around three separable authorities (DNS, source hosting, offline signing key) rather than a single signature check

- Added the signed status canary as an out-of-band incident signal

- Made WebAuthn PRF an opt-in enhancement rather than a default requirement

- Added cross-tab session coordination, PDS migration handling, and draft persistence surviving storage eviction

- Switched comments from Bluesky-post reuse to app-scoped `fyi.recipe.comment` for decoupling

- Added recipe versioning policy (strongRef with AT-URI + CID pin)

- Added search, blob handling, rate-limit handling, and multi-device sync

- Added the incident-response runbook as a first-class artifact

- Acknowledged PDS operator as a real single point of failure in the threat model

- Introduced `fyi.recipe.friend` for app-scoped follows so users not on Bluesky have a cold-start path

- Called out lexicon-mirroring in the application account's own PDS as resilience against `recipe.exchange` domain loss

---

## 0. Preamble

The `a` is for Amanda.

This document specifies a working recipe-sharing social application. Its principal design goal is structural resistance to the enshittification pattern Cory Doctorow named: the progressive extraction of value from users by a platform operator answering to shareholders. The design cannot resist every decay mode a software project may suffer, and it does not eliminate the existence of an operator entirely. What it does is reduce the operator's coercive power to near zero for behavioral, moderation, and data-portability decisions, and it distributes trust across independent authorities so that no single compromise silently targets users.

The recipe domain was chosen because it is non-controversial, has high value per record, and already has a working lexicon (`exchange.recipe.*`) with a functioning public consumer at recipe.exchange. That anchor makes the interoperability story concrete rather than theoretical. A recipe written through this application is a valid `exchange.recipe.recipe` record that appears on recipe.exchange without coordination between the two projects.

The document is meant to be readable end to end so that the composition of the layers, not any individual layer, carries the argument.

---

## 1. Thesis

Enshittification, per Doctorow, is a decay pattern: platforms first serve users to attract them, then serve business customers to extract from them, and finally extract from both to serve shareholders. The pattern requires four structural conditions:

- A platform operator with unilateral control over the platform's behavior

- Data lock-in that makes leaving expensive

- Aggregated user data held as a proprietary asset

- Network effects that make individual defection irrational

Remove any one of these and the pattern stalls. Remove all four and it cannot begin. The design specified here removes all four:

- **No operator with unilateral behavioral control.** An operator exists (someone owns the domain, maintains the code, signs releases) but their levers are minimum-authority. Users can unadopt any decision the operator publishes.

- **No lock-in.** Records live in users' own PDSes. Any conforming consumer can render them.

- **No aggregated data asset.** The application holds nothing. There is no database, no user table, no analytics warehouse.

- **Network effects operate at the protocol layer.** Users can adopt a competing application and take their social graph, content, and moderation preferences with them.

The claim of "uninshittifiable" is bounded: **structurally resistant to Doctorow's specific pattern.** Not resistant to author burnout, third-party value extraction, legal shutdown, or fork-based monetization. Those failure modes remain and are called out where relevant in the sections below.

---

## 2. Threat Model

The design's guarantees apply to a specific set of threats. This section states them precisely.

### Defended

- Progressive value extraction by an operator over time. There is no operator with the incentive or the levers.

- Silent extraction of user data by the application. The application holds no data.

- Silent moderation policy change imposed on users. Moderation is client-derived from the user's own graph and adoption of published lists is opt-in.

- Application shutdown destroying user data. Data is on user-owned PDSes.

- Vendor lock-in. Records are portable to any conforming consumer.

- Silent version downgrade of the running application. Enforced by monotonic version numbering in signed release manifests.

- **Single-authority compromise silently targeting users.** No individual authority (DNS provider, source host, or offline signing key) can compromise users without at least one other authority also being compromised. Detection and recovery paths exist for each independent authority.

- **Deplatforming by any single hosting provider.** Source hosting is redundant across multiple independent providers. Source code is mirrored across independent git forges. Loss of any one provider degrades but does not silence the service.

### Not defended, and explicitly acknowledged as user or ecosystem responsibility

- Compromise of a user's own PDS host. The PDS operator holds the user's signed records; a malicious PDS could refuse to serve them, though it cannot silently alter them (records are signed by the user's own key).

- Compromise of a user's own device.

- Malicious browser extensions with access to application memory.

- Social engineering attacks against users.

- Simultaneous compromise of two or more of DNS, source hosting, and offline signing key.

- Loss of the offline signing key without a prepared rotation ceremony.

- Cryptographic breaks in Ed25519, SHA-256, or the browser's WebCrypto and WebAuthn implementations.

- Adversarial legal action against the developer or against user PDS operators.

- Sybil attacks and coordinated adversarial usage at web scale. The design targets 12-25 person groups; at that scale sybil resistance is a social problem, not a cryptographic one. Larger deployments require additional design work.

### Single points of failure acknowledged

- **The user's PDS operator.** If the PDS host disappears, the user's records disappear with it (unless the user migrated first). The application should surface this fact during onboarding and encourage users to think about their PDS choice.

- **The `exchange.recipe.*` lexicon maintainer.** A single developer maintains the schemas. Loss of that maintainer degrades the interop story. Mitigation is to mirror the lexicons in the application account's own PDS (see Section 5).

- **The offline signing key.** Loss without rotation is catastrophic and requires a hard fork. The key ceremony must be designed with recoverability in mind.

### Cryptographic assumptions

Ed25519 signatures are unforgeable. SHA-256 is collision-resistant. Browser WebCrypto and WebAuthn implementations are correct with respect to their specifications. A well-behaved PDS returns signed records unmodified.

---

## 3. Architecture at a Glance

Ten layers, from lowest to highest:

1. **Identity and authorization.** DIDs, PDSes, OAuth flow, DPoP, PDS migration.

2. **Data model.** Reuse of `exchange.recipe.*`; addition of app-scoped `fyi.recipe.*` for moderation, social overlay, drafts, and versioning.

3. **Delivery and multi-authority attestation.** PWA served from redundant static hosting providers; releases signed by an offline key; DNS, source hosting, and key held as independent authorities with source hosting itself internally redundant; signed status canary for out-of-band incident signaling.

4. **Client-side persistence.** IndexedDB with drafts synced to PDS for eviction survival, non-extractable DPoP keys, encrypted-or-plain refresh tokens depending on user opt-in.

5. **Authentication persistence.** Default is unencrypted local storage plus OS device lock; WebAuthn PRF is an opt-in enhancement. Cross-tab coordination for refresh token rotation.

6. **Data flow.** Direct PDS fetches for cold start; Jetstream for live tail with polling fallback; rate-limit handling; multi-device visibility.

7. **Social graph.** Atproto follows plus app-scoped `fyi.recipe.friend` records plus interaction-derived affinity.

8. **Immune system.** Inherited moderation from the graph, weighted by affinity, applied client-side. Bounded to target scale.

9. **Trust anchors.** Application account with split keys across independent authorities; canonical baseline lists; signed status canary; announcement channel.

10. **Discovery and incident response.** DID documents, well-known files, cross-channel pubkey publication, publicly published incident-response runbook.

Every layer above the first exists because a specific property becomes possible only when the layers below are in place. The order is dependency-respecting.

---

## 4. Layer 1: Identity and Authorization

### What this layer does

Establishes who a user is, how the application obtains permission to read and write records on their behalf, how that permission is proven on every request, and how the session survives infrastructure changes on the user's side.

### Handle to PDS discovery

- User enters a handle.

- Application resolves handle to a DID via DNS TXT record or `.well-known/atproto-did`.

- Application resolves the DID document to find the PDS endpoint and public keys.

- Application fetches `<pds>/.well-known/oauth-protected-resource` to find the authorization server URL.

- Application fetches `<authserver>/.well-known/oauth-authorization-server` for endpoint URLs.

- Application initiates PAR with PKCE, redirects the user, receives an authorization code, exchanges it for a DPoP-bound token pair.

Every subsequent request carries the access token and a DPoP proof signed by the client's private key.

### Session lifetimes

The atproto OAuth specification recommends short access tokens (15-30 minutes) and, for untrusted public clients, a two-week ceiling on overall session lifetime and on individual refresh token lifetime. Bluesky's reference implementation extends the overall session lifetime to two years assuming continuous refresh, but that is a Bluesky-specific decision that may not hold on other PDSes.

**Design implication**: assume the two-week case. Silent re-auth on refresh failure is the primary code path. The two-year case is a UX bonus for users on Bluesky-hosted accounts.

Sources: `atproto.com/specs/oauth`, `atproto.com/blog/oauth-improvements`.

### PDS migration handling

Users can migrate their PDS to a different operator. When this happens, the DPoP keys and refresh tokens issued by the old PDS are no longer valid. The application:

- Detects `invalid_token` or `unauthorized` responses from the PDS URL currently on file.

- Re-resolves the user's DID document to find the current PDS endpoint.

- If the PDS endpoint has changed, initiates a fresh OAuth flow against the new authorization server.

- Preserves local drafts and cached records across the migration.

### OAuth flow in installed PWAs

Standalone PWAs on mobile have known quirks with OAuth redirects. Design guidance:

- Use popup-based OAuth flows where the platform supports them.

- Fall back to a full-page redirect flow that completes inside the standalone PWA context on Android.

- On iOS installed PWAs, redirects may bounce through the system browser and back; test the return path explicitly.

- Handle the case where the return leg opens in a fresh tab: use `postMessage` or `BroadcastChannel` to hand the authorization code back to the original context.

### Design choices

- Handle-based login, aligned with atproto conventions.

- OAuth rather than app-password authentication (app-passwords are deprecated for OAuth-native applications; DPoP binding is significantly stronger than bearer tokens).

- Refresh tokens stored client-side, protected per Layer 5.

---

## 5. Layer 2: Data Model and Lexicons

### Reused lexicons: `exchange.recipe.*`

The core recipe records use the namespace defined by Josh Huckabee at `recipe.exchange/lexicons/`. Confirmed schemas:

- `exchange.recipe.recipe`: the primary recipe record, Schema.org Recipe-compatible.

- `exchange.recipe.collection`: named grouping of recipes.

- `exchange.recipe.defs`: shared enumerations for cooking methods and dietary restrictions.

- `exchange.recipe.profile`: user profile with personal-versus-business distinction.

A recipe written through this application is bit-identical to a recipe on recipe.exchange, providing free interop and credible-exit properties.

### Lexicon mirroring for resilience

The application account's PDS also holds `com.atproto.lexicon.schema` records mirroring each `exchange.recipe.*` schema currently in use. If the `recipe.exchange` domain ever becomes unreachable, clients can resolve schemas from the mirror.

**Long-term**: lobby for the `exchange.recipe.*` namespace to move under `lexicon.community` stewardship for real credible exit. Until then, the mirror is the primary hedge against single-maintainer risk.

### Application-scoped namespace: `fyi.recipe.*`

New lexicons for artifacts specific to this application:

**Moderation**:

- `fyi.recipe.mute.person`: hide records from a specific DID.

- `fyi.recipe.mute.recipe`: hide a specific recipe by AT-URI.

- `fyi.recipe.mute.tag`: hide any recipe carrying a specific tag.

- `fyi.recipe.mute.list`: curated list of mute subjects, subscribable.

- `fyi.recipe.mute.listitem`: individual entry in a mute list.

- `fyi.recipe.mute.listblock`: subscription record for another user's mute list.

**Social**:

- `fyi.recipe.friend`: app-scoped follow. Public record in the follower's PDS naming a friended DID. Coexists with `app.bsky.graph.follow` and is preferred when the user is not on Bluesky.

- `fyi.recipe.comment`: app-scoped comment on a recipe. Contains recipe strongRef (AT-URI + CID), comment text, and parent-comment reference for threading.

- `fyi.recipe.interaction.cooked`: declaration that the author cooked a recipe. Contains recipe strongRef, optional rating, notes, photos.

- `fyi.recipe.interaction.saved`: weaker signal, save-for-later.

**Curation**:

- `fyi.recipe.starterpack`: curated bundle of recipes and accounts for onboarding.

- `fyi.recipe.starterpackitem`: individual entry in a starter pack.

**Application infrastructure**:

- `fyi.recipe.draft`: in-progress recipe, comment, or interaction. Contains subject payload plus `status: draft` flag. Synced to PDS so local storage eviction doesn't destroy work.

- `fyi.recipe.group.manifest`: for private groups, listing member DIDs and group-level configuration.

- `fyi.recipe.status`: the signed status canary published by the application account (see Layer 3).

### Why comments got their own lexicon (change from v0.1)

In v0.1 the spec recommended reusing `app.bsky.feed.post` with a reply reference. That coupling made recipe-app social behavior dependent on Bluesky rendering: if Bluesky changed reply-chain semantics or went down, comments would break.

The v0.2 approach defines `fyi.recipe.comment` as its own lexicon. Comments stay within the recipe world. Users who also want to post to Bluesky can do so as a separate action, but the two are decoupled.

### Recipe versioning policy

Recipes are editable. Editing a recipe changes its CID. Comments and interactions that reference an old CID must decide whether to follow the AT-URI (mutable, latest version) or pin to the specific CID (immutable, may become orphaned if the AT-URI moves).

The application uses `com.atproto.repo.strongRef` (AT-URI + CID) for all cross-record references. Client rendering behavior:

- Primary key is the AT-URI. Interactions and comments stay attached across recipe edits.

- If the current recipe CID does not match the referenced CID, the client shows a "this comment references an older version of the recipe" indicator.

- Users viewing an older comment can request the pinned CID via PDS repo commit history if the PDS operator retains it.

### Blob (image) handling

Recipes carry photos as atproto blobs. Upload flow:

- User selects image locally.

- Client generates a thumbnail (canvas API).

- Client uploads full-size blob via `com.atproto.repo.uploadBlob` to the user's PDS. Response contains a CID.

- Client uploads thumbnail as a separate blob.

- Recipe record embeds both CIDs.

Fetch uses `com.atproto.sync.getBlob` against the author's PDS. Failed fetches show a placeholder.

Local cache: thumbnails cached in IndexedDB (capped ~100MB). Full-size images fetched on demand and not persisted long-term.

### Search

Group-scoped in-browser index using MiniSearch or FlexSearch. Index built at cold-start hydration over all cached recipes. Fields indexed: name, description, tags, ingredients, author handle. Query latency at 25-member scale is sub-100ms.

At larger scales the in-browser index becomes too heavy. This is a known scale limit (see Section 14).

### References

- `recipe.exchange/lexicons/`

- `atproto.com/specs/lexicon`

- `github.com/lexicon-community/lexicon`

---

## 6. Layer 3: Delivery and Multi-Authority Attestation

### What this layer does

Ships the application to users, updates it over time, and provides cryptographic assurance that distributes across independent authorities so that no single compromise silently targets users.

### The three-authority model

Compromise of any single authority does not, on its own, produce a successful attack against users. Each authority is held independently and has an independent detection and recovery path.

**Authority 1: DNS.** The registrar for `arecipe.fyi` (or `arecipe.croft.ing`), the DNS provider, and any subdomain configurations. Held under an account separate from source hosting, with FIDO2 hardware key 2FA, registrar-lock, and DNSSEC where supported.

**Authority 2: Source hosting.** Redundant across multiple independent providers. Each holds an identical signed bundle. DNS load-balances across the active providers with health-check failover. Providers are chosen for genuine corporate independence (different ownership, different jurisdictions where practical) and each account is held with hardware key 2FA and audited third-party access. Candidate providers include GitHub Pages, Cloudflare Pages, Bunny.net static, and Tangled sites (pending custom-domain support). Exact composition is an implementation decision that can shift over time; the spec commits to at least two independent origins in production.

Source code is mirrored across GitHub and Tangled as independent git remotes. Code availability and serve availability are decoupled: anyone can rebuild the signed bundle from either code mirror even if all serving origins are unreachable. Sources: Tangled hosting documentation at `docs.tangled.org/hosting-websites-on-tangled`.

**Current Tangled limitation**: Tangled does not yet support custom domains, so `arecipe.app` DNS cannot presently point at Tangled. Tangled currently serves as a code mirror and as a documented fallback origin at `arecipe.tngl.sh` (or a claimed `arecipe.tngl.io`). Users navigate to that URL if the primary domain is unreachable, verify the signed bundle against the pinned pubkey, and continue. Once Tangled ships custom domains, it joins the DNS load-balancing pool directly.

**Why redundancy does not expand silent-attack surface.** The trust anchor is the offline signing key, not any origin. A compromised origin serving a modified bundle fails signature verification and updates are refused. Adding origins improves availability and makes partial compromise noisier (users on the compromised origin see failed updates, which is itself a detection signal) without creating new paths to silent user targeting.

**Authority 3: Offline signing key.** The Ed25519 keypair used to sign release manifests and status records. Held on a hardware token or in a KMS with strong access controls. Only touches an internet-connected machine during signing ceremonies. Different physical or credential context from the other authorities.

**Authority 4 (auxiliary): Incident-communication channels.** Bluesky account under different credentials, mailing list on a different provider, alternative-domain mirror. Used to signal incidents when the primary channels are compromised. Not a signing authority; a signaling authority.

### Independence hardening

For the three-authority model to hold, the credentials for each must be genuinely independent:

- Different accounts on different providers where possible.

- Different 2FA methods (a hardware key for one, a separate hardware key for another).

- Different recovery emails on different mailboxes with different providers.

- Different physical locations for hardware tokens where practical.

- No single password manager holding all of them (or, if one is used, protected by its own hardware key that isn't reused for anything else).

The goal is that no single credential loss cascades. If GitHub gets compromised, DNS is untouched. If DNS registrar gets compromised, the offline key is untouched. If the offline key device fails, DNS and GitHub still work.

### PWA delivery

The application is a single-page Progressive Web App served as a static bundle. Service worker caches the bundle and controls updates. Standard PWA machinery.

### Release manifest and signature

Each release produces a manifest containing:

- Monotonic version number

- Release timestamp

- SHA-256 hash of every file in the bundle

- Attestation pubkey fingerprint (matches the offline key)

- Reference URI for the signed status canary record

- Signature over the above, produced by the offline signing key

Published to a known URL at the origin and as a `fyi.recipe.release` record in the application account's PDS.

### Signed status canary

A separate record type, `fyi.recipe.status`, is published under the application account's PDS. Contains:

- Current expected release version

- Current expected attestation pubkey fingerprint

- Operational status flag: `normal`, `incident-pause-updates`, `emergency-see-mirror`

- Optional mirror URL for emergency use

- Timestamp

- Signature by the offline key

Refreshed on a schedule (weekly is a reasonable default). Fetched by the running service worker on every update check.

### Verification flow at update time

The installed service worker performs:

- Fetch the release manifest from the origin.

- Fetch the release manifest from the application account's PDS.

- Verify the two manifests agree.

- Verify the signature against the pinned attestation pubkey. The pinned pubkey is baked into the service worker at build time.

- Fetch the current status canary from the application account's PDS.

- Verify the canary signature.

- Verify the canary's expected version and pubkey fingerprint match what the service worker has and what the manifest claims.

- If canary operational status is not `normal`, refuse the update and surface the flag to the user.

- Verify the manifest version is strictly greater than the currently installed version.

- Fetch each file, verify SHA-256 against the manifest.

- Install if all checks pass.

### Guarantee bounds

**Strong**: no single compromise cascades to a silent user-targeting attack. Any single authority (DNS, source, key, canary channel) can be compromised, and the design detects or resists the attack via the remaining authorities.

- Source compromise alone: signature check fails, updates refused.

- DNS compromise alone: users may be redirected but the attacker has no valid signing key; new-install bundle is unsigned or wrong-signed.

- Key compromise alone (offline key stolen but source and DNS intact): attacker can sign but not distribute. Detection through announcement channels and rotation ceremony.

- Canary compromise (application account PDS credentials): the canary itself is signature-checked; a stolen PDS credential doesn't produce valid signatures.

**Bounded**: a first-time install by a user during a compromise window still faces some exposure. If DNS points to malicious source and the attacker has no signing key, the malicious bundle either fails to install (no valid signature) or presents itself as unsigned. A user willing to install unsigned bundles is exposed. The out-of-band channels (verified pubkey published on multiple domains and in the incident runbook) exist for users who verify. Users who don't verify carry the standard TOFU risk that every package manager carries.

### Key ceremony

- Offline key generation on an air-gapped device with entropy verification.

- Signing sessions on the same device; signed artifacts moved to online systems via one-way transfer (QR code, USB with read-only mount, cryptographic hash verification on both sides).

- Rotation involves publishing a transition manifest signed by both old and new keys. New installs pin the new key. Existing installs verify the transition using the pinned old key.

- Compromise recovery: hard-fork with out-of-band new-pubkey distribution. Never rely on a signed transition from a compromised key.

---

## 7. Layer 4: Client-Side Persistence

### What this layer does

Stores the artifacts that must survive across application sessions: the DPoP private key, the refresh token, cached records, the user's own drafts, and local moderation state. Designed for storage eviction survival.

### DPoP private key

Generated via WebCrypto with `extractable: false`. Stored in IndexedDB as a `CryptoKey` reference. Key material never leaves the browser process. Provides protection against exfiltration (disk theft, backup exposure, static XSS that gets stopped before executing) but does not prevent an active same-origin adversary from using the key to sign requests. The real defense against runtime XSS is preventing XSS: strict CSP, subresource integrity, no third-party script loads.

### Refresh token

A bearer secret. Storage strategy depends on user opt-in (see Layer 5): either encrypted with a WebAuthn PRF-derived key or stored in plaintext relying on the OS device lock. The plaintext-with-device-lock path is the default because it works on every browser without setup friction.

### Cached records

Recipes, comments, interactions, follows, and moderation state fetched from various PDSes. Stored with CID for content verification and a `verified` boolean.

### Drafts

Recipes and comments in progress that have not yet been published. **Two-tier storage**:

- Local IndexedDB for fast access and offline work.

- Synced to the user's PDS as `fyi.recipe.draft` records with `status: draft` flag. Not indexed by the AppView side. Provides eviction survival.

Users always see their drafts; where they physically live depends on the network state.

### Local moderation state

The user's explicit mutes, cached inherited moderation from Layer 8, and any local overrides.

### Persistent storage request

On first use, the application calls `navigator.storage.persist()` and requests the user's permission for persistent storage. This reduces the probability of eviction. Not honored on every browser; the draft-sync-to-PDS backup handles the residual eviction risk.

---

## 8. Layer 5: Authentication Persistence

### What this layer does

Keeps the user signed in across application opens with a graceful default, an opt-in security enhancement for users who want it, and coordination across multiple open tabs to avoid session collisions.

### Default: unencrypted local plus OS device lock

The refresh token is stored in IndexedDB as plaintext. Protection relies on:

- The device being unlocked (biometric, PIN, or password enforced by the OS)

- Origin isolation preventing cross-site access

- The user not installing malicious extensions that read the origin's storage

This is the same threat model that virtually all browser-persistent sessions rely on. It works on every browser, requires no setup, and is appropriate for the target audience of a private group cookbook.

### Opt-in enhancement: WebAuthn PRF

For users who want stronger protection against local threats (shared devices, backup exposure, adversarial forensic tools), the application offers PRF-gated encryption:

**Registration flow (opt-in, after first successful login)**:

- Application prompts user to create a passkey with the PRF extension.

- Passkey registered with `userVerification: required`.

- Application derives a wrapping key from a PRF assertion against the new credential.

- Application encrypts the refresh token with the wrapping key using AES-GCM.

- Encrypted refresh token stored in IndexedDB; plaintext version deleted.

**Session resumption**:

- Application finds encrypted refresh token and credential ID.

- Application invokes `navigator.credentials.get()` with the credential ID and PRF extension.

- User completes biometric or PIN gesture.

- Application derives wrapping key, decrypts refresh token.

- Refresh token used to obtain fresh access token.

### PRF availability check

At registration time, the application checks `PublicKeyCredential.getClientCapabilities()` for PRF support. If unavailable, the opt-in flow is not offered on that browser. The user remains on the default path with no interruption.

### Passkey recovery

Passkey loss means the encrypted refresh token cannot be decrypted. Recovery:

- Reinstall PWA on a new device.

- Perform fresh OAuth flow.

- Register a new passkey.

- Drafts saved to the PDS as `fyi.recipe.draft` records survive.

- Local-only cache is rebuilt from PDSes.

**Suggested UX**: at registration time, encourage the user to register passkeys on multiple devices. The application supports multiple passkeys; the user just needs one working authenticator.

### Cross-tab session coordination

Refresh tokens in atproto OAuth are single-use. Two open tabs racing to refresh will produce an `invalid_grant` on the second tab, killing its session.

Solution: `BroadcastChannel` API for coordination.

- One tab is designated the "leader" via a locking protocol (`navigator.locks.request()` with `mode: 'exclusive'`).

- Only the leader performs refresh.

- On successful refresh, the leader broadcasts the new access token to other tabs via `BroadcastChannel`.

- Other tabs update their in-memory state and continue.

- If the leader tab closes, another tab acquires the lock and takes over.

Standard pattern; requires design but not novel research.

---

## 9. Layer 6: Data Flow

### What this layer does

Fetches records from PDSes, receives real-time updates via Jetstream where available, handles rate limits, and coordinates across multiple devices for the same user.

### Two primary channels

**Direct PDS fetch.** `com.atproto.repo.listRecords` or `getRecord` on the author's PDS. Signed and authoritative. Used for cold-start catchup and targeted queries.

**Jetstream subscription.** WebSocket stream of filtered atproto events from Bluesky-operated Jetstream instances. Filterable by DID (up to 10,000 per subscription) and collection NSID (up to 100). Used for live tail. Not signed; provenance re-verifiable on demand by refetching from the author's PDS.

### Jetstream as optimization, not dependency

Jetstream is a Bluesky operational service, not part of the atproto protocol. If it becomes unavailable, restricted, or paywalled, the application must fall back gracefully.

**Fallback**: poll-based live updates. Each open client polls each group member's PDS at a configurable interval (default 60 seconds) for records newer than a cursor. Less real-time but functional. Bandwidth cost scales with group size and interval.

### Cold-start hydration for target scale

For a 12-25 person group:

- Fetch each member's most recent records in relevant collections in parallel.

- Fetch group manifest for current membership.

- Fetch each member's `fyi.recipe.friend` and `app.bsky.graph.follow` records.

- Store all in IndexedDB with author DID and collection as index keys.

- Open Jetstream subscription (or start polling) at `cursor = now`.

Wall clock: 1-3 seconds for 25 members over broadband.

### Warm re-open

Everything from previous session is in IndexedDB. Open Jetstream at last-seen cursor, catch up on missed records.

### Verification policy

Jetstream events are unsigned. Records in IndexedDB are tagged with a `verified` boolean. Client renders unverified events for UX; a background task promotes them to verified by refetching from the author's PDS.

For target-scale private groups where members trust each other socially, verification can be deferred or skipped. For any application growing beyond a private group, it should be enforced.

### Rate limit handling

PDS operators, Bluesky's OAuth entryway, and Jetstream all impose rate limits. The application uses:

- Exponential backoff on `429` responses.

- Per-endpoint concurrency limits (max 6 parallel fetches per PDS host).

- Adaptive polling intervals when Jetstream is unavailable.

- Explicit UI when rate-limited (rather than silent failure).

### Multi-device sync

A user with the PWA installed on two devices has two DPoP keypairs, two refresh tokens, and two Jetstream subscriptions. Writes from one device appear on the other via Jetstream (each device subscribed to its own DID sees its own writes echoed).

Push notifications are not designed in v0.2. A push-based notification system would require a backend service, which contradicts the "no backend" story. Users who want cross-device notifications should keep at least one client open.

---

## 10. Layer 7: Social Graph

### What this layer does

Establishes who a user considers relevant and with what strength, so that layers above can filter, recommend, and moderate accordingly. Designed to work whether or not the user is also on Bluesky.

### Base primitives

- `app.bsky.graph.follow`: Bluesky follow record. Used when the user is on Bluesky.

- `fyi.recipe.friend`: app-scoped follow record. Used always; the primary signal for cold start when the user is not on Bluesky.

- `app.bsky.graph.block`: Bluesky block. Public; observable.

- `app.bsky.feed.like`, `app.bsky.feed.repost`, `app.bsky.feed.post` (with reply or embed): interaction records tying two accounts together.

- `fyi.recipe.interaction.cooked`, `fyi.recipe.interaction.saved`: recipe-specific affinity signals.

### Interaction-weighted affinity

For each (viewer, contact) pair, the application computes a scalar affinity score from records already indexed:

- Replies exchanged (reciprocal weighted higher)

- Likes given (time-decayed, 90-day half-life)

- Reposts (strong endorsement)

- Quotes (mixed signal by default)

- Cooked-this markers on each other's recipes (strong culinary affinity)

- Recency bonus for recent interaction

Used by Layer 8 as a trust weight.

### Fallback for users not on Bluesky

If the user has no `app.bsky.graph.follow` records, the application:

- Prompts for `fyi.recipe.friend` seed at onboarding (starter pack adoption).

- Uses friend records exclusively for graph traversal.

- Defers Bluesky follow inheritance until the user optionally connects.

---

## 11. Layer 8: The Immune System

### What this layer does

Derives each user's effective moderation filter from their own graph, without central authority, with legibility about why any specific action was taken.

### Base primitive

Bluesky's mod-list mechanism via `app.bsky.graph.list` with `purpose = modlist`. This application uses the same pattern under `fyi.recipe.mute.list` and `fyi.recipe.mute.listblock`.

### The extension

Instead of requiring explicit list subscription, the application inherits from contacts weighted by affinity.

### Algorithm

- Identify contacts (follows, followers, high-interaction accounts).

- Fetch each contact's mute records and subscribed mute-lists.

- Compute per-contact affinity (Layer 7).

- Union inherited mute subjects, tagged with source contact and affinity.

- A subject enters the effective filter when sum-of-affinity-weighted-contacts muting it exceeds a threshold.

- Local explicit mutes always apply.

- Local explicit unmutes override inherited mutes.

- Store the effective filter in IndexedDB; apply on every render and every Jetstream event.

### Knobs

Depth of graph traversal, threshold for inheritance, per-contact weighting scheme, direction asymmetry (follows weighted higher than followers), reversal policy, refresh cadence. Defaults tuned for target scale; user-configurable.

### Legibility

For any hidden subject, the client can show the user the inheritance path: which contacts contributed, with what weight, and how the threshold was met. Enables override and adjustment. Distinguishes an immune system from a black-box censor.

### Bounded claim

This design is tight for target scale (12-25 person groups). At web scale, the computation cost and the Sybil-attack surface become material. The "novel adaptive moderation" claim applies specifically to target scale.

---

## 12. Layer 9: Trust Anchors

### What this layer does

Establishes the small number of authoritative artifacts users can rely on: baseline moderation list, release manifest, status canary, announcement channel. All backed by the multi-authority structure of Layer 3.

### The application account

Has a DID (`did:web:arecipe.fyi` recommended for domain-anchored identity), a PDS (self-hosted preferred, or delegated), a profile record, and the trust-anchor records described below.

### Split keys in the DID document

- `#atproto`: online repo-writing key. Signs day-to-day updates to the application account's PDS.

- `#recipe-attestation`: offline signing key. Signs release manifests and status canaries.

- `#recipe-labeler` (optional, if the account becomes a labeler): separate label-signing key per atproto label spec.

Each key can be rotated independently. Compromise of any one does not compromise the others.

### Canonical baseline mute list

A single well-known `fyi.recipe.mute.list` record at a fixed rkey. Curated members are known spam accounts, low-quality-recipe factories, deceptive commercial accounts. Adoption is opt-in for new users; always overridable.

### Canonical starter pack

A `fyi.recipe.starterpack` record with curated recipes and accounts. Adopted by new users as bootstrap. Editorial in nature; users can adopt other starter packs published by anyone.

### Third-party starter packs

Any user can publish `fyi.recipe.starterpack`. The application supports adoption by URL. Decouples editorial curation from moderation authority. Vegan pack, budget pack, cuisine-specific packs, group-cookbook packs. Each curator gains discovery within their audience without requiring operator permission.

### Signed status canary

`fyi.recipe.status` record refreshed on a schedule. Contents per Layer 3. This is the out-of-band incident signal that composes with the release manifest to defeat any single-authority compromise.

### Announcement channel

Ordinary posts (via `app.bsky.feed.post` or a custom `fyi.recipe.announcement` lexicon) for changelog, security notices, community communication.

### Identity anchor

`arecipe.fyi/.well-known/atproto-did` binds the domain to the application account's DID. Cross-verifiable against phishing clones at other domains.

---

## 13. Layer 10: Discovery and Incident Response

### What this layer does

Makes trust anchors findable through multiple independent channels, publishes the incident-response runbook, and ensures that no single compromised channel silences the recovery path.

### Channels

- **DID document.** Primary anchor for keys and service endpoints.

- **Well-known files at the origin.** `.well-known/atproto-did`, `.well-known/recipe-app-manifest.json` (pubkey fingerprint, current version, status canary URL).

- **Application account announcements.** Signed posts for changes and incidents.

- **Cross-domain publication.** Pubkey fingerprint published under domains other than `arecipe.fyi` that the developer controls. Alternative check against primary-domain compromise.

- **Bluesky posts from a well-known account** (the developer's personal DID, held under separate credentials from all other authorities).

- **Public runbook.** Hosted at multiple independent origins.

### The incident runbook

A public document titled "How to verify arecipe is uncompromised" that describes:

- The current expected attestation pubkey fingerprint (updated on rotation, with rotation announcements signed by both old and new keys).

- Where to fetch the current signed status canary and how to verify its signature.

- The current authoritative announcement channels and their credentials-of-record.

- The steps for a user to verify their installed version matches expectations.

- The escalation path if any check fails: contact the developer via a specific out-of-band method, disable auto-updates, fall back to the documented mirror at `arecipe.tngl.sh` (the Tangled-hosted fallback origin).

- The developer's PGP or Signal identity for confidential communication.

Hosted at:

- `arecipe.fyi/incident-runbook.html` (primary)

- A mirror at a personal domain of the maintainer

- As a Bluesky post pinned to the maintainer's profile

- In the source repository README

### Verifiability without full technical understanding

Ordinary users cannot verify signatures by hand. The runbook includes a "quick check" section:

- The version indicator in the application's About page should match a specific expected string.

- The application's "check for updates" flow should not report any status other than `normal`.

- If the About page or the update check ever shows something unexpected, users are instructed to stop, not update, and check the runbook.

Technical users in the community perform full signature verification and post confirmation to the announcement channel. Ordinary users trust the community's verification. Standard pattern for open-source distribution.

---

## 14. Novelty (Bounded)

The design as a whole is not the invention of any single primitive. Every piece exists somewhere in the ecosystem or in prior art. The novelty is the composition and the specific properties that emerge from it. Language below is bounded to what is defensible.

### What this specifically enables

- **Social applications where the operator has minimum authority.** The operator holds domain, code, and signing key, but cannot silently alter user data, cannot silently change moderation policy that users have adopted, cannot lock users in, and cannot silently target users through any single compromise.

- **Client-derived moderation from graph-weighted, potentially-adversarial inputs.** Legible, reversible, portable. At target scale, this works cleanly.

- **Data that survives the application's death, conditional on user PDSes remaining accessible.** Users retain their records on their own PDSes. If this application is abandoned, users lose the frontend but not the content, provided their PDS operator continues.

- **Editorial curation without editorial monopoly.** Starter packs and mute lists are records anyone can publish. The application's canonical versions are one option among many.

- **Signed application updates with no-single-compromise-cascades property.** DNS, source, and offline key are held independently. Any single compromise is detectable and recoverable via the remaining authorities.

- **Trust-weighted community immunity at small-group scale.** Moderation adapts to the user's community rather than to a platform-wide policy.

### Why each was hard or unavailable before

Under the Web 2.0 model, an operator owns user data, which produces the incentive for progressive extraction. This design has no such operator, so it has no such incentive. Federated alternatives (ActivityPub) reduce operator power but do not eliminate it; instance operators still hold moderation policy. Blockchain-based alternatives place data on-chain with different tradeoffs. This design places data on user-controlled servers and moderation policy on the user's own graph.

The novelty is not that any one property is unprecedented. It is that they compose cleanly in a working browser application, at zero infrastructure cost, using existing specifications and existing infrastructure, at the target scale.

### Where the claim does not reach

- Application at web scale. The immune system computation, cold-start hydration, and Sybil resistance all degrade beyond the target range.

- Author burnout. The design has no mechanism to make an abandoned project un-abandoned.

- Third-party value extraction. The public data can be indexed and monetized by anyone. This is a feature (credible exit) but also a limitation on what "un-extractable" means.

- Legal shutdown. A court order against the domain owner ends the application's frontend. Data survives, but the pitch does not.

- Compromise of two or more of the three primary authorities simultaneously. This is state-level attack territory and is out of scope.

---

## 15. Open Questions and Future Work

Not resolved in v0.2, deferred with rationale:

- **Non-browser clients.** Native mobile and agent access require different key storage models. WebAuthn PRF has a mobile analog but the API differs. Deferred to v2.

- **Sybil resistance at scale.** For target scale, not needed. For public applications, requires proof-of-personhood or reputation systems.

- **Discovery beyond the graph.** How do new users find good recipes when the graph is empty? Starter pack adoption is the current answer; algorithmic feeds via `app.bsky.feed.generator` are a future option.

- **Cross-application moderation compatibility.** When multiple applications share `exchange.recipe.*` records, whose mutes apply where? Application-scoped mutes stay in each app's namespace; opt-in cross-app inheritance is future work.

- **Legal exposure at scale.** Small private groups: near-zero risk. Public application with visible attention: real risk. Requires legal review before public launch.

- **Cold-start performance beyond target scale.** Explicit knee at ~500 members. Hosted-indexer path is a v2 option that would break the "no server" claim.

- **Push notifications.** Requires backend push service. Deferred to a v2 with acknowledged infrastructure cost.

---

## 16. References

Primary sources:

- AT Protocol OAuth specification. `atproto.com/specs/oauth`

- AT Protocol OAuth improvements. `atproto.com/blog/oauth-improvements`, `docs.bsky.app/blog/oauth-improvements`

- AT Protocol label specification. `atproto.com/specs/label`

- AT Protocol lexicon specification. `atproto.com/specs/lexicon`

- Recipe Exchange lexicons. `recipe.exchange/lexicons/`

- Bluesky user lists documentation. `docs.bsky.app/docs/tutorials/user-lists`

- Lexicon Community. `github.com/lexicon-community/lexicon`

- Jetstream documentation. `github.com/bluesky-social/jetstream`

- WebAuthn Level 2 specification (W3C).

- W3C Credential Management API.

Prior art:

- Cory Doctorow, "The 'Enshittification' of TikTok" (Wired, 2023) and subsequent essays.

- The Update Framework (TUF) specification. `theupdateframework.io`

- Sigstore. `sigstore.dev`

- Philip Pettit, non-domination and republican freedom (background for the "minimum-authority operator" framing).

- Elizabeth Anderson, relational equality (background for community-derived moderation framing).

Related atproto projects:

- Nick Gerakines' atproto Rust crates workspace. `tangled.org/ngerakines.me/atproto-crates`

- Smoke Signal and AIP. `blog.smokesignal.events`, `auth.smokesignal.events`

- Blacksky (full-mirror AppView reference). `github.com/blacksky-algorithms/atproto`

- Frontpage (link aggregator, monolith example). `github.com/frontpagefyi/frontpage`

- Statusphere (Bluesky-provided specialized AppView tutorial). `github.com/bluesky-social/statusphere-example-app`

---

## 17. Colophon

Version 0.3 supersedes v0.2 and adds source-hosting redundancy across independent providers with Tangled as a code mirror and documented fallback origin.

Version 0.2 superseded v0.1 and incorporated the crashability review findings and the multi-authority defense discussion.

Next expected milestone: prototype implementing a subset of Layer 1, Layer 2 (read-only against `exchange.recipe.*`), and Layer 4 for two-device same-user testing. Immune system and PRF opt-in deferred to a later prototype.

The name `arecipe` honors Amanda.
