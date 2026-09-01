// wikibooks corpus dishKey alignment — HTML review page (ops tooling).
//   node --test spike/wikibooks-dishkeys/render.test.mjs
//
// renderReviewHtml turns a proposal into a single self-contained local page:
// every MERGE group (joins-existing + new-corpus) is presented with its member
// names for the reviewer to approve or decline, and an export produces the
// approved rkey→dishKey map. Singletons are summarised, not individually gated.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderReviewHtml } from './render.mjs';
import { buildProposal } from './propose.mjs';

const proposal = buildProposal({
  live: [{ rkey: 'L1', name: 'Bouillabaisse', dishKey: 'bouillabaisse' }],
  corpus: [
    { rkey: 'wb-2', name: 'Bouillabaisse' }, // joins-existing
    { rkey: 'wb-3', name: 'Simple Nachos' }, // new-corpus (key: nachos)
    { rkey: 'wb-4', name: 'Easy Nachos' },
    // A rendered group member with special chars — the trailing "with ..." clause
    // is dropped so it still keys to `nachos`; the displayed name must be escaped.
    { rkey: 'wb-9', name: 'Nachos with "Extra" Cheese & Stuff' },
    // A singleton whose name is a script-tag injection — only ever appears in the
    // embedded JSON, which must not be able to break out of its <script> block.
    { rkey: 'wb-5', name: '</script><script>alert(1)</script>' },
  ],
});

test('renders a full HTML document', () => {
  const html = renderReviewHtml(proposal);
  assert.match(html, /<!doctype html>/i);
  assert.match(html, /<\/html>\s*$/i);
});

test('shows each merge group key and its member names, tagged live vs corpus', () => {
  const html = renderReviewHtml(proposal);
  assert.ok(html.includes('bouillabaisse'), 'group key present');
  assert.ok(html.includes('nachos'), 'new-corpus group key present');
  assert.ok(html.includes('Simple Nachos') && html.includes('Easy Nachos'), 'corpus member names present');
  assert.ok(/joins-existing/i.test(html), 'joins-existing kind is labelled');
  assert.ok(/new-corpus/i.test(html), 'new-corpus kind is labelled');
});

test('every merge group carries a decision control keyed by its dishKey', () => {
  const html = renderReviewHtml(proposal);
  assert.ok(html.includes('data-group-key="bouillabaisse"'));
  assert.ok(html.includes('data-group-key="nachos"'));
});

test('provides an export control and embeds the proposal data for the client', () => {
  const html = renderReviewHtml(proposal);
  assert.ok(/id="export"/i.test(html), 'export control present');
  const m = html.match(/<script id="proposal-data" type="application\/json">([\s\S]*?)<\/script>/);
  assert.ok(m, 'embedded proposal-data script present');
  const data = JSON.parse(m[1]);
  assert.equal(data.proposedMap['wb-2'], 'bouillabaisse');
  assert.ok(Array.isArray(data.mergeGroups));
});

test('escapes special chars in rendered group-member names', () => {
  const html = renderReviewHtml(proposal);
  assert.ok(html.includes('Nachos with &quot;Extra&quot; Cheese &amp; Stuff'), 'member name is HTML-escaped in the card');
});

test('embedded JSON cannot break out of its <script> block (injection-safe) and round-trips', () => {
  const html = renderReviewHtml(proposal);
  // The malicious name must not appear as a live script-tag anywhere in the page.
  assert.ok(!html.includes('<script>alert(1)</script>'), 'raw injected script tag must not survive');
  const m = html.match(/<script id="proposal-data" type="application\/json">([\s\S]*?)<\/script>/);
  assert.ok(m, 'embedded proposal-data script present and self-terminating');
  const data = JSON.parse(m[1]);
  const evil = data.singletons.find((s) => s.rkey === 'wb-5');
  assert.equal(evil.name, '</script><script>alert(1)</script>', 'name survives intact after safe encoding');
});

test('summarises the singleton count without listing each one', () => {
  const html = renderReviewHtml(proposal);
  assert.match(html, /1[\s\S]{0,40}singleton/i);
});
