// The Acquire hub (import.html): the "pull a recipe in" surface, separate from
// the "build/edit" surface (the editor). Every path here produces a candidate
// DRAFT and hands off to the same editor — nothing is ever posted automatically.
//
// It composes the import panel (paste + "From a link" + share auto-run) with two
// more 0→1 entries: "Scan a photo" (OCR) and "Build from scratch" (a blank
// editor). OCR is laddered: with an injected engine, a photo is recognized on
// device and the text drops into the paste box for the cook to eyeball before
// importing (OCR is error-prone, especially on handwriting — a human stays in the
// loop); without an engine, the card explains the zero-dependency route of using
// the phone's own text-from-photo and sharing it. Pure DOM builder; deps injected.

import { renderImportPanel, type ImportPanelDeps } from './panel.js';
import { OCR_GUIDANCE, recognizeImage, type OcrEngine } from './ocr.js';
import { log } from '../log.js';

export type AcquireHubDeps = Pick<
  ImportPanelDeps,
  'acquireFromUrl' | 'acquireFromPaste' | 'onImported' | 'shared'
> & {
  /** Where "Build from scratch" points (a blank draft in the editor). */
  editorHref?: string;
  /** In-app OCR engine. When present, "Scan a photo" opens a camera/file picker
   *  and drops the recognized text into the paste box for review. When absent,
   *  the card shows the on-device (OS OCR + share) guidance instead. */
  ocrEngine?: OcrEngine;
};

const el = (tag: string, className?: string, text?: string): HTMLElement => {
  const node = document.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

export const renderAcquireHub = (deps: AcquireHubDeps): HTMLElement => {
  const fromShare = deps.shared.url !== '' || deps.shared.pasteText !== undefined;

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

  // The paste + "From a link" + share engine (built first so "Scan a photo" can
  // drop recognized text into its paste box).
  const panel = renderImportPanel({
    acquireFromUrl: deps.acquireFromUrl,
    acquireFromPaste: deps.acquireFromPaste,
    onImported: deps.onImported,
    shared: deps.shared,
    manualUrl: true,
    revealPasteInitially: !fromShare,
  });

  const options = el('div', 'acquire-options');

  // Scan a photo.
  const photo = el('button', 'button acquire-option', '📷 Scan a photo') as HTMLButtonElement;
  photo.type = 'button';
  photo.dataset['testid'] = 'acquire-photo';
  const photoNote = el('p', 'status');
  photoNote.hidden = true;
  photoNote.dataset['testid'] = 'acquire-photo-note';

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.setAttribute('capture', 'environment'); // prefer the rear camera on a phone
  fileInput.hidden = true;
  fileInput.dataset['testid'] = 'acquire-photo-input';

  const engine = deps.ocrEngine;
  if (engine !== undefined) {
    photo.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (file === undefined || file === null) return;
      void runPhotoOcr(file, engine, panel, photoNote);
    });
  } else {
    photo.addEventListener('click', () => {
      photoNote.hidden = false;
      photoNote.textContent = OCR_GUIDANCE;
    });
  }

  const scratch = el('a', 'button acquire-option', '✎ Build from scratch') as HTMLAnchorElement;
  scratch.href = deps.editorHref ?? './editor.html';
  scratch.dataset['testid'] = 'acquire-scratch';

  options.append(photo, scratch);
  hub.append(options, photoNote);
  if (engine !== undefined) hub.append(fileInput); // the picker only exists with an engine
  hub.append(panel);
  return hub;
};

/** OCR a chosen photo and drop the text into the panel's paste box for review —
 *  the cook confirms/fixes it before importing (OCR is error-prone). Exported for
 *  direct testing of the recognize→fill seam. */
export const runPhotoOcr = async (
  image: Blob,
  engine: OcrEngine,
  panel: HTMLElement,
  note: HTMLElement,
): Promise<void> => {
  note.hidden = false;
  note.textContent = 'Reading the photo…';
  try {
    const text = await recognizeImage(image, engine);
    const pasteBlock = panel.querySelector('[data-testid="import-paste-block"]') as HTMLElement | null;
    const paste = panel.querySelector('[data-testid="import-paste"]') as HTMLTextAreaElement | null;
    if (pasteBlock !== null) pasteBlock.hidden = false;
    if (paste !== null) paste.value = text;
    note.textContent =
      text.trim() === ''
        ? 'Couldn’t read any text from that photo — try a clearer, flatter shot, or paste the text.'
        : 'Read the photo — check the text below, then import.';
  } catch (err) {
    log.warn('import', 'photo OCR failed', { error: String(err) });
    note.textContent = OCR_GUIDANCE;
  }
};
