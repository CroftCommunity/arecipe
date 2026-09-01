// The sign-in page's provider registry — croft-pwa/docs/DESIGN.md § Flows › Sign in.
// Ported from the reference implementation (croft-pwa/src/signin/providers.ts).
//
// arecipe has no accounts of its own. Every identity belongs to a server someone
// else runs, and the sign-in page's job is to route you to one — which is why this
// is a list of real providers with visibly different rules rather than a single
// "Sign in with Bluesky" button.
//
// EVERY FACT BELOW WAS PROBED, not inferred (forage 2026-08-26..29; re-probed by
// tests/e2e/providers-live.spec.ts, `npm run test:live`):
//   - signup posture:  com.atproto.server.describeServer -> inviteCodeRequired
//   - OAuth support:   /.well-known/oauth-authorization-server
//   - prompt=create:   advertised in prompt_values_supported
// Wrong first guesses, recorded so they are not repeated: `blacksky.community` is
// not a PDS (the host is `blacksky.app`); `eurosky.tech` / `portal.eurosky.tech`
// are EuroSky's site and portal, the PDS is `eurosky.social`; `mu.social` is a
// Mastodon server; `muni.town` is not a PDS.
import registry from './providers.json' with { type: 'json' };

export const SIGNUP = { OPEN: 'open', INVITE: 'invite' } as const;
export type Signup = (typeof SIGNUP)[keyof typeof SIGNUP];

export type Provider = {
  readonly id: string;
  readonly label: string;
  /** The https origin OAuth starts at when this provider is chosen. */
  readonly entryway: string;
  readonly signups: Signup;
};

/** The owner's word for a home on the open social Atmosphere, glossed verbatim. */
export const ATMO_GLOSS = 'A Personal Data Server provider in the open social Atmosphere';

// The SHAPE: the front page is capped, and everything else reaches the same code
// path through "Another provider", which takes a handle on any atproto host. The
// split between the two panels is POSTURE, not position in the list: featured =
// open signups, other = invite-only. Both derive from one registry so a provider
// cannot fall off both panels by being edited in one place.
export const FEATURED_CAP = 4;

export const featuredProviders = (list: readonly Provider[] = PROVIDERS): readonly Provider[] =>
  list.filter((p) => p.signups === SIGNUP.OPEN).slice(0, FEATURED_CAP);

export const otherProviders = (list: readonly Provider[] = PROVIDERS): readonly Provider[] =>
  list.filter((p) => p.signups === SIGNUP.INVITE);

export const providerById = (id: string, list: readonly Provider[] = PROVIDERS): Provider => {
  const p = list.find((x) => x.id === id);
  if (p === undefined) throw new Error(`unknown provider: ${id} (known: ${list.map((x) => x.id).join(', ')})`);
  return p;
};

// An invite-only provider still ADVERTISES prompt=create — it would just land you
// on a create screen that then demands a code. Posture decides, not capability.
export const canCreateAccount = (p: Provider): boolean => p.signups === SIGNUP.OPEN;

// Bad registry data is silent breakage: a sign-in that lands nowhere, or an
// "invite only" label on a server with open signups. Validate loudly instead.
export const validateProviders = (list: readonly Provider[]): readonly Provider[] => {
  const seen = new Set<string>();
  const postures: readonly string[] = Object.values(SIGNUP);
  for (const p of list) {
    if (!p.id) throw new Error(`provider without an id: ${JSON.stringify(p)}`);
    if (!/^https:\/\//.test(p.entryway)) throw new Error(`provider ${p.id}: entryway must be an https origin (got ${p.entryway})`);
    if (!p.label) throw new Error(`provider ${p.id}: needs a human label`);
    if (!postures.includes(p.signups)) {
      throw new Error(`provider ${p.id}: unknown signup posture '${String(p.signups)}' (expected ${postures.join(' or ')})`);
    }
    if (seen.has(p.entryway)) throw new Error(`two providers share the entryway ${p.entryway} — one server, two ids, is a bug`);
    seen.add(p.entryway);
  }
  return list;
};

// MEMBERSHIP is the owner's: two open providers and one invite-only, chosen for
// reputation rather than for count (2026-08-27); EuroSky added 2026-08-29.
// Validated at import so a bad row fails the first test that touches it.
export const PROVIDERS: readonly Provider[] = validateProviders(
  Object.freeze((registry as { providers: readonly Provider[] }).providers),
);
