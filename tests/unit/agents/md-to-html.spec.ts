// Agents-page run, Phase 1: the build-time Markdown→HTML converter that
// generates agents.html from the canonical agents.md. Deliberately minimal —
// it supports exactly the subset the doc uses (h1–h3 with slug ids,
// paragraphs, blockquotes, ul/ol with wrapped continuation lines, fenced code,
// hr, inline code/links/bold) and escapes everything else. No runtime parser,
// no dependency: this runs only inside scripts/build.mjs.
import { describe, expect, it } from 'vitest';
import { htmlShell, mdToHtml, slugify } from '../../../scripts/md-to-html.mjs';

describe('slugify', () => {
  it('lowercases and hyphenates non-alphanumerics', () => {
    expect(slugify('Part A — What the sources say')).toBe('part-a-what-the-sources-say');
  });

  it('drops apostrophes instead of hyphenating them', () => {
    expect(slugify("Reading arecipe's data")).toBe('reading-arecipes-data');
  });

  it('trims leading/trailing hyphens', () => {
    expect(slugify('— dashes around —')).toBe('dashes-around');
  });
});

describe('mdToHtml blocks', () => {
  it('renders h1–h3 with slug ids', () => {
    expect(mdToHtml('# Top')).toBe('<h1 id="top">Top</h1>');
    expect(mdToHtml('## Part A — What the sources say')).toBe(
      '<h2 id="part-a-what-the-sources-say">Part A — What the sources say</h2>',
    );
    expect(mdToHtml('### Sub heading')).toBe('<h3 id="sub-heading">Sub heading</h3>');
  });

  it('joins consecutive lines into one paragraph', () => {
    expect(mdToHtml('one line\ntwo line')).toBe('<p>one line two line</p>');
  });

  it('separates paragraphs on blank lines', () => {
    expect(mdToHtml('first\n\nsecond')).toBe('<p>first</p>\n<p>second</p>');
  });

  it('renders a blockquote with internal paragraphs', () => {
    expect(mdToHtml('> quoted text\n> continues')).toBe('<blockquote><p>quoted text continues</p></blockquote>');
    expect(mdToHtml('> para one\n>\n> para two')).toBe(
      '<blockquote><p>para one</p><p>para two</p></blockquote>',
    );
  });

  it('renders unordered lists, folding indented continuation lines', () => {
    expect(mdToHtml('- alpha\n- beta wraps\n  onto a second line')).toBe(
      '<ul><li>alpha</li><li>beta wraps onto a second line</li></ul>',
    );
  });

  it('renders ordered lists', () => {
    expect(mdToHtml('1. first\n2. second')).toBe('<ol><li>first</li><li>second</li></ol>');
  });

  it('renders fenced code blocks with escaped content and no inline parsing', () => {
    expect(mdToHtml('```\ncurl "https://x?a=1&b=2" <tag>\n```')).toBe(
      '<pre><code>curl &quot;https://x?a=1&amp;b=2&quot; &lt;tag&gt;</code></pre>',
    );
  });

  it('renders a horizontal rule', () => {
    expect(mdToHtml('---')).toBe('<hr />');
  });
});

describe('mdToHtml inline', () => {
  it('escapes raw HTML in prose', () => {
    expect(mdToHtml('a <script> & "quote"')).toBe('<p>a &lt;script&gt; &amp; &quot;quote&quot;</p>');
  });

  it('renders links with the href preserved', () => {
    expect(mdToHtml('see [the spec](https://llmstxt.org/) now')).toBe(
      '<p>see <a href="https://llmstxt.org/">the spec</a> now</p>',
    );
  });

  it('renders inline code without processing its contents', () => {
    expect(mdToHtml('use `listRecords?a=[x](y)&z` here')).toBe(
      '<p>use <code>listRecords?a=[x](y)&amp;z</code> here</p>',
    );
  });

  it('renders bold', () => {
    expect(mdToHtml('a **strong** word')).toBe('<p>a <strong>strong</strong> word</p>');
  });

  it('is deterministic', () => {
    const md = '# T\n\npara [l](https://a.b) `c` **d**\n\n- one\n- two';
    expect(mdToHtml(md)).toBe(mdToHtml(md));
  });
});

describe('htmlShell', () => {
  it('wraps the body in a full document with charset meta first (CSP injection seam)', () => {
    const page = htmlShell({
      title: 'arecipe — for AI agents',
      body: '<h1 id="x">x</h1>',
      stylesheets: [{ href: './styles-abc.css', integrity: 'sha384-x' }],
    });
    expect(page).toContain('<!doctype html>');
    // scripts/build.mjs injects the CSP immediately after this exact tag.
    expect(page).toContain('<meta charset="utf-8" />');
    expect(page).toContain('<title>arecipe — for AI agents</title>');
    expect(page).toContain(
      '<link rel="stylesheet" href="./styles-abc.css" integrity="sha384-x" crossorigin="anonymous" />',
    );
    expect(page).toContain('<h1 id="x">x</h1>');
    expect(page).toContain('<meta name="viewport" content="width=device-width, initial-scale=1" />');
  });

  it('escapes the title', () => {
    const page = htmlShell({ title: 'a & b', body: '', stylesheets: [] });
    expect(page).toContain('<title>a &amp; b</title>');
  });
});
