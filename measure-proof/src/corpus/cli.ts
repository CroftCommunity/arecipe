import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { generateCorpus, serializeCorpus, type Profile } from './generate.ts';

// Materialise a corpus and print a stable fingerprint. Used to pin determinism
// as a golden (findings/corpus-fingerprints.json) and to eyeball population shape.
//   node --experimental-strip-types src/corpus/cli.ts <seed> <profile> [sessions] [--write path]

function main(): void {
  const [seedArg, profileArg, sessionsArg, ...rest] = process.argv.slice(2);
  const seed = Number(seedArg ?? 42);
  const profile = (profileArg ?? 'small') as Profile;
  const sessions = sessionsArg && !sessionsArg.startsWith('--') ? Number(sessionsArg) : undefined;

  const corpus = generateCorpus({ seed, profile, sessions });
  const json = serializeCorpus(corpus);
  const sha = createHash('sha256').update(json).digest('hex').slice(0, 16);

  const writeIdx = rest.indexOf('--write');
  if (writeIdx >= 0 && rest[writeIdx + 1]) {
    writeFileSync(rest[writeIdx + 1]!, json);
  }

  process.stdout.write(
    JSON.stringify(
      {
        seed,
        profile,
        sessions: corpus.meta.sessions,
        devices: corpus.meta.devices,
        bytes: json.length,
        sha256_16: sha,
      },
      null,
      2,
    ) + '\n',
  );
}

main();
