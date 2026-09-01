// D6/D7 — ingredients, procedure, and named prose sections. Conservative
// posture (matching RUN-SHOPPING-LIST): no quantity parsing, no unit
// normalisation. Lines flow through as text + refs. Nothing understood-but-
// removed is lost silently: stripped templates and unmodeled prose become
// parseFlags.
import type { IngredientLine, ParseFlag, ProseBlock, Step } from '../ir.ts';
import { bodyLines, renderInline, stripTables, type Section } from './wikitext.ts';

/** Templates that are understood navigation/scaffolding, not content — stripped
 *  without a flag. Everything else stripped IS flagged. */
export const KNOWN_NAV = new Set(['recipe', 'recipesummary', 'recipe summary']);

const flagStrippedTemplates = (names: Iterable<string>, flags: ParseFlag[]): void => {
  const seen = new Set<string>();
  for (const n of names) {
    const key = n.toLowerCase();
    if (KNOWN_NAV.has(key) || seen.has(key)) continue;
    seen.add(key);
    flags.push({ code: 'template-stripped', detail: n });
  }
};

const isIngredientHeading = (h: string): boolean => /ingredient/i.test(h);
const isProcedureHeading = (h: string): boolean =>
  /procedure|method|directions|preparation|instructions|steps/i.test(h);

const detectOptional = (raw: string): boolean =>
  /^\s*optional\b[:\s]/i.test(raw) ||
  /\(\s*optional\s*\)\s*\.?$/i.test(raw) ||
  /,\s*optional\s*\.?$/i.test(raw);

export const parseIngredients = (
  sections: Section[],
): { ingredients: IngredientLine[]; flags: ParseFlag[] } => {
  const flags: ParseFlag[] = [];
  const ingredients: IngredientLine[] = [];
  const templates: string[] = [];
  for (const sec of sections) {
    if (!isIngredientHeading(sec.heading)) continue;
    const { text, hadTable } = stripTables(sec.body);
    if (hadTable) flags.push({ code: 'table', detail: `Ingredients (${sec.heading})` });
    for (const bl of bodyLines(text)) {
      if (bl.kind === 'item') {
        const inline = renderInline(bl.content);
        templates.push(...inline.templates);
        ingredients.push({
          raw: bl.content,
          display: inline.display,
          refs: inline.refs,
          optional: detectOptional(bl.content),
        });
      } else if (bl.kind === 'prose') {
        const r = renderInline(bl.content);
        templates.push(...r.templates);
        // Non-list prose is preserved, not dropped — unless it renders empty
        // (e.g. a bare category link, which is understood markup).
        if (r.display.trim() !== '') flags.push({ code: 'ingredients-prose', detail: r.display });
      }
    }
  }
  flagStrippedTemplates(templates, flags);
  return { ingredients, flags };
};

export const parseProcedure = (sections: Section[]): { steps: Step[]; flags: ParseFlag[] } => {
  const flags: ParseFlag[] = [];
  const steps: Step[] = [];
  const templates: string[] = [];
  for (const sec of sections) {
    if (!isProcedureHeading(sec.heading)) continue;
    const { text, hadTable } = stripTables(sec.body);
    if (hadTable) flags.push({ code: 'table', detail: `Procedure (${sec.heading})` });
    for (const bl of bodyLines(text)) {
      if (bl.kind === 'item') {
        const inline = renderInline(bl.content);
        templates.push(...inline.templates);
        const step: Step = { text: inline.display, refs: inline.refs };
        if (bl.depth <= 1) {
          steps.push(step);
        } else {
          const parent = steps[steps.length - 1];
          if (parent === undefined) steps.push(step);
          else (parent.substeps ??= []).push(step);
        }
      } else if (bl.kind === 'prose') {
        const r = renderInline(bl.content);
        templates.push(...r.templates);
        if (r.display.trim() !== '') flags.push({ code: 'procedure-prose', detail: r.display });
      }
    }
  }
  flagStrippedTemplates(templates, flags);
  return { steps, flags };
};

/** Every section that isn't ingredients/procedure → a named prose block
 *  (Notes, Tips, Variations, Warnings, See also, …). */
export const parseProseSections = (
  sections: Section[],
): { blocks: ProseBlock[]; flags: ParseFlag[] } => {
  const flags: ParseFlag[] = [];
  const blocks: ProseBlock[] = [];
  const templates: string[] = [];
  for (const sec of sections) {
    if (isIngredientHeading(sec.heading) || isProcedureHeading(sec.heading)) continue;
    const { text, hadTable } = stripTables(sec.body);
    if (hadTable) flags.push({ code: 'table', detail: sec.heading });
    const inline = renderInline(text);
    templates.push(...inline.templates);
    if (inline.display.trim() !== '') blocks.push({ heading: sec.heading, text: inline.display });
  }
  flagStrippedTemplates(templates, flags);
  return { blocks, flags };
};
