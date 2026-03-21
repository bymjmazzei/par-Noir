/**
 * Push notification service
 * Registers device tokens and sends push via FCM.
 * Requires firebase-admin to be configured for actual delivery.
 */

import { getDatabasePool } from '../utils/database';

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

export class PushService {
  static async registerToken(
    pnIdentifier: string,
    deviceToken: string,
    platform: 'ios' | 'android'
  ): Promise<void> {
    const db = getDatabasePool();
    await db.query(
      `INSERT INTO device_tokens (pn_identifier, device_token, platform, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (pn_identifier, device_token) DO UPDATE SET platform = $3, updated_at = NOW()`,
      [pnIdentifier, deviceToken, platform]
    );
  }

  static async unregisterToken(pnIdentifier: string, deviceToken: string): Promise<void> {
    const db = getDatabasePool();
    await db.query(
      'DELETE FROM device_tokens WHERE pn_identifier = $1 AND device_token = $2',
      [pnIdentifier, deviceToken]
    );
  }

  static async getTokensForUser(pnIdentifier: string): Promise<{ device_token: string; platform: string }[]> {
    const db = getDatabasePool();
    const result = await db.query(
      'SELECT device_token, platform FROM device_tokens WHERE pn_identifier = $1',
      [pnIdentifier]
    );
    return result.rows;
  }

  /**
   * Send push notification to a user's registered devices.
   * Requires firebase-admin and FCM config. If not configured, no-op.
   * To enable: npm install firebase-admin, set GOOGLE_APPLICATION_CREDENTIALS.
   */
  static async send(pnIdentifier: string, payload: PushPayload): Promise<void> {
    const tokens = await this.getTokensForUser(pnIdentifier);
    if (tokens.length === 0) return;

    try {
      const { sendPushViaFCM } = await import('./pushFcm');
      await sendPushViaFCM(
        tokens.map((t) => t.device_token),
        payload
      );
    } catch (err) {
      // pushFcm may not exist or FCM not configured
      console.debug('[Push] FCM not configured or send failed:', (err as Error)?.message);
    }
  }
}
