// The committed release-signing public key (signed releases D2) — the pin
// source for release-manifest verification. INTERIM TIER: the matching
// private seed lives in a GitHub Actions secret (`ARECIPE_SIGNING_SEED`),
// so "verified" means "signed by protected-branch CI", not the Phase-3
// offline-ceremony guarantee. Rotation path: docs/RELEASE-SIGNING.md.
//
// null = no key installed yet. Builds without a key report release state
// "signing not yet enabled" (couldn't-check tier — never a banner), and
// scripts/build.mjs FAILS a signed build whose derived pubkey mismatches a
// committed one, so the secret and this pin can never silently diverge.

/** Raw 32-byte Ed25519 public key, hex — or null before first key install. */
export const RELEASE_PUBKEY_HEX: string | null = null;
