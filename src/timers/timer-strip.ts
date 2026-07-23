// Feature A (timers) — the compact focus-mode strip (A-D6). Lists running
// timers as "label · remaining" inside `.focus-top`; tapping opens the timers
// page. It renders NOTHING when no timer is running (the element is only in the
// DOM while there is something to show), takes no vertical space when idle, and
// never steals focus or scroll position — it only reads.

import { createTimerStore, type TimerStore } from './timers-local.js';
import { formatRemaining, isExpired, remainingMs, type Timer } from './timer-state.js';

const el = (tag: string, className?: string, text?: string): HTMLElement => {
  const node = document.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

export type TimerStripHandle = { stop: () => void };

/** Mount the strip into `host`. Reads current timers once (they were started
 *  before entering focus), then ticks, recomputing remaining from each timer's
 *  absolute `endsAt` and dropping timers as they expire. Returns a handle whose
 *  `stop()` clears the tick (call on focus exit). */
export const mountTimerStrip = (
  host: HTMLElement,
  opts: { store?: TimerStore; now?: () => number; tickMs?: number } = {},
): TimerStripHandle => {
  const store = opts.store ?? createTimerStore();
  const now = opts.now ?? ((): number => Date.now());
  let timers: Timer[] = [];
  let strip: HTMLAnchorElement | null = null;

  const render = (): void => {
    const running = timers.filter((t) => !isExpired(t, now()));
    if (running.length === 0) {
      strip?.remove();
      strip = null;
      return;
    }
    if (strip === null) {
      strip = el('a', 'timer-strip') as HTMLAnchorElement;
      strip.dataset['testid'] = 'timer-strip';
      strip.href = './timers.html';
      strip.setAttribute('aria-label', 'Open timers');
      host.append(strip);
    }
    strip.replaceChildren(
      ...running.map((t) => {
        const item = el('span', 'timer-strip-item');
        item.dataset['testid'] = 'timer-strip-item';
        item.append(
          el('span', 'timer-strip-label', t.label || 'Timer'),
          el('span', 'timer-strip-time', formatRemaining(remainingMs(t, now()))),
        );
        return item;
      }),
    );
  };

  void store.list().then((list) => {
    timers = list;
    render();
  });
  const id = window.setInterval(render, opts.tickMs ?? 1000);
  return {
    stop: (): void => {
      window.clearInterval(id);
    },
  };
};
