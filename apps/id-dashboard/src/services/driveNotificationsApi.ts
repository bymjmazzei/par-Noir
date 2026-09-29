import { listDeviceNotifications, markDeviceNotificationsRead } from '@par-noir/device-cloud-credentials';
import { sessionDriveFor } from './sessionDrive';

export interface DriveNotification {
  notification_id: string;
  user_pn_identifier?: string;
  type: string;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  read: boolean;
  created_at: string;
}

export async function fetchDriveNotifications(
  userPnIdentifier: string,
  authToken: string,
  options?: { limit?: number; unreadOnly?: boolean; type?: string }
): Promise<{ notifications: DriveNotification[]; total: number }> {
  const drive = await sessionDriveFor(userPnIdentifier, authToken);
  const sheetId = drive.index.sheetIds.notifications;
  let notifications: DriveNotification[] = sheetId
    ? await listDeviceNotifications(drive.accessToken, sheetId)
    : [];
  if (options?.unreadOnly) notifications = notifications.filter((n) => !n.read);
  if (options?.type) notifications = notifications.filter((n) => n.type === options.type);
  const total = notifications.length;
  if (options?.limit) notifications = notifications.slice(0, options.limit);
  return { notifications, total };
}

export async function markDriveNotificationRead(
  notificationId: string,
  userPnIdentifier: string,
  authToken: string
): Promise<void> {
  const drive = await sessionDriveFor(userPnIdentifier, authToken);
  const sheetId = drive.index.sheetIds.notifications;
  if (!sheetId) throw new Error('cloud_on_device');
  await markDeviceNotificationsRead(drive.accessToken, sheetId, [notificationId]);
}
