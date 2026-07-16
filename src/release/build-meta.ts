// The release pubkey this build carries (signed releases D2/F4). Baked by
// esbuild define into page and SW bundles — its value only changes on key
// rotation, so content-hashed bundle names stay stable across deploys. In
// vitest (no define) it falls back to the committed pin, so unit tests see
// exactly what an un-defined build would.

import { RELEASE_PUBKEY_HEX } from './keys.js';

declare const __RELEASE_PUBKEY__: string | null;

export const bakedPubkeyHex = (): string | null =>
  typeof __RELEASE_PUBKEY__ === 'undefined' ? RELEASE_PUBKEY_HEX : __RELEASE_PUBKEY__;
