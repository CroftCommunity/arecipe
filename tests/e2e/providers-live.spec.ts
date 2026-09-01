// @live: do the registered providers still exist, still speak OAuth, and still
// have the signup posture we claim? (croft-pwa/docs/DESIGN.md § Flows › Sign in.)
// The registry is hardcoded on purpose — the page paints synchronously, and
// probing four third-party servers on every load to avoid drift would be a bad
// trade. The drift lives here instead; hardcoded facts about someone else's
// service rot silently. `npm run test:live`, never in push CI. No credentials.
import { expect, test } from '@playwright/test';
import { PROVIDERS, SIGNUP } from '../../src/auth/providers.js';

for (const p of PROVIDERS) {
  test(`@live ${p.id}: ${p.entryway} still matches the registry`, async ({ request }) => {
    const desc = await request.get(`${p.entryway}/xrpc/com.atproto.server.describeServer`, { timeout: 15_000 });
    // A host that is DOWN and a host that CHANGED are different findings.
    test.skip(!desc.ok(), `${p.id} unreachable (describeServer ${desc.status()}) — not our regression`);
    const d = (await desc.json()) as { inviteCodeRequired?: boolean };
    const posture = d.inviteCodeRequired === true ? SIGNUP.INVITE : SIGNUP.OPEN;
    expect(posture, `${p.id}: we say '${p.signups}', the server says '${posture}' — update src/auth/providers.json`).toBe(p.signups);

    const oauth = await request.get(`${p.entryway}/.well-known/oauth-authorization-server`, { timeout: 15_000 });
    expect(oauth.ok(), `${p.id}: no oauth-authorization-server (${oauth.status()})`).toBe(true);
    const meta = (await oauth.json()) as { prompt_values_supported?: string[]; scopes_supported?: string[] };
    expect(meta.prompt_values_supported ?? [], `${p.id}: no longer advertises prompt=create`).toContain('create');
    expect(meta.scopes_supported ?? [], `${p.id}: dropped transition:generic`).toContain('transition:generic');

    const pr = await request.get(`${p.entryway}/.well-known/oauth-protected-resource`, { timeout: 15_000 });
    if (pr.ok()) {
      const servers = ((await pr.json()) as { authorization_servers?: string[] }).authorization_servers ?? [];
      expect(servers.map((s) => s.replace(/\/+$/, '')), `${p.id}: authorization server moved off the entryway`).toContain(p.entryway);
    }
  });
}
