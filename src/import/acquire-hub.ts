// The Acquire hub (import.html): the "pull a recipe in" surface, separate from
// the "build/edit" surface (the editor). Every path here produces a candidate
// DRAFT and hands off to the same editor — nothing is ever posted automatically.
//
// It composes the import panel (paste + "From a link" + share auto-run) with two
// more 0→1 entries: "Scan a photo" (OCR — laddered; `onScanPhoto` is wired in the
// OCR increment, and until then the card explains the zero-dependency route of
// using the phone's own text-from-photo and sharing it), and "Build from scratch"
// (a blank editor). Pure DOM builder; deps injected for testability.

import { renderImportPanel, type ImportPanelDeps } from './panel.js';

export type AcquireHubDeps = Pick<
  ImportPanelDeps,
  'acquireFromUrl' | 'acquireFromPaste' | 'onImported' | 'shared'
> & {
  /** Where "Build from scratch" points (a blank draft in the editor). */
  editorHref?: string;
  /** Invoked by "Scan a photo". When omitted, the card shows OS-OCR guidance
   *  instead — the mobile route that needs no in-app OCR dependency. */
  onScanPhoto?: () => void;
  /** True when the hub opened from a share (params present) → the panel
   *  auto-imports and we don't also pre-reveal the paste box. */
  fromShare?: boolean;
};

const el = (tag: string, className?: string, text?: string): HTMLElement => {
  const node = document.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

/** Shown by "Scan a photo" until an in-app OCR handler is wired: the on-device,
 *  zero-dependency route that works today (and handles handwriting best). */
export const OCR_GUIDANCE =
  'Take a photo of the recipe, then use your phone’s “select text” on the image and share that here — or paste it below.';

export const renderAcquireHub = (deps: AcquireHubDeps): HTMLElement => {
  const hub = el('section', 'acquire-hub');
  hub.dataset['testid'] = 'acquire-hub';
  hub.append(el('h2', 'page-title', 'Import a recipe'));
  hub.append(
    el(
      'p',
      'status',
      'Bring a recipe in from anywhere — it lands as a draft you review before publishing. Nothing is posted automatically.',
    ),
  );

  const options = el('div', 'acquire-options');

  const photo = el('button', 'button acquire-option', '📷 Scan a photo') as HTMLButtonElement;
  photo.type = 'button';
  photo.dataset['testid'] = 'acquire-photo';
  const photoNote = el('p', 'status');
  photoNote.hidden = true;
  photoNote.dataset['testid'] = 'acquire-photo-note';
  photo.addEventListener('click', () => {
    if (deps.onScanPhoto !== undefined) {
      deps.onScanPhoto();
      return;
    }
    photoNote.hidden = false;
    photoNote.textContent = OCR_GUIDANCE;
  });

  const scratch = el('a', 'button acquire-option', '✎ Build from scratch') as HTMLAnchorElement;
  scratch.href = deps.editorHref ?? './editor.html';
  scratch.dataset['testid'] = 'acquire-scratch';

  options.append(photo, scratch);
  hub.append(options, photoNote);

  // Paste + "From a link" + share auto-run — the deterministic engine.
  hub.append(
    renderImportPanel({
      acquireFromUrl: deps.acquireFromUrl,
      acquireFromPaste: deps.acquireFromPaste,
      onImported: deps.onImported,
      shared: deps.shared,
      manualUrl: true,
      revealPasteInitially: deps.fromShare !== true,
    }),
  );

  return hub;
};
