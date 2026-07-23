// A stand-in model of the arecipe PWA surface (§11 recommends arecipe as the
// pilot). Pages, the features that live on them, and a weighted transition model
// that a real low-traffic recipe site roughly resembles. This is DECLARED as a
// stand-in in the run summary: real transition probabilities are owner-supplied
// later. It is deterministic and shared by every experiment via the corpus.

export const PAGES = [
  'home',
  'browse',
  'recipe',
  'cookbook',
  'meals',
  'timers',
  'mine',
  'editor',
  'guide',
  'settings',
] as const;
export type Page = (typeof PAGES)[number];

// Coarse geo buckets (region granularity, never lat/long) — used by E3 as a
// singling-out dimension.
export const GEO = ['eu-west', 'eu-north', 'us-east', 'us-west', 'apac'] as const;
export type Geo = (typeof GEO)[number];

// Features declared per page. A feature use is "a functionality was used" plus an
// associated label/destination.
export const FEATURES: Record<Page, { name: string; label: string }[]> = {
  home: [{ name: 'search', label: 'query' }],
  browse: [
    { name: 'search', label: 'query' },
    { name: 'filter', label: 'tag' },
  ],
  recipe: [
    { name: 'cook_focus', label: 'enter' },
    { name: 'share', label: 'link' },
    { name: 'plan_add', label: 'meals' },
    { name: 'timer_start', label: 'step' },
  ],
  cookbook: [{ name: 'open_recipe', label: 'recipe' }],
  meals: [{ name: 'plan_move', label: 'day' }],
  timers: [{ name: 'timer_start', label: 'preset' }],
  mine: [{ name: 'open_recipe', label: 'recipe' }],
  editor: [{ name: 'save', label: 'recipe' }],
  guide: [{ name: 'guide_jump', label: 'section' }],
  settings: [{ name: 'theme_toggle', label: 'mode' }],
};

// Timing metrics declared per page (load / interaction timings, coarse ms).
export const TIMINGS: Record<Page, string[]> = {
  home: ['load_ms'],
  browse: ['load_ms', 'first_result_ms'],
  recipe: ['load_ms'],
  cookbook: ['load_ms'],
  meals: ['load_ms'],
  timers: [],
  mine: ['load_ms'],
  editor: [],
  guide: [],
  settings: [],
};

// Entry-page distribution (where sessions start), integer weights.
export const ENTRY: { page: Page; weight: number }[] = [
  { page: 'home', weight: 40 },
  { page: 'recipe', weight: 30 }, // deep links / shares land straight on a recipe
  { page: 'browse', weight: 15 },
  { page: 'cookbook', weight: 8 },
  { page: 'guide', weight: 4 },
  { page: 'mine', weight: 3 },
];

// Weighted next-page model. Keys are "from" pages; each lists candidate "to"
// pages with integer weights. Some transitions are common (declared as edge
// metrics in the registry); rarer ones exercise E2's `other` bucket.
export const TRANSITIONS: Record<Page, { to: Page; weight: number }[]> = {
  home: [
    { to: 'browse', weight: 40 },
    { to: 'recipe', weight: 25 },
    { to: 'cookbook', weight: 15 },
    { to: 'meals', weight: 8 },
    { to: 'guide', weight: 5 },
    { to: 'settings', weight: 2 },
  ],
  browse: [
    { to: 'recipe', weight: 70 },
    { to: 'browse', weight: 15 },
    { to: 'home', weight: 10 },
    { to: 'cookbook', weight: 5 },
  ],
  recipe: [
    { to: 'timers', weight: 25 },
    { to: 'recipe', weight: 20 },
    { to: 'meals', weight: 18 },
    { to: 'browse', weight: 17 },
    { to: 'cookbook', weight: 10 },
    { to: 'editor', weight: 6 },
    { to: 'home', weight: 4 },
  ],
  cookbook: [
    { to: 'recipe', weight: 75 },
    { to: 'home', weight: 15 },
    { to: 'meals', weight: 10 },
  ],
  meals: [
    { to: 'recipe', weight: 45 },
    { to: 'browse', weight: 25 },
    { to: 'home', weight: 20 },
    { to: 'meals', weight: 10 },
  ],
  timers: [
    { to: 'recipe', weight: 80 },
    { to: 'home', weight: 20 },
  ],
  mine: [
    { to: 'recipe', weight: 60 },
    { to: 'editor', weight: 25 },
    { to: 'home', weight: 15 },
  ],
  editor: [
    { to: 'recipe', weight: 55 },
    { to: 'mine', weight: 30 },
    { to: 'home', weight: 15 },
  ],
  guide: [
    { to: 'home', weight: 50 },
    { to: 'browse', weight: 30 },
    { to: 'recipe', weight: 20 },
  ],
  settings: [
    { to: 'home', weight: 70 },
    { to: 'browse', weight: 30 },
  ],
};
