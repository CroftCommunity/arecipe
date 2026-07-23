// The committed 25-question fixture set (RUN-GUIDE-HELPER Phase 1 test 6). Each
// question is phrased the way a real cook would type it — not a keyword echo of
// the section it maps to — and is hand-marked with the ONE guide section that
// answers it (the section's stable anchor = its testid).
//
// Retrieval quality (top-1 and top-3 accuracy) is MEASURED against this set, not
// asserted at a hoped-for level: search.spec.ts runs every question through the
// real index and the recorded baseline counts go in the run summary. Add
// questions here as the guide grows; never tune a question to flatter the
// ranker.

export interface FixtureQuestion {
  /** What a person types. */
  q: string;
  /** The one section that answers it (anchor === the guide entry's testid). */
  anchor: string;
}

export const FIXTURE_QUESTIONS: FixtureQuestion[] = [
  { q: 'is my password shared with arecipe', anchor: 'guide-entry-bluesky' },
  { q: 'why do I have to sign in with a bluesky account', anchor: 'guide-entry-bluesky' },
  { q: 'can other people see the recipes I publish', anchor: 'guide-entry-bluesky' },
  { q: 'do my recipes stay mine if arecipe shuts down', anchor: 'guide-entry-bluesky' },
  { q: 'how do I search for a recipe by ingredient', anchor: 'guide-entry-browse' },
  { q: 'what are the starter cooks on the front page', anchor: 'guide-entry-browse' },
  { q: 'how do I follow a cook', anchor: 'guide-entry-add-cook' },
  { q: 'how do I add someone new to my feed', anchor: 'guide-entry-add-cook' },
  { q: 'how do I only show vegetarian recipes', anchor: 'guide-entry-filters' },
  { q: 'how do I stop seeing cuisines I dislike', anchor: 'guide-entry-filters' },
  { q: 'where are the recipes I have liked', anchor: 'guide-entry-cookbook' },
  { q: 'how do I share my whole cookbook with a friend', anchor: 'guide-entry-cookbook' },
  { q: 'what does the fingerprint on a recipe mean', anchor: 'guide-entry-open-recipe' },
  { q: 'how do I share a single recipe with someone', anchor: 'guide-entry-open-recipe' },
  { q: 'what is focus mode', anchor: 'guide-entry-focus' },
  { q: 'how do I read a recipe with my phone propped up while cooking', anchor: 'guide-entry-focus' },
  { q: 'where do I find measurement conversions', anchor: 'guide-entry-reference' },
  { q: 'how do I find an ingredient substitution', anchor: 'guide-entry-reference' },
  { q: 'how do I turn off the did you know fun facts', anchor: 'guide-entry-funfacts' },
  { q: 'how do I hide a recipe I never want to see again', anchor: 'guide-entry-hide' },
  { q: 'how do I leave a comment on a recipe', anchor: 'guide-entry-comments' },
  { q: 'how do I import a recipe from a website', anchor: 'guide-entry-share' },
  { q: 'how do I plan my meals for the week', anchor: 'guide-entry-meals' },
  { q: 'how do I publish my meal plan as a link', anchor: 'guide-entry-meal-publish' },
  { q: 'how do I make a shopping list from my plan', anchor: 'guide-entry-shopping' },
];
