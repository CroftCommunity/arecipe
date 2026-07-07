// Phase 1: the observability spine. Behavior under test:
// - debug/info are suppressed unless the debug flag is on (production quiet)
// - warn/error always emit, flag or no flag
// - the debug flag comes from ?debug=1 or a localStorage 'debug' entry
// - emitted records are structured: [arecipe] <component> <message> (+data)
import { describe, expect, it } from 'vitest';
import { createLogger, isDebugEnabled, type LogSink } from '../../src/log.js';

type Captured = { method: string; args: unknown[] };

const makeSink = (): { sink: LogSink; captured: Captured[] } => {
  const captured: Captured[] = [];
  const grab =
    (method: string) =>
    (...args: unknown[]) => {
      captured.push({ method, args });
    };
  return {
    captured,
    sink: { log: grab('log'), info: grab('info'), warn: grab('warn'), error: grab('error') },
  };
};

describe('isDebugEnabled', () => {
  it('is on when ?debug=1 is in the query string', () => {
    expect(isDebugEnabled('?debug=1', null)).toBe(true);
  });

  it('is on when localStorage has a debug entry', () => {
    expect(isDebugEnabled('', '1')).toBe(true);
  });

  it('is off with no flag anywhere', () => {
    expect(isDebugEnabled('', null)).toBe(false);
    expect(isDebugEnabled('?other=1', null)).toBe(false);
  });
});

describe('createLogger', () => {
  it('suppresses debug and info when the flag is off (production quiet)', () => {
    const { sink, captured } = makeSink();
    const log = createLogger({ debug: false, sink });
    log.debug('sw', 'should not appear');
    log.info('sw', 'should not appear either');
    expect(captured).toHaveLength(0);
  });

  it('always emits warn and error, flag or no flag', () => {
    const { sink, captured } = makeSink();
    const log = createLogger({ debug: false, sink });
    log.warn('cache', 'cid mismatch');
    log.error('auth', 'refresh failed');
    expect(captured.map((c) => c.method)).toEqual(['warn', 'error']);
  });

  it('emits all levels when the flag is on', () => {
    const { sink, captured } = makeSink();
    const log = createLogger({ debug: true, sink });
    log.debug('a', 'd');
    log.info('a', 'i');
    log.warn('a', 'w');
    log.error('a', 'e');
    expect(captured.map((c) => c.method)).toEqual(['log', 'info', 'warn', 'error']);
  });

  it('emits structured records: [arecipe] prefix, component, message, then data', () => {
    const { sink, captured } = makeSink();
    const log = createLogger({ debug: true, sink });
    log.info('sw', 'registered', { scope: '/' });
    expect(captured[0]?.args[0]).toBe('[arecipe]');
    expect(captured[0]?.args[1]).toBe('sw');
    expect(captured[0]?.args[2]).toBe('registered');
    expect(captured[0]?.args[3]).toEqual({ scope: '/' });
  });

  it('omits the data argument when none is given', () => {
    const { sink, captured } = makeSink();
    const log = createLogger({ debug: true, sink });
    log.info('sw', 'registered');
    expect(captured[0]?.args).toHaveLength(3);
  });
});
