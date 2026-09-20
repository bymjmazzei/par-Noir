/**
 * Deep link / cold-start URL handling for Universal Links and custom scheme.
 */

import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';

export type UnlockLaunchHandler = (url: string) => void;

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

/** Convert unlock.parnoir.com or custom-scheme URL into location.search for ConsentUnlockApp. */
export function searchFromUnlockUrl(url: string): string | null {
  try {
    if (url.startsWith('com.parnoir.unlock:')) {
      const normalized = url.replace(/^com\.parnoir\.unlock:\/\//, 'https://unlock.parnoir.com/');
      const u = new URL(normalized);
      return u.search || '';
    }
    const u = new URL(url);
    if (
      u.hostname === 'unlock.parnoir.com' ||
      u.hostname === 'localhost' ||
      u.pathname.includes('oauth')
    ) {
      return u.search || '';
    }
  } catch {
    return null;
  }
  return null;
}
