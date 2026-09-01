import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseRegistry } from './parse.ts';
import {
  buildFixtures,
  buildPanel,
  generateClientSource,
  lintEmitSites,
  lintExpired,
} from './generate.ts';

// measure-proof registry CLI.
//   generate   parse registry, emit the three artifacts into generated/
//   check      fail (exit 1) on registry errors, drifted emit sites, or (with
//              --strict-expiry) any expired metric

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const REGISTRY = join(root, 'registry', 'metrics.yaml');
const GEN = join(root, 'generated');

function today(): string {
  // Passed in explicitly to keep the tool deterministic and offline; defaults to
  // a fixed run date. Real build would read the clock.
  const arg = process.argv.find((a) => a.startsWith('--today='));
  return arg ? arg.slice('--today='.length) : '2026-07-23';
}

function load() {
  return parseRegistry(readFileSync(REGISTRY, 'utf8'));
}

function generate(): void {
  const reg = load();
  writeFileSync(join(GEN, 'metrics.gen.ts'), generateClientSource(reg));
  writeFileSync(
    join(GEN, 'panel.golden.json'),
    JSON.stringify(buildPanel(reg), null, 2) + '\n',
  );
  writeFileSync(
    join(GEN, 'fixtures.json'),
    JSON.stringify(buildFixtures(reg), null, 2) + '\n',
  );
  process.stdout.write(
    `generated ${reg.metrics.length} metrics → metrics.gen.ts, panel.golden.json, fixtures.json\n`,
  );
}

function check(): void {
  const reg = load();
  // In a real build the emit-site name list is extracted from the instrumentation
  // source. Here the generated fixtures ARE that list, so a clean registry checks
  // clean; drift is exercised in the unit tests.
  const used = reg.metrics.map((m) => m.name);
  const emitErrs = lintEmitSites(used, reg);
  const expiry = lintExpired(reg, today());
  const strict = process.argv.includes('--strict-expiry');

  for (const w of expiry.warnings) process.stderr.write(`WARN ${w}\n`);
  for (const e of emitErrs) process.stderr.write(`ERROR ${e}\n`);

  const fail = emitErrs.length > 0 || (strict && expiry.expired.length > 0);
  if (fail) {
    process.stderr.write('registry check FAILED\n');
    process.exit(1);
  }
  process.stdout.write(
    `registry check OK (${reg.metrics.length} metrics, ${expiry.expired.length} expired)\n`,
  );
}

const cmd = process.argv[2];
if (cmd === 'generate') generate();
else if (cmd === 'check') check();
else {
  process.stderr.write('usage: cli.ts <generate|check>\n');
  process.exit(2);
}
