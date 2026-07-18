// Editor provenance surfaces for a link-imported draft (import Phase 4, D5).
// Pure DOM builders so the copy is unit-tested; editor.ts renders them only when
// the draft carries a sourceUrl. The etiquette line is deliberately gentle and
// singular — a nudge toward original wording, not a scold or a gate.

const el = (tag: string, className?: string, text?: string): HTMLElement => {
  const node = document.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

/** The gentle "own words" nudge shown near publish for an imported draft. */
export const ETIQUETTE_COPY =
  'Imported as a starting point — before publishing, consider writing the instructions in your own words.';

/** A small "Imported from <host>" line linking back to the source. */
export const renderProvenanceLine = (sourceUrl: string): HTMLElement => {
  const line = el('p', 'status import-provenance');
  line.dataset['testid'] = 'editor-provenance';
  const link = document.createElement('a');
  link.className = 'friend-link';
  link.href = sourceUrl;
  link.rel = 'noopener noreferrer';
  link.target = '_blank';
  let label = sourceUrl;
  try {
    label = new URL(sourceUrl).host;
  } catch {
    label = sourceUrl; // not a parseable URL — show it verbatim
  }
  link.textContent = label;
  line.append(document.createTextNode('Imported from '), link);
  return line;
};

/** The single etiquette nudge for an imported draft. */
export const renderEtiquetteLine = (): HTMLElement => {
  const line = el('p', 'status import-etiquette', ETIQUETTE_COPY);
  line.dataset['testid'] = 'editor-etiquette';
  return line;
};
