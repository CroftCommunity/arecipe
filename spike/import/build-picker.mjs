// Generate the static image-picker page from catalog.json (NON-PRODUCTION
// ops tooling). Self-contained: the catalog is embedded inline so the page
// works opened directly over file:// (no fetch/CORS). Pick one image per
// recipe (or "none"); Export emits JSON keyed by recipe name with the chosen
// file and its Commons attribution, ready for the upload step.
//
//   node spike/import/build-picker.mjs <dir>   # reads <dir>/catalog.json -> <dir>/index.html
import { readFileSync, writeFileSync } from 'node:fs';

const DIR = process.argv[2];
if (!DIR) throw new Error('usage: node build-picker.mjs <dir> [outfile] [name1,name2,...]');
const OUTFILE = process.argv[3] ?? 'index.html';
const ONLY = process.argv[4] ? new Set(process.argv[4].split(',')) : null;
const all = JSON.parse(readFileSync(`${DIR}/catalog.json`, 'utf8'));
const catalog = ONLY === null ? all : all.filter((c) => ONLY.has(c.name));

const esc = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const withImgs = catalog.filter((c) => c.options.length > 0).length;

const cards = catalog
  .map((rec) => {
    const opts = rec.options
      .map(
        (o, i) => `
        <label class="opt">
          <input type="radio" name="${esc(rec.name)}" value="${esc(o.file)}"
            data-page="${esc(o.pageurl)}" data-license="${esc(o.license)}"
            data-artist="${esc(o.artist)}" data-attr="${o.attributionRequired ? '1' : '0'}">
          <img src="img/${esc(o.file)}" alt="${esc(rec.name)} option ${i + 1}" loading="lazy">
          <span class="meta">
            <span class="lic">${esc(o.license)}</span>
            <span class="artist">${esc(o.artist)}</span>
            <a href="${esc(o.pageurl)}" target="_blank" rel="noopener">Commons ↗</a>
          </span>
        </label>`,
      )
      .join('');
    const none = `
        <label class="opt opt-none">
          <input type="radio" name="${esc(rec.name)}" value="" checked>
          <span class="none-box">skip / none</span>
        </label>`;
    const noImgs = rec.options.length === 0 ? '<p class="warn">No Commons candidates found — search a different term.</p>' : '';
    return `
    <section class="recipe" data-name="${esc(rec.name)}">
      <div class="head">
        <h2>${esc(rec.name)}</h2>
        <span class="badge">${esc(rec.cuisine ?? '')}</span>
        <span class="term">search: “${esc(rec.term)}”</span>
      </div>
      <p class="desc">${esc(rec.text)}</p>
      ${noImgs}
      <div class="opts">${opts}${none}</div>
    </section>`;
  })
  .join('\n');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>arecipe — pick images (${catalog.length})</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 15px/1.5 system-ui, -apple-system, sans-serif; background: #14171a; color: #e7e9ea; }
  header { position: sticky; top: 0; z-index: 5; background: #1b1f24; border-bottom: 1px solid #2b3138;
    padding: 14px 20px; display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
  header h1 { font-size: 17px; margin: 0; font-weight: 650; }
  header .sub { color: #9aa4ad; font-size: 13px; }
  header .spacer { flex: 1; }
  button { font: inherit; font-weight: 600; padding: 8px 16px; border-radius: 8px; border: 1px solid #3a434d;
    background: #2f9e6f; color: #fff; cursor: pointer; }
  button.ghost { background: #232830; color: #e7e9ea; }
  main { padding: 20px; max-width: 1100px; margin: 0 auto; display: grid; gap: 14px; }
  .recipe { background: #1b1f24; border: 1px solid #2b3138; border-radius: 12px; padding: 16px; }
  .head { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
  .head h2 { font-size: 18px; margin: 0; }
  .badge { font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #7fd1aa;
    border: 1px solid #2f9e6f55; padding: 2px 8px; border-radius: 999px; }
  .term { color: #6b747c; font-size: 12px; margin-left: auto; }
  .desc { color: #b6bec6; margin: 8px 0 14px; }
  .warn { color: #e0a458; }
  .opts { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
  .opt { position: relative; display: block; cursor: pointer; border: 2px solid #2b3138; border-radius: 10px;
    overflow: hidden; background: #0f1215; transition: border-color .12s; }
  .opt:hover { border-color: #4a545e; }
  .opt input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
  .opt img { width: 100%; height: 160px; object-fit: cover; display: block; }
  .opt:has(input:checked) { border-color: #2f9e6f; box-shadow: 0 0 0 2px #2f9e6f55; }
  .meta { display: flex; flex-direction: column; gap: 2px; padding: 8px 10px; font-size: 12px; }
  .meta .lic { color: #7fd1aa; font-weight: 600; }
  .meta .artist { color: #9aa4ad; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .opt-none { display: flex; align-items: center; justify-content: center; min-height: 160px; }
  .opt-none .none-box { color: #9aa4ad; }
  dialog { background: #1b1f24; color: #e7e9ea; border: 1px solid #2b3138; border-radius: 12px; width: min(680px, 92vw); }
  dialog textarea { width: 100%; height: 320px; background: #0f1215; color: #e7e9ea; border: 1px solid #2b3138;
    border-radius: 8px; font: 12px/1.4 ui-monospace, monospace; padding: 10px; }
  dialog .row { display: flex; gap: 8px; justify-content: flex-end; margin-top: 10px; }
</style>
</head>
<body>
<header>
  <h1>Pick recipe images</h1>
  <span class="sub">${withImgs}/${catalog.length} recipes have candidates · images from Wikimedia Commons</span>
  <span class="spacer"></span>
  <button id="export">Export choices</button>
</header>
<main>${cards}</main>
<dialog id="dlg">
  <p style="margin:0 0 8px">Your picks (copy this, or Download). Recipes left on “skip” are omitted.</p>
  <textarea id="out" readonly></textarea>
  <div class="row">
    <button class="ghost" id="copy">Copy</button>
    <button class="ghost" id="download">Download JSON</button>
    <button id="close">Close</button>
  </div>
</dialog>
<script>
  const dlg = document.getElementById('dlg');
  const collect = () => {
    const picks = {};
    document.querySelectorAll('.recipe').forEach((r) => {
      const sel = r.querySelector('input:checked');
      if (!sel || !sel.value) return;
      picks[r.dataset.name] = {
        file: sel.value,
        commons: sel.dataset.page,
        license: sel.dataset.license,
        artist: sel.dataset.artist,
        attributionRequired: sel.dataset.attr === '1',
      };
    });
    return picks;
  };
  document.getElementById('export').onclick = () => {
    document.getElementById('out').value = JSON.stringify(collect(), null, 2);
    dlg.showModal();
  };
  document.getElementById('copy').onclick = () => navigator.clipboard.writeText(document.getElementById('out').value);
  document.getElementById('download').onclick = () => {
    const blob = new Blob([document.getElementById('out').value], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'image-choices.json'; a.click();
  };
  document.getElementById('close').onclick = () => dlg.close();
</script>
</body>
</html>`;

writeFileSync(`${DIR}/${OUTFILE}`, html);
console.log(`wrote ${DIR}/${OUTFILE} (${withImgs}/${catalog.length} recipes with candidates)`);
