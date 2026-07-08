// Pure record transform for attaching a Commons image to a recipe record
// (NON-PRODUCTION ops tooling). Unit-tested in image-record.test.mjs.
// The blob comes from com.atproto.repo.uploadBlob; credit travels with the
// image (artist/license/source) so attribution survives on the record.

/** "https://commons.wikimedia.org/wiki/File:Foo_bar.jpg" → "File:Foo bar"-style
 * title (URL-decoded), suitable for the MediaWiki `titles=` parameter. */
export const fileTitleFromCommonsUrl = (url) => {
  const marker = '/wiki/';
  const idx = url.indexOf(marker);
  if (idx === -1) throw new Error(`not a Commons wiki URL: ${url}`);
  return decodeURIComponent(url.slice(idx + marker.length));
};

/** Return a copy of the record value with a single-image embed attached.
 * aspectRatio and credit are included only when provided. Preserves
 * createdAt (and every other field); sets updatedAt to the given timestamp. */
export const withImage = (value, opts, nowIso) => {
  const image = { image: opts.blob, alt: opts.alt };
  if (opts.aspectRatio !== undefined) image.aspectRatio = opts.aspectRatio;
  if (opts.credit !== undefined) image.credit = opts.credit;
  return {
    ...value,
    embed: { images: [image] },
    updatedAt: nowIso,
  };
};
