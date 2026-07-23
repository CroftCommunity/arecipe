// D5–D8 — the transform. Pure, deterministic, network-free. These targeted
// tests pin the tricky real-world cases; the fixture snapshots (separate file)
// are the regression suite over 30+ real captured pages.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transform } from '../src/transform/transform.ts';
import { serializeIr, irSha256 } from '../src/ir.ts';

const wrap = (body: string) => `{{Recipe summary\n| difficulty = 1\n}}\n${body}`;

// ---- D6 ingredients: link parsing ----

test('pipe trick: [[Cookbook:Carrot|]] renders "Carrot" and refs "Carrot"', () => {
  const ir = transform(wrap('== Ingredients ==\n* [[Cookbook:Carrot|]]\n== Procedure ==\n# Cook.'), 'Cookbook:X');
  const ing = ir.ingredients[0]!;
  assert.equal(ing.display, 'Carrot');
  assert.deepEqual(ing.refs, ['Carrot']);
  assert.equal(ing.optional, false);
  assert.equal(ing.raw, '[[Cookbook:Carrot|]]');
});

test('piped, bare, and non-Cookbook links', () => {
  const ir = transform(
    wrap(
      '== Ingredients ==\n' +
        '* [[Cookbook:Carrot|carrots]]\n' +
        '* [[Cookbook:Onion]]\n' +
        '* [[Water|H2O]] and [[Salt]]\n' +
        '== Procedure ==\n# Mix.',
    ),
    'Cookbook:X',
  );
  assert.deepEqual(ir.ingredients.map((i) => i.display), ['carrots', 'Onion', 'H2O and Salt']);
  assert.deepEqual(ir.ingredients[0]!.refs, ['Carrot']);
  assert.deepEqual(ir.ingredients[1]!.refs, ['Onion']);
  assert.deepEqual(ir.ingredients[2]!.refs, [], 'non-Cookbook links contribute no refs');
});

test('an ingredient line with three Cookbook links resolves three refs', () => {
  const ir = transform(
    wrap(
      '== Ingredients ==\n* [[Cookbook:Sugar|sugar]], [[Cookbook:Honey|honey]], or [[Cookbook:Maple Syrup|syrup]]\n== Procedure ==\n# Go.',
    ),
    'Cookbook:X',
  );
  assert.deepEqual(ir.ingredients[0]!.refs, ['Sugar', 'Honey', 'Maple Syrup']);
});

test('optional detected from leading and trailing markers, not mid-line', () => {
  const ir = transform(
    wrap(
      '== Ingredients ==\n' +
        '* [[Cookbook:Salt|Salt]] (optional)\n' +
        '* Optional: [[Cookbook:Pepper|pepper]]\n' +
        '* [[Cookbook:Oil|Oil]] for optional frying\n' +
        '== Procedure ==\n# Go.',
    ),
    'Cookbook:X',
  );
  assert.equal(ir.ingredients[0]!.optional, true, 'trailing (optional)');
  assert.equal(ir.ingredients[1]!.optional, true, 'leading Optional:');
  assert.equal(ir.ingredients[2]!.optional, false, 'mid-line "optional" is not a marker');
});

// ---- D5 infobox: hints ----

test('servings free text preserved; hint parsed only when unambiguous', () => {
  const mk = (s: string) => transform(`{{Recipe summary\n| servings = ${s}\n}}\n== Ingredients ==\n* [[Cookbook:X|x]]\n== Procedure ==\n# go`, 'Cookbook:X').summary;
  assert.deepEqual(mk('1-2').servingsHint, { min: 1, max: 2 });
  assert.equal(mk('1-2').servings, '1-2');
  assert.deepEqual(mk('4').servingsHint, { min: 4 });
  assert.equal(mk('a lot').servingsHint, undefined);
  assert.equal(mk('').servings, undefined, 'empty param omitted entirely');
});

