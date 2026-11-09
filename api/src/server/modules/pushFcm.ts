/**
 * FCM delivery for native push (Android, and iOS through APNs configured in Firebase).
 * Credentials come from GOOGLE_APPLICATION_CREDENTIALS; never committed.
 */

import type { App } from 'firebase-admin/app';
import type { PushPayload } from './pushService';

let app: App | null = null;

async function getApp(): Promise<App> {
  if (app) return app;
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error('FCM not configured: GOOGLE_APPLICATION_CREDENTIALS not set');
  }
  const { initializeApp, getApps, applicationDefault } = await import('firebase-admin/app');
  app = getApps()[0] ?? initializeApp({ credential: applicationDefault() });
  return app;
}

const INVALID_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

/** collapseKey keeps one visible notification per category on the device. */
export async function sendPushViaFCM(
  tokens: string[],
  payload: PushPayload,
  collapseKey?: string
): Promise<{ invalidTokens: string[] }> {
  if (!tokens.length) return { invalidTokens: [] };
  const { getMessaging } = await import('firebase-admin/messaging');
  const messaging = getMessaging(await getApp());
  const message = {
    notification: { title: payload.title, body: payload.body },
    data: payload.data || {},
    tokens,
    android: {
      priority: 'high' as const,
      ...(collapseKey ? { collapseKey, notification: { tag: collapseKey } } : {}),
    },
    apns: {
      ...(collapseKey ? { headers: { 'apns-collapse-id': collapseKey } } : {}),
      payload: { aps: { sound: 'default' } },
    },
  };
  const result = await messaging.sendEachForMulticast(message);
  const invalidTokens: string[] = [];
  result.responses.forEach((r, i) => {
    if (!r.success && r.error?.code && INVALID_TOKEN_CODES.has(r.error.code)) {
      invalidTokens.push(tokens[i]);
    }
  });
  return { invalidTokens };
}
