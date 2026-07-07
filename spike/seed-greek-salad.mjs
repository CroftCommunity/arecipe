// Seeding script (NON-PRODUCTION, ops tooling): publish the first recipe to
// the official application account (arecipe.bsky.social). Field formats
// follow observed wild records (see tests/fixtures + plan Phase 5e/6 notes):
// plain-word category, token-ref cookingMethod, attributionWebsite with
// source URL. Description text is OUR OWN words; ingredients/method are
// facts, lightly rephrased; the source is credited via attribution.
// Reads credentials from the gitignored .env. Never prints secrets.
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => l.split(/=(.*)/s).slice(0, 2)),
);

const HANDLE = env.BSKY_ARECIPE_HANDLE;
const PASSWORD = env.BSKY_ARECIPE_PASSWORD;
if (!HANDLE || !PASSWORD) {
  console.error('BSKY_ARECIPE_HANDLE / BSKY_ARECIPE_PASSWORD missing from .env');
  process.exit(1);
}

const now = new Date().toISOString();
const record = {
  $type: 'exchange.recipe.recipe',
  name: 'Greek Cucumber Tomato Feta Salad',
  text:
    'A bright summer side: crisp cucumber, sweet cherry tomatoes, and salty feta ' +
    'tossed with parsley in a garlicky oregano and red-wine vinaigrette. Ready in ' +
    'minutes, better after a rest in the fridge, and it keeps for about five days.',
  ingredients: [
    '1 English cucumber, diced',
    '2 pints cherry or grape tomatoes, halved',
    '8 oz feta, diced',
    '1/4 cup chopped fresh parsley',
    '1/4 cup olive oil',
    '2 tbsp red wine vinegar',
    '2 cloves garlic, minced',
    '1 tsp dried oregano',
    '1 tsp salt',
    '1/2 tsp black pepper',
  ],
  instructions: [
    'Chop and prepare the vegetables, feta, and parsley.',
    'Combine the cucumber, tomatoes, feta, and parsley in a large bowl.',
    'Add the olive oil, vinegar, garlic, oregano, salt, and pepper; toss until everything is evenly coated.',
    'Serve right away, or refrigerate in an airtight container for up to 5 days.',
  ],
  prepTime: 'PT15M',
  totalTime: 'PT25M',
  recipeYield: '8',
  recipeCategory: 'side dish',
  recipeCuisine: 'greek',
  cookingMethod: 'exchange.recipe.defs#cookingMethodNoCook',
  attribution: {
    $type: 'exchange.recipe.defs#attributionWebsite',
    name: 'Erin Lives Whole (Erin Antoniak)',
    url: 'https://www.erinliveswhole.com/greek-cucumber-tomato-feta-salad/',
    notes: 'Ingredients and method adapted from the source; description rewritten.',
  },
  createdAt: now,
  updatedAt: now,
};

const session = await (
  await fetch('https://bsky.social/xrpc/com.atproto.server.createSession', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identifier: HANDLE, password: PASSWORD }),
  })
).json();
if (!session.did) {
  console.error('login failed:', session.error, session.message);
  process.exit(1);
}
console.log('signed in as', session.did);

const created = await (
  await fetch('https://bsky.social/xrpc/com.atproto.repo.createRecord', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${session.accessJwt}`,
    },
    body: JSON.stringify({
      repo: session.did,
      collection: 'exchange.recipe.recipe',
      record,
    }),
  })
).json();
if (!created.uri) {
  console.error('createRecord failed:', created.error, created.message);
  process.exit(1);
}
console.log('created:', created.uri);
console.log('cid:', created.cid);
