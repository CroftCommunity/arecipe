// wikibooks corpus dishKey alignment — HTML review page (ops tooling).
//
// Pure: proposal -> a single self-contained local HTML string. No network, no
// framework. Every merge group is a card the reviewer approves (default) or
// declines; declining splits its corpus members back into standalone (no
// dishKey). Export downloads the approved rkey->dishKey map for the stamp step.
import { computeApproved } from './propose.mjs';

/** Escape text for safe interpolation into HTML body / attribute context. */
export const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** Encode JSON for safe embedding inside a <script> element: escaping `<`
 *  prevents any `</script>` in the data from terminating the block. The result
 *  is still valid JSON (<) and JSON.parse restores the original bytes. */
const embedJson = (obj) => JSON.stringify(obj).replace(/</g, '\\u003c');

const memberList = (names, tag) =>
  names.map((n) => `<li class="member ${tag}"><span class="tag">${tag}</span>${esc(n)}</li>`).join('');

const groupCard = (g) => {
  const corpusNames = g.corpus.map((c) => c.name);
  return `
  <section class="group ${g.kind}" data-group-key="${esc(g.key)}">
    <header>
      <label class="decide">
        <input type="checkbox" class="approve" checked data-group-key="${esc(g.key)}" />
        <span class="state">approved</span>
      </label>
      <code class="key">${esc(g.key)}</code>
      <span class="kind">${esc(g.kind)}</span>
      <span class="size">${g.live.length + g.corpus.length} recipes</span>
    </header>
    <ul class="members">
      ${memberList(g.live, 'live')}
      ${memberList(corpusNames, 'corpus')}
    </ul>
  </section>`;
};

const nearMissRows = (nearMiss) =>
  nearMiss
    .map((n) => `<li><code>${esc(n.specific)}</code> <span class="arrow">~?</span> <code>${esc(n.general)}</code></li>`)
    .join('');

/**
 * @param {ReturnType<import('./propose.mjs').buildProposal>} proposal
 * @param {{ generatedAtNote?: string, target?: string }} [meta]
 */
