// Build-time Markdown→HTML converter for the agents page (agents.md →
// agents.html). Deliberately minimal: it supports exactly the subset the doc
// uses — h1–h3 (with slug ids so llms.txt can deep-link sections),
// paragraphs, blockquotes, ul/ol with indented continuation lines, fenced
// code, hr, and inline code/links/bold — and HTML-escapes everything. It is
// NOT a general Markdown engine and must never ship to the browser: it runs
// only inside scripts/build.mjs (unit-tested via tests/unit/agents/).

export const escapeHtml = (s) =>
  s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

/** Heading text → anchor id: lowercase, apostrophes dropped, runs of
 * non-alphanumerics collapsed to single hyphens. */
export const slugify = (text) =>
  text
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

// Inline pass: code spans are split out first so nothing else fires inside
// them; the remainder is escaped, then links and bold applied to the escaped
// text (an &amp; inside a href is correct HTML, so escaping first is safe).
const inline = (text) =>
  text
    .split(/(`[^`]+`)/)
    .map((part) => {
      if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
        return `<code>${escapeHtml(part.slice(1, -1))}</code>`;
      }
      return escapeHtml(part)
        .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    })
    .join('');

const isBlockStart = (line) =>
  /^#{1,3} /.test(line) || /^> ?/.test(line) || /^- /.test(line) || /^\d+\. /.test(line) ||
  line.startsWith('```') || /^---+\s*$/.test(line);

/** Convert the supported Markdown subset to an HTML fragment (no shell). */
export const mdToHtml = (md) => {
  const lines = md.split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') {
      i += 1;
      continue;
    }
    if (line.startsWith('```')) {
      const block = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith('```')) {
        block.push(lines[i]);
        i += 1;
      }
      i += 1; // closing fence
      out.push(`<pre><code>${escapeHtml(block.join('\n'))}</code></pre>`);
      continue;
    }
    const heading = /^(#{1,3}) (.+)$/.exec(line);
    if (heading !== null) {
      const level = heading[1].length;
      out.push(`<h${level} id="${slugify(heading[2])}">${inline(heading[2])}</h${level}>`);
      i += 1;
      continue;
    }
    if (/^---+\s*$/.test(line)) {
      out.push('<hr />');
      i += 1;
      continue;
    }
    if (/^> ?/.test(line)) {
      const quoted = [];
      while (i < lines.length && /^> ?/.test(lines[i])) {
        quoted.push(lines[i].replace(/^> ?/, ''));
        i += 1;
      }
      // A bare `>` line separates paragraphs inside the quote.
      const paras = quoted
        .join('\n')
        .split(/\n\s*\n/)
        .map((p) => p.replace(/\n/g, ' ').trim())
        .filter((p) => p !== '');
      out.push(`<blockquote>${paras.map((p) => `<p>${inline(p)}</p>`).join('')}</blockquote>`);
      continue;
    }
    const listMatch = /^(-|\d+\.) /.exec(line);
    if (listMatch !== null) {
      const ordered = listMatch[1] !== '-';
      const marker = ordered ? /^\d+\. / : /^- /;
      const items = [];
      while (i < lines.length) {
        if (marker.test(lines[i])) {
          items.push(lines[i].replace(marker, ''));
        } else if (/^\s{2,}\S/.test(lines[i]) && items.length > 0) {
          // Wrapped continuation of the current item.
          items[items.length - 1] += ` ${lines[i].trim()}`;
        } else {
          break;
        }
        i += 1;
      }
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}>${items.map((item) => `<li>${inline(item)}</li>`).join('')}</${tag}>`);
      continue;
    }
    // Paragraph: consecutive non-blank lines that don't start another block.
    const para = [];
    while (i < lines.length && lines[i].trim() !== '' && !isBlockStart(lines[i])) {
      para.push(lines[i].trim());
      i += 1;
    }
    out.push(`<p>${inline(para.join(' '))}</p>`);
  }
  return out.join('\n');
};

/** Wrap a converted fragment in the site's static-page shell (the
 * calendar-setup.html pattern: JS-less, shared stylesheet + SRI; the build
 * injects the CSP right after the charset meta, so that tag's exact form is
 * load-bearing). */
export const htmlShell = ({ title, body, stylesheets }) => {
  const links = stylesheets
    .map(
      (s) =>
        `    <link rel="stylesheet" href="${s.href}"${
          s.integrity !== undefined ? ` integrity="${s.integrity}" crossorigin="anonymous"` : ''
        } />`,
    )
    .join('\n');
  return `<!doctype html>
<!-- GENERATED at build time from agents.md (scripts/md-to-html.mjs) — do not
     edit; edit agents.md instead. Static, no JS bundle (calendar-setup.html
     pattern): the build injects the hashed stylesheet + SRI + CSP. -->
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
${links}
  </head>
  <body>
    <main class="agents-page">
      <p><a class="friend-link" href="./index.html">‹ arecipe</a></p>
${body}
    </main>
  </body>
</html>
`;
};
