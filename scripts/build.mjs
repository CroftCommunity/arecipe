// Build: bundle app + SW, copy the shell, and emit dist/build-info.json so
// the running app can show which build it is and how big (see
// src/build-stamp.ts). Version = UTC date + short git SHA.
import { execSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { buildSync } from 'esbuild';

mkdirSync('dist', { recursive: true });
buildSync({
  entryPoints: ['src/main.ts'],
  bundle: true,
  minify: true,
  format: 'esm',
  outfile: 'dist/main.js',
});
buildSync({ entryPoints: ['src/sw.ts'], bundle: true, minify: true, outfile: 'dist/sw.js' });
copyFileSync('index.html', 'dist/index.html');

const sha = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
const now = new Date();
const date = now.toISOString().slice(0, 10).replaceAll('-', '.');
const main = readFileSync('dist/main.js');
const info = {
  version: `${date}-${sha}`,
  builtAt: now.toISOString(),
  mainBytes: main.length,
  mainGzipBytes: gzipSync(main).length,
};
writeFileSync('dist/build-info.json', JSON.stringify(info));
console.log(`built ${info.version}: main.js ${info.mainBytes} B (${info.mainGzipBytes} B gz)`);
