// User guide content (user-guide.html). Pure DOM builder — no auth, no network —
// so the copy is unit-tested and the entry point (user-guide.ts) just wraps it
// in the nav shell. Cook-facing help for a stable UI: written to be accurate and
// honest rather than aspirational (the payoff of a UI that isn't moving).
//
// Entries are an ordered list; the first is the share-to-import walkthrough.
// Add later entries to GUIDE_ENTRIES.

const el = (tag: string, className?: string, text?: string): HTMLElement => {
  const node = document.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

type GuideEntry = {
  testid: string;
  title: string;
  /** Rendered as the entry's build function so an entry can mix prose, lists,
   *  and notes. */
  build: (entry: HTMLElement) => void;
};

const ol = (items: (string | Node)[]): HTMLElement => {
  const list = el('ol', 'guide-steps');
  for (const item of items) {
    const li = el('li');
    if (typeof item === 'string') li.textContent = item;
    else li.append(item);
    list.append(li);
  }
  return list;
};

const strong = (lead: string, rest: string): DocumentFragment => {
  const frag = document.createDocumentFragment();
  frag.append(el('strong', undefined, lead), document.createTextNode(rest));
  return frag;
};

const shareEntry: GuideEntry = {
  testid: 'guide-entry-share',
  title: 'Import a recipe by sharing it to arecipe',
  build: (entry) => {
    entry.append(
      el(
        'p',
        undefined,
        'On your phone, send a recipe you found on the web into arecipe from your ' +
          'browser’s Share button. arecipe turns it into a draft you can review, ' +
          'tidy up, and publish. This is a phone feature — because there’s no ' +
          'server, arecipe can only read a recipe two ways, and both start with Share.',
      ),
      ol([
        strong(
          'Install arecipe first. ',
          'Add arecipe to your home screen (“Add to Home Screen” / “Install app”). ' +
            'The share option only appears for the installed app, on Android/Chromium ' +
            'browsers. (iPhone Safari doesn’t support this yet.)',
        ),
        strong(
          'Best result — share the recipe text. ',
          'On the recipe page, select the ingredients and steps, then tap Share and ' +
            'choose arecipe. Selected text is read directly on your device — arecipe ' +
            'never fetches the site — so it works even on sites that block apps from ' +
            'reading them.',
        ),
        strong(
          'Or share the whole page. ',
          'Use the page’s Share button and pick arecipe. arecipe tries to read the ' +
            'link, but most recipe sites block that, so you’ll get a box to paste the ' +
            'page or the recipe text instead — same result, one extra step.',
        ),
        strong(
          'Review, then publish. ',
          'arecipe opens the draft in the editor, already filled in, with the source ' +
            'link attached. Nothing is published until you tap Publish — it’s yours to ' +
            'edit first. If a part couldn’t be read it’s left blank rather than guessed.',
        ),
      ]),
    );
    const etiquette = el(
      'p',
      'status',
      'A note on etiquette: an imported recipe is a starting point. Before you ' +
        'publish, consider rewriting the steps in your own words and crediting the ' +
        'source (the link is kept for you).',
    );
    entry.append(etiquette);
  },
};

/** Ordered guide entries. Share-to-import leads; append future topics here. */
export const GUIDE_ENTRIES: GuideEntry[] = [shareEntry];

export const renderUserGuide = (): HTMLElement => {
  const content = el('section', 'panel');
  content.append(el('h2', 'page-title', 'User guide'));
  const title = content.querySelector('.page-title') as HTMLElement;
  title.dataset['testid'] = 'user-guide-title';
  content.append(
    el(
      'p',
      'status',
      'How to get the most out of arecipe. More topics will land here over time.',
    ),
  );

  for (const entry of GUIDE_ENTRIES) {
    const box = el('section', 'guide-entry');
    box.dataset['testid'] = entry.testid;
    box.append(el('h3', 'section-title', entry.title));
    entry.build(box);
    content.append(box);
  }
  return content;
};
