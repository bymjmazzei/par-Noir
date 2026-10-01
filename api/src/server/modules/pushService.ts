/**
 * Push payloads stay typed for the FCM helper. Device tokens are not stored.
 */

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

export class PushService {
  static async registerToken(
    _pnIdentifier: string,
    _deviceToken: string,
    _platform: 'ios' | 'android'
  ): Promise<void> {
    return;
  }

  static async unregisterToken(_pnIdentifier: string, _deviceToken: string): Promise<void> {
    return;
  }

  static async send(_pnIdentifier: string, _payload: PushPayload): Promise<void> {
    return;
  }
}
