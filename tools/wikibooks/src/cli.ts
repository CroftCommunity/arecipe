// D13 — operator surface. Every command is resumable and safe to re-run.
//
//   wbsync discover                enumerate + revision sweep, write the delta plan
//   wbsync fetch                   fetch new and changed only
//   wbsync transform [--reparse]   network-free re-transform of stored raw
//   wbsync plan                    ledger diff -> plan.json, no writes (dry pipeline)
//   wbsync publish --publish       apply the plan
//   wbsync run [--publish]         all of the above, DRY by default
//   wbsync status                  ledger counts, last run, drift summary
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig, MissingContactError } from './config.ts';
import { realClock } from './util/clock.ts';
import { WikiTransport, type FetchLike } from './http/transport.ts';
import { WikiClient } from './http/wiki-client.ts';
import { openLedger, type Ledger } from './ledger/ledger.ts';
import { HttpPdsClient } from './publish/http-pds.ts';
import { assertBlastRadius } from './discover.ts';
import { stageDiscover, stageFetch, stageTransform, stagePlan, executeRun, renderSummary, type RunContext } from './run.ts';
import { rawPageIds } from './fetch.ts';
import { writePlanFiles } from './publish/publish.ts';
import { canonicalJsonPretty } from './util/canonical-json.ts';

const realFetch: FetchLike = (url, init) => fetch(url, { headers: init.headers });

const nowRunId = (): string => new Date().toISOString().replace(/[:.]/g, '-');

type BaseDeps = { ctx: RunContext; ledger: Ledger };

const buildDeps = async (runId: string, wantPublish: boolean): Promise<BaseDeps> => {
  const cfg = loadConfig(process.env);
  const home = process.env.WBSYNC_HOME ?? process.cwd();
  mkdirSync(join(home, 'state'), { recursive: true });
  const ledger = openLedger(join(home, 'state', 'corpus.db'));
  const transport = new WikiTransport(cfg, realFetch, realClock);
  const client = new WikiClient(cfg, transport);

  let pds: HttpPdsClient | undefined;
  if (wantPublish) {
    if (cfg.publish === undefined) {
      throw new Error(
        'publish requested but WIKIBOOKS_PUBLISH_HANDLE / _SERVICE / _APP_PASSWORD are not all set. ' +
          'O4 target is cookbook.arecipe.app; configure the service + app password to publish.',
      );
    }
    pds = await HttpPdsClient.connect(cfg.publish.service, cfg.publish.handle, cfg.publish.appPassword);
  }

  const ctx: RunContext = {
    cfg, ledger, client,
    stateDir: join(home, 'state'),
    rawDir: join(home, 'raw'),
    runDir: join(home, 'runs', runId),
    runId, clock: realClock, pds,
  };
  return { ctx, ledger };
};

const statusReport = (ledger: Ledger): string => {
  const rows = ledger.all();
  const byStatus: Record<string, number> = {};
  for (const r of rows) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
  const last = ledger.lastRun();
  const L: string[] = [];
  L.push(`Ledger: ${rows.length} recipes`);
  for (const [s, n] of Object.entries(byStatus).sort()) L.push(`  ${s}: ${n}`);
  if (last !== undefined) {
    L.push(
      `Last run #${last.id} (${last.mode}) — ${last.wiki_requests} wiki requests, ` +
        `${last.pds_writes} PDS writes, finished ${last.finished ?? 'n/a'}`,
    );
    L.push(`  counts: ${last.counts_json}`);
  } else {
    L.push('No runs recorded yet.');
  }
  return L.join('\n') + '\n';
};

export const main = async (argv: string[]): Promise<number> => {
  const command = argv[0] ?? 'run';
  const flags = new Set(argv.slice(1));
  const publish = flags.has('--publish');
  const reparse = flags.has('--reparse');
  const runId = nowRunId();

  try {
    switch (command) {
      case 'status': {
        const { ledger } = await buildDeps(runId, false);
        process.stdout.write(statusReport(ledger));
        ledger.close();
        return 0;
      }
      case 'discover': {
        const { ctx, ledger } = await buildDeps(runId, false);
        const { discovery, flatness } = await stageDiscover(ctx);
        assertBlastRadius(discovery.vanishedCount, discovery.activeLedgerCount);
        const plan = stagePlan(ctx, discovery);
        writePlanFiles(ctx.runDir, plan);
        process.stdout.write(
          `discover: new ${discovery.newPages.length} · changed ${discovery.changed.length} · ` +
            `unchanged ${discovery.unchanged.length} · decategorised ${discovery.decategorised.length} · ` +
            `deleted ${discovery.deleted.length}\n${flatness.note}\nwiki requests: ${ctx.client.requestCount}\n`,
        );
        ledger.close();
        return 0;
      }
      case 'fetch': {
        const { ctx, ledger } = await buildDeps(runId, false);
        const { discovery } = await stageDiscover(ctx);
        assertBlastRadius(discovery.vanishedCount, discovery.activeLedgerCount);
        const written = await stageFetch(ctx, discovery);
        process.stdout.write(`fetch: ${written} pages written to raw/ · wiki requests ${ctx.client.requestCount}\n`);
        ledger.close();
        return 0;
      }
      case 'transform': {
        const { ctx, ledger } = await buildDeps(runId, false);
        const targets = rawPageIds(ctx.rawDir);
        const { transformed, changed } = stageTransform(ctx, targets);
        const plan = stagePlan(ctx, undefined, changed);
        writePlanFiles(ctx.runDir, plan);
        process.stdout.write(
          `transform${reparse ? ' --reparse' : ''}: ${transformed} transformed, ${changed.length} changed (network off)\n`,
        );
        ledger.close();
        return 0;
      }
      case 'plan': {
        const { ctx, ledger } = await buildDeps(runId, false);
        const summary = await executeRun(ctx, { publish: false, reparse });
        process.stdout.write(renderSummary(summary));
        ledger.close();
        return 0;
      }
      case 'publish': {
        if (!publish) {
          process.stderr.write('refusing to publish without --publish (dry-run is the default)\n');
          return 2;
        }
        const { ctx, ledger } = await buildDeps(runId, true);
        const summary = await executeRun(ctx, { publish: true, reparse });
        process.stdout.write(renderSummary(summary));
        ledger.close();
        return 0;
      }
      case 'run': {
        const { ctx, ledger } = await buildDeps(runId, publish);
        const summary = await executeRun(ctx, { publish, reparse });
        process.stdout.write(renderSummary(summary));
        ledger.close();
        return 0;
      }
      default:
        process.stderr.write(`unknown command: ${command}\n`);
        return 2;
    }
  } catch (err) {
    if (err instanceof MissingContactError) {
      // D1: refuse to start, exit non-zero, write no partial state.
      process.stderr.write(`${err.message}\n`);
      return 1;
    }
    process.stderr.write(`${(err as Error).message}\n`);
    return 1;
  }
};
