// The changelog is generated at build time from opt-in `Changelog:` commit
// trailers (scripts/build.mjs -> dist/changelog.json). The pure parser is the
// load-bearing logic, so it is unit-tested against fixture commits here, red
// first. It lives in scripts/ (plain .mjs) so both build.mjs and this test import
// the one source — mirroring scripts/md-to-html.mjs.
//
// Contract:
// - only commits carrying a `Changelog:` trailer produce entries (opt-in);
// - `Changelog(<cat>): text` sets the category; bare/unknown -> 'changed';
// - repeated trailers in one commit -> one entry each;
// - the PR number is read from a trailing `(#NN)` subject;
// - each entry carries sha/shortSha/date/commitUrl (+ pr/prUrl when present).
import { describe, expect, it } from 'vitest';
// @ts-expect-error - plain-JS build helper (JSDoc-typed), same as scripts/md-to-html.mjs
import { mergeChangelog, normalizeRepoUrl, parseChangelog } from '../../../scripts/changelog.mjs';

const REPO = 'https://github.com/CroftCommunity/arecipe';

/** A fixture git commit as scripts/build.mjs collects it. */
const commit = (over = {}) => ({
  sha: '1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b',
  subject: 'Some internal change (#40)',
  date: '2026-07-20T10:00:00Z',
  body: '',
  ...over,
});

describe('parseChangelog', () => {
  it('excludes commits with no Changelog trailer', () => {
    const out = parseChangelog([commit({ body: 'just a normal body\n\nCo-Authored-By: X <y>' })], { repoUrl: REPO });
    expect(out).toEqual([]);
  });

  it('extracts a bare trailer as a "changed" entry', () => {
    const out = parseChangelog([commit({ body: 'Changelog: Added a shopping list' })], { repoUrl: REPO });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ category: 'changed', text: 'Added a shopping list' });
  });

  it('reads the category from Changelog(<cat>):', () => {
    const out = parseChangelog([commit({ body: 'Changelog(added): A new thing' })], { repoUrl: REPO });
    expect(out[0]).toMatchObject({ category: 'added', text: 'A new thing' });
  });

  it('falls back to "changed" for an unknown category, keeping the text', () => {
    const out = parseChangelog([commit({ body: 'Changelog(zonk): Still user-facing' })], { repoUrl: REPO });
    expect(out[0]).toMatchObject({ category: 'changed', text: 'Still user-facing' });
  });

  it('emits one entry per repeated trailer in a single commit', () => {
    const body = 'Changelog(added): First\nChangelog(fixed): Second';
    const out = parseChangelog([commit({ body })], { repoUrl: REPO });
    expect(out.map((e: { text: string }) => e.text)).toEqual(['First', 'Second']);
    expect(out.map((e: { category: string }) => e.category)).toEqual(['added', 'fixed']);
  });

  it('reads the PR number from a trailing (#NN) subject and builds URLs', () => {
    const out = parseChangelog(
      [commit({ subject: 'Shopping lists (#40)', body: 'Changelog(added): x' })],
      { repoUrl: REPO },
    );
    expect(out[0]).toMatchObject({
      pr: 40,
      prUrl: `${REPO}/pull/40`,
      sha: '1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b',
      shortSha: '1a2b3c4',
      commitUrl: `${REPO}/commit/1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b`,
      date: '2026-07-20',
    });
  });

  it('omits pr/prUrl when the subject has no (#NN)', () => {
    const out = parseChangelog([commit({ subject: 'direct commit', body: 'Changelog: y' })], { repoUrl: REPO });
    expect(out[0].pr).toBeUndefined();
    expect(out[0].prUrl).toBeUndefined();
  });

  it('trims text and skips an empty trailer', () => {
    const out = parseChangelog([commit({ body: 'Changelog:   \nChangelog(added):   Real  ' })], { repoUrl: REPO });
    expect(out).toHaveLength(1);
    expect(out[0].text).toBe('Real');
  });

  it('keeps commits newest-first as given (no reordering)', () => {
    const out = parseChangelog(
      [
        commit({ sha: 'aaaaaaa0000000000000000000000000000000000', body: 'Changelog: newer' }),
        commit({ sha: 'bbbbbbb0000000000000000000000000000000000', body: 'Changelog: older' }),
      ],
      { repoUrl: REPO },
    );
    expect(out.map((e: { text: string }) => e.text)).toEqual(['newer', 'older']);
  });
});

describe('mergeChangelog (backlog seed ∪ git-derived)', () => {
  const e = (sha: string, date: string, text: string) => ({
    date,
    category: 'added',
    text,
    sha,
    shortSha: sha.slice(0, 7),
    commitUrl: `https://github.com/CroftCommunity/arecipe/commit/${sha}`,
  });

  it('unions seed and derived, newest date first', () => {
    const out = mergeChangelog([e('seed001', '2026-07-10', 'backlog thing')], [e('der0001', '2026-07-20', 'new thing')]);
    expect(out.map((x: { text: string }) => x.text)).toEqual(['new thing', 'backlog thing']);
  });

  it('dedupes by sha, with the git-derived (live) entry winning', () => {
    const out = mergeChangelog(
      [e('shaXXXX', '2026-07-15', 'stale seed text')],
      [e('shaXXXX', '2026-07-15', 'fresh trailer text')],
    );
    expect(out).toHaveLength(1);
    expect(out[0].text).toBe('fresh trailer text');
  });

  it('keeps seed-only entries whose sha is absent from derived (the durable backlog)', () => {
    const out = mergeChangelog([e('onlySeed', '2026-07-01', 'pre-convention change')], []);
    expect(out).toHaveLength(1);
    expect(out[0].text).toBe('pre-convention change');
  });

  it('handles an empty seed', () => {
    const out = mergeChangelog([], [e('der0001', '2026-07-20', 'only derived')]);
    expect(out.map((x: { text: string }) => x.text)).toEqual(['only derived']);
  });
});

describe('normalizeRepoUrl', () => {
  it('maps an SSH remote (with an SSH-alias host) to the github.com https URL', () => {
    expect(normalizeRepoUrl('git@github-personal:CroftCommunity/arecipe.git')).toBe(
      'https://github.com/CroftCommunity/arecipe',
    );
  });
  it('strips a trailing .git from an https remote', () => {
    expect(normalizeRepoUrl('https://github.com/CroftCommunity/arecipe.git')).toBe(
      'https://github.com/CroftCommunity/arecipe',
    );
  });
  it('passes through an already-clean https URL', () => {
    expect(normalizeRepoUrl('https://github.com/CroftCommunity/arecipe')).toBe(
      'https://github.com/CroftCommunity/arecipe',
    );
  });
});
