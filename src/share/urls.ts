// Share URL builders (share affordances). Both share targets already exist as
// real, shareable documents — the recipe detail
// (recipe.html?u=<at-uri>[&by=<handle>], per src/pages/recipe.ts) and the
// cookbook cold-view (cookbook.html?did=<did>, per src/pages/cookbook.ts). These
// pure functions turn a page's own params into the canonical link a Share button
// copies. Contract: each identifier is URL-encoded EXACTLY once; `by` rides along
// only when a handle is present; `origin` is passed in (never read from a global)
// so the builders stay pure and unit-testable. `origin` is a base URL with no
// trailing slash — the bare origin for the root deploy, or origin + subpath for a
// preview deploy (e.g. https://arecipe.app/pr-preview/pr-8).

export const buildRecipeShareUrl = (origin: string, atUri: string, handle?: string): string => {
  const base = `${origin}/recipe.html?u=${encodeURIComponent(atUri)}`;
  return handle === undefined || handle === ''
    ? base
    : `${base}&by=${encodeURIComponent(handle)}`;
};

export const buildCookbookShareUrl = (origin: string, did: string): string =>
  `${origin}/cookbook.html?did=${encodeURIComponent(did)}`;
