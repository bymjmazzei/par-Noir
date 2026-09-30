/**
 * Deep link / cold-start URL handling for Universal Links and custom scheme.
 */

import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { searchFromUnlockUrl } from '@par-noir/oauth-ui';

export type UnlockLaunchHandler = (url: string) => void;
export { searchFromUnlockUrl };

/** Cold-start custom scheme or universal link, as a consent search string. */
export async function readUnlockLaunchSearch(): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const result = await CapApp.getLaunchUrl();
    if (!result?.url) return null;
    return searchFromUnlockUrl(result.url);
  } catch {
    return null;
  }
}

/**
 * Subscribe to later appUrlOpen events. Cold start is readUnlockLaunchSearch.
 */
export function subscribeUnlockDeepLinks(onUrl: UnlockLaunchHandler): () => void {
  if (!Capacitor.isNativePlatform()) {
    return () => undefined;
  }

  let removed = false;
  const listenerPromise = CapApp.addListener('appUrlOpen', (event) => {
    if (!removed && event?.url) onUrl(event.url);
  });

  return () => {
    removed = true;
    void listenerPromise.then((h) => h.remove());
  };
}
