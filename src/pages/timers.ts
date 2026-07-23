// Timers page entry. A standalone page holding several concurrent named
// timers, device-scoped and persisted (they keep running while you leave the
// recipe to look at the meal plan and come back — A0). All remaining time
// derives from each timer's absolute `endsAt` (A1); nothing here stores or
// decrements a "remaining" counter.

import { mountBuildStamp } from '../build-stamp.js';
import { log } from '../log.js';
import { mountShell } from '../nav.js';
import { registerServiceWorker } from '../sw-register.js';
import { createTimerAlarm } from '../timers/timer-alarm.js';
import { createTimerPrefs } from '../timers/timer-prefs.js';
import { createTimerStore } from '../timers/timers-local.js';
import {
  addTimer,
  createTimer,
  formatRemaining,
  isExpired,
  remainingMs,
  removeTimer,
  restartTimer,
  type Timer,
} from '../timers/timer-state.js';

const el = (tag: string, className?: string, text?: string): HTMLElement => {
  const node = document.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const numberInput = (testid: string, placeholder: string): HTMLInputElement => {
  const inp = document.createElement('input');
  inp.type = 'number';
  inp.min = '0';
  inp.inputMode = 'numeric';
  inp.placeholder = placeholder;
  inp.dataset['testid'] = testid;
  inp.className = 'timer-num';
  return inp;
};

const main = async (): Promise<void> => {
  const app = document.getElementById('app');
  if (app === null) return;

  const store = createTimerStore();
  const prefs = createTimerPrefs();
  const alarm = createTimerAlarm();

  let timers: Timer[] = await store.list();
  // Timers already expired at load (they finished while the tab was gone) start
  // in the fired set so we don't re-alarm for a timer that finished off-screen.
  const fired = new Set<string>(timers.filter((t) => isExpired(t, Date.now())).map((t) => t.id));

  const content = el('main', 'timers');
  content.append(el('h1', undefined, 'Kitchen Timers'));
  content.append(
    el(
      'p',
      'timers-intro',
      'Start as many as you like. They keep running while you look at other pages, and are correct when you come back.',
    ),
  );

  // --- Add form -------------------------------------------------------------
  const form = el('form', 'timer-add') as HTMLFormElement;
  const labelInput = document.createElement('input');
  labelInput.type = 'text';
  labelInput.placeholder = 'Label (optional)';
  labelInput.dataset['testid'] = 'timer-label';
  labelInput.className = 'timer-label-input';
  const minutes = numberInput('timer-minutes', 'min');
  const seconds = numberInput('timer-seconds', 'sec');
  const startBtn = el('button', 'button timer-start', 'Start') as HTMLButtonElement;
  startBtn.type = 'submit';
  startBtn.dataset['testid'] = 'timer-start';
  form.append(labelInput, minutes, seconds, startBtn);

  // --- Notify toggle + the honest limitation (A-D4 / A-D5) ------------------
  const notifySection = el('section', 'timer-notify-section');
  const notifyRow = el('label', 'timer-notify-row') as HTMLLabelElement;
  notifyRow.dataset['testid'] = 'timer-notify-row';
  const notifyBox = document.createElement('input');
  notifyBox.type = 'checkbox';
  notifyBox.dataset['testid'] = 'timer-notify';
  notifyBox.checked = prefs.notify();
  notifyRow.append(notifyBox, el('span', undefined, 'Notify me when a timer finishes'));
  notifySection.append(notifyRow);
  notifySection.append(
    // A-D5: state the background-alert limitation plainly, in one sentence.
    el(
      'p',
      'timer-notify-note',
      'With no server there is no background alarm: a timer stays correct when you return, but its alert may be late if this tab was in the background.',
    ),
  );
  notifyBox.addEventListener('change', () => {
    if (notifyBox.checked) {
      // Only ever request permission on this explicit opt-in.
      void alarm.requestPermission().then((granted) => {
        prefs.setNotify(granted);
        notifyBox.checked = granted; // a denial is a permanent, silent no
        log.debug('timers', 'notify-optin', { granted });
      });
    } else {
      prefs.setNotify(false);
    }
  });

  // --- Running list ---------------------------------------------------------
  const listEl = el('ul', 'timer-list');
  listEl.dataset['testid'] = 'timer-list';
  const emptyMsg = el('p', 'timer-empty', 'No timers yet.');

  const paint = (): void => {
    const now = Date.now();
    listEl.replaceChildren(
      ...timers.map((t) => {
        const expired = isExpired(t, now);
        const li = el('li', expired ? 'timer-item timer-item--done' : 'timer-item') as HTMLLIElement;
        li.dataset['testid'] = 'timer-item';
        li.append(el('span', 'timer-item-label', t.label || 'Timer'));
        li.append(
          (() => {
            const time = el('span', 'timer-remaining', expired ? 'Done' : formatRemaining(remainingMs(t, now)));
            time.dataset['testid'] = 'timer-remaining';
            return time;
          })(),
        );
        const controls = el('span', 'timer-item-controls');
        if (expired) {
          const restart = el('button', 'button timer-restart', 'Restart') as HTMLButtonElement;
          restart.type = 'button';
          restart.dataset['testid'] = 'timer-restart';
          restart.addEventListener('click', () => {
            alarm.prime();
            const next = restartTimer(t, Date.now());
            timers = timers.map((x) => (x.id === t.id ? next : x));
            fired.delete(t.id);
            void store.save(next);
            paint();
          });
          controls.append(restart);
        }
        const remove = el('button', 'button timer-remove', expired ? 'Dismiss' : 'Cancel') as HTMLButtonElement;
        remove.type = 'button';
        remove.dataset['testid'] = 'timer-remove';
        remove.addEventListener('click', () => {
          timers = removeTimer(timers, t.id);
          void store.remove(t.id);
          paint();
        });
        controls.append(remove);
        li.append(controls);
        return li;
      }),
    );
    if (timers.length === 0) listEl.replaceChildren(emptyMsg);
  };

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    alarm.prime(); // first user gesture unlocks the audio path (A-D4)
    const mins = Number.parseInt(minutes.value, 10) || 0;
    const secs = Number.parseInt(seconds.value, 10) || 0;
    const durationMs = (mins * 60 + secs) * 1000;
    if (durationMs <= 0) return;
    const timer = createTimer({ label: labelInput.value.trim(), durationMs, now: Date.now() });
    timers = addTimer(timers, timer);
    void store.save(timer);
    labelInput.value = '';
    minutes.value = '';
    seconds.value = '';
    paint();
  });

  // The page owns the tick (A-D3); the module owns the arithmetic. A sub-second
  // tick keeps the display crisp and catches expiry promptly.
  const tick = (): void => {
    const now = Date.now();
    for (const t of timers) {
      if (isExpired(t, now) && !fired.has(t.id)) {
        fired.add(t.id);
        alarm.fire({ label: t.label, notify: prefs.notify() });
      }
    }
    paint();
  };
  window.setInterval(tick, 250);

  content.append(form, notifySection, listEl);
  paint();

  mountShell(app, content);
  void mountBuildStamp(app);
  log.debug('shell', 'mounted', { page: 'timers' });
  void registerServiceWorker();
};

void main();
