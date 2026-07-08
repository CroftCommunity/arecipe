// UI skeleton: presentational derivations from real record shapes.
// Behaviors (shapes taken from the recorded fixtures):
// - ISO-8601 durations render human ("PT1H35M" → "1 h 35 m"); PT0S and
//   absent mean "not set" → null
// - the first embedded image's blob CID is extractable from a record value
// - thumbnail URLs point at the CDN with did + cid
import { describe, expect, it } from 'vitest';
import {
  firstImageCid,
  firstImageCredit,
  formatDuration,
  formatPublishedDate,
  thumbUrl,
} from '../../../src/recipes/present.js';

describe('formatDuration', () => {
  it('renders hours and minutes', () => {
    expect(formatDuration('PT1H35M')).toBe('1 h 35 m');
    expect(formatDuration('PT20M')).toBe('20 m');
    expect(formatDuration('PT2H')).toBe('2 h');
  });

  it('treats zero and absent as not set', () => {
    expect(formatDuration('PT0S')).toBeNull();
    expect(formatDuration(undefined)).toBeNull();
    expect(formatDuration('')).toBeNull();
  });

  it('treats unparseable values as not set (open-world tolerance)', () => {
    expect(formatDuration('45 minutes')).toBeNull();
  });
});

describe('firstImageCid', () => {
  it('extracts the first embedded image blob CID (fixture shape)', () => {
    const value = {
      embed: {
        $type: 'exchange.recipe.recipe#imagesEmbed',
        images: [{ image: { $type: 'blob', ref: { $link: 'bafkreidtrbx6w' }, mimeType: 'image/jpeg' } }],
      },
    };
    expect(firstImageCid(value)).toBe('bafkreidtrbx6w');
  });

  it('returns null when there is no embed', () => {
    expect(firstImageCid({})).toBeNull();
  });
});

describe('firstImageCredit', () => {
  it('extracts artist/license/source from the first image credit', () => {
    const value = {
      embed: {
        images: [
          {
            image: { $type: 'blob', ref: { $link: 'bafk' } },
            credit: { artist: 'Nikodem Nijaki', license: 'CC BY-SA 3.0', source: 'https://commons.wikimedia.org/wiki/File:Guac.jpg' },
          },
        ],
      },
    };
    expect(firstImageCredit(value)).toEqual({
      artist: 'Nikodem Nijaki',
      license: 'CC BY-SA 3.0',
      source: 'https://commons.wikimedia.org/wiki/File:Guac.jpg',
    });
  });

  it('returns null when the image has no credit or there is no embed', () => {
    expect(firstImageCredit({ embed: { images: [{ image: {} }] } })).toBeNull();
    expect(firstImageCredit({})).toBeNull();
  });
});

describe('formatPublishedDate', () => {
  it('renders a short month + year from an ISO timestamp', () => {
    expect(formatPublishedDate('2025-03-29T19:55:58Z')).toBe('Mar 2025');
  });

  it('treats absent or unparseable as not set', () => {
    expect(formatPublishedDate(undefined)).toBeNull();
    expect(formatPublishedDate('not-a-date')).toBeNull();
  });
});

describe('thumbUrl', () => {
  it('builds a CDN thumbnail URL from did and cid', () => {
    expect(thumbUrl('did:plc:abc', 'bafkreixyz')).toBe(
      'https://cdn.bsky.app/img/feed_thumbnail/plain/did:plc:abc/bafkreixyz@jpeg',
    );
  });
});
