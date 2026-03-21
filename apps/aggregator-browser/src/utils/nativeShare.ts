/**
 * Share content via native sheet (Capacitor) or Web Share API / clipboard
 */

import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';

export interface ShareContentOptions {
  title?: string;
  text?: string;
  url: string;
}

/**
 * Share content. On native: uses Capacitor Share. On web: tries Web Share API, then clipboard.
 */
export async function shareContent(options: ShareContentOptions): Promise<boolean> {
  const { title, text, url } = options;

  if (Capacitor.isNativePlatform()) {
    try {
      await Share.share({
        title: title || 'par Noir',
        text: text || '',
        url,
        dialogTitle: 'Share'
      });
      return true;
    } catch (err) {
      // User cancelled or error
      return false;
    }
  }

  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({
        title: title || 'par Noir',
        text: text || '',
        url
      });
      return true;
    } catch (err) {
      return false;
    }
  }

  // Fallback to clipboard
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
}
