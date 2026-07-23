// Configuration. Two hard rules from the brief live here:
//   1. The User-Agent contact string has NO default. Wikimedia policy requires a
//      meaningful, contactable UA; the tool refuses to start without it (D1).
//   2. The licence + publish account are config with no baked-in secret. Their
//      absence blocks publish (D9/O2, O4) but never blocks fetch/transform/plan.

export const TOOL_NAME = 'arecipe-wikibooks-sync';
export const TOOL_VERSION = '0.1.0';

/** The current transform semantics version. Bump when the parser changes what
 *  IR it produces from the same wikitext — this is change-axis 2 (D2/D5–D8). */
export const TRANSFORM_VERSION = 1;

export type LicenseConfig = {
  /** exchange.recipe.defs licence token, e.g. "licenseCreativeCommonsBySa". */
  token: string;
  /** Human licence id for the provenance block, e.g. "CC-BY-SA-4.0". */
  id: string;
  /** Attribution string carried on every record. */
  attribution: string;
};

export type Config = {
  /** Contact string embedded in the User-Agent. REQUIRED, no default. */
  contact: string;
  version: string;
  /** MediaWiki Action API endpoint. */
  wikiApiBase: string;
  /** Cookbook namespace id, verified against siteinfo at runtime (never trusted). */
  expectedCookbookNamespaceId: number;
  /** Licence applied to imported records (O2). Absent → publish blocked. */
  license?: LicenseConfig;
  /** Publish target account (O4). Absent fields → publish blocked. */
  publish?: {
    /** PDS handle, e.g. "cookbook.arecipe.app". */
    handle: string;
    /** PDS service base URL, e.g. "https://pds.arecipe.app". */
    service: string;
    /** App password (from env, never committed). */
    appPassword: string;
  };
};

/** The User-Agent string. Shape mandated by D1. */
export const userAgent = (cfg: Pick<Config, 'contact' | 'version'>): string =>
  `${TOOL_NAME}/${cfg.version} (https://arecipe.app; ${cfg.contact})`;

export class MissingContactError extends Error {
  constructor() {
    super(
      'WIKIBOOKS_CONTACT is unset. Wikimedia policy requires a meaningful, ' +
        'contactable User-Agent; the tool refuses to start without one. ' +
        'Set WIKIBOOKS_CONTACT to an email or URL a maintainer can be reached at.',
    );
    this.name = 'MissingContactError';
  }
}

/**
 * O2 answer: Wikimedia's current default text licence (since June 2023) is
 * CC BY-SA 4.0. Older revisions in a page's history remain CC BY-SA 3.0 — a
 * composite the attribution string acknowledges without making a legal claim.
 */
export const DEFAULT_LICENSE: LicenseConfig = {
  token: 'licenseCreativeCommonsBySa',
  id: 'CC-BY-SA-4.0',
  attribution:
    'Wikibooks Cookbook contributors, CC BY-SA 4.0 ' +
    '(older revisions in the page history remain CC BY-SA 3.0)',
};

export type Env = Record<string, string | undefined>;

/**
 * Build a Config from environment + explicit overrides. Throws
 * MissingContactError if no contact is available — the caller is expected to
 * let that propagate, exit non-zero, and write no state (D1).
 */
export const loadConfig = (env: Env, overrides: Partial<Config> = {}): Config => {
  const contact = overrides.contact ?? env.WIKIBOOKS_CONTACT ?? '';
  if (contact.trim() === '') throw new MissingContactError();

  const license =
    overrides.license ??
    (env.WIKIBOOKS_LICENSE_ID !== undefined
      ? {
          token: env.WIKIBOOKS_LICENSE_TOKEN ?? DEFAULT_LICENSE.token,
          id: env.WIKIBOOKS_LICENSE_ID,
          attribution: env.WIKIBOOKS_LICENSE_ATTRIBUTION ?? DEFAULT_LICENSE.attribution,
        }
      : DEFAULT_LICENSE);

  const publishHandle = overrides.publish?.handle ?? env.WIKIBOOKS_PUBLISH_HANDLE;
  const publishService = overrides.publish?.service ?? env.WIKIBOOKS_PUBLISH_SERVICE;
  const publishPassword = overrides.publish?.appPassword ?? env.WIKIBOOKS_PUBLISH_APP_PASSWORD;
  const publish =
    overrides.publish ??
    (publishHandle !== undefined && publishService !== undefined && publishPassword !== undefined
      ? { handle: publishHandle, service: publishService, appPassword: publishPassword }
      : undefined);

  return {
    contact: contact.trim(),
    version: overrides.version ?? TOOL_VERSION,
    wikiApiBase: overrides.wikiApiBase ?? env.WIKIBOOKS_API_BASE ?? 'https://en.wikibooks.org/w/api.php',
    expectedCookbookNamespaceId: overrides.expectedCookbookNamespaceId ?? 102,
    license,
    publish,
  };
};
