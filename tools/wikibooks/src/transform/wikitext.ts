// Wikitext primitives shared by the transform stage. Pure string functions,
// no network, no clock. The tricky parts these solve:
//   • template params split on top-level '|' only — pipes inside [[links]] and
//     nested {{templates}} must not split a parameter (D5)
//   • the pipe trick: [[Cookbook:Carrot|]] renders "Carrot" and refs "Carrot" (D6)
//   • markup stripping that records the templates it removes, so nothing is lost
//     silently (standing directive)

export type Inline = {
  display: string;
  refs: string[]; // Cookbook: link targets, namespace-stripped
  templates: string[]; // names of {{templates}} removed from the text
  files: string[]; // File:/Image: targets removed
};

/** Split `text` on `sep` at brace/bracket depth 0 (respects {{}} and [[]]). */
export const splitTopLevel = (text: string, sep: string): string[] => {
  const out: string[] = [];
  let depthCurly = 0;
  let depthSquare = 0;
  let buf = '';
  for (let i = 0; i < text.length; i++) {
    const two = text.slice(i, i + 2);
    if (two === '{{') { depthCurly++; buf += two; i++; continue; }
    if (two === '}}') { depthCurly = Math.max(0, depthCurly - 1); buf += two; i++; continue; }
    if (two === '[[') { depthSquare++; buf += two; i++; continue; }
    if (two === ']]') { depthSquare = Math.max(0, depthSquare - 1); buf += two; i++; continue; }
    const ch = text[i]!;
    if (ch === sep && depthCurly === 0 && depthSquare === 0) { out.push(buf); buf = ''; continue; }
    buf += ch;
  }
  out.push(buf);
  return out;
};

export type ParsedTemplate = {
  name: string;
  named: Map<string, string>; // lower-cased trimmed key → raw value
  positional: string[];
  raw: string;
};

/** Find the first template whose name matches `nameRe` (case-insensitive),
 *  with correct nested-brace matching. Returns null if none. */
export const findTemplate = (wikitext: string, nameRe: RegExp): ParsedTemplate | null => {
  for (let i = 0; i < wikitext.length - 1; i++) {
    if (wikitext[i] !== '{' || wikitext[i + 1] !== '{') continue;
    // match to the closing }}
    let depth = 0;
    let j = i;
    for (; j < wikitext.length - 1; j++) {
      const two = wikitext.slice(j, j + 2);
      if (two === '{{') { depth++; j++; }
      else if (two === '}}') { depth--; j++; if (depth === 0) break; }
    }
    if (depth !== 0) return null;
    const raw = wikitext.slice(i, j + 1);
    const inner = raw.slice(2, -2);
    const segments = splitTopLevel(inner, '|');
    const name = (segments[0] ?? '').trim();
    if (nameRe.test(name)) {
      const named = new Map<string, string>();
      const positional: string[] = [];
      for (const seg of segments.slice(1)) {
        const eq = splitTopLevel(seg, '=');
        if (eq.length >= 2) {
          const key = eq[0]!.trim().toLowerCase();
          named.set(key, eq.slice(1).join('=').trim());
        } else {
          positional.push(seg.trim());
        }
      }
      return { name, named, positional, raw };
    }
    i = j; // skip past this template and keep scanning
  }
  return null;
};

const stripNamespace = (target: string): string => target.replace(/^[^:|]+:/, '');

/** The MediaWiki pipe trick display for a bare/empty-piped link target. */
const pipeTrick = (target: string): string =>
  stripNamespace(target)
    .replace(/_/g, ' ')
    .replace(/\s*\([^)]*\)\s*$/, '') // trailing parenthetical removed
    .replace(/,.*$/, '') // text after a comma removed
    .trim();

const renderLink = (inner: string, refs: string[], files: string[]): string => {
  const parts = inner.split('|');
  const target = (parts[0] ?? '').trim();
  const explicitDisp = parts.length > 1 ? parts.slice(1).join('|').trim() : '';
  if (/^category\s*:/i.test(target)) return ''; // category link — dropped, no ref
  if (/^(file|image)\s*:/i.test(target)) {
    files.push(target.replace(/^(file|image)\s*:/i, '').trim());
    return '';
  }
  if (/^cookbook\s*:/i.test(target)) {
    refs.push(target.replace(/^cookbook\s*:/i, '').replace(/_/g, ' ').trim());
  }
  if (explicitDisp !== '') return explicitDisp;
  return pipeTrick(target);
};

/** Strip wikitext markup to display text, resolving links and recording every
 *  template/file removed. Links render to display text; Cookbook: links add refs. */
