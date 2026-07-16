// @vitest-environment happy-dom
// Shared UI glyphs (D2). One helper draws the reset/revert mark so Browse,
// Cookbook, and Meals render the identical control — a counterclockwise
// arrow-in-a-circle (D1: clockwise is RESERVED for refresh, e.g. Meals Resync).
// The geometry is pinned to committed constants so a change to the glyph must be
// a deliberate test edit, not a silent drift. A permanent contrast guard (D3)
// proves the rust stroke stays legible on --tile if the palette is ever tweaked.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  REFERENCE_ICON_LEFT_PAGE_PATH,
  REFERENCE_ICON_RIGHT_PAGE_PATH,
  REFERENCE_ICON_VIEWBOX,
  RESET_ICON_ARC_PATH,
  RESET_ICON_ARROW_POINTS,
  RESET_ICON_VIEWBOX,
  SHARE_ICON_ARROW_POINTS,
  SHARE_ICON_STEM_PATH,
  SHARE_ICON_TRAY_PATH,
  SHARE_ICON_VIEWBOX,
  referenceIcon,
  referenceIconLink,
  resetIcon,
  resetIconButton,
  shareIcon,
} from '../../src/icons.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

describe('resetIcon', () => {
  it('is an inline SVG: aria-hidden, currentColor stroke, no fill', () => {
    const svg = resetIcon();
    expect(svg).toBeInstanceOf(SVGElement);
    expect(svg.namespaceURI).toBe(SVG_NS);
    expect(svg.tagName.toLowerCase()).toBe('svg');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    // Stroke follows text color (so CSS `color: var(--rust)` tints it); no fill.
    expect(svg.getAttribute('stroke')).toBe('currentColor');
    expect(svg.getAttribute('fill')).toBe('none');
    // viewBox'd so CSS sizes it (glyph ~16-18px, hit area padded to ≥44px).
    expect(svg.getAttribute('viewBox')).toBe(RESET_ICON_VIEWBOX);
  });

  it('pins the counterclockwise geometry to the committed constants', () => {
    const svg = resetIcon();
    const arrow = svg.querySelector('polyline');
    const arc = svg.querySelector('path');
    expect(arrow).not.toBeNull();
    expect(arc).not.toBeNull();
    // A change here must be a deliberate edit of the committed glyph, not drift.
    expect(arrow!.getAttribute('points')).toBe(RESET_ICON_ARROW_POINTS);
    expect(arc!.getAttribute('d')).toBe(RESET_ICON_ARC_PATH);
  });

  it('returns a fresh node each call (no shared singleton to accidentally re-parent)', () => {
    expect(resetIcon()).not.toBe(resetIcon());
  });
});

describe('resetIconButton', () => {
  it('is a type=button carrying the label as aria-label + title, containing exactly the icon', () => {
    const btn = resetIconButton('reset filters');
    expect(btn.tagName.toLowerCase()).toBe('button');
    expect(btn.type).toBe('button');
    expect(btn.getAttribute('aria-label')).toBe('reset filters');
    expect(btn.getAttribute('title')).toBe('reset filters');
    // Exactly one child, and it is the reset svg (same geometry as resetIcon()).
    expect(btn.children.length).toBe(1);
    const svg = btn.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('aria-hidden')).toBe('true');
    expect(svg!.querySelector('path')!.getAttribute('d')).toBe(RESET_ICON_ARC_PATH);
  });

  it('carries the shared .reset-icon-btn class so all three sites style identically', () => {
    expect(resetIconButton('Reset plan').classList.contains('reset-icon-btn')).toBe(true);
  });
});

// --- Reference glyph: the open book marking the culinary Reference page. -----
describe('referenceIcon', () => {
  it('is an inline SVG: aria-hidden, currentColor stroke, no fill', () => {
    const svg = referenceIcon();
    expect(svg).toBeInstanceOf(SVGElement);
    expect(svg.namespaceURI).toBe(SVG_NS);
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('stroke')).toBe('currentColor');
    expect(svg.getAttribute('fill')).toBe('none');
    expect(svg.getAttribute('viewBox')).toBe(REFERENCE_ICON_VIEWBOX);
  });

  it('pins the open-book geometry to the committed constants', () => {
    const paths = referenceIcon().querySelectorAll('path');
    expect(paths.length).toBe(2);
    // A change here must be a deliberate edit of the committed glyph, not drift.
    expect(paths[0]!.getAttribute('d')).toBe(REFERENCE_ICON_LEFT_PAGE_PATH);
    expect(paths[1]!.getAttribute('d')).toBe(REFERENCE_ICON_RIGHT_PAGE_PATH);
  });

  it('returns a fresh node each call (no shared singleton to accidentally re-parent)', () => {
    expect(referenceIcon()).not.toBe(referenceIcon());
  });
});

