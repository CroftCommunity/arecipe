// Where a DID's feed lives, as pure string helpers shared by the generator (Node)
// and the meals.html affordance (browser) — so the file the Action writes and the
// URL the page links are guaranteed to agree.
//
// Keyed by DID, not handle: the DID is the durable identifier (a handle can
// change; the feed URL must not). The DID's colons are not filesystem/URL-clean,
// so non-alphanumerics collapse to underscores, e.g.
//   did:plc:xyfhcaweaeyew3zrgk6jaln7 → did_plc_xyfhcaweaeyew3zrgk6jaln7.ics

/** The deployed directory (relative to the site root) holding the feeds. */
export const FEED_DIR = 'calendars';

/** The `.ics` basename for a DID (non-alphanumerics → underscore). */
export const feedFileName = (did: string): string => `${did.replace(/[^a-zA-Z0-9]/g, '_')}.ics`;

/** The site-root-relative path of a DID's feed, e.g. `calendars/did_plc_x.ics`. */
export const feedPath = (did: string): string => `${FEED_DIR}/${feedFileName(did)}`;
