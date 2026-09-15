// E1 — does a WAITING worker become active across a browser restart, and
// after the last client navigates away? (Assumptions 1, 2.) Persistent
// profile per engine; the served-by stamp is written by whichever worker
// handles the launch navigation, before any page code runs.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ENGINES, startServer, waitFor, report } from './harness.mjs';

const rows = [];
for (const [name, engine] of Object.entries(ENGINES)) {
  const { state, origin, close } = await startServer();
  const dir = mkdtempSync(join(tmpdir(), `rt-e1-${name}-`));
  const row = { engine: name };
  try {
    let ctx = await engine.launchPersistentContext(dir, { headless: true });
    row.version = ctx.browser()?.version() ?? 'persistent';
    let page = await ctx.newPage();
    await page.goto(origin + '/');
    await waitFor(page, (s) => s.controller !== null);
    await page.reload();
    const s1 = await waitFor(page, (s) => s.controllerVersion === 'v1');
    row.step1_controlled_by = s1.controllerVersion; row.step1_servedBy = s1.servedBy;
    // Server-side swap of the SAME URL (a hostile deploy), then the page's own
    // register()/update() finds it.
    state.sw['sw.js'] = 'v2';
    await page.evaluate(() => window.rt.reg.update());
    const s2 = await waitFor(page, (s) => s.waiting !== null);
    row.step2_after_update = { controllerVersion: s2.controllerVersion, waiting: s2.waiting, events: s2.events };
    // (a) navigate away to a DIFFERENT origin and come back (client gone, no bfcache)
    await page.goto('about:blank');
    await page.waitForTimeout(500);
    await page.goto(origin + '/');
    const s3 = await waitFor(page, (s) => s.controllerVersion !== null && s.controllerVersion !== 'timeout');
    row.step3_after_navigate_away_and_back = { servedBy: s3.servedBy, controllerVersion: s3.controllerVersion, waiting: s3.waiting, active: s3.active };
    // Re-arm: swap to v3 so there is again a waiting worker, then RESTART.
    state.sw['sw.js'] = 'v3';
    await page.evaluate(() => window.rt.reg.update());
    const s4 = await waitFor(page, (s) => s.waiting !== null);
    row.step4_waiting_before_restart = { controllerVersion: s4.controllerVersion, waiting: s4.waiting };
    await ctx.close();
    ctx = await engine.launchPersistentContext(dir, { headless: true });
    page = await ctx.newPage();
    await page.goto(origin + '/');
    const s5 = await waitFor(page, (s) => s.controllerVersion !== null && s.controllerVersion !== 'timeout');
    row.step5_after_restart = { servedBy: s5.servedBy, controllerVersion: s5.controllerVersion, waiting: s5.waiting, active: s5.active, events: s5.events };
    await ctx.close();
  } catch (err) {
    row.error = String(err);
  } finally {
    await close();
    rmSync(dir, { recursive: true, force: true });
  }
  rows.push(row);
}
report('E1 restart / navigate-away activates the waiting worker', rows);
