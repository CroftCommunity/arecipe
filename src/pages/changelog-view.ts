// Changelog page content (changelog.html). The entries are generated at build
// time from opt-in `Changelog:` commit trailers (scripts/build.mjs -> dist/
// changelog.json; pure logic in scripts/changelog.mjs). The list renderer is a
// pure DOM builder (unit-tested); renderChangelog() fetches the data and wraps
// it, degrading to the empty-state on any failure — a missing file shows "no
// changes yet", never a blank or broken page.

export type ChangelogCategory = 'added' | 'changed' | 'fixed' | 'removed';

export type ChangelogEntry = {
  date: string;
  category: ChangelogCategory;
  text: string;
  sha: string;
  shortSha: string;
  commitUrl: string;
  pr?: number;
  prUrl?: string;
};

const el = (tag: string, className?: string, text?: string): HTMLElement => {
  const node = document.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const link = (href: string, text: string, testid: string): HTMLAnchorElement => {
  const a = el('a', 'cl-link', text) as HTMLAnchorElement;
  a.href = href;
  a.rel = 'noopener';
  a.dataset['testid'] = testid;
  return a;
};

const renderEntry = (entry: ChangelogEntry): HTMLElement => {
  const li = el('li', 'cl-entry');
  li.dataset['testid'] = 'changelog-entry';

  const badge = el('span', `cl-badge cl-${entry.category}`, entry.category);
  badge.dataset['testid'] = 'cl-category';

  const text = el('span', 'cl-text', entry.text);

  const meta = el('span', 'cl-meta');
  meta.append(link(entry.commitUrl, entry.shortSha, 'cl-commit'));
  if (entry.pr !== undefined && entry.prUrl !== undefined) {
    meta.append(link(entry.prUrl, `#${entry.pr}`, 'cl-pr'));
  }

  li.append(badge, text, meta);
  return li;
};

/** Pure list renderer: entries (already newest-first) grouped by date. */
export const renderChangelogList = (entries: ChangelogEntry[]): HTMLElement => {
  const root = el('div', 'changelog-list');
  if (entries.length === 0) {
    const empty = el('p', 'cl-empty', 'No changes recorded yet.');
    empty.dataset['testid'] = 'changelog-empty';
    root.append(empty);
    return root;
  }

  // Map preserves insertion order, so date groups stay newest-first.
  const byDate = new Map<string, ChangelogEntry[]>();
  for (const entry of entries) {
    const bucket = byDate.get(entry.date);
    if (bucket === undefined) byDate.set(entry.date, [entry]);
    else bucket.push(entry);
  }
  for (const [date, group] of byDate) {
    const heading = el('h2', 'cl-date', date);
    heading.dataset['testid'] = 'changelog-date';
    const list = el('ul', 'cl-entries');
    for (const entry of group) list.append(renderEntry(entry));
    root.append(heading, list);
  }
  return root;
};

/** Page content: heading + intro + the list, populated from ./changelog.json. */
export const renderChangelog = (): HTMLElement => {
  const section = el('section', 'changelog');
  const title = el('h1', undefined, "What's changed");
  title.dataset['testid'] = 'changelog-title';
  section.append(
    title,
    el('p', 'cl-intro', 'User-facing changes, newest first. Each links to the commit that made it.'),
  );
  const mount = el('div', 'changelog-mount');
  mount.append(renderChangelogList([])); // placeholder until the fetch resolves
  section.append(mount);

  void (async (): Promise<void> => {
    try {
      const res = await fetch('./changelog.json');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { entries: ChangelogEntry[] };
      mount.replaceChildren(renderChangelogList(data.entries ?? []));
    } catch {
      // Degrade to the empty-state rather than a blank or broken page.
      mount.replaceChildren(renderChangelogList([]));
    }
  })();

  return section;
};
