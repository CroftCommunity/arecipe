// One retry after a short delay — for transient network races (a fetch
// fired in the moment an OAuth redirect settles, a flaky first request).
// Deliberately minimal: two attempts total, then surface the real error.

export const retryOnce = async <T>(
  fn: () => Promise<T>,
  opts: { delayMs?: number } = {},
): Promise<T> => {
  try {
    return await fn();
  } catch {
    await new Promise((resolve) => setTimeout(resolve, opts.delayMs ?? 1_000));
    return fn();
  }
};
