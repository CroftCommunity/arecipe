// @vitest-environment happy-dom
// Shared add-a-cook panel (D7/D8): a handle input with the cook typeahead + a
// submit button, emitting the chosen handle to onSubmit. Browse (preview) and
// Account (follow) reuse it. Behaviors: a form submit reports the trimmed handle;
// a typeahead pick fills the input and reports the picked handle; blank submits
// are ignored.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderAddCookPanel } from '../../../src/social/add-cook-panel.js';
import type { ActorSuggestion } from '../../../src/identity/actor-search.js';

const input = (root: HTMLElement): HTMLInputElement =>
  root.querySelector<HTMLInputElement>('[data-testid="add-cook-input"]')!;

describe('renderAddCookPanel', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('reports the trimmed handle on form submit', () => {
    const submitted: string[] = [];
    const panel = renderAddCookPanel({ onSubmit: (h) => submitted.push(h) });
    input(panel.element).value = '  rdur.dev  ';
    panel.element.querySelector('form')!.dispatchEvent(new Event('submit'));
    expect(submitted).toEqual(['rdur.dev']);
  });

  it('ignores a blank submit', () => {
    const submitted: string[] = [];
    const panel = renderAddCookPanel({ onSubmit: (h) => submitted.push(h) });
    input(panel.element).value = '   ';
    panel.element.querySelector('form')!.dispatchEvent(new Event('submit'));
    expect(submitted).toEqual([]);
  });

  it('reports the picked handle when a typeahead suggestion is chosen', async () => {
    const submitted: string[] = [];
    const search = async (): Promise<ActorSuggestion[]> => [{ did: 'did:plc:alice', handle: 'alice.test' }];
    const panel = renderAddCookPanel({ onSubmit: (h) => submitted.push(h), search });
    document.body.append(panel.element);
    const box = input(panel.element);
    box.value = 'ali';
    box.dispatchEvent(new Event('input'));
    await vi.advanceTimersByTimeAsync(200);
    const option = panel.element.parentElement!.querySelector<HTMLElement>('.typeahead-option')!;
    option.dispatchEvent(new MouseEvent('mousedown'));
    expect(box.value).toBe('alice.test');
    expect(submitted).toEqual(['alice.test']);
    panel.destroy();
  });
});
