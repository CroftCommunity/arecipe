// Hand-kept declarations for scripts/version.mjs (node-run .mjs, imported by
// typed vitest specs — tsconfig has no allowJs, so the boundary is declared).
export declare const displayVersion: (now: Date, sha: string) => string;
export declare const versionCodeFrom: (revListCountOutput: string) => number;
export declare const stampTwaVersions: <T extends object>(
  manifest: T,
  versionCode: number,
  versionName: string,
) => T & { appVersionCode: number; appVersion: string };