export const renderReviewHtml = (proposal, meta = {}) => {
  const { counts, mergeGroups, nearMiss } = proposal;
  const joins = mergeGroups.filter((m) => m.kind === 'joins-existing');
  const news = mergeGroups.filter((m) => m.kind === 'new-corpus');
  const target = esc(meta.target ?? 'arecipe.bsky.social');
  const note = meta.generatedAtNote ? `<p class="note">${esc(meta.generatedAtNote)}</p>` : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Wikibooks corpus — dishKey alignment review</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 15px/1.5 system-ui, sans-serif; margin: 0; padding: 0 0 6rem; }
  header.top { position: sticky; top: 0; background: Canvas; border-bottom: 2px solid; padding: 1rem 1.25rem; z-index: 5; }
  h1 { font-size: 1.15rem; margin: 0 0 .35rem; }
  .counts { display: flex; gap: 1.25rem; flex-wrap: wrap; font-size: .85rem; }
  .counts b { font-size: 1.05rem; }
  main { padding: 1rem 1.25rem; max-width: 60rem; }
  h2 { font-size: 1rem; margin: 1.75rem 0 .5rem; }
  .group { border: 1px solid; border-radius: 8px; padding: .6rem .8rem; margin: .5rem 0; }
  .group.declined { opacity: .5; }
  .group.joins-existing { border-left: 5px solid #2a7; }
  .group.new-corpus { border-left: 5px solid #46c; }
  .group header { display: flex; align-items: center; gap: .6rem; flex-wrap: wrap; }
  .decide { display: inline-flex; align-items: center; gap: .35rem; cursor: pointer; }
  .key { font-weight: 700; }
  .kind, .size { font-size: .75rem; opacity: .7; }
  ul.members { list-style: none; margin: .4rem 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: .3rem .6rem; }
  .member { font-size: .85rem; }
  .tag { font-size: .6rem; text-transform: uppercase; border: 1px solid; border-radius: 4px; padding: 0 .25rem; margin-right: .3rem; opacity: .7; }
  .member.live .tag { background: #2a7; color: #fff; border-color: #2a7; }
  .toolbar { display: flex; gap: .75rem; align-items: center; margin-top: .5rem; }
  button { font: inherit; padding: .4rem .9rem; border-radius: 6px; cursor: pointer; }
  #export { font-weight: 700; }
  details { margin-top: 1.5rem; }
  .nearmiss li { font-size: .82rem; }
  .arrow { opacity: .6; }
  .note { font-size: .8rem; opacity: .75; margin: .25rem 0 0; }
</style>
</head>
<body>
<header class="top">
  <h1>Wikibooks corpus → dishKey alignment (target: ${target})</h1>
  <div class="counts">
    <span><b>${counts.joinsExisting}</b> recipes join <b>${joins.length}</b> existing live groups</span>
    <span><b>${counts.newGroups}</b> new corpus groups (<b>${news.reduce((a, g) => a + g.corpus.length, 0)}</b> recipes)</span>
    <span><b>${counts.singletons}</b> singletons (auto-keyed)</span>
    <span><b>${counts.corpus}</b> corpus recipes total</span>
  </div>
  <div class="toolbar">
    <button id="approve-all" type="button">Approve all</button>
    <button id="decline-all" type="button">Decline all</button>
    <button id="export" type="button">Export approved map</button>
    <span id="tally"></span>
  </div>
  ${note}
</header>
<main>
  <p>Each group below is a proposed set of "same dish" versions. Approve to stamp
  the shared <code>dishKey</code>; decline to split its Wikibooks members back to
  standalone (no <code>dishKey</code>). Live members already carry the key on
  ${target}. Singletons need no decision and are exported with their derived key.</p>

  <h2>Joins existing live groups (${joins.length})</h2>
  ${joins.map(groupCard).join('') || '<p>None.</p>'}

  <h2>New corpus-only version groups (${news.length})</h2>
  ${news.map(groupCard).join('') || '<p>None.</p>'}

  <details>
    <summary>Near-miss candidates (${nearMiss.length}) — prefix overlaps you may want to merge by hand</summary>
    <ul class="nearmiss">${nearMissRows(nearMiss)}</ul>
  </details>
</main>

<script id="proposal-data" type="application/json">${embedJson(proposal)}</script>
<script>
(function () {
  const data = JSON.parse(document.getElementById('proposal-data').textContent);
  const boxes = () => Array.from(document.querySelectorAll('input.approve'));
  const syncCard = (box) => {
    const sec = box.closest('.group');
    sec.classList.toggle('declined', !box.checked);
    sec.querySelector('.state').textContent = box.checked ? 'approved' : 'declined';
  };
  const tally = () => {
    const declined = boxes().filter((b) => !b.checked).length;
    document.getElementById('tally').textContent =
      declined === 0 ? 'all groups approved' : declined + ' group(s) declined';
  };
  document.addEventListener('change', (e) => {
    if (e.target.matches('input.approve')) { syncCard(e.target); tally(); }
  });
  document.getElementById('approve-all').onclick = () => { boxes().forEach((b) => { b.checked = true; syncCard(b); }); tally(); };
  document.getElementById('decline-all').onclick = () => { boxes().forEach((b) => { b.checked = false; syncCard(b); }); tally(); };
  // The exact, unit-tested map computation (embedded from propose.mjs so the
  // page runs the same code the tests cover — no reimplementation, no drift).
  const computeApproved = ${computeApproved.toString()};
  document.getElementById('export').onclick = () => {
    const declinedKeys = boxes().filter((b) => !b.checked).map((b) => b.dataset.groupKey);
    const approved = computeApproved(data, declinedKeys);
    const out = {
      _meta: {
        purpose: 'Approved wikibooks rkey -> dishKey map. Declined merge members omitted (standalone, no dishKey).',
        target: ${JSON.stringify(target)},
        approvedGroups: data.mergeGroups.length - declinedKeys.length,
        declinedGroups: declinedKeys,
        approvedRecords: Object.keys(approved).length,
      },
      approved,
    };
    const blob = new Blob([JSON.stringify(out, null, 2) + '\\n'], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'wb-dishkeys.approved.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };
  tally();
})();
</script>
</body>
</html>`;
};
