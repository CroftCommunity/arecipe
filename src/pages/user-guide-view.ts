// User guide content (user-guide.html). Pure DOM builder — no auth, no network —
// so the copy is unit-tested and the entry point (user-guide.ts) just wraps it
// in the nav shell. Cook-facing help for a stable UI: written to be accurate and
// honest rather than aspirational (the payoff of a UI that isn't moving), in
// the narrative voice of agents.md — prose that explains what a thing is FOR,
// not just where its button sits.
//
// Entries are an ordered list; each gets a TOC anchor. Screenshots live in
// assets/guide/ and are regenerated from staged data by tools/guide-shots.mjs —
// rerun that after a visual change so the guide never shows a UI that no
// longer exists.

const el = (tag: string, className?: string, text?: string): HTMLElement => {
  const node = document.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

type GuideEntry = {
  testid: string;
  title: string;
  /** Short label for the table of contents. */
  toc: string;
  /** Rendered as the entry's build function so an entry can mix prose, lists,
   *  screenshots, and notes. */
  build: (entry: HTMLElement) => void;
};

const ol = (items: (string | Node)[]): HTMLElement => {
  const list = el('ol', 'guide-steps');
  for (const item of items) {
    const li = el('li');
    if (typeof item === 'string') li.textContent = item;
    else li.append(item);
    list.append(li);
  }
  return list;
};

const strong = (lead: string, rest: string): DocumentFragment => {
  const frag = document.createDocumentFragment();
  frag.append(el('strong', undefined, lead), document.createTextNode(rest));
  return frag;
};

/** A paragraph assembled from strings and inline nodes (links, <strong>). */
const p = (...parts: (string | Node)[]): HTMLElement => {
  const node = el('p');
  for (const part of parts) {
    node.append(typeof part === 'string' ? document.createTextNode(part) : part);
  }
  return node;
};

const link = (href: string, text: string): HTMLAnchorElement => {
  const a = el('a', undefined, text) as HTMLAnchorElement;
  a.href = href;
  return a;
};

/** A guide screenshot: fluid (mobile-fit guards 320px), bordered, captioned. */
const shot = (name: string, alt: string, caption: string): HTMLElement => {
  const fig = el('figure', 'guide-shot');
  const img = el('img') as HTMLImageElement;
  img.src = `./assets/guide/${name}.jpg`;
  img.alt = alt;
  img.loading = 'lazy';
  fig.append(img, el('figcaption', undefined, caption));
  return fig;
};

const blueskyEntry: GuideEntry = {
  testid: 'guide-entry-bluesky',
  title: 'First, the shape of the thing: arecipe runs on Bluesky',
  toc: 'Runs on Bluesky',
  build: (entry) => {
    entry.append(
      p(
        'arecipe has no server of its own. When you sign in, you sign in with a ',
        'Bluesky account — because Bluesky is built on an open network (the AT ',
        'Protocol) where every account comes with its own small, public data ',
        'store. Everything you publish through arecipe — recipes, likes, ',
        'comments, published meal plans — is saved there, in your account, not ',
        'on some arecipe database. That has three consequences worth knowing.',
      ),
      p(
        strong(
          'Your recipes stay yours. ',
          'They live with your account, so if arecipe vanished tomorrow, your ' +
            'recipes wouldn’t. Any other app on the network can read them, and ' +
            'you can take them anywhere.',
        ),
      ),
      p(
        strong(
          'Published means public. ',
          'The network’s data stores are world-readable by design. Publish a ' +
            'recipe, like one, comment on one — anyone can see it. Drafts and ' +
            'everything you do signed out stay in your browser only.',
        ),
      ),
      p(
        strong('Your password never touches arecipe. ', 'Signing in bounces you to your '),
        'own account’s sign-in page and back; arecipe only ever receives ',
        'permission, never credentials. Don’t have a Bluesky account? Browsing, ',
        'drafting, and meal planning all work without one — an account is only ',
        'needed to publish and to sync across devices. (A fuller “Why Bluesky?” ',
        'page is planned; this is the short version.)',
      ),
    );
  },
};

const browseEntry: GuideEntry = {
  testid: 'guide-entry-browse',
  title: 'Browse: the open shelf',
  toc: 'Browse',
  build: (entry) => {
    entry.append(
      p(
        'Browse is the front page, and it needs no account: a feed of recipes ',
        'read straight from cooks’ own accounts. Out of the box it shows the ',
        'starter pack — a few cooks we curate to keep the shelf stocked — plus ',
        'any cooks you’ve added yourself. (You can turn starter cooks off one ',
        'by one in ',
        link('./settings.html', 'Settings'),
        '.)',
      ),
      shot(
        'browse',
        'The Browse feed on a phone: search box, + Cook button, Tiles/Details toggle, and recipe cards with photos',
        'Browse, signed out — the feed is yours before you have an account.',
      ),
      p(
        'The search box reaches inside the recipes: type “feta” and you’ll get ',
        'every recipe that lists it in the ingredients, not just ones with it in ',
        'the title — close-enough spellings work too. Tiles and Details are two ',
        'views of the same feed; tap any card to open the recipe. When a cook ',
        'has published several versions of one dish, they collapse into a ',
        'single card with a “versions” badge that opens a side-by-side compare. ',
        'The ↑ button exports whatever the feed is currently showing to a file.',
      ),
    );
  },
};

const addCookEntry: GuideEntry = {
  testid: 'guide-entry-add-cook',
  title: 'Adding a cook',
  toc: 'Add a cook',
  build: (entry) => {
    entry.append(
      p(
        'The feed is a shelf you curate. Tap ',
        el('strong', undefined, '+ Cook'),
        ' on Browse and start typing a handle — suggestions appear as you type. ',
        'Pick one and you get a preview of just that cook’s recipes; if you like ',
        'what you see, tap ',
        el('strong', undefined, 'Follow'),
        ' and their recipes join your feed from then on. ',
        '“← Feed” takes you back without following.',
      ),
      p(
        'Honesty about where that list lives: follows made on Browse are kept ',
        'on this device. Sign in and the ',
        link('./account.html', 'Account page'),
        ' can publish them to your account — after that, any device you sign ',
        'in on picks up the same cooks, and each row there has an Unfollow.',
      ),
    );
  },
};

const filtersEntry: GuideEntry = {
  testid: 'guide-entry-filters',
  title: 'Filtering — and your standing tastes',
  toc: 'Filters & tastes',
  build: (entry) => {
    entry.append(
      p(
        'Two kinds of narrowing, deliberately separate. The ',
        el('strong', undefined, 'Filters ▾'),
        ' popover holds the in-the-moment kind: photos only, meal (breakfast, ',
        'dinner…), cuisine. The count stays honest while you filter — “2 of 4 ',
        'recipes” means two shown, four on the shelf — and one reset tap brings ',
        'everything back.',
      ),
      shot(
        'filters',
        'The Filters popover open over the Browse feed, with Photos only, Meal and Cuisine checkboxes and “dinner” ticked',
        'The Filters popover: the count outside stays honest — “2/4”.',
      ),
      p(
        'The standing kind lives in the ',
        link('./account.html#diet-preference', 'Taste section of your Account page'),
        ' and applies everywhere, signed in or out. ',
        el('strong', undefined, '“Only show me”'),
        ' is your dietary line — vegetarian, vegan, gluten-free, dairy-free, ',
        'low-carb — and ',
        el('strong', undefined, '“Never show me”'),
        ' is for the meals and cuisines you simply don’t want. Recipes that ',
        'fall outside them are quietly hidden app-wide — Browse, the meal ',
        'planner’s palette, all of it — not flagged or badged. The counts and ',
        'filter options reflect what’s left, so the app never dangles a filter ',
        'that could only come up empty.',
      ),
    );
  },
};

const cookbookEntry: GuideEntry = {
  testid: 'guide-entry-cookbook',
  title: 'Your Cookbook — and handing someone the whole thing',
  toc: 'Cookbook',
  build: (entry) => {
    entry.append(
      p(
        'The Cookbook tab is your collection: the recipes you’ve published and ',
        'the ones you’ve ',
        el('strong', undefined, 'Liked'),
        ' (tap the heart on any recipe to collect it). The Mine / Liked / Both ',
        'switch picks the slice; New Recipe starts a fresh one in the editor.',
      ),
      shot(
        'cookbook',
        'A shared cookbook viewed without signing in: a banner reads “Viewing arecipe.bsky.social’s shared cookbook” above the recipe list',
        'A shared cookbook, opened cold — no account needed to read it.',
      ),
      p(
        'The share icon beside the “Cookbook” heading is the big one: it hands ',
        'over your ',
        el('strong', undefined, 'entire cookbook as a single link'),
        '. Anyone who opens it sees your recipes and your likes — readable in ',
        'any browser, no account, because it’s all public records read straight ',
        'from your data store. It’s the closest thing arecipe has to lending ',
        'someone the family recipe box.',
      ),
    );
  },
};

const openRecipeEntry: GuideEntry = {
  testid: 'guide-entry-open-recipe',
  title: 'Opening a recipe',
  toc: 'Open a recipe',
  build: (entry) => {
    entry.append(
      p(
        'A recipe is a real page with its own address — every one can be linked, ',
        'bookmarked, and shared. Top to bottom: the photo (with the ',
        'photographer’s credit on it, when the image carries one), the title, a ',
        'time chip, the description, then ingredients and steps — each with a ⧉ ',
        'button that copies the list. The share icon beside the title opens ',
        'your phone’s share sheet, or copies the link on a desktop.',
      ),
      shot(
        'recipe',
        'A recipe page: photo with credit overlay, Reference and Focus buttons, title with share icon, time chip, description, and ingredients list',
        'A recipe page — photo credit, focus + reference buttons, share icon by the title.',
      ),
      p(
        'The quiet line at the bottom — “as published by … · fingerprint ',
        'matches” — is arecipe checking the copy you’re reading against what ',
        'the author actually published. Because there’s no server in the ',
        'middle, the app verifies each record itself; a copy that doesn’t match ',
        'gets a rust “ALTERED?” stamp instead of a quiet pass. You’ll likely ',
        'never see one — but that’s the machinery that makes a shared link ',
        'trustworthy.',
      ),
    );
  },
};

const focusEntry: GuideEntry = {
  testid: 'guide-entry-focus',
  title: 'Focus mode: the propped-up-phone view',
  toc: 'Focus mode',
  build: (entry) => {
    entry.append(
      p(
        'The ',
        el('strong', undefined, '⛶ Focus'),
        ' button under the photo strips the page down to what you need at the ',
        'counter: title, photo, ingredients, steps — larger type, nothing else. ',
        'It’s for the phone propped against the flour jar and read at arm’s ',
        'length, mid-recipe, with wet hands. Tap ',
        el('strong', undefined, '✕ Exit focus'),
        ' (or press Esc) to come back.',
      ),
      shot(
        'focus',
        'Focus mode: just the recipe title, photo, ingredients and instructions in large type on a plain background',
        'Focus mode — the whole recipe, larger, and nothing else.',
      ),
    );
  },
};

const referenceEntry: GuideEntry = {
  testid: 'guide-entry-reference',
  title: 'The little open book',
  toc: 'Reference icon',
  build: (entry) => {
    entry.append(
      p(
        'Next to the Focus button sits an open-book icon. It opens ',
        link('./reference.html', 'Kitchen References'),
        ' — the conversion charts you’d once have taped inside a cupboard door: ',
        'weights and measures, ingredient substitutions, can sizes, and roasting ',
        'charts for meat and poultry. It’s a static page that works offline and ',
        'needs no account, and each section has its own # link if you want to ',
        'send someone straight to, say, the substitutions.',
      ),
      shot(
        'reference',
        'The Kitchen References page: a Weights & Measures table of teaspoon, tablespoon and cup equivalents',
        'Kitchen References — conversions, substitutions, can sizes, roasting charts.',
      ),
    );
  },
};

const funFactsEntry: GuideEntry = {
  testid: 'guide-entry-funfacts',
  title: '“Did you know?” fun facts',
  toc: 'Fun facts',
  build: (entry) => {
    entry.append(
      p(
        'Some recipes carry a small fact or two — the kind of thing a cook ',
        'mentions while you both wait for the water to boil. They show up in a ',
        '“Did you know?” box under the recipe (and pooled across versions on a ',
        'dish’s compare page), with a Next button when there’s more than one.',
      ),
      p(
        'They’re on by default. If they’re not your thing, untick ',
        el('strong', undefined, '“Include fun facts”'),
        ' in the Social section of ',
        link('./settings.html', 'Settings'),
        ' and they disappear everywhere.',
      ),
    );
  },
};

const hideEntry: GuideEntry = {
  testid: 'guide-entry-hide',
  title: 'Hiding a recipe',
  toc: 'Hide a recipe',
  build: (entry) => {
    entry.append(
      p(
        'Your feed, your call. If a recipe you never want to see again keeps ',
        'appearing, open it and use ',
        el('strong', undefined, 'Hide'),
        ' in the footer (it asks you to confirm). The recipe drops out of your ',
        'feeds — Browse, search, everywhere — but nothing happens to the ',
        'author’s copy: hiding is kept on this device and affects only what ',
        'you see.',
      ),
      p(
        'Changed your mind? The same spot on the recipe shows ',
        el('strong', undefined, 'Unhide'),
        ', and ',
        link('./settings.html', 'Settings'),
        ' keeps a “Hidden recipes” list so nothing hidden is ever lost — one ',
        'tap there restores any of them.',
      ),
    );
  },
};

const commentsEntry: GuideEntry = {
  testid: 'guide-entry-comments',
  title: 'Comments',
  toc: 'Comments',
  build: (entry) => {
    entry.append(
      p(
        'Every recipe has a comment thread — tips, substitutions that worked, ',
        '“made this for Sunday dinner” notes. Sign in to post or reply; a ',
        'comment you write is a public record saved in your account, like ',
        'everything else here.',
      ),
      shot(
        'comments',
        'A recipe’s comment thread showing one comment from the author and a “Sign in on Alchemy to join the conversation” note',
        'Comments under a recipe, read without an account.',
      ),
      p(
        'A word on scope, because it’s different from big social apps: with no ',
        'central server there is no all-seeing comment index. You see comments ',
        'from the recipe’s author and from the cooks in your own cookbook — ',
        'the people you’ve chosen — not from the entire internet. And if you’d ',
        'rather cook in silence, “Hide comments” in Settings → Social turns the ',
        'whole section off.',
      ),
    );
  },
};

const shareEntry: GuideEntry = {
  testid: 'guide-entry-share',
  title: 'Import a recipe by sharing it to arecipe',
  toc: 'Import by sharing',
  build: (entry) => {
    entry.append(
      el(
        'p',
        undefined,
        'On your phone, send a recipe you found on the web into arecipe from your ' +
          'browser’s Share button. arecipe turns it into a draft you can review, ' +
          'tidy up, and publish. This is a phone feature — because there’s no ' +
          'server, arecipe can only read a recipe two ways, and both start with Share.',
      ),
      ol([
        strong(
          'Install arecipe first. ',
          'Add arecipe to your home screen (“Add to Home Screen” / “Install app”). ' +
            'The share option only appears for the installed app, on Android/Chromium ' +
            'browsers. (iPhone Safari doesn’t support this yet.)',
        ),
        strong(
          'Best result — share the recipe text. ',
          'On the recipe page, select the ingredients and steps, then tap Share and ' +
            'choose arecipe. Selected text is read directly on your device — arecipe ' +
            'never fetches the site — so it works even on sites that block apps from ' +
            'reading them.',
        ),
        strong(
          'Or share the whole page. ',
          'Use the page’s Share button and pick arecipe. arecipe tries to read the ' +
            'link, but most recipe sites block that, so you’ll get a box to paste the ' +
            'page or the recipe text instead — same result, one extra step.',
        ),
        strong(
          'Review, then publish. ',
          'arecipe opens the draft in the editor, already filled in, with the source ' +
            'link attached. Nothing is published until you tap Publish — it’s yours to ' +
            'edit first. If a part couldn’t be read it’s left blank rather than guessed.',
        ),
      ]),
    );
    const etiquette = el(
      'p',
      'status',
      'A note on etiquette: an imported recipe is a starting point. Before you ' +
        'publish, consider rewriting the steps in your own words and crediting the ' +
        'source (the link is kept for you).',
    );
    entry.append(etiquette);
  },
};

const mealsEntry: GuideEntry = {
  testid: 'guide-entry-meals',
  title: 'Meals: planning your weeks',
  toc: 'Meal planner',
  build: (entry) => {
    entry.append(
      p(
        'The Meals tab pairs a palette of recipes with a week of days. The ',
        'palette draws from ',
        el('strong', undefined, 'My Cookbook'),
        ' or ',
        el('strong', undefined, 'Browse'),
        ' — and placing is tap-first: tap a recipe, then tap a day. (On a ',
        'desktop you can drag instead, including moving a placed meal between ',
        'days.) A day holds several meals, up to the “Recipes per day” cap you ',
        'set, and each meal is labeled by its recipe’s own type — breakfast, ',
        'dinner — so the week reads like a menu.',
      ),
      shot(
        'meals',
        'The Meals planner: a recipe palette above a Week 1 row of day columns with placed meals, and a dated calendar below',
        'A planned week — palette on top, days below, real dates once anchored.',
      ),
      p(
        strong('Weeks are the working unit. ', '+ Add appends a blank week (up to six), and '),
        '⧉ Repeat doubles the plan — every planned week, meals included — which ',
        'is how a fortnight’s rotation becomes a month in one tap. Set ',
        '“Starts (first Monday)” and the whole plan snaps to real dates, with a ',
        'calendar underneath showing it day by day.',
      ),
      p(
        'All of this works signed out — the plan simply lives in your browser. ',
        'Signed in, your working plan also follows your account, so it’s ',
        'waiting for you on the next device.',
      ),
    );
  },
};

const mealPublishEntry: GuideEntry = {
  testid: 'guide-entry-meal-publish',
  title: 'Publishing a plan',
  toc: 'Publish a plan',
  build: (entry) => {
    entry.append(
      p(
        el('strong', undefined, 'Publish'),
        ' turns the working plan into a share link. Anyone who opens it — ',
        'account or not — sees a clean, read-only calendar of the plan, every ',
        'meal linking to its recipe. Like everything published, the plan ',
        'becomes a public record in your account; the link works as long as ',
        'the record exists.',
      ),
      p(
        'The ',
        el('strong', undefined, 'Published'),
        ' page lists your published plans: edit one (changes stay private ',
        'until you publish again, and the share link survives the update) or ',
        'delete it. By default the planner starts you on a fresh plan after ',
        'publishing, so later tinkering never silently rewrites a link you’ve ',
        'already sent to the family.',
      ),
      p(
        'For the ambitious: published plans can also feed a subscribable ',
        'calendar — your meal plan appearing in Google Calendar and friends. ',
        'It takes some one-time setup; the ',
        link('./calendar-setup.html', 'calendar setup page'),
        ' walks through it.',
      ),
    );
  },
};

const shoppingEntry: GuideEntry = {
  testid: 'guide-entry-shopping',
  title: 'Shopping lists',
  toc: 'Shopping lists',
  build: (entry) => {
    entry.append(
      p(
        'The 🛒 button — on your planner and on any shared plan — turns ',
        'scheduled meals into a shopping list. Pick the range (dates on a dated ',
        'plan, week numbers otherwise) and read it two ways: ',
        el('strong', undefined, 'By recipe'),
        ', each recipe’s ingredients as written, with amounts scaled when a ',
        'recipe is scheduled twice; or ',
        el('strong', undefined, 'Combined'),
        ', everything rolled into one list with quantities summed.',
      ),
      shot(
        'shopping',
        'The shopping list panel on the Combined tab: date range pickers, By recipe / Combined tabs, and an aggregated ingredient list',
        'The Combined view — one list for the week, quantities summed.',
      ),
      p(
        'The aggregation is deliberately cautious: it never guesses. Metric and ',
        'imperial amounts are never converted into each other, a line the ',
        'parser can’t confidently combine is flagged (⚑) or kept verbatim ',
        'under “As listed”, and a recipe whose ingredients can’t be fetched is ',
        'named rather than silently dropped. Copy the list or download it as a ',
        'file and take it to the shop.',
      ),
    );
  },
};

/** Ordered guide entries: the Bluesky explainer leads, then Browse-to-Meals in
 *  the order a new cook meets them. Append future topics here. */
export const GUIDE_ENTRIES: GuideEntry[] = [
  blueskyEntry,
  browseEntry,
  addCookEntry,
  filtersEntry,
  cookbookEntry,
  openRecipeEntry,
  focusEntry,
  referenceEntry,
  funFactsEntry,
  hideEntry,
  commentsEntry,
  shareEntry,
  mealsEntry,
  mealPublishEntry,
  shoppingEntry,
];

export const renderUserGuide = (): HTMLElement => {
  const content = el('section', 'panel');
  content.append(el('h2', 'page-title', 'User guide'));
  const title = content.querySelector('.page-title') as HTMLElement;
  title.dataset['testid'] = 'user-guide-title';
  content.append(
    el(
      'p',
      'status',
      'How to get the most out of arecipe — what each page is for, and how the ' +
        'pieces fit together.',
    ),
  );

  const toc = el('nav', 'guide-toc');
  toc.dataset['testid'] = 'guide-toc';
  toc.setAttribute('aria-label', 'Guide topics');
  const tocList = el('ul');
  for (const entry of GUIDE_ENTRIES) {
    const li = el('li');
    li.append(link(`#${entry.testid}`, entry.toc));
    tocList.append(li);
  }
  toc.append(tocList);
  content.append(toc);

  for (const entry of GUIDE_ENTRIES) {
    const box = el('section', 'guide-entry');
    box.dataset['testid'] = entry.testid;
    box.id = entry.testid;
    box.append(el('h3', 'section-title', entry.title));
    entry.build(box);
    content.append(box);
  }
  return content;
};
