/**
 * Push notification registration and handlers (id-dashboard).
 * Uses @capacitor/push-notifications on native only.
 * Registers device token with par Noir API when user has valid access token.
 * Note: API expects pn OAuth Bearer token; dashboard token may not be accepted until pn OAuth integration.
 */

import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { API_ENDPOINT } from '../config/api';

export interface UsePushNotificationsOptions {
  /** Returns current access token or null if not authenticated. */
  getAccessToken: () => Promise<string | null>;
  /** Called when user taps a notification. */
  onNotificationAction?: (data: Record<string, string>) => void;
}

function getPlatform(): 'ios' | 'android' | null {
  const platform = Capacitor.getPlatform();
  if (platform === 'ios') return 'ios';
  if (platform === 'android') return 'android';
  return null;
}

export function usePushNotifications({
  getAccessToken,
  onNotificationAction,
}: UsePushNotificationsOptions): void {
  const registeredTokenRef = useRef<string | null>(null);
  const onActionRef = useRef(onNotificationAction);
  onActionRef.current = onNotificationAction;

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const platform = getPlatform();
    if (!platform) return;

    const registerTokenWithApi = async (token: string) => {
      const accessToken = await getAccessToken();
      if (!accessToken) return;
      if (registeredTokenRef.current === token) return;
      try {
        const res = await fetch(`${API_ENDPOINT}/api/push/register`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ deviceToken: token, platform }),
        });
        if (res.ok) {
          registeredTokenRef.current = token;
        }
      } catch (e) {
        console.debug('[Push] Failed to register token:', (e as Error)?.message);
      }
    };

    const unregisterTokenFromApi = async (token: string) => {
      const accessToken = await getAccessToken();
      if (!accessToken) return;
      try {
        await fetch(`${API_ENDPOINT}/api/push/register`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ deviceToken: token }),
        });
        if (registeredTokenRef.current === token) {
          registeredTokenRef.current = null;
        }
      } catch (e) {
        console.debug('[Push] Failed to unregister token:', (e as Error)?.message);
      }
    };

    let regListener: { remove: () => Promise<void> } | null = null;
    let receivedListener: { remove: () => Promise<void> } | null = null;
    let actionListener: { remove: () => Promise<void> } | null = null;

    const setup = async () => {
      try {
        const perm = await PushNotifications.requestPermissions();
        if (perm.receive !== 'granted') return;
        await PushNotifications.register();

        regListener = await PushNotifications.addListener(
          'registration',
          (ev) => registerTokenWithApi(ev.value)
        );
        receivedListener = await PushNotifications.addListener('pushNotificationReceived', () => {});
        actionListener = await PushNotifications.addListener(
          'pushNotificationActionPerformed',
          (ev) => {
            const data = (ev.notification.data as Record<string, string>) || {};
            onActionRef.current?.(data);
          }
        );
      } catch (e) {
        console.debug('[Push] Setup failed:', (e as Error)?.message);
      }
    };

    setup();

    return () => {
      regListener?.remove();
      receivedListener?.remove();
      actionListener?.remove();
      if (registeredTokenRef.current) {
        unregisterTokenFromApi(registeredTokenRef.current).catch(() => {});
        registeredTokenRef.current = null;
      }
    };
  }, [getAccessToken]);
}
