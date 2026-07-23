// In-app OCR ("Scan a photo") end-to-end against the REAL self-hosted Tesseract
// engine under import.html's scoped CSP. Hermetic: all assets (worker, WASM core,
// eng.traineddata) are served same-origin from assets/ocr/ — no network. Proves
// the whole path: tap → engine loads on first tap → recognizes an image → drops
// the text into the paste box for review (nothing auto-imports).
import { expect, test } from '@playwright/test';

test('Scan a photo: OCR reads an image into the paste box for review', async ({ page }) => {
  await page.goto('/import.html');

  // A synthetic "photo" of a recipe line, drawn to a canvas (clean, high-contrast
  // — this checks the pipeline, not OCR accuracy on hard handwriting).
  const dataUrl = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 700;
    c.height = 160;
    const ctx = c.getContext('2d');
    if (ctx === null) throw new Error('no 2d context');
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = 'black';
    ctx.font = '52px sans-serif';
    ctx.fillText('2 cups flour', 24, 100);
    return c.toDataURL('image/png');
  });
  const buffer = Buffer.from(dataUrl.split(',')[1] ?? '', 'base64');

  // First tap loads the engine (nothing heavy downloads before this).
  await page.getByTestId('acquire-photo').click();
  // The "Starting the scanner…" note hides once the engine is ready.
  await expect(page.getByTestId('acquire-photo-note')).toBeHidden({ timeout: 60_000 });

  await page.setInputFiles('[data-testid="acquire-photo-input"]', {
    name: 'recipe.png',
    mimeType: 'image/png',
    buffer,
  });

  // Recognized text lands in the paste box for the cook to confirm/fix — it is
  // NOT auto-imported (no navigation to the editor).
  await expect(page.getByTestId('import-paste')).toHaveValue(/cups flour/i, { timeout: 60_000 });
  await expect(page).toHaveURL(/\/import\.html$/);
});
