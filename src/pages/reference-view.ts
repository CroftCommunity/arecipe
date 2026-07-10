// Reference page view (pure DOM builder, no side effects — the entry file
// src/pages/reference.ts wraps this in the shared shell). Kitchen reference
// charts transcribed from the scanned reference cards (© HMK. LIC.), rendered
// as tables for reading while cooking. Each section carries a stable id so a
// chart is directly linkable (e.g. reference.html#roasting-poultry), plus an
// in-page anchor link to copy that direct link.
//
// Styling lives in styles.css (the app CSP forbids inline styles); this module
// only assigns class names.

const el = (tag: string, className?: string, text?: string): HTMLElement => {
  const node = document.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

/** A two-column equivalence table (A = B). */
interface PairTable {
  readonly kind: 'pairs';
  readonly rows: readonly (readonly [string, string])[];
}

/** A headed grid table (columns + rows). Cells may carry line breaks as \n. */
interface GridTable {
  readonly kind: 'grid';
  readonly headers: readonly string[];
  readonly rows: readonly (readonly string[])[];
}

interface ReferenceSection {
  readonly id: string;
  readonly title: string;
  /** One or more tables; pair tables render side-by-side on wide viewports. */
  readonly tables: readonly (PairTable | GridTable)[];
  /** Optional footnote under the tables. */
  readonly note?: string;
}

export const REFERENCE_SECTIONS: readonly ReferenceSection[] = [
  {
    id: 'weights-and-measures',
    title: 'Weights & Measures',
    tables: [
      {
        kind: 'pairs',
        rows: [
          ['3 teaspoons', '1 tablespoon'],
          ['2 tablespoons', '1/8 cup'],
          ['4 tablespoons', '1/4 cup'],
          ['5 1/3 tablespoons', '1/3 cup'],
          ['8 tablespoons', '1/2 cup'],
          ['10 2/3 tablespoons', '2/3 cup'],
          ['12 tablespoons', '3/4 cup'],
          ['14 tablespoons', '7/8 cup'],
          ['16 tablespoons', '1 cup'],
        ],
      },
      {
        kind: 'pairs',
        rows: [
          ['1 cup', '8 fluid ounces'],
          ['1 cup', '1/2 pint'],
          ['2 cups', '1 pint'],
          ['4 cups', '1 quart'],
          ['4 quarts', '1 gallon'],
          ['8 quarts', '1 peck'],
          ['4 pecks', '1 bushel'],
          ['1 liter', '2.1 pints'],
          ['1 kilogram', '2.2 pounds'],
          ['28.3 grams', '1 ounce'],
        ],
      },
    ],
  },
  {
    id: 'substitutions',
    title: 'Substitutions',
    tables: [
      {
        kind: 'pairs',
        rows: [
          ['1 tablespoon cornstarch (for thickening)', '2 tablespoons flour'],
          ['1 cup sifted all-purpose flour', '1 cup plus 2 tablespoons sifted cake flour'],
          ['1 square chocolate (1 ounce)', '3 tablespoons cocoa plus 1 tablespoon butter'],
          [
            '1 teaspoon baking powder',
            '1/4 teaspoon baking soda plus 1/2 teaspoon cream of tartar',
          ],
          ['1 cup milk', '1/2 cup evaporated milk plus 1/2 cup water'],
          [
            '1 cup sour milk',
            '1 cup sweet milk into which 1 tablespoon vinegar or lemon juice has been mixed. 1 cup buttermilk may also be used.',
          ],
          ['1 cup sweet milk', '1 cup sour milk or buttermilk plus 1/2 teaspoon baking soda'],
        ],
      },
    ],
  },
  {
    id: 'can-sizes',
    title: 'Can Sizes',
    tables: [
      {
        kind: 'grid',
        headers: ['Size', 'Average Contents'],
        rows: [
          ['6 oz.', '3/4 c.'],
          ['8 oz.', '1 c.'],
          ['Picnic', '1 1/4 c. fluid'],
          ['No. 1', '1 2/3 c. solid / 1 1/4 c. fluid'],
          ['No. 303 or No. 1 tall', '2 c.'],
          ['No. 2', '2 1/2 c.'],
          ['No. 2 1/2', '3 1/2 c.'],
          ['No. 3', '4 c.'],
          ['46 oz.', '5 3/4 c.'],
          ['No. 10', '12 to 13 c.'],
        ],
      },
    ],
  },
  {
    id: 'roasting-meat',
    title: 'Roasting Chart — Meat',
    tables: [
      {
        kind: 'grid',
        headers: [
          'Meat',
          'Oven Temperature',
          'Internal Temperature (meat thermometer)',
          'Weight of Meat',
          'Cooking Time (per pound)',
        ],
        rows: [
          [
            'Beef',
            '300° to 325°F',
            'Rare — 140°F\nMed. — 160°F\nWell-Done — 170°F',
            '6 to 8 lb.',
            '18 to 20 min.\n22 to 25 min.\n27 to 30 min.',
          ],
          ['Pork, Fresh', '350°F', '185°F', '3 to 7 lb.', '35 to 45 min.'],
          ['Ham, Precooked', '300° to 325°F', '130°F', '10 to 12 lb.', '12 to 15 min.'],
          ['Ham, Smoked (uncooked)', '300° to 325°F', '160°F', '10 to 14 lb.', '18 to 20 min.'],
          ['Lamb', '300° to 325°F', '170°–185°F', '3 to 5 lb.', '30 to 35 min.'],
          ['Veal', '300°F', '170°F', '5 to 8 lb.', '25 to 30 min.'],
        ],
      },
    ],
  },
  {
    id: 'roasting-poultry',
    title: 'Roasting Chart — Poultry',
    tables: [
      {
        kind: 'grid',
        headers: [
          'Poultry',
          'Oven Temperature',
          'Internal Temperature (meat thermometer)',
          'Weight of Meat',
          'Cooking Time (per pound)',
        ],
        rows: [
          ['Turkey', '325°F', '185°F', '10 to 16 lb.\nover 16 lb.', '15 to 20 min.\n13 to 15 min.'],
          ['Chicken / Capon', '375°F', '190°F', '4 to 8 lb.', '20 min.'],
          ['Duckling', '350°F', '190°F', '4 to 5 lb.', '20 min.'],
          ['Goose', '350°F', '190°F', '10 to 12 lb.', '15 min.'],
        ],
      },
    ],
    note: 'Add 5 min. per pound if bird is stuffed.',
  },
];

/** A table cell whose source text may carry \n as visual line breaks. */
const cellWithBreaks = (tag: 'td' | 'th', value: string, className?: string): HTMLElement => {
  const cell = el(tag, className);
  value.split('\n').forEach((line, i) => {
    if (i > 0) cell.append(document.createElement('br'));
    cell.append(document.createTextNode(line));
  });
  return cell;
};

const renderPairTable = (table: PairTable): HTMLElement => {
  const t = el('table', 'ref pairs');
  const body = el('tbody');
  for (const [left, right] of table.rows) {
    const tr = el('tr');
    tr.append(el('td', undefined, left), el('td', 'eq', '='), el('td', undefined, right));
    body.append(tr);
  }
  t.append(body);
  return t;
};

const renderGridTable = (table: GridTable): HTMLElement => {
  const t = el('table', 'ref');
  const head = el('thead');
  const headRow = el('tr');
  for (const h of table.headers) headRow.append(el('th', undefined, h));
  head.append(headRow);
  const body = el('tbody');
  for (const row of table.rows) {
    const tr = el('tr');
    for (const cell of row) tr.append(cellWithBreaks('td', cell));
    body.append(tr);
  }
  t.append(head, body);
  // Wrap in a scroll container: grid charts have many columns and would crush
  // the layout on a narrow viewport. The wrapper scrolls the table horizontally
  // instead (see styles.css .ref-scroll). Pair tables are never wrapped.
  const scroll = el('div', 'ref-scroll');
  scroll.append(t);
  return scroll;
};

const renderSection = (section: ReferenceSection): HTMLElement => {
  const card = el('section', 'ref-card');
  card.id = section.id;

  const heading = el('h2');
  heading.append(document.createTextNode(section.title));
  // In-page anchor: copyable direct link to this chart.
  const anchor = el('a', 'ref-anchor', '#') as HTMLAnchorElement;
  anchor.href = `#${section.id}`;
  anchor.setAttribute('aria-label', `Direct link to ${section.title}`);
  heading.append(document.createTextNode(' '), anchor);
  card.append(heading);

  const allPairs = section.tables.every((t) => t.kind === 'pairs');
  const grid = el('div', allPairs && section.tables.length > 1 ? 'ref-cols two' : 'ref-cols');
  for (const table of section.tables) {
    grid.append(table.kind === 'pairs' ? renderPairTable(table) : renderGridTable(table));
  }
  card.append(grid);

  if (section.note !== undefined) card.append(el('p', 'ref-note', section.note));
  return card;
};

/** Build the reference page content (sections of anchored charts). */
export const renderReference = (): HTMLElement => {
  const root = el('div', 'reference');

  const header = el('header', 'ref-head');
  header.append(
    el('h1', undefined, 'Kitchen References'),
    el('p', undefined, 'Handy conversions and charts to read while you cook.'),
  );
  root.append(header);

  for (const section of REFERENCE_SECTIONS) root.append(renderSection(section));

  root.append(el('p', 'ref-foot', 'Transcribed from scanned reference cards (© HMK. LIC.).'));
  return root;
};
