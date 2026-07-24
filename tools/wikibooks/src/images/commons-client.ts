// D15 Phase 8 — Wikimedia Commons resolver. Turns an infobox image filename into
// a web-optimized rendition + credit, gated by license. Zero-dep: no image
// encoder — we pull Commons' server-scaled rendition (iiurlwidth) rather than
// downscaling locally. Every request goes through a RateLimiter (throttle both
// Commons and the PDS). Injectable fetch + clock → fully testable.
//
// The ≤1 MB blob cap is enforced on the DOWNLOADED rendition bytes: imageinfo's
// `size` is the ORIGINAL file, not the thumb (confirmed by a live probe), so we
// step down the width ladder until a rendition fits. Artist is HTML → stripped.
import { RateLimiter } from '../http/rate-limiter.ts';
import { realClock, type Clock } from '../util/clock.ts';
import { acceptLicense } from './license.ts';

const MAX_BLOB_BYTES = 1_000_000;
const WIDTH_LADDER = [1200, 1024, 800, 640, 512, 400, 320];
const API = 'https://commons.wikimedia.org/w/api.php';

type CommonsResponse = {
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
};
export type CommonsFetch = (url: string, init?: { headers?: Record<string, string> }) => Promise<CommonsResponse>;

export type ImageCredit = { artist?: string; license: string; source: string };
export type Resolved = {
  skipped?: undefined;
  bytes: Uint8Array;
  mime: string;
  width: number;
  height: number;
  credit: ImageCredit;
};
export type Skipped = { skipped: true; reason: string; bytes?: undefined; credit?: undefined; width?: undefined };
export type Resolution = Resolved | Skipped;

const stripHtml = (s: string): string =>
  s.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

const em = (extmetadata: Record<string, { value?: string }> | undefined, key: string): string =>
  (extmetadata?.[key]?.value ?? '').toString();

export class CommonsClient {
  private readonly fetch: CommonsFetch;
  private readonly limiter: RateLimiter;
  private readonly ua: string;

  constructor(deps: { fetch?: CommonsFetch; clock?: Clock; limiter?: RateLimiter; contact: string }) {
    this.fetch = deps.fetch ?? ((url, init) => fetch(url, init as RequestInit) as unknown as Promise<CommonsResponse>);
    this.limiter =
      deps.limiter ??
      new RateLimiter(deps.clock ?? realClock, {
        onWait: (i) => process.stderr.write(`  ↳ Commons ${i.reason} — waiting ${Math.round(i.ms / 1000)}s (attempt ${i.attempt + 1})\n`),
      });
    this.ua = `arecipe-wikibooks-sync/0.1.0 (https://arecipe.app; ${deps.contact})`;
  }

  private async imageinfo(filename: string, width: number): Promise<Record<string, unknown> | undefined> {
    const url = `${API}?${new URLSearchParams({
      action: 'query', format: 'json', formatversion: '2', prop: 'imageinfo',
      iiprop: 'url|size|mime|extmetadata', iiurlwidth: String(width), titles: `File:${filename}`,
    }).toString()}`;
    const res = await this.limiter.run(() => this.fetch(url, { headers: { 'User-Agent': this.ua, 'Accept-Encoding': 'gzip' } }));
    if (res.status >= 400) return undefined;
    const body = (await res.json()) as { query?: { pages?: { missing?: boolean; imageinfo?: Record<string, unknown>[] }[] } };
    const page = body.query?.pages?.[0];
    if (page === undefined || page.missing === true) return undefined;
    return page.imageinfo?.[0];
  }

  private async download(thumbUrl: string): Promise<Uint8Array> {
    const res = await this.limiter.run(() => this.fetch(thumbUrl, { headers: { 'User-Agent': this.ua } }));
    return new Uint8Array(await res.arrayBuffer());
  }

  /** Resolve `filename` to a rendition + credit, or a skip with a reason. */
  async resolve(filename: string): Promise<Resolution> {
    let credit: ImageCredit | undefined;
    for (const width of WIDTH_LADDER) {
      const info = await this.imageinfo(filename, width);
      if (info === undefined) {
        if (credit === undefined) return { skipped: true, reason: 'not found on Commons' };
        continue;
      }
      if (credit === undefined) {
        const extmetadata = info.extmetadata as Record<string, { value?: string }> | undefined;
        const license = em(extmetadata, 'LicenseShortName');
        const verdict = acceptLicense(license);
        if (!verdict.accept) return { skipped: true, reason: verdict.reason ?? 'license not free' };
        const artistRaw = stripHtml(em(extmetadata, 'Artist'));
        // Commons' "No machine-readable author provided…" boilerplate reads as
        // noise in the credit overlay — treat it as no artist.
        const artist = /no machine[- ]readable author/i.test(artistRaw) ? '' : artistRaw;
        credit = { license, source: String(info.descriptionurl ?? ''), ...(artist !== '' ? { artist } : {}) };
      }
      const thumbUrl = info.thumburl as string | undefined;
      if (thumbUrl === undefined) continue;
      const bytes = await this.download(thumbUrl);
      if (bytes.length <= MAX_BLOB_BYTES) {
        return {
          bytes,
          mime: String(info.mime ?? 'image/jpeg'),
          width: Number(info.thumbwidth ?? width),
          height: Number(info.thumbheight ?? 0),
          credit,
        };
      }
    }
    return { skipped: true, reason: 'no rendition <=1MB' };
  }
}
