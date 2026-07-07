// Recipe list rendering (Phase 4b). Deliberately unstyled M1-walking-
// skeleton markup — structure/UI/UX decisions happen at the M1 checkpoint
// (mealplanner review), not here. The verified marker surfaces the Tier 2
// cache verdict; hiding an unverified record would defeat the point.

import type { CachedRecipe } from './cache.js';

const textEl = (tag: string, text: string): HTMLElement => {
  const el = document.createElement(tag);
  el.textContent = text;
  return el;
};

const listEl = (testid: string, items: string[]): HTMLElement => {
  const ul = document.createElement('ul');
  ul.dataset['testid'] = testid;
  for (const item of items) ul.append(textEl('li', item));
  return ul;
};

const renderRecipe = (entry: CachedRecipe): HTMLElement => {
  const value = entry.value as {
    name?: string;
    text?: string;
    ingredients?: string[];
    instructions?: string[];
  };
  const item = document.createElement('details');
  item.dataset['testid'] = 'recipe-item';

  const summary = document.createElement('summary');
  summary.append(textEl('span', value.name ?? '(untitled)'));
  const badge = textEl('span', entry.verified ? ' ✓ verified' : ' ⚠ unverified');
  badge.setAttribute('data-verified', String(entry.verified));
  summary.append(badge);
  item.append(summary);

  item.append(textEl('p', value.text ?? ''));
  item.append(textEl('h3', 'Ingredients'));
  item.append(listEl('recipe-ingredients', value.ingredients ?? []));
  item.append(textEl('h3', 'Instructions'));
  item.append(listEl('recipe-instructions', value.instructions ?? []));
  return item;
};

/** Render cached recipes as an (unstyled) expandable list. */
export const renderRecipeList = (entries: CachedRecipe[]): HTMLElement => {
  const container = document.createElement('section');
  container.dataset['testid'] = 'recipe-list';
  for (const entry of entries) container.append(renderRecipe(entry));
  return container;
};
