// D5 — the {{Recipe summary}} infobox (and its {{recipesummary}} alias). All
// params are optional and free text. Hint fields are derived ONLY when
// unambiguous — the source string is never lost, and we never guess.
import type { ParseFlag, Summary } from '../ir.ts';
import { findTemplate, renderInline } from './wikitext.ts';

const parseServingsHint = (s: string): { min: number; max?: number } | undefined => {
  const t = s.trim();
  let m = /^(\d+)\s*(?:[-–—]|to)\s*(\d+)$/.exec(t);
  if (m !== null) return { min: Number(m[1]), max: Number(m[2]) };
  m = /^(\d+)$/.exec(t);
  if (m !== null) return { min: Number(m[1]) };
  return undefined;
};

const parseTimeMinutes = (s: string): number | undefined => {
  const hours = /(\d+)\s*(?:hours?|hrs?)\b/i.exec(s);
  const mins = /(\d+)\s*(?:minutes?|mins?|min)\b/i.exec(s);
  if (hours === null && mins === null) return undefined;
  return (hours !== null ? Number(hours[1]) * 60 : 0) + (mins !== null ? Number(mins[1]) : 0);
};

const extractImageFilename = (v: string): string | undefined => {
  const m = /(?:file|image)\s*:\s*([^|\]\n]+)/i.exec(v);
  if (m !== null) return m[1]!.trim();
  const bare = v.replace(/\[\[|\]\]/g, '').trim();
  return bare === '' ? undefined : bare;
};

export const parseSummary = (wikitext: string): { summary: Summary; flags: ParseFlag[] } => {
  const tmpl = findTemplate(wikitext, /^recipe ?summary$/i);
  if (tmpl === null) return { summary: {}, flags: [] };
  const flags: ParseFlag[] = [];
  const summary: Summary = {};

  const cleanText = (key: string): string | undefined => {
    const v = tmpl.named.get(key);
    if (v === undefined) return undefined;
    const r = renderInline(v);
    if (r.templates.length > 0) flags.push({ code: 'template-in-value', detail: `${key}: ${r.templates.join(', ')}` });
    const t = r.display.trim();
    return t === '' ? undefined : t;
  };

  const category = cleanText('category'); if (category !== undefined) summary.category = category;
  const servings = cleanText('servings'); if (servings !== undefined) summary.servings = servings;
  const yieldVal = cleanText('yield'); if (yieldVal !== undefined) summary.yield = yieldVal;
  const time = cleanText('time'); if (time !== undefined) summary.time = time;
  const cuisine = cleanText('cuisine'); if (cuisine !== undefined) summary.cuisine = cuisine;
  const origin = cleanText('origin'); if (origin !== undefined) summary.origin = origin;
  const energy = cleanText('energy'); if (energy !== undefined) summary.energy = energy;
  const note = cleanText('note'); if (note !== undefined) summary.note = note;

  if (summary.servings !== undefined) {
    const hint = parseServingsHint(summary.servings);
    if (hint !== undefined) summary.servingsHint = hint;
  }
  if (summary.time !== undefined) {
    const mins = parseTimeMinutes(summary.time);
    if (mins !== undefined) summary.timeMinutesHint = mins;
  }

  const diffRaw = (tmpl.named.get('difficulty') ?? '').trim();
  if (diffRaw !== '') {
    const n = Number(diffRaw);
    if (Number.isInteger(n) && n >= 1 && n <= 5) summary.difficulty = n as 1 | 2 | 3 | 4 | 5;
    else flags.push({ code: 'difficulty-out-of-range', detail: diffRaw });
  }

  const imageRaw = tmpl.named.get('image');
  if (imageRaw !== undefined && imageRaw.trim() !== '') {
    const fn = extractImageFilename(imageRaw);
    if (fn !== undefined) {
      summary.image = fn;
      flags.push({ code: 'image-unresolved', detail: fn }); // images out of scope (D9)
    }
  }

  return { summary, flags };
};
