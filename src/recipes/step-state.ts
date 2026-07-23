// Step-at-a-time state for the focus cook view (RUN-COOK-FOCUS D3). A pure,
// DOM-free reducer: exactly one step is `current`, Next/Back move it one at a
// time and clamp at both ends (NO wraparound), and setCurrent jumps to a
// clamped index. State is per focus session — not persisted in v1. The DOM
// wiring (view.ts) derives each step's visual status from `stepStatusAt`.

export interface StepState {
  /** Number of instruction steps (may be 0 for a recipe with no instructions). */
  readonly total: number;
  /** The single current step index, always within [0, total-1] (0 when empty). */
  readonly current: number;
}

export type StepAction =
  | { type: 'next' }
  | { type: 'back' }
  | { type: 'setCurrent'; index: number };

export type StepStatus = 'done' | 'current' | 'upcoming';

/** Largest valid step index (0 when there are no steps, so nothing advances). */
const lastIndexOf = (total: number): number => Math.max(0, total - 1);

const clamp = (n: number, max: number): number => Math.max(0, Math.min(n, max));

export const initStepState = (total: number): StepState => ({
  total: Math.max(0, total),
  current: 0,
});

export const stepReducer = (state: StepState, action: StepAction): StepState => {
  const max = lastIndexOf(state.total);
  const target =
    action.type === 'next'
      ? state.current + 1
      : action.type === 'back'
        ? state.current - 1
        : action.index;
  const current = clamp(target, max);
  // Clamped to a no-op → return the input unchanged (never mutated either way).
  return current === state.current ? state : { total: state.total, current };
};

/** A step's status relative to the current step: below → done, at → current,
 *  above → upcoming. Drives the receded/prominent styling; nothing is hidden. */
export const stepStatusAt = (state: StepState, index: number): StepStatus => {
  if (index === state.current) return 'current';
  return index < state.current ? 'done' : 'upcoming';
};
