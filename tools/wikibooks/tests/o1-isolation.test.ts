// O1 isolation guard. The owner chose `tools/wikibooks/` inside arecipe over a
// separate repo (RUN-WIKIBOOKS-CORPUS §1). The spec makes that conditional on a
// hard test that the tool's dependencies can never reach arecipe's `src/`, and
// that the arecipe bundle (scripts/build.mjs) is unaffected. This is that test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve, sep } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const toolRoot = resolve(here, '..');
const arecipeRoot = resolve(toolRoot, '..', '..');

const walk = (dir: string): string[] => {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
};

const IMPORT_RE = /(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]/g;

const specifiersOf = (source: string): string[] => {
  const specs: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = IMPORT_RE.exec(source)) !== null) {
    const spec = m[1] ?? m[2];
    if (spec !== undefined) specs.push(spec);
  }
  return specs;
};

test('every import in the tool is a node: builtin or stays inside the tool dir', () => {
  const files = [...walk(join(toolRoot, 'src')), ...walk(join(toolRoot, 'bin')), ...walk(join(toolRoot, 'tests'))];
  assert.ok(files.length > 0, 'expected some .ts files');
  for (const file of files) {
    for (const spec of specifiersOf(readFileSync(file, 'utf8'))) {
      if (spec.startsWith('node:')) continue; // Node builtin — allowed
      assert.ok(
        spec.startsWith('.') || spec.startsWith('/'),
        `${relative(arecipeRoot, file)} imports third-party module "${spec}" — the tool must have zero runtime deps (Node builtins only)`,
      );
      const resolved = resolve(dirname(file), spec);
      const rel = relative(toolRoot, resolved);
      assert.ok(
        !rel.startsWith('..' + sep) && rel !== '..',
        `${relative(arecipeRoot, file)} imports "${spec}" which escapes the tool dir into arecipe — forbidden`,
      );
    }
  }
});

test('the tool declares zero runtime dependencies', () => {
  const pkg = JSON.parse(readFileSync(join(toolRoot, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>;
  };
  assert.deepEqual(pkg.dependencies ?? {}, {}, 'tool must have no runtime dependencies');
});

test('arecipe scripts/build.mjs never references tools/ — the bundle excludes the tool', () => {
  // build.mjs bundles a fixed allowlist of src/pages/*.ts entry points. It has no
  // knowledge of tools/, so dist/ is byte-identical whether or not the tool exists.
  const build = readFileSync(join(arecipeRoot, 'scripts', 'build.mjs'), 'utf8');
  assert.ok(!/\btools\//.test(build), 'build.mjs must not reference tools/');
});

test('no file in arecipe src/ imports from tools/', () => {
  const srcFiles = walk(join(arecipeRoot, 'src'));
  for (const file of srcFiles) {
    for (const spec of specifiersOf(readFileSync(file, 'utf8'))) {
      assert.ok(!spec.includes('tools/'), `${relative(arecipeRoot, file)} imports from tools/ — forbidden`);
    }
  }
});
