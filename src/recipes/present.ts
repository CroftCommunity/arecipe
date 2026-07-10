// Presentational derivations from record values (UI skeleton).
// Open-world tolerance applies here too: a duration we can't parse renders
// as "not set" rather than breaking the card.

/** Shorten a long opaque id (e.g. a record rkey/ULID) to `head…tail` so it fits
 *  on one line — the full value belongs in a title/tooltip. Ids of 12 chars or
 *  fewer are returned unchanged. */
export const abbreviateId = (id: string): string =>
  id.length <= 12 ? id : `${id.slice(0, 6)}…${id.slice(-4)}`;

export const formatDuration = (iso: string | undefined): string | null => {
  if (iso === undefined || iso === '') return null;
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (match === null) return null;
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  if (hours === 0 && minutes === 0) return null;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours} h`);
  if (minutes > 0) parts.push(`${minutes} m`);
  return parts.join(' ');
};

/** Short human date ("Mar 2025") from an ISO timestamp; null when unusable. */
export const formatPublishedDate = (iso: string | undefined): string | null => {
  if (iso === undefined) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en', { month: 'short', year: 'numeric', timeZone: 'UTC' });
};

type EmbedShape = {
  embed?: { images?: { image?: { ref?: { $link?: string } } }[] };
};

export const firstImageCid = (value: Record<string, unknown>): string | null =>
  (value as EmbedShape).embed?.images?.[0]?.image?.ref?.$link ?? null;

export type ImageCredit = { artist?: string; license?: string; source?: string };

type CreditShape = { embed?: { images?: { credit?: ImageCredit }[] } };

/** The first embedded image's credit (artist/license/source), when present.
 * Populated for images sourced from Wikimedia Commons; null otherwise. */
export const firstImageCredit = (value: Record<string, unknown>): ImageCredit | null =>
  (value as CreditShape).embed?.images?.[0]?.credit ?? null;

/**
 * Blob thumbnail via the Bluesky CDN. A recorded third-party dependency
 * (like the handle resolver): direct `sync.getBlob` serves the full-size
 * original (~1 MB per photo, D2-observed), which is the wrong default for a
 * card grid. Revisit alongside Phase 8b offline caching.
 */
export const thumbUrl = (did: string, cid: string): string =>
  `https://cdn.bsky.app/img/feed_thumbnail/plain/${did}/${cid}@jpeg`;
