/**
 * Push notification registration and handlers.
 * Uses @capacitor/push-notifications on native only.
 * Registers device token with par Noir API when user has valid access token.
 *
 * Do not call requestPermissions() until unlocked — the iOS system sheet blocks
 * the whole Cap WebView (unlock / OAuth) and reappears after every reinstall.
 */

import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { API_ENDPOINT } from '../config/api';

export interface UsePushNotificationsOptions {
  /** Returns current access token or null if not authenticated. Used for Bearer auth. */
  getAccessToken: () => Promise<string | null>;
  /** When false, do not prompt or register (e.g. locked session). */
  enabled?: boolean;
  /** Called when user taps a notification; data may contain threadId, messageId, etc. */
  onNotificationAction?: (data: Record<string, string>) => void;
}

/** Detect platform for push registration. */
function getPlatform(): 'ios' | 'android' | null {
  const platform = Capacitor.getPlatform();
  if (platform === 'ios') return 'ios';
  if (platform === 'android') return 'android';
  return null;
}

export function usePushNotifications({
  getAccessToken,
  enabled = true,
  onNotificationAction,
}: UsePushNotificationsOptions): void {
  const registeredTokenRef = useRef<string | null>(null);
  const onActionRef = useRef(onNotificationAction);
  onActionRef.current = onNotificationAction;
  const getAccessTokenRef = useRef(getAccessToken);
  getAccessTokenRef.current = getAccessToken;

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    if (!enabled) return;
    const platform = getPlatform();
    if (!platform) return;

    const registerTokenWithApi = async (token: string) => {
      const accessToken = await getAccessTokenRef.current();
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
      const accessToken = await getAccessTokenRef.current();
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
    let cancelled = false;

    const setup = async () => {
      try {
        // Wait until OAuth session exists — never prompt over the locked / unlock UI.
        const accessToken = await getAccessTokenRef.current();
        if (!accessToken || cancelled) return;

        const existing = await PushNotifications.checkPermissions();
        if (cancelled) return;
        if (existing.receive === 'denied') return;

        if (existing.receive === 'prompt' || existing.receive === 'prompt-with-rationale') {
          const perm = await PushNotifications.requestPermissions();
          if (cancelled) return;
          if (perm.receive !== 'granted') return;
        } else if (existing.receive !== 'granted') {
          return;
        }

        await PushNotifications.register();

        regListener = await PushNotifications.addListener(
          'registration',
          (ev) => registerTokenWithApi(ev.value)
        );
        receivedListener = await PushNotifications.addListener(
          'pushNotificationReceived',
          (_notification) => {
            // Optionally show in-app or update badge
          }
        );
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

    void setup();

    return () => {
      cancelled = true;
      regListener?.remove();
      receivedListener?.remove();
      actionListener?.remove();
      if (registeredTokenRef.current) {
        unregisterTokenFromApi(registeredTokenRef.current).catch(() => {});
        registeredTokenRef.current = null;
      }
    };
  }, [enabled]);
}
