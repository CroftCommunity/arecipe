// Shared UI glyphs (zero-dep). One helper draws the reset/revert mark so every
// site that can reset something renders the identical control — the toolbar
// reset on Browse/Cookbook and the Meals plan reset all consume this, so the
// glyph is defined once and can never diverge.
//
// The mark is a COUNTERCLOCKWISE arrow-in-a-circle: counterclockwise reads as
// "revert / undo". Clockwise is deliberately RESERVED for refresh-type actions
// (the Meals header's calendar Resync shares a row with reset), so the direction
// is load-bearing — never render a clockwise variant for reset.
//
// SVG is built with createElementNS (the build-stamp.ts precedent): stroke
// follows `currentColor` so CSS `color: var(--rust)` tints it, `fill: none` and
// a viewBox let CSS size the glyph while the button pads out the ≥44px hit area.
// The geometry lives in exported constants so a change to the glyph is a
// deliberate, test-visible edit — the Lucide "rotate-ccw" mark.

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Committed glyph geometry — pinned by tests/unit/icons.spec.ts. */
export const RESET_ICON_VIEWBOX = '0 0 24 24';
/** The arrowhead at the top-left, signalling the counterclockwise entry. */
export const RESET_ICON_ARROW_POINTS = '1 4 1 10 7 10';
/** The near-full circular arc that closes the loop back to the arrowhead. */
export const RESET_ICON_ARC_PATH = 'M3.51 15a9 9 0 1 0 2.13-9.36L1 10';

/** An inline reset glyph: counterclockwise arrow-in-a-circle, currentColor
 *  stroke, no fill, aria-hidden (the accessible name lives on the button). */
export const resetIcon = (): SVGSVGElement => {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', RESET_ICON_VIEWBOX);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');

  const arrow = document.createElementNS(SVG_NS, 'polyline');
  arrow.setAttribute('points', RESET_ICON_ARROW_POINTS);
  const arc = document.createElementNS(SVG_NS, 'path');
  arc.setAttribute('d', RESET_ICON_ARC_PATH);

  svg.append(arrow, arc);
  return svg;
};

/** A reset button wrapping the glyph. The visible glyph is icon-only, so the
 *  label is the accessible name — set on both `aria-label` (SR) and `title`
 *  (pointer tooltip). Shared `.reset-icon-btn` class styles all sites alike. */
export const resetIconButton = (label: string): HTMLButtonElement => {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'reset-icon-btn';
  btn.setAttribute('aria-label', label);
  btn.title = label;
  btn.append(resetIcon());
  return btn;
};

// ---- Reference glyph ---------------------------------------------------------
// An OPEN BOOK marks the culinary Reference page (kitchen charts). One helper
// draws it so every quick link — recipe detail, editor, Alchemy — renders the
// identical mark. Same posture as the reset glyph: currentColor stroke, no
// fill, geometry pinned in exported constants (Lucide "book-open").

/** Committed glyph geometry — pinned by tests/unit/icons.spec.ts. */
export const REFERENCE_ICON_VIEWBOX = '0 0 24 24';
/** The left page of the open book. */
export const REFERENCE_ICON_LEFT_PAGE_PATH = 'M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z';
/** The right page of the open book. */
export const REFERENCE_ICON_RIGHT_PAGE_PATH = 'M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z';

/** An inline open-book glyph: currentColor stroke, no fill, aria-hidden (the
 *  accessible name lives on the link). */
export const referenceIcon = (): SVGSVGElement => {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', REFERENCE_ICON_VIEWBOX);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');

  const left = document.createElementNS(SVG_NS, 'path');
  left.setAttribute('d', REFERENCE_ICON_LEFT_PAGE_PATH);
  const right = document.createElementNS(SVG_NS, 'path');
  right.setAttribute('d', REFERENCE_ICON_RIGHT_PAGE_PATH);

  svg.append(left, right);
  return svg;
};

/** A quick link to the Reference page wrapping the open-book glyph. Icon-only,
 *  so the label is the accessible name (`aria-label` + `title`). Shared
 *  `.reference-link` class + testid style/locate every site alike. */
export const referenceIconLink = (): HTMLAnchorElement => {
  const link = document.createElement('a');
  link.className = 'reference-link';
  link.href = './reference.html';
  link.dataset['testid'] = 'reference-link';
  link.setAttribute('aria-label', 'Culinary reference charts');
  link.title = 'Culinary reference charts';
  link.append(referenceIcon());
  return link;
};
