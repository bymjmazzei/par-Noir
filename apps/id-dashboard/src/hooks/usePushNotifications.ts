/**
 * Push registration is not used. Messages land on the notifications sheet.
 */

export interface UsePushNotificationsOptions {
  getAccessToken: () => Promise<string | null>;
  onNotificationAction?: (data: Record<string, string>) => void;
}

export function usePushNotifications(_options: UsePushNotificationsOptions): void {
  return;
}
