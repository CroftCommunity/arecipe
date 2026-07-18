// Guard the Web Share Target manifest wiring: arecipe must register as a GET
// share target on mine.html with the title/text/url params the importer reads.
// A GET target (data in the query string) needs no service-worker POST handler.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('manifest share_target', () => {
  const manifest = JSON.parse(readFileSync('manifest.webmanifest', 'utf8')) as {
    share_target?: {
      action: string;
      method: string;
      params: { title?: string; text?: string; url?: string };
    };
  };

  it('registers a GET share target landing on mine.html', () => {
    expect(manifest.share_target).toBeDefined();
    expect(manifest.share_target?.action).toMatch(/mine\.html$/);
    expect(manifest.share_target?.method.toUpperCase()).toBe('GET');
  });

  it('maps the title/text/url params the importer consumes', () => {
    expect(manifest.share_target?.params).toMatchObject({ title: 'title', text: 'text', url: 'url' });
  });
});