describe('referenceIconLink', () => {
  it('links to reference.html with an accessible name (aria-label + title), containing exactly the icon', () => {
    const link = referenceIconLink();
    expect(link.tagName.toLowerCase()).toBe('a');
    expect(link.getAttribute('href')).toBe('./reference.html');
    expect(link.getAttribute('aria-label')).toBe('Culinary reference charts');
    expect(link.getAttribute('title')).toBe('Culinary reference charts');
    expect(link.children.length).toBe(1);
    const svg = link.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.querySelector('path')!.getAttribute('d')).toBe(REFERENCE_ICON_LEFT_PAGE_PATH);
  });

  it('carries the shared .reference-link class + testid so every site styles/locates identically', () => {
    const link = referenceIconLink();
    expect(link.classList.contains('reference-link')).toBe(true);
    expect(link.getAttribute('data-testid')).toBe('reference-link');
  });
});

// --- Share glyph: the tray + up-arrow "send it out" mark (Lucide "share"), ----
// consumed by the icon variant of the share control (src/share/button.ts) on
// the cookbook title row.
describe('shareIcon', () => {
  it('is an inline SVG: aria-hidden, currentColor stroke, no fill', () => {
    const svg = shareIcon();
    expect(svg).toBeInstanceOf(SVGElement);
    expect(svg.namespaceURI).toBe(SVG_NS);
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('stroke')).toBe('currentColor');
    expect(svg.getAttribute('fill')).toBe('none');
    expect(svg.getAttribute('viewBox')).toBe(SHARE_ICON_VIEWBOX);
  });

  it('pins the tray + up-arrow geometry to the committed constants', () => {
    const svg = shareIcon();
    const paths = svg.querySelectorAll('path');
    const arrow = svg.querySelector('polyline');
    expect(paths.length).toBe(2);
    expect(arrow).not.toBeNull();
    // A change here must be a deliberate edit of the committed glyph, not drift.
    expect(paths[0]!.getAttribute('d')).toBe(SHARE_ICON_TRAY_PATH);
    expect(paths[1]!.getAttribute('d')).toBe(SHARE_ICON_STEM_PATH);
    expect(arrow!.getAttribute('points')).toBe(SHARE_ICON_ARROW_POINTS);
  });

  it('returns a fresh node each call (no shared singleton to accidentally re-parent)', () => {
    expect(shareIcon()).not.toBe(shareIcon());
  });
});

// --- Contrast guard (D3): reset must stay legible on --tile. -----------------
// Pure WCAG 2.x relative-luminance + contrast-ratio math, computed in the test
// so a future palette edit that drops --rust below the 3:1 non-text floor fails
// the build instead of silently making reset illegible.
const srgbToLinear = (channel: number): number => {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

const relativeLuminance = (hex: string): number => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (m === null) throw new Error(`not a 6-digit hex: ${hex}`);
  const n = parseInt(m[1]!, 16);
  const r = srgbToLinear((n >> 16) & 0xff);
  const g = srgbToLinear((n >> 8) & 0xff);
  const b = srgbToLinear(n & 0xff);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrastRatio = (a: string, b: string): number => {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
};

/** Read a `--token: #hex;` value from the first `:root {…}` block of styles.css. */
const rootToken = (css: string, token: string): string => {
  const root = /:root\s*\{([\s\S]*?)\}/.exec(css);
  if (root === null) throw new Error('no :root block in styles.css');
  const m = new RegExp(`--${token}\\s*:\\s*(#[0-9a-fA-F]{6,8})`).exec(root[1]!);
  if (m === null) throw new Error(`--${token} not found in :root`);
  return m[1]!;
};

describe('reset icon contrast (permanent palette guard)', () => {
  const css = readFileSync('styles.css', 'utf8');

  it('sanity-checks the WCAG math against a known pair (black on white ≈ 21:1)', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
  });

  it('--rust strokes ≥3:1 against --tile (WCAG non-text floor)', () => {
    const rust = rootToken(css, 'rust');
    const tile = rootToken(css, 'tile');
    const ratio = contrastRatio(rust, tile);
    // D3 measured ~4.5:1; assert the 3:1 floor with margin so a palette tweak
    // that drifts below it fails the build.
    expect(ratio, `--rust ${rust} on --tile ${tile} = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(3);
  });

  it('defines --rust-soft (hover/pressed tint) mirroring --enamel-soft', () => {
    const root = /:root\s*\{([\s\S]*?)\}/.exec(css)![1]!;
    expect(root).toMatch(/--rust-soft\s*:\s*#[0-9a-fA-F]{8}\s*;/);
  });
});
