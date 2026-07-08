// retryOnce: one retry after a short delay, for transient network races
// (e.g. an own-repo fetch fired in the moment an OAuth redirect settles).
import { describe, expect, it, vi } from 'vitest';
import { retryOnce } from '../../src/retry.js';

describe('retryOnce', () => {
  it('returns the first result without retrying when it succeeds', async () => {
    const fn = vi.fn(async () => 'ok');
    expect(await retryOnce(fn, { delayMs: 0 })).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries once and succeeds on the second attempt', async () => {
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValueOnce('recovered');
    expect(await retryOnce(fn, { delayMs: 0 })).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws the second error when both attempts fail', async () => {
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('first'))
      .mockRejectedValueOnce(new Error('second'));
    await expect(retryOnce(fn, { delayMs: 0 })).rejects.toThrow('second');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
