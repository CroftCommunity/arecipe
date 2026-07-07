// Recipe editor (Phase 6): editor.html[?draft=<id>]. Draft-before-publish:
// Save draft works for anyone, locally, without a session — publishing is
// the explicit act that needs sign-in and writes to the account's PDS.

import { bootSession } from '../auth/boot.js';
import { mountBuildStamp } from '../build-stamp.js';
import { log } from '../log.js';
import { mountShell } from '../nav.js';
import { createDraftStore } from '../recipes/drafts-local.js';
import {
  buildImagesEmbed,
  prepareImage,
  uploadRecipeImage,
  validateImageInput,
} from '../recipes/images-upload.js';
import { buildRecipeRecord, publishRecipe, type EditorFields } from '../recipes/write.js';
import { registerServiceWorker } from '../sw-register.js';

const el = (tag: string, className?: string, text?: string): HTMLElement => {
  const node = document.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

type FieldEls = {
  name: HTMLInputElement;
  text: HTMLTextAreaElement;
  ingredients: HTMLTextAreaElement;
  instructions: HTMLTextAreaElement;
  prepMinutes: HTMLInputElement;
  totalMinutes: HTMLInputElement;
  recipeYield: HTMLInputElement;
};

const buildForm = (content: HTMLElement): FieldEls => {
  const form = el('form', 'editor') as HTMLFormElement;
  form.addEventListener('submit', (e) => e.preventDefault());

  const labeled = <T extends HTMLElement>(labelText: string, control: T, testid: string): T => {
    const label = el('label', 'editor-field');
    label.append(el('span', 'editor-label', labelText), control);
    control.dataset['testid'] = testid;
    form.append(label);
    return control;
  };

  const name = document.createElement('input');
  name.type = 'text';
  const text = document.createElement('textarea');
  text.rows = 3;
  const ingredients = document.createElement('textarea');
  ingredients.rows = 8;
  ingredients.placeholder = 'one ingredient per line';
  const instructions = document.createElement('textarea');
  instructions.rows = 8;
  instructions.placeholder = 'one step per line';
  const prepMinutes = document.createElement('input');
  prepMinutes.type = 'number';
  prepMinutes.min = '0';
  const totalMinutes = document.createElement('input');
  totalMinutes.type = 'number';
  totalMinutes.min = '0';
  const recipeYield = document.createElement('input');
  recipeYield.type = 'text';

  const fields: FieldEls = {
    name: labeled('Name', name, 'editor-name'),
    text: labeled('Description', text, 'editor-text'),
    ingredients: labeled('Ingredients', ingredients, 'editor-ingredients'),
    instructions: labeled('Instructions', instructions, 'editor-instructions'),
    prepMinutes: labeled('Prep (minutes)', prepMinutes, 'editor-prep'),
    totalMinutes: labeled('Total (minutes)', totalMinutes, 'editor-total'),
    recipeYield: labeled('Servings', recipeYield, 'editor-yield'),
  };
  content.append(form);
  return fields;
};

const readFields = (f: FieldEls): EditorFields => ({
  name: f.name.value,
  text: f.text.value,
  ingredients: f.ingredients.value,
  instructions: f.instructions.value,
  prepMinutes: f.prepMinutes.value === '' ? 0 : Number(f.prepMinutes.value),
  totalMinutes: f.totalMinutes.value === '' ? 0 : Number(f.totalMinutes.value),
  recipeYield: f.recipeYield.value,
});

const fillFields = (f: FieldEls, fields: EditorFields): void => {
  f.name.value = fields.name;
  f.text.value = fields.text;
  f.ingredients.value = fields.ingredients;
  f.instructions.value = fields.instructions;
  f.prepMinutes.value = fields.prepMinutes === undefined || fields.prepMinutes === 0 ? '' : String(fields.prepMinutes);
  f.totalMinutes.value = fields.totalMinutes === undefined || fields.totalMinutes === 0 ? '' : String(fields.totalMinutes);
  f.recipeYield.value = fields.recipeYield ?? '';
};

const main = async (): Promise<void> => {
  const app = document.getElementById('app');
  if (app === null) throw new Error('shell mount point #app missing');

  const content = el('section', 'panel');
  content.append(el('h2', 'page-title', 'New recipe'));
  const fields = buildForm(content);

  // Photo (Phase 7): optional, one image, re-encoded on publish (EXIF gone).
  const photoField = el('label', 'editor-field');
  photoField.append(el('span', 'editor-label', 'Photo (optional)'));
  const photoInput = document.createElement('input');
  photoInput.type = 'file';
  photoInput.accept = 'image/*';
  photoInput.dataset['testid'] = 'editor-photo';
  const photoPreview = document.createElement('img');
  photoPreview.className = 'editor-photo-preview';
  photoPreview.alt = '';
  photoPreview.hidden = true;
  const photoStatus = el('p', 'status');
  photoStatus.dataset['testid'] = 'photo-status';
  photoField.append(photoInput, photoPreview, photoStatus);
  content.append(photoField);
  photoInput.addEventListener('change', () => {
    const file = photoInput.files?.[0];
    photoPreview.hidden = true;
    photoStatus.textContent = '';
    if (file === undefined) return;
    try {
      validateImageInput(file);
      photoPreview.src = URL.createObjectURL(file);
      photoPreview.hidden = false;
      photoStatus.textContent = `${file.name} — will be re-encoded on publish (metadata removed)`;
    } catch (err) {
      photoInput.value = '';
      photoStatus.textContent = err instanceof Error ? err.message : String(err);
    }
  });

  const actions = el('div', 'lookup');
  const saveButton = el('button', 'button', 'Save draft') as HTMLButtonElement;
  saveButton.type = 'button';
  saveButton.dataset['testid'] = 'save-draft';
  const publishButton = el('button', 'button button--primary', 'Publish') as HTMLButtonElement;
  publishButton.type = 'button';
  publishButton.dataset['testid'] = 'publish';
  const status = el('p', 'status');
  status.dataset['testid'] = 'editor-status';
  actions.append(saveButton, publishButton);
  content.append(actions, status);

  mountShell(app, content);
  void mountBuildStamp(app);
  void registerServiceWorker();

  const drafts = createDraftStore();
  let draftId = new URLSearchParams(window.location.search).get('draft') ?? undefined;
  if (draftId !== undefined) {
    const existing = await drafts.get(draftId);
    if (existing !== undefined) fillFields(fields, existing.fields);
    else status.textContent = 'draft not found — starting fresh';
  }

  saveButton.addEventListener('click', () => {
    void drafts
      .save(readFields(fields), draftId)
      .then((draft) => {
        draftId = draft.id;
        // The URL names the draft so a reload resumes it.
        const url = new URL(window.location.href);
        url.searchParams.set('draft', draft.id);
        window.history.replaceState(null, '', url);
        status.textContent = `draft saved ${draft.savedAt}`;
      })
      .catch((err: unknown) => {
        status.textContent = `draft save failed: ${String(err)}`;
      });
  });

  const { agent } = await bootSession();
  if (agent === null) {
    publishButton.disabled = true;
    publishButton.title = 'Sign in (My recipes) to publish — drafts save locally';
    status.textContent = 'not signed in — drafts save locally; publishing needs sign-in';
  } else {
    const boundAgent = agent;
    publishButton.addEventListener('click', () => {
      void (async () => {
        const record = buildRecipeRecord(readFields(fields)); // fail-loud validation
        const file = photoInput.files?.[0];
        if (file !== undefined) {
          status.textContent = 'processing photo…';
          const prepared = await prepareImage(file); // re-encode: EXIF gone
          status.textContent = 'uploading photo…';
          const blobRef = await uploadRecipeImage(boundAgent, prepared);
          record.embed = buildImagesEmbed(blobRef, prepared);
        }
        status.textContent = 'publishing…';
        const { uri } = await publishRecipe(boundAgent, record);
        if (draftId !== undefined) await drafts.remove(draftId);
        status.textContent = `published ${uri}`;
        window.location.href = './mine.html';
      })().catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        log.error('recipes', 'publish failed', { error: message });
        status.textContent = message;
      });
    });
  }
  log.debug('shell', 'mounted', { page: 'editor', signedIn: agent !== null });
};

void main();
