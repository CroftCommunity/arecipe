#!/usr/bin/env -S node --experimental-strip-types
// wbsync entrypoint. Run with: node --experimental-strip-types bin/wbsync.ts <cmd>
import { main } from '../src/cli.ts';

main(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((err) => {
    process.stderr.write(`fatal: ${(err as Error).stack ?? String(err)}\n`);
    process.exit(1);
  });
