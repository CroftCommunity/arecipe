// Hand-written declarations for scripts/md-to-html.mjs — build tooling stays
// plain .mjs (Node 22 runs it directly from build.mjs), while the typechecked
// vitest specs import it through these types.
export declare const escapeHtml: (s: string) => string;
export declare const slugify: (text: string) => string;
export declare const mdToHtml: (md: string) => string;
export declare const htmlShell: (options: {
  title: string;
  body: string;
  stylesheets: { href: string; integrity?: string }[];
}) => string;