test('time free text preserved; minutes hint parsed when unambiguous', () => {
  const mk = (s: string) => transform(`{{Recipe summary\n| time = ${s}\n}}\n== Ingredients ==\n* [[Cookbook:X|x]]\n== Procedure ==\n# go`, 'Cookbook:X').summary;
  assert.equal(mk('30 minutes').timeMinutesHint, 30);
  assert.equal(mk('1 hour').timeMinutesHint, 60);
  assert.equal(mk('1 hour 30 minutes').timeMinutesHint, 90);
  assert.equal(mk('overnight').timeMinutesHint, undefined);
  assert.equal(mk('30 minutes').time, '30 minutes');
});

test('difficulty: 1–5 kept; out of range / non-numeric omitted with a parseFlag', () => {
  const mk = (s: string) => transform(`{{Recipe summary\n| difficulty = ${s}\n}}\n== Ingredients ==\n* [[Cookbook:X|x]]\n== Procedure ==\n# go`, 'Cookbook:X');
  assert.equal(mk('3').summary.difficulty, 3);
  assert.equal(mk('6').summary.difficulty, undefined);
  assert.ok(mk('6').parseFlags.some((f) => f.code === 'difficulty-out-of-range'));
  assert.equal(mk('hard').summary.difficulty, undefined);
  assert.ok(mk('hard').parseFlags.some((f) => f.code === 'difficulty-out-of-range'));
});

test('recipesummary alias + case-insensitive name + whitespace-tolerant params', () => {
  const ir = transform('{{recipesummary|CATEGORY = Dessert recipes|Difficulty=2}}\n== Ingredients ==\n* [[Cookbook:X|x]]\n== Procedure ==\n# go', 'Cookbook:X');
  assert.equal(ir.summary.category, 'Dessert recipes');
  assert.equal(ir.summary.difficulty, 2);
});

test('nested template with internal pipes does not break param boundaries', () => {
  const ir = transform(
    '{{Recipe summary| yield = 4 cups ({{convert|1|l|USqt|abbr=on|disp=s}})|difficulty=1}}\n== Ingredients ==\n* [[Cookbook:X|x]]\n== Procedure ==\n# go',
    'Cookbook:X',
  );
  assert.equal(ir.summary.difficulty, 1, 'the param after the nested template still parses');
  assert.match(ir.summary.yield ?? '', /4 cups/);
  assert.ok(ir.parseFlags.some((f) => f.code === 'template-in-value'), 'the stripped template is flagged, not silently dropped');
});

test('infobox image captured as filename only, flagged unresolved (images out of scope)', () => {
  const ir = transform('{{Recipe summary| image = [[File:Nice Cup of Tea.jpg|300px]]|difficulty=1}}\n== Ingredients ==\n* [[Cookbook:X|x]]\n== Procedure ==\n# go', 'Cookbook:X');
  assert.equal(ir.summary.image, 'Nice Cup of Tea.jpg');
  assert.ok(ir.parseFlags.some((f) => f.code === 'image-unresolved'));
});

// ---- D7 procedure + sections ----

test('unusual heading spellings still locate ingredients & procedure', () => {
  for (const h of ['==Ingredient==', '=== Ingredients ===', "== Ingredient's ==", '==  INGREDIENTS  ==']) {
    const ir = transform(`{{Recipe summary|difficulty=1}}\n${h}\n* [[Cookbook:X|x]]\n== Procedure ==\n# go`, 'Cookbook:X');
    assert.equal(ir.ingredients.length, 1, `heading "${h}" should be found`);
  }
});

test('nested procedure sub-lists are preserved as substeps, not flattened', () => {
  const ir = transform(
    '{{Recipe summary|difficulty=1}}\n== Ingredients ==\n* [[Cookbook:X|x]]\n== Procedure ==\n# Make the dough.\n#* Knead well.\n#* Rest 1 hour.\n# Bake.',
    'Cookbook:X',
  );
  assert.equal(ir.procedure.length, 2);
  assert.equal(ir.procedure[0]!.substeps?.length, 2);
  assert.equal(ir.procedure[0]!.substeps?.[0]!.text, 'Knead well.');
  assert.equal(ir.procedure[1]!.text, 'Bake.');
});

