// Stamp derived versions into a COPY of twa-manifest.json (plan
// 2026-07-18-1 D4). Usage: node scripts/stamp-twa-version.mjs <output-path>
// Reads the committed twa-manifest.json (never rewritten), derives
//   versionCode = git rev-list --count HEAD   (monotonic on ff-only main)
//   versionName = the date-sha display version (same function as the web
//                 build, so app and site report one version)
// and writes the stamped manifest to <output-path> for the Android build.
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { displayVersion, stampTwaVersions, versionCodeFrom } from './version.mjs';

const target = process.argv[2];
if (target === undefined) {
  console.error('usage: node scripts/stamp-twa-version.mjs <output-path>');
  process.exit(1);
}

const manifest = JSON.parse(readFileSync('twa-manifest.json', 'utf8'));
const versionCode = versionCodeFrom(
  execSync('git rev-list --count HEAD', { encoding: 'utf8' }),
);
const sha = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
const versionName = displayVersion(new Date(), sha);

writeFileSync(target, `${JSON.stringify(stampTwaVersions(manifest, versionCode, versionName), null, 2)}\n`);
console.log(`stamped ${target}: versionCode=${versionCode} versionName=${versionName}`);
