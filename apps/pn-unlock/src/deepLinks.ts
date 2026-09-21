/**
 * Deep link / cold-start URL handling for Universal Links and custom scheme.
 */

import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { searchFromUnlockUrl } from '@par-noir/oauth-ui';

export type UnlockLaunchHandler = (url: string) => void;
export { searchFromUnlockUrl };

/**
 * Subscribe to appUrlOpen + getLaunchUrl. Returns unsubscribe.
 */
export function subscribeUnlockDeepLinks(onUrl: UnlockLaunchHandler): () => void {
  if (!Capacitor.isNativePlatform()) {
    return () => undefined;
  }

  let removed = false;
  const listenerPromise = CapApp.addListener('appUrlOpen', (event) => {
    if (event?.url) onUrl(event.url);
  });

  void CapApp.getLaunchUrl()
    .then((result) => {
      if (!removed && result?.url) onUrl(result.url);
    })
    .catch(() => undefined);

  return () => {
    removed = true;
    void listenerPromise.then((h) => h.remove());
  };
}
