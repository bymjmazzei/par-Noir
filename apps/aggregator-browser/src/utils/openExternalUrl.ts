/**
 * Open external URL. Uses Capacitor Browser on native for better UX.
 */

import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';

export async function openExternalUrl(url: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      await Browser.open({ url });
    } catch (err) {
      // Fallback to window.open if Browser fails
      window.open(url, '_blank');
    }
  } else {
    window.open(url, '_blank');
  }
}
