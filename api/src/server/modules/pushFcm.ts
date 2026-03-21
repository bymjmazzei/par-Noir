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

export async function sendPushViaFCM(
  tokens: string[],
  payload: PushPayload
): Promise<void> {
  const a = await getAdmin();
  const message = {
    notification: { title: payload.title, body: payload.body },
    data: payload.data || {},
    tokens,
    android: { priority: 'high' as const },
    apns: { payload: { aps: { sound: 'default' } } }
  };
  await a.messaging().sendEachForMulticast(message);
}
