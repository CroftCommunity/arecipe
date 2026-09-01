// wikibooks corpus dishKey alignment — page behaviour (ops tooling).
//   node --test spike/wikibooks-dishkeys/page-behavior.test.mjs
//
// Executes the page's actual inline <script> against a minimal fake DOM, so the
// approve/decline → export wiring is verified without a real browser. The export
// runs the SAME computeApproved the unit tests cover (embedded via toString).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderReviewHtml } from './render.mjs';
import { buildProposal } from './propose.mjs';

const proposal = buildProposal({
  live: [{ rkey: 'L1', name: 'Bouillabaisse', dishKey: 'bouillabaisse' }],
  corpus: [
    { rkey: 'wb-2', name: 'Bouillabaisse' }, // joins-existing (bouillabaisse)
    { rkey: 'wb-3', name: 'Simple Nachos' }, // new-corpus (nachos)
    { rkey: 'wb-4', name: 'Easy Nachos' },
    { rkey: 'wb-5', name: 'Injera' }, // singleton
  ],
});

/** Pull the behaviour script (the <script> without a src/type) out of the page. */
const behaviourScript = (html) => {
  const blocks = [...html.matchAll(/<script(?![^>]*\btype=)[^>]*>([\s\S]*?)<\/script>/g)];
  const body = blocks.map((m) => m[1]).find((s) => s.includes("getElementById('export')"));
  assert.ok(body, 'expected an inline behaviour script');
  return body;
};

/** Minimal DOM + browser stubs; captures whatever the export blob contains. */
const runPage = (html, decline = []) => {
  const declineSet = new Set(decline);
  const embedded = html.match(/<script id="proposal-data" type="application\/json">([\s\S]*?)<\/script>/)[1];

  const boxes = proposal.mergeGroups.map((g) => ({
    className: 'approve',
    checked: !declineSet.has(g.key),
    dataset: { groupKey: g.key },
    matches: (sel) => sel === 'input.approve',
    closest: () => card,
  }));
  const card = { classList: { toggle() {} }, querySelector: () => ({ textContent: '' }) };
  const els = {
    'proposal-data': { textContent: embedded },
    'approve-all': {},
    'decline-all': {},
    export: {},
    tally: { textContent: '' },
  };
  const document = {
    getElementById: (id) => els[id],
    querySelectorAll: () => boxes,
    addEventListener: () => {},
    createElement: () => anchor,
  };
  const anchor = { href: '', download: '', click() {} };

  let captured;
  class Blob {
    constructor(parts) {
      captured = parts.join('');
    }
  }
  const URL = { createObjectURL: () => 'blob:stub', revokeObjectURL() {} };

  const body = behaviourScript(html);
  // eslint-disable-next-line no-new-func
  new Function('document', 'Blob', 'URL', body)(document, Blob, URL);
  els.export.onclick();
  return JSON.parse(captured);
};

test('export with nothing declined stamps every corpus recipe (singletons + all merge members)', () => {
  const html = renderReviewHtml(proposal);
  const out = runPage(html, []);
  assert.equal(out.approved['wb-2'], 'bouillabaisse');
  assert.equal(out.approved['wb-3'], 'nachos');
  assert.equal(out.approved['wb-4'], 'nachos');
  assert.equal(out.approved['wb-5'], 'injera'); // singleton keyed
  assert.equal(out._meta.declinedGroups.length, 0);
  assert.equal(out._meta.approvedRecords, 4);
});

test('declining the nachos group drops its members but keeps bouillabaisse + the singleton', () => {
  const html = renderReviewHtml(proposal);
  const out = runPage(html, ['nachos']);
  assert.ok(!('wb-3' in out.approved), 'declined member dropped');
  assert.ok(!('wb-4' in out.approved), 'declined member dropped');
  assert.equal(out.approved['wb-2'], 'bouillabaisse', 'other group kept');
  assert.equal(out.approved['wb-5'], 'injera', 'singleton kept');
  assert.deepEqual(out._meta.declinedGroups, ['nachos']);
});
