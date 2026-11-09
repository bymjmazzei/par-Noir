/**
 * FCM push delivery. Optional - requires firebase-admin.
 * Add firebase-admin to api package.json and set GOOGLE_APPLICATION_CREDENTIALS.
 */

import type { PushPayload } from './pushService';

let admin: any = null;

async function getAdmin(): Promise<any> {
  if (admin) return admin;
  try {
    // firebase-admin is optional: npm install firebase-admin, set GOOGLE_APPLICATION_CREDENTIALS
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error - optional dependency
    const firebaseAdmin = await import('firebase-admin');
    if (firebaseAdmin.apps?.length > 0) return firebaseAdmin;
    const key = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (!key) throw new Error('GOOGLE_APPLICATION_CREDENTIALS not set');
    firebaseAdmin.initializeApp({ credential: firebaseAdmin.credential.applicationDefault() });
    admin = firebaseAdmin;
    return admin;
  } catch (e) {
    throw new Error(`FCM not configured: ${(e as Error).message}`);
  }
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
  const a = await getAdmin();
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
  const result = await a.messaging().sendEachForMulticast(message);
  const invalidTokens: string[] = [];
  (result?.responses ?? []).forEach((r: { success: boolean; error?: { code?: string } }, i: number) => {
    if (!r.success && r.error?.code && INVALID_TOKEN_CODES.has(r.error.code)) {
      invalidTokens.push(tokens[i]);
    }
  });
  return { invalidTokens };
}
