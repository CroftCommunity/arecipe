// Step reducer (RUN-COOK-FOCUS D3): a pure, DOM-free state machine for the
// step-at-a-time focus view. Exactly one step is current; Next/Back clamp at
// both ends (no wraparound); steps below current are "done". No persistence.
import { describe, expect, it } from 'vitest';
import {
  initStepState,
  stepReducer,
  stepStatusAt,
  type StepState,
} from '../../../src/recipes/step-state.js';

describe('stepReducer', () => {
  it('Next from the last step is a no-op; Back from step 0 is a no-op (clamped, no wraparound)', () => {
    const last: StepState = { total: 3, current: 2 };
    expect(stepReducer(last, { type: 'next' }).current).toBe(2);

    const first = initStepState(3);
    expect(first.current).toBe(0);
    expect(stepReducer(first, { type: 'back' }).current).toBe(0);
  });

  it('Next and Back move exactly one step within range', () => {
    const s = initStepState(4);
    const a = stepReducer(s, { type: 'next' });
    expect(a.current).toBe(1);
    const b = stepReducer(a, { type: 'next' });
    expect(b.current).toBe(2);
    expect(stepReducer(b, { type: 'back' }).current).toBe(1);
  });

  it('setCurrent out of range is clamped to [0, total-1]', () => {
    const s = initStepState(3);
    expect(stepReducer(s, { type: 'setCurrent', index: 99 }).current).toBe(2);
    expect(stepReducer(s, { type: 'setCurrent', index: -5 }).current).toBe(0);
    expect(stepReducer(s, { type: 'setCurrent', index: 1 }).current).toBe(1);
  });

  it('a zero-step recipe clamps current to 0 and never advances', () => {
    const s = initStepState(0);
    expect(s.current).toBe(0);
    expect(stepReducer(s, { type: 'next' }).current).toBe(0);
    expect(stepReducer(s, { type: 'setCurrent', index: 3 }).current).toBe(0);
  });

  it('never mutates its input', () => {
    const s = initStepState(3);
    const snapshot = { ...s };
    stepReducer(s, { type: 'next' });
    stepReducer(s, { type: 'setCurrent', index: 2 });
    stepReducer(s, { type: 'back' });
    expect(s).toEqual(snapshot);
  });
});

describe('stepStatusAt', () => {
  it('marks steps below current "done", the current "current", and steps above not-done', () => {
    const s: StepState = { total: 5, current: 2 };
    expect(stepStatusAt(s, 0)).toBe('done');
    expect(stepStatusAt(s, 1)).toBe('done');
    expect(stepStatusAt(s, 2)).toBe('current');
    expect(stepStatusAt(s, 3)).not.toBe('done');
    expect(stepStatusAt(s, 4)).not.toBe('done');
  });
});
