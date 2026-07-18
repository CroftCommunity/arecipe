// @vitest-environment happy-dom
// The user guide (user-guide.html) content is a pure builder so its copy can be
// asserted. The guide is narrative-first (the agents.md voice): each entry is
// honest prose about ONE feature, with a real screenshot where one helps and
// links into the app where a setting lives. These tests pin the copy's honest
// claims — platform constraints, device-local vs published-to-your-account,
// hidden-not-flagged filtering — so a rewrite can't quietly soften them.
import { describe, expect, it } from 'vitest';
import { GUIDE_ENTRIES, renderUserGuide } from '../../../src/pages/user-guide-view.js';

const text = (root: HTMLElement, id: string): string =>
  (root.querySelector(`[data-testid="${id}"]`) as HTMLElement | null)?.textContent ?? '';

const entry = (root: HTMLElement, id: string): HTMLElement | null =>
  root.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

describe('renderUserGuide', () => {
  const guide = renderUserGuide();

  it('is titled as the user guide', () => {
    expect(text(guide, 'user-guide-title').toLowerCase()).toContain('guide');
  });

  it('opens with the Bluesky explainer, in plain English, before any feature', () => {
    const entries = guide.querySelectorAll('.guide-entry');
    expect((entries[0] as HTMLElement).dataset['testid']).toBe('guide-entry-bluesky');
    const body = text(guide, 'guide-entry-bluesky');
    expect(body).toContain('Bluesky');
    // The honest core: no arecipe server; recipes live in YOUR account; public.
    expect(body.toLowerCase()).toMatch(/no server|server of its own|without a server/);
    expect(body.toLowerCase()).toContain('your account');
    expect(body.toLowerCase()).toContain('public');
    // Password honesty: sign-in happens on Bluesky's page, not in arecipe.
    expect(body.toLowerCase()).toContain('password');
  });

  it('has a table of contents linking to every entry', () => {
    const toc = guide.querySelector('[data-testid="guide-toc"]');
    expect(toc).not.toBeNull();
    const links = Array.from(toc!.querySelectorAll('a')).map((a) =>
      (a as HTMLAnchorElement).getAttribute('href'),
    );
    for (const e of GUIDE_ENTRIES) {
      expect(links).toContain(`#${e.testid}`);
      // Anchors resolve: every entry carries its own id.
      expect(entry(guide, e.testid)?.id).toBe(e.testid);
    }
  });

  it('covers every promised topic, in reading order', () => {
    const order = Array.from(guide.querySelectorAll('.guide-entry')).map(
      (e) => (e as HTMLElement).dataset['testid'],
    );
    expect(order).toEqual([
      'guide-entry-bluesky',
      'guide-entry-browse',
      'guide-entry-add-cook',
      'guide-entry-filters',
      'guide-entry-cookbook',
      'guide-entry-open-recipe',
      'guide-entry-focus',
      'guide-entry-reference',
      'guide-entry-funfacts',
      'guide-entry-hide',
      'guide-entry-comments',
      'guide-entry-share',
      'guide-entry-meals',
      'guide-entry-meal-publish',
      'guide-entry-shopping',
    ]);
  });

  it('illustrates the visual entries with screenshots that all carry alt text', () => {
    const withShots = [
      'guide-entry-browse',
      'guide-entry-filters',
      'guide-entry-cookbook',
      'guide-entry-open-recipe',
      'guide-entry-focus',
      'guide-entry-reference',
      'guide-entry-comments',
      'guide-entry-meals',
      'guide-entry-shopping',
    ];
    for (const id of withShots) {
      const img = entry(guide, id)?.querySelector('img') as HTMLImageElement | null;
      expect(img, `${id} has a screenshot`).not.toBeNull();
      expect(img!.getAttribute('src')).toMatch(/^\.\/assets\/guide\/[a-z-]+\.jpg$/);
      expect((img!.getAttribute('alt') ?? '').length).toBeGreaterThan(10);
    }
  });

  it('browse: says what the open feed is for and that no account is needed', () => {
    const body = text(guide, 'guide-entry-browse').toLowerCase();
    expect(body).toContain('starter');
    expect(body).toMatch(/no account|without an account|signed out/);
    expect(body).toContain('search');
  });

  it('add-cook: the + Cook flow, and where the follow list honestly lives', () => {
    const body = text(guide, 'guide-entry-add-cook');
    expect(body).toContain('+ Cook');
    expect(body).toContain('Follow');
    expect(body.toLowerCase()).toContain('this device'); // device-local until published
  });

  it('filters: on-tab filters plus the standing taste & diet preferences', () => {
    const box = entry(guide, 'guide-entry-filters')!;
    const body = box.textContent ?? '';
    expect(body).toContain('Only show me');
    expect(body).toContain('Never show me');
    // Honesty: preference-excluded recipes are hidden, not flagged.
    expect(body.toLowerCase()).toMatch(/hidden|removed|drop/);
    const links = Array.from(box.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(links).toContain('./account.html#diet-preference');
  });

  it('cookbook: yours + liked, and one link shares the whole thing', () => {
    const body = text(guide, 'guide-entry-cookbook');
    expect(body).toContain('Liked');
    expect(body.toLowerCase()).toContain('share');
    expect(body.toLowerCase()).toMatch(/whole|entire/);
  });

  it('open-recipe: anatomy, the fingerprint check, and the share icon', () => {
    const body = text(guide, 'guide-entry-open-recipe').toLowerCase();
    expect(body).toContain('fingerprint');
    expect(body).toContain('share');
    expect(body).toContain('ingredients');
  });

  it('focus mode: what it is for and how to leave it', () => {
    const body = text(guide, 'guide-entry-focus');
    expect(body).toContain('Focus');
    expect(body).toMatch(/Exit focus|Esc/);
  });

  it('reference: the open-book icon leads to the Kitchen References charts', () => {
    const body = text(guide, 'guide-entry-reference');
    expect(body).toContain('Kitchen References');
    expect(body.toLowerCase()).toMatch(/book/);
  });

  it('fun facts: what they are and the link to switch them off', () => {
    const box = entry(guide, 'guide-entry-funfacts')!;
    expect(box.textContent).toContain('Did you know?');
    expect(box.textContent).toContain('Include fun facts');
    const links = Array.from(box.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(links).toContain('./settings.html');
  });

  it('hide: the purpose (your feed, not the author’s copy) and the way back', () => {
    const box = entry(guide, 'guide-entry-hide')!;
    const body = box.textContent ?? '';
    expect(body).toContain('Hide');
    expect(body).toContain('Unhide');
    expect(body.toLowerCase()).toContain('this device'); // affects only you
    const links = Array.from(box.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(links).toContain('./settings.html');
  });

  it('comments: your comment lives in your account; scope is honest; opt-out exists', () => {
    const body = text(guide, 'guide-entry-comments');
    expect(body.toLowerCase()).toContain('your account');
    expect(body.toLowerCase()).toContain('sign in');
    expect(body).toContain('Hide comments');
  });

  it('meals: weeks, tap-to-place, and the signed-out honesty', () => {
    const body = text(guide, 'guide-entry-meals').toLowerCase();
    expect(body).toContain('week');
    expect(body).toContain('tap');
    expect(body).toMatch(/signed out|without an account|no account/);
  });

  it('meal publish: a share link anyone can open, and it is public', () => {
    const box = entry(guide, 'guide-entry-meal-publish')!;
    const body = box.textContent ?? '';
    expect(body).toContain('Publish');
    expect(body.toLowerCase()).toContain('public');
    const links = Array.from(box.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(links).toContain('./calendar-setup.html');
  });

  it('shopping list: both views, and the no-guessing aggregation posture', () => {
    const body = text(guide, 'guide-entry-shopping');
    expect(body).toContain('By recipe');
    expect(body).toContain('Combined');
    expect(body.toLowerCase()).toMatch(/never (guesses|converts|invents)/);
  });

  // The original share-to-import walkthrough survives the rewrite untouched.
  it('keeps the share-to-import walkthrough with its honest constraints', () => {
    const body = text(guide, 'guide-entry-share').toLowerCase();
    expect(body).toMatch(/android|chromium/);
    expect(body).toContain('select');
    expect(body).toMatch(/paste/);
    expect(body).toMatch(/publish/);
    expect(body).toMatch(/your own words/);
  });
});