test('Notes / Tips / Variations / Warnings captured as named prose blocks', () => {
  const ir = transform(
    '{{Recipe summary|difficulty=1}}\n== Ingredients ==\n* [[Cookbook:X|x]]\n== Procedure ==\n# go\n== Notes, tips, and variations ==\n* Use butter.\n== Warnings ==\nHot oil burns.',
    'Cookbook:X',
  );
  const headings = ir.sections.map((s) => s.heading);
  assert.ok(headings.some((h) => /notes/i.test(h)));
  assert.ok(headings.some((h) => /warning/i.test(h)));
});

test('a table in the procedure is flagged, never silently dropped', () => {
  const ir = transform(
    '{{Recipe summary|difficulty=1}}\n== Ingredients ==\n* [[Cookbook:X|x]]\n== Procedure ==\n# go\n{| class="wikitable"\n|-\n| a || b\n|}',
    'Cookbook:X',
  );
  assert.ok(ir.parseFlags.some((f) => f.code === 'table'));
});

test('category links, ref tags, comments, and nav templates stripped + flagged', () => {
  const ir = transform(
    '{{Recipe summary|difficulty=1}}\n{{nutritionsummary|1|2|3}}\n{{recipe}}\n== Ingredients ==\n* [[Cookbook:X|x]]<ref>a source</ref>\n== Procedure ==\n# go <!-- hidden -->\n[[Category:Easy recipes]]',
    'Cookbook:X',
  );
  assert.ok(!ir.ingredients[0]!.display.includes('ref'), 'ref tag stripped from display');
  assert.ok(!ir.ingredients[0]!.display.includes('source'));
  assert.ok(!serializeIr(ir).includes('Category:Easy recipes'), 'category links removed');
  assert.ok(ir.parseFlags.some((f) => f.code === 'template-stripped' && /nutritionsummary/i.test(f.detail ?? '')));
});

// ---- D8 completeness gate ----

test('completeness gate: needs >=1 ingredient AND >=1 step', () => {
  const bothMissing = transform('{{Recipe summary|difficulty=1}}\nJust prose.', 'Cookbook:X');
  assert.equal(bothMissing.publishable, false);

  const noProc = transform('{{Recipe summary|difficulty=1}}\n== Ingredients ==\n* [[Cookbook:X|x]]', 'Cookbook:X');
  assert.equal(noProc.publishable, false);
  assert.match(noProc.skipReason ?? '', /procedure|step/i);

  const noIng = transform('{{Recipe summary|difficulty=1}}\n== Procedure ==\n# go', 'Cookbook:X');
  assert.equal(noIng.publishable, false);
  assert.match(noIng.skipReason ?? '', /ingredient/i);

  const ok = transform('{{Recipe summary|difficulty=1}}\n== Ingredients ==\n* [[Cookbook:X|x]]\n== Procedure ==\n# go', 'Cookbook:X');
  assert.equal(ok.publishable, true);
  assert.equal(ok.skipReason, undefined);
});

// ---- determinism ----

test('transform is deterministic: same bytes → byte-identical IR', () => {
  const wt = '{{Recipe summary| servings = 2-4|time=25 minutes|difficulty=2}}\n== Ingredients ==\n* [[Cookbook:Egg|eggs]]\n== Procedure ==\n# Whisk.\n# Cook.';
  const a = transform(wt, 'Cookbook:Omelette');
  const b = transform(wt, 'Cookbook:Omelette');
  assert.equal(serializeIr(a), serializeIr(b));
  assert.equal(irSha256(a), irSha256(b));
});

test('title has the Cookbook: prefix stripped', () => {
  const ir = transform('{{Recipe summary|difficulty=1}}\n== Ingredients ==\n* [[Cookbook:X|x]]\n== Procedure ==\n# go', 'Cookbook:Chicken Soup');
  assert.equal(ir.title, 'Chicken Soup');
});
