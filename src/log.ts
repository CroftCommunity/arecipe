// Diagnostic logging spine (Phase 1). Leveled, structured, flag-gated:
// debug/info stay quiet in production; warn/error always emit. The flag is
// `?debug=1` in the URL or any `debug` entry in localStorage. Every risky
// boundary (auth, PDS fetch, SW update, blob upload) logs through this module
// so a backendless failure is debuggable from the console alone.

export type LogSink = Pick<Console, 'log' | 'info' | 'warn' | 'error'>;

export type Logger = {
  [level in 'debug' | 'info' | 'warn' | 'error']: (
    component: string,
    message: string,
    data?: Record<string, unknown>,
  ) => void;
};

/** Pure flag check — `search` is a location.search string, `stored` the localStorage 'debug' entry. */
export const isDebugEnabled = (search: string, stored: string | null): boolean =>
  new URLSearchParams(search).has('debug') || stored !== null;

export const createLogger = (opts: { debug: boolean; sink?: LogSink }): Logger => {
  const sink = opts.sink ?? console;
  const emit =
    (method: keyof LogSink, gated: boolean) =>
    (component: string, message: string, data?: Record<string, unknown>): void => {
      if (gated && !opts.debug) return;
      if (data === undefined) sink[method]('[arecipe]', component, message);
      else sink[method]('[arecipe]', component, message, data);
    };
  return {
    debug: emit('log', true),
    info: emit('info', true),
    warn: emit('warn', false),
    error: emit('error', false),
  };
};

const detectDebug = (): boolean => {
  try {
    return isDebugEnabled(window.location.search, window.localStorage.getItem('debug'));
  } catch {
    return false;
  }
};

/** App-wide default logger instance. */
export const log: Logger = createLogger({ debug: detectDebug() });