export const renderInline = (text: string): Inline => {
  const refs: string[] = [];
  const templates: string[] = [];
  const files: string[] = [];
  let s = text;
  s = s.replace(/<!--[\s\S]*?-->/g, ''); // comments
  s = s.replace(/<ref[^>]*\/>/gi, '').replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, ''); // ref tags
  s = s.replace(/__[A-Z]+__/g, ''); // magic words like __NOTOC__

  // Strip templates innermost-first, recording their names.
  let prev: string;
  do {
    prev = s;
    s = s.replace(/\{\{([^{}]*)\}\}/g, (_m, body: string) => {
      const name = (body.split('|')[0] ?? '').trim();
      if (name !== '') templates.push(name);
      return '';
    });
  } while (s !== prev);

  // Links (innermost-first for safety, though ingredient links rarely nest).
  do {
    prev = s;
    s = s.replace(/\[\[([^\[\]]*)\]\]/g, (_m, inner: string) => renderLink(inner, refs, files));
  } while (s !== prev);

  // External links [http://... display] → display; bare → removed.
  s = s.replace(/\[(?:https?:|\/\/|mailto:)[^\s\]]+\s+([^\]]*)\]/gi, '$1');
  s = s.replace(/\[(?:https?:|\/\/|mailto:)[^\s\]]+\]/gi, '');

  s = s.replace(/'''''|'''|''/g, ''); // bold/italic
  s = s.replace(/\(\s*\)/g, ''); // empty parens left by stripped templates
  s = s.replace(/&nbsp;/g, ' ');
  s = s.replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').trim();

  return { display: s, refs: dedupe(refs), templates, files };
};

const dedupe = (xs: string[]): string[] => [...new Set(xs)];

export type Section = { level: number; heading: string; body: string };

/** Split into a lead block (before the first heading) and headed sections. */
export const splitSections = (wikitext: string): { lead: string; sections: Section[] } => {
  const lines = wikitext.split('\n');
  let lead = '';
  const sections: Section[] = [];
  let current: Section | null = null;
  const headingRe = /^(={2,6})\s*(.*?)\s*\1\s*$/;
  for (const line of lines) {
    const m = headingRe.exec(line.trim());
    if (m !== null) {
      if (current !== null) sections.push(current);
      current = { level: m[1]!.length, heading: m[2]!.trim(), body: '' };
    } else if (current === null) {
      lead += line + '\n';
    } else {
      current.body += line + '\n';
    }
  }
  if (current !== null) sections.push(current);
  return { lead: lead.trim(), sections };
};

// Headings that name a top-level recipe section, so they START a region even
// when the page author used an inconsistent (deeper) heading level. Without
// this, a page with `== Ingredients ==` then `=== Procedure ===` (real!) would
// swallow the procedure steps into the ingredients region.
const BOUNDARY_HEADING =
  /ingredient|procedure|method|direction|preparation|instruction|steps?\b|notes?\b|tips?\b|variation|warning|see also|nutrition|sources?\b|references?\b|equipment|serving|storage|history|utensil|tools?\b/i;

/**
 * Group flat sections into regions. A heading starts a new region if it names a
 * known section (BOUNDARY_HEADING) or is at the same-or-shallower level as the
 * current region; otherwise it is an unnamed subsection (=== Brownie ===,
 * === For the sauce ===) merged into the current region — its heading kept as a
 * line so the grouping is preserved, not lost.
 */
export const regions = (sections: Section[]): Section[] => {
  const out: Section[] = [];
  let current: Section | null = null;
  for (const sec of sections) {
    const isBoundary = current === null || sec.level <= current.level || BOUNDARY_HEADING.test(sec.heading);
    if (isBoundary) {
      current = { level: sec.level, heading: sec.heading, body: sec.body };
      out.push(current);
    } else if (current !== null) {
      current.body += `\n${sec.heading}\n${sec.body}`;
    }
  }
  return out;
};

/** Remove {|...|} tables, returning the cleaned text and whether any were found. */
export const stripTables = (text: string): { text: string; hadTable: boolean } => {
  let hadTable = false;
  const cleaned = text.replace(/^\{\|[\s\S]*?^\|\}\s*$/gm, () => {
    hadTable = true;
    return '';
  });
  // Fallback for tables not anchored to line starts.
  const cleaned2 = cleaned.replace(/\{\|[\s\S]*?\|\}/g, () => {
    hadTable = true;
    return '';
  });
  return { text: cleaned2, hadTable };
};

/** List items at the top level of a body, by marker char ('*' or '#'), with
 *  their nesting depth (marker run length). Blank/prose lines are returned too
 *  so the caller can preserve them rather than drop them. */
export type BodyLine =
  | { kind: 'item'; marker: string; depth: number; content: string }
  | { kind: 'prose'; content: string }
  | { kind: 'blank' };

export const bodyLines = (body: string): BodyLine[] => {
  const out: BodyLine[] = [];
  for (const rawLine of body.split('\n')) {
    const line = rawLine.replace(/\s+$/, '');
    if (line.trim() === '') { out.push({ kind: 'blank' }); continue; }
    const m = /^([*#:]+)\s?(.*)$/.exec(line);
    if (m !== null && /[*#]/.test(m[1]!)) {
      out.push({ kind: 'item', marker: m[1]!, depth: m[1]!.length, content: m[2]!.trim() });
    } else {
      out.push({ kind: 'prose', content: line.trim() });
    }
  }
  return out;
};
