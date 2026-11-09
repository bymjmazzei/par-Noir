/**
 * Native push for locked pNs: after a biometric vault unlock, the FCM token is
 * registered for each saved pN (ML-DSA proof per pN). Notifications are content-free;
 * tapping one opens the web app for its category.
 */

import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import {
  registerNativePushForEntries,
  sendNativePushProof,
  type NativePushVaultEntry,
} from '@par-noir/oauth-ui';
import { OpenExternalApp } from './openExternalApp';

const API_ENDPOINT = (
  (import.meta as ImportMeta & { env?: { VITE_API_ENDPOINT?: string } }).env?.VITE_API_ENDPOINT ||
  'https://api.parnoir.com'
).replace(/\/$/, '');

const APP_URLS: Record<string, string> = {
  messaging: 'https://messaging.parnoir.com/',
  browse: 'https://browse.parnoir.com/',
  dashboard: 'https://pn.parnoir.com/',
  pen: 'https://pen.parnoir.com/',
};

let tokenPromise: Promise<string | null> | null = null;

function platform(): 'ios' | 'android' | null {
  const p = Capacitor.getPlatform();
  return p === 'ios' || p === 'android' ? p : null;
}

/** Asks for permission once; resolves null when denied, unsupported, or Firebase is not configured. */
function deviceToken(): Promise<string | null> {
  if (tokenPromise) return tokenPromise;
  tokenPromise = (async () => {
    if (!platform()) return null;
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
      perm = await PushNotifications.requestPermissions();
    }
    if (perm.receive !== 'granted') return null;
    return new Promise<string | null>((resolve) => {
      const timer = window.setTimeout(() => resolve(null), 15_000);
      void PushNotifications.addListener('registration', (t) => {
        window.clearTimeout(timer);
        resolve(t.value || null);
      });
      void PushNotifications.addListener('registrationError', () => {
        window.clearTimeout(timer);
        resolve(null);
      });
      void PushNotifications.register().catch(() => {
        window.clearTimeout(timer);
        resolve(null);
      });
    });
  })().then((t) => {
    if (!t) tokenPromise = null;
    return t;
  });
  return tokenPromise;
}

export async function registerPushForVaultEntries(entries: NativePushVaultEntry[]): Promise<void> {
  const p = platform();
  if (!p || entries.length === 0) return;
  const token = await deviceToken();
  if (!token) return;
  await registerNativePushForEntries({ apiEndpoint: API_ENDPOINT, entries, token, platform: p });
}

/** Never prompts: without permission there is nothing registered to remove. */
export async function unregisterPushForVaultEntry(entry: NativePushVaultEntry): Promise<void> {
  const p = platform();
  if (!p) return;
  if (!tokenPromise && (await PushNotifications.checkPermissions()).receive !== 'granted') return;
  const token = await deviceToken();
  if (!token) return;
  await sendNativePushProof({ apiEndpoint: API_ENDPOINT, entry, token, platform: p, action: 'unregister' });
}

export function bindPushTapHandler(): void {
  if (!platform()) return;
  void PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    const app = String(action.notification.data?.app ?? '');
    const url = APP_URLS[app];
    if (url) void OpenExternalApp.open({ url }).catch(() => undefined);
  });
}
