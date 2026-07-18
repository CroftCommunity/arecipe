// Agents-page run: mechanized guards on the PUBLISHED content (llms.txt +
// agents.md + the generated agents.html). The governing posture is that
// arecipe makes no legal claims and only cites sources — these guards are the
// mechanized half of that ruling (the other half is the owner's pre-merge
// read). They are permanent gate tests: they run on the real committed
// content forever, not just during the run that authored it.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mdToHtml, slugify } from '../../../scripts/md-to-html.mjs';

const read = (name: string): string =>
  readFileSync(new URL(`../../../${name}`, import.meta.url), 'utf8');

const llms = read('llms.txt');
const agentsMd = read('agents.md');
const agentsHtml = mdToHtml(agentsMd);

// ---------------------------------------------------------------------------
// D3 — the claim-phrase guard. Assertive legal-claim phrasings that must
// never appear in anything we publish, in any voice, quoted or not (a quote
// this assertive would be a drafting failure too — the sources cited do not
// talk like this). Case-insensitive. Extend the list as near-misses surface;
// the final list ships in the run summary.
// ---------------------------------------------------------------------------
const BANNED_PHRASES = [
  'is legal',
  'it is legal',
  'you may legally',
  'legally safe',
  'we guarantee',
  'you cannot be sued',
  'no risk',
  'fair use allows',
  // near-misses added while drafting:
  'is not illegal',
  'perfectly legal',
  'you are free to copy',
  'without any legal',
];

describe('claim-phrase guard (D3)', () => {
  for (const [name, text] of [
    ['llms.txt', llms],
    ['agents.md', agentsMd],
    ['agents.html (generated)', agentsHtml],
  ] as const) {
    it(`${name} contains no assertive legal-claim phrasing`, () => {
      const lower = text.toLowerCase();
      for (const phrase of BANNED_PHRASES) {
        expect(lower.includes(phrase), `"${phrase}" found in ${name}`).toBe(false);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// llms.txt format lint — the llmstxt.org shape: H1 site name first, a
// blockquote summary, optional freeform guidance, then H2 sections whose
// entries are `- [Title](URL): description` with absolute HTTPS URLs.
// ---------------------------------------------------------------------------
describe('llms.txt format', () => {
  const lines = llms.split('\n');
  const nonEmpty = lines.filter((l) => l.trim() !== '');

  it('starts with the H1 site name', () => {
    expect(nonEmpty[0]).toBe('# arecipe');
  });

  it('has the blockquote summary immediately after the H1', () => {
    expect(nonEmpty[1]?.startsWith('> ')).toBe(true);
  });

  it('has at least one H2 section', () => {
    expect(lines.some((l) => l.startsWith('## '))).toBe(true);
  });

  it('uses only absolute HTTPS URLs in links', () => {
    for (const [, , url] of llms.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)) {
      expect(url, `link URL ${url} must be absolute https`).toMatch(/^https:\/\//);
    }
  });

  it('every section entry parses as `- [Title](URL): description`', () => {
    let inSection = false;
    for (const line of lines) {
      if (line.startsWith('## ')) inSection = true;
      if (!inSection || line.trim() === '' || line.startsWith('## ')) continue;
      expect(line, `unparseable section line: ${line}`).toMatch(
        /^- \[[^\]]+\]\(https:\/\/[^)]+\): .+$/,
      );
    }
  });

  it('links to the canonical agents.md', () => {
    expect(llms).toContain('https://arecipe.app/agents.md');
  });

  it('anchors into agents.html correspond to real agents.md headings', () => {
    const slugs = [...agentsMd.matchAll(/^#{1,3} (.+)$/gm)].map((m) => slugify(m[1] ?? ''));
    for (const m of llms.matchAll(/\((https:\/\/arecipe\.app\/agents\.html#([^)]+))\)/g)) {
      const anchor = m[2] ?? '';
      expect(slugs, `anchor #${anchor} has no matching heading in agents.md`).toContain(anchor);
    }
  });
});

// ---------------------------------------------------------------------------
// agents.md structure — the four-part shape of D2, and the Part A structural
// rule: legal content appears only with its source named and linked, so every
// content block in Part A must carry at least one absolute link.
// ---------------------------------------------------------------------------
const sectionOf = (md: string, heading: RegExp): string => {
  const lines = md.split('\n');
  const start = lines.findIndex((l) => heading.test(l));
  if (start === -1) return '';
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^## /.test(l));
  return (end === -1 ? rest : rest.slice(0, end)).join('\n');
};

describe('agents.md structure (D2)', () => {
  it('carries the four parts in order', () => {
    const headings = [...agentsMd.matchAll(/^## (.+)$/gm)].map((m) => m[1] ?? '');
    const parts = headings.filter((h) => /^Part [A-D] /.test(h));
    expect(parts.map((h) => h.slice(0, 6))).toEqual(['Part A', 'Part B', 'Part C', 'Part D']);
  });

  it('every Part A content block names a source via an absolute link', () => {
    const partA = sectionOf(agentsMd, /^## Part A /);
    expect(partA.trim()).not.toBe('');
    const blocks = partA
      .split(/\n\s*\n/)
      .map((b) => b.trim())
      .filter((b) => b !== '' && !/^###? /.test(b));
    expect(blocks.length).toBeGreaterThan(0);
    for (const block of blocks) {
      expect(block, `Part A block lacks a source link:\n${block}`).toContain('](https://');
    }
  });

  it('ships no DRAFT placeholder', () => {
    expect(agentsMd.includes('DRAFT'), 'agents.md still carries a DRAFT marker').toBe(false);
    expect(llms.includes('DRAFT'), 'llms.txt still carries a DRAFT marker').toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Parity — every content sentence of the canonical agents.md appears in the
// generated agents.html (D1). Markdown syntax stripped from the source; tags
// stripped and entities decoded from the output; whitespace collapsed.
// ---------------------------------------------------------------------------
const decodeEntities = (s: string): string =>
  s
    .replaceAll('&quot;', '"')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&#39;', "'")
    .replaceAll('&amp;', '&');

const collapse = (s: string): string => s.replace(/\s+/g, ' ').trim();

describe('agents.md ↔ agents.html parity (D1)', () => {
  it('every content line of the md appears in the generated html', () => {
    // Pad tag-to-tag boundaries (block joins like </p><p>), then drop tags
    // entirely — inline tags (<a>, <code>) must not split a word from its
    // neighboring punctuation.
    const haystack = collapse(decodeEntities(agentsHtml.replace(/></g, '> <').replace(/<[^>]+>/g, '')));
    for (const raw of agentsMd.split('\n')) {
      const line = raw.trim();
      if (line === '' || line.startsWith('```') || /^---+$/.test(line)) continue;
      const plain = collapse(
        line
          .replace(/^#{1,3} /, '')
          .replace(/^> ?/, '')
          .replace(/^[-*] /, '')
          .replace(/^\d+\. /, '')
          .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
          .replace(/\*\*([^*]+)\*\*/g, '$1')
          .replace(/`([^`]+)`/g, '$1'),
      );
      if (plain === '') continue;
      expect(haystack.includes(plain), `md line missing from html: ${plain}`).toBe(true);
    }
  });
});
