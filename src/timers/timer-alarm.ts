// Feature A (timers) — firing a finished timer honestly (A-D4).
//
// Audio hygiene: browsers block audio that starts without a user gesture, so
// `prime()` is called on the first "start timer" tap to unlock a reusable
// AudioContext; `fire()` reuses it. No user gesture, no sound — never a
// console-spamming autoplay rejection.
//
// Permission hygiene: notification permission is NEVER requested on load. Only
// `requestPermission()` may ask, and it is called solely when the user turns on
// "notify me". A prior denial is a permanent, silent no — we never re-prompt.

type NotificationCtor = {
  permission: NotificationPermission;
  requestPermission: () => Promise<NotificationPermission>;
  new (title: string, options?: { body?: string }): unknown;
};

const notificationApi = (): NotificationCtor | null => {
  const w = window as unknown as { Notification?: NotificationCtor };
  return typeof w.Notification === 'function' ? w.Notification : null;
};

type AudioCtor = new () => AudioContext;

const audioCtor = (): AudioCtor | null => {
  const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
};

export type TimerAlarm = {
  /** Unlock the audio path on a user gesture (the first "start" tap). Idempotent. */
  prime: () => void;
  /** Ask for notification permission — only on explicit opt-in. Resolves to
   *  whether notifications may now be shown. A prior denial is never re-prompted. */
  requestPermission: () => Promise<boolean>;
  /** A timer finished: audible cue always; a Notification only if opted in and
   *  already granted. */
  fire: (opts: { label: string; notify: boolean }) => void;
};

export const createTimerAlarm = (): TimerAlarm => {
  let ctx: AudioContext | null = null;

  const prime = (): void => {
    if (ctx !== null) {
      void ctx.resume();
      return;
    }
    const Ctor = audioCtor();
    if (Ctor === null) return; // no WebAudio → silent, visual state still changes
    try {
      ctx = new Ctor();
      void ctx.resume();
    } catch {
      ctx = null; // creation blocked → degrade silently
    }
  };

  const beep = (): void => {
    if (ctx === null) return;
    try {
      const now = ctx.currentTime;
      // Two short pips — recognisably a kitchen timer, not a system error.
      for (const offset of [0, 0.28]) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.0001, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.25, now + offset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.22);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now + offset);
        osc.stop(now + offset + 0.24);
      }
    } catch {
      /* audio hiccup must never break timer firing */
    }
  };

  const requestPermission = async (): Promise<boolean> => {
    const N = notificationApi();
    if (N === null) return false; // unsupported → silent no
    if (N.permission === 'granted') return true;
    if (N.permission === 'denied') return false; // permanent, silent no — never re-prompt
    try {
      return (await N.requestPermission()) === 'granted';
    } catch {
      return false;
    }
  };

  const fire = ({ label, notify }: { label: string; notify: boolean }): void => {
    beep();
    if (!notify) return;
    const N = notificationApi();
    if (N === null || N.permission !== 'granted') return;
    try {
      new N('Timer finished', { body: label || 'Your timer is up.' });
    } catch {
      /* notification failure is non-fatal — the audible cue already fired */
    }
  };

  return { prime, requestPermission, fire };
};
