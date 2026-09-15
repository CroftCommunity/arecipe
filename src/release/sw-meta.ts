// Page ↔ SW release-meta round-trip (signed releases D3/D4). The page's
// running version/buildNumber are NOT baked into page bundles (that would
// churn every content-hashed name each deploy) — the controlling service
// worker, which does carry them, answers over a MessageChannel. No controller
// (first visit, dev without SW) → null; callers degrade to signature-only
// verification or network build-info.

export type SwReleaseMeta = { version: string; buildNumber: number };

type ControllerLike = Pick<ServiceWorker, 'postMessage'> | null;

export const requestSwReleaseMeta = (
  controller: ControllerLike = navigator.serviceWorker?.controller ?? null,
  timeoutMs = 2_000,
): Promise<SwReleaseMeta | null> => {
  if (controller === null) return Promise.resolve(null);
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(null), timeoutMs);
    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      const data = event.data as Partial<SwReleaseMeta> | null;
      resolve(
        typeof data?.version === 'string' && typeof data.buildNumber === 'number'
          ? { version: data.version, buildNumber: data.buildNumber }
          : null,
      );
    };
    controller.postMessage({ type: 'ARECIPE_RELEASE_META' }, [channel.port2]);
  });
};

/** Tell the SW its memoized release config is stale (pin/enforcement toggles). */
export const notifyReleaseConfigChanged = (
  controller: ControllerLike = navigator.serviceWorker?.controller ?? null,
): void => {
  controller?.postMessage({ type: 'ARECIPE_RELEASE_CONFIG_CHANGED' });
};
