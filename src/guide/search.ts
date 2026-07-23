// Layer A retrieval over the guide section index (RUN-GUIDE-HELPER).
//
// Deterministic lexical search — no model, works on every device. Modeled on the
// recipe searcher (src/recipes/search.ts): MiniSearch with prefix + fuzzy +
// per-field boosts and an empty-query guard. The guide-specific additions are a
// stop-word filter (natural-language questions are mostly function words) and a
// SCORE THRESHOLD (D4): below it, the helper returns nothing and the UI routes
// to the table of contents rather than improvising an answer.
//
// D5 (Layer C guard) lives here too as a pure invariant so it cannot be bolted
// on wrongly later: a model may rank and summarize retrieved sections, but any
// answer citing an anchor not in the index is rejected wholesale.
import MiniSearch from 'minisearch';
import type { GuideSection } from './model.js';

export interface GuideResult {
  section: GuideSection;
  /** MiniSearch relevance score (higher = better); above the threshold. */
  score: number;
  /** A one-line excerpt of the section body, for the result card (D3). */
  excerpt: string;
}

// Generic question/function words that carry no topic signal. Deliberately
// short: words like "off", "hide", "share", "see" are content here and stay.
const STOP = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'that',
  'this', 'i', 'me', 'my', 'you', 'your', 'it', 'is', 'are', 'be', 'do', 'does',
  'did', 'can', 'could', 'how', 'what', 'where', 'when', 'why', 'have', 'has',
]);

const processTerm = (term: string): string | null => {
  const t = term.toLowerCase();
  if (t.length < 2 || STOP.has(t)) return null;
  return t;
};

const FIELDS = ['title', 'phrasings', 'breadcrumb', 'text'] as const;

// Curated phrasings and the title are the strongest signals; body prose rides
// lower; the breadcrumb is a faint tie-breaker.
const BOOST = { title: 3, phrasings: 4, breadcrumb: 1, text: 1.5 } as const;

// Prefix/fuzzy are gated by term length: short query words neither prefix- nor
// fuzzy-expand, so "sit" (from "train my dog to sit") no longer matches "site"
// and "set" — the off-topic false positives that a bag of function words
// otherwise triggers. Longer words still expand ("convert" → "conversions",
// typos in real words), where it earns its keep.
const prefix = (term: string): boolean => term.length > 3;
const fuzzy = (term: string): number | boolean => (term.length > 5 ? 0.2 : false);

// Tuned against the 25-question fixture (Phase 3, with Layer B phrasings): the
// off-topic fixture queries top out at 1.8 ("bitcoin price"; "dog"/"gibberish"
// score 0), while every marked answer scores ≥ 12.8 and terse single-word
// queries clear it ("password" 4.9). Recorded in the run summary; the fixture
// test guards it.
export const DEFAULT_THRESHOLD = 3.5;

/** How many results to show; more than a handful is noise on a help page. */
const DEFAULT_LIMIT = 5;

type Doc = {
  anchor: string;
  title: string;
  phrasings: string;
  breadcrumb: string;
  text: string;
};

const EXCERPT_LEN = 150;

/** A short, readable excerpt centered on the first matched query term when one
 *  is found, else the section's opening — always a single line (D3). */
const excerptOf = (section: GuideSection, terms: string[]): string => {
  const body = section.text;
  if (body.length <= EXCERPT_LEN) return body;
  const lower = body.toLowerCase();
  let at = -1;
  for (const t of terms) {
    const i = lower.indexOf(t);
    if (i !== -1 && (at === -1 || i < at)) at = i;
  }
  let start = at <= 0 ? 0 : Math.max(0, at - 40);
  if (start > 0) {
    const sp = body.indexOf(' ', start);
    if (sp !== -1 && sp - start < 25) start = sp + 1;
  }
  const slice = body.slice(start, start + EXCERPT_LEN).trimEnd();
  return `${start > 0 ? '…' : ''}${slice}…`;
};

export interface GuideSearch {
  /** Ranked results above threshold; [] for an empty/whitespace or off-topic
   *  query (never throws). */
  search: (query: string) => GuideResult[];
}

export interface GuideSearchOptions {
  threshold?: number;
  limit?: number;
}

export const createGuideSearch = (
  sections: readonly GuideSection[],
  options: GuideSearchOptions = {},
): GuideSearch => {
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;
  const limit = options.limit ?? DEFAULT_LIMIT;

  const mini = new MiniSearch<Doc>({ idField: 'anchor', fields: [...FIELDS], processTerm });
  const meta = new Map<string, { section: GuideSection; index: number }>();
  const docs: Doc[] = [];
  sections.forEach((section, index) => {
    if (meta.has(section.anchor)) return; // anchors are unique; never let a dup throw
    meta.set(section.anchor, { section, index });
    docs.push({
      anchor: section.anchor,
      title: section.title,
      phrasings: section.phrasings.join('\n'),
      breadcrumb: section.breadcrumb.join(' '),
      text: section.text,
    });
  });
  mini.addAll(docs);

  return {
    search: (query) => {
      if (query.trim() === '') return [];
      const raw = mini.search(query, {
        combineWith: 'OR',
        prefix,
        fuzzy,
        boost: { ...BOOST },
      });
      const terms = query
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .map(processTerm)
        .filter((t): t is string => t !== null);
      return raw
        .map((r) => {
          const m = meta.get(r.id as string);
          return m === undefined ? null : { m, score: r.score };
        })
        .filter((x): x is { m: { section: GuideSection; index: number }; score: number } => x !== null)
        .filter((x) => x.score >= threshold)
        // Stable order: score desc, then document order — no nondeterministic
        // tie breaks (test 9).
        .sort((a, b) => b.score - a.score || a.m.index - b.m.index)
        .slice(0, limit)
        .map((x) => ({
          section: x.m.section,
          score: x.score,
          excerpt: excerptOf(x.m.section, terms),
        }));
    },
  };
};

// --- Layer C guard (D5) — a pure invariant, so Layer C cannot be bolted on
// wrongly later. Layer C is not built in Layer A; this locks its contract. -----

/** A simulated/real Layer C answer: a summary grounded in retrieved sections,
 *  citing the anchors it drew from. */
export interface LayerCResponse {
  /** Primary section cited. */
  anchor: string;
  /** Any additional cited anchors. */
  citedAnchors?: string[];
  /** Generative summary of the cited sections (rendered BELOW the links, D7). */
  summary?: string;
}

/** Every cited anchor must exist in the index. */
export const validateLayerCAnchors = (
  cited: readonly string[],
  known: ReadonlySet<string>,
): boolean => cited.every((a) => known.has(a));

/**
 * Fuse a Layer C response with Layer A results. The model may rank and
 * summarize, never invent a destination: if ANY cited anchor is unknown the
 * whole response is rejected and the Layer A results stand alone (D5). A valid
 * response contributes only its summary, additively, below the unchanged links
 * (D7).
 */
export const fuseLayerC = (
  layerA: GuideResult[],
  layerC: LayerCResponse | null,
  known: ReadonlySet<string>,
): { results: GuideResult[]; summary?: string } => {
  if (layerC === null) return { results: layerA };
  const cited = [layerC.anchor, ...(layerC.citedAnchors ?? [])].filter((a) => a !== '');
  if (!validateLayerCAnchors(cited, known)) return { results: layerA };
  return layerC.summary === undefined
    ? { results: layerA }
    : { results: layerA, summary: layerC.summary };
};
