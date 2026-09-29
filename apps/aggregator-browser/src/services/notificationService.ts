/**
 * Notification Service (Frontend)
 * Handles notifications for feed subscriptions, comments, likes, etc.
 */

import { sessionDriveFor } from './sessionDrive';

export interface Notification {
  notification_id: string;
  user_did: string;
  type: 'feed_new_post' | 'feed_new_comment' | 'feed_new_like' | 'feed_new_subscriber' | 'comment_reply' | 'mention' | 'connection_request' | 'connection_accepted' | 'repost' | 'follow' | 'new_message';
  title: string;
  message: string;
  data?: {
    feed_id?: string;
    file_id?: string;
    comment_id?: string;
    user_did?: string;
    connection_id?: string;
    message_id?: string;
    thread_id?: string;
    [key: string]: any;
  };
  read: boolean;
  created_at: string;
}

export interface NotificationPreferences {
  user_did: string;
  feed_new_post: boolean;
  feed_new_comment: boolean;
  feed_new_like: boolean;
  feed_new_subscriber: boolean;
  comment_reply: boolean;
  mention: boolean;
  connection_request?: boolean;
  connection_accepted?: boolean;
  repost?: boolean;
  new_message?: boolean;
}

export interface NotificationListResponse {
  notifications: Notification[];
  total: number;
  limit: number;
  offset: number;
}

export class NotificationService {
  /**
   * Get user's notifications
   */
  static async getNotifications(
    userPnIdentifier: string,
    options?: {
      limit?: number;
      offset?: number;
      unreadOnly?: boolean;
      type?: Notification['type'];
    }
  ): Promise<NotificationListResponse> {
    const { listDeviceNotifications } = await import('@par-noir/device-cloud-credentials');
    const drive = await sessionDriveFor(userPnIdentifier);
    const sheetId = drive.index.sheetIds.notifications;
    let notifications = sheetId
      ? await listDeviceNotifications(drive.accessToken, sheetId)
      : [];
    if (options?.unreadOnly) notifications = notifications.filter((n) => !n.read);
    if (options?.type) notifications = notifications.filter((n) => n.type === options.type);
    const total = notifications.length;
    const offset = options?.offset || 0;
    const limit = options?.limit || notifications.length;
    notifications = notifications.slice(offset, offset + limit);
    return {
      notifications: notifications as unknown as Notification[],
      total,
      limit,
      offset,
    };
  }

  /**
   * Get unread notification count
   */
  static async getUnreadCount(userPnIdentifier: string): Promise<number> {
    const listed = await NotificationService.getNotifications(userPnIdentifier, { unreadOnly: true });
    return listed.total;
  }

  /**
   * Mark notification as read
   */
  static async markAsRead(notificationId: string, userPnIdentifier: string): Promise<void> {
    const { markDeviceNotificationsRead } = await import('@par-noir/device-cloud-credentials');
    const drive = await sessionDriveFor(userPnIdentifier);
    const sheetId = drive.index.sheetIds.notifications;
    if (!sheetId) throw new Error('cloud_on_device');
    await markDeviceNotificationsRead(drive.accessToken, sheetId, [notificationId]);
  }

  /**
   * Mark all notifications as read
   */
  static async markAllAsRead(userPnIdentifier: string): Promise<number> {
    const { markDeviceNotificationsRead } = await import('@par-noir/device-cloud-credentials');
    const drive = await sessionDriveFor(userPnIdentifier);
    const sheetId = drive.index.sheetIds.notifications;
    if (!sheetId) return 0;
    return markDeviceNotificationsRead(drive.accessToken, sheetId, 'all');
  }

  /**
   * Delete notification
   */
  static async deleteNotification(notificationId: string, userPnIdentifier: string): Promise<void> {
    const { readSheetValues, writeSheetValues } = await import('@par-noir/device-cloud-credentials');
    const drive = await sessionDriveFor(userPnIdentifier);
    const sheetId = drive.index.sheetIds.notifications;
    if (!sheetId) return;
    const rows = await readSheetValues(drive.accessToken, sheetId, 'Notifications!A2:H');
    const next = rows.filter((row) => row[0] !== notificationId);
    await writeSheetValues(
      drive.accessToken,
      sheetId,
      'Notifications!A2:H',
      next.length ? next : [['', '', '', '', '', '', '', '']]
    );
  }

  /**
   * Get notification preferences
   */
  static async getPreferences(userPnIdentifier: string): Promise<NotificationPreferences> {
    const defaults: NotificationPreferences = {
      user_did: userPnIdentifier,
      feed_new_post: true,
      feed_new_comment: true,
      feed_new_like: true,
      feed_new_subscriber: true,
      comment_reply: true,
      mention: true,
    };
    try {
      const { readSheetValues } = await import('@par-noir/device-cloud-credentials');
      const drive = await sessionDriveFor(userPnIdentifier);
      const sheetId = drive.index.sheetIds.preferences;
      if (!sheetId) return defaults;
      const rows = await readSheetValues(drive.accessToken, sheetId, 'Current!A2:B');
      const row = rows.find((r) => r[0] === 'notificationPreferences');
      if (!row?.[1]) return defaults;
      return { ...defaults, ...JSON.parse(row[1]) };
    } catch {
      return defaults;
    }
  }

  /**
   * Update notification preferences
   */
  static async updatePreferences(
    userPnIdentifier: string,
    preferences: Partial<Omit<NotificationPreferences, 'user_did'>>
  ): Promise<NotificationPreferences> {
    const current = await NotificationService.getPreferences(userPnIdentifier);
    const next = { ...current, ...preferences, user_did: userPnIdentifier };
    const { readSheetValues, writeSheetValues } = await import('@par-noir/device-cloud-credentials');
    const drive = await sessionDriveFor(userPnIdentifier);
    const sheetId = drive.index.sheetIds.preferences;
    if (!sheetId) return next;
    const rows = await readSheetValues(drive.accessToken, sheetId, 'Current!A2:B');
    const without = rows.filter((r) => r[0] && r[0] !== 'notificationPreferences');
    without.push(['notificationPreferences', JSON.stringify(next)]);
    await writeSheetValues(drive.accessToken, sheetId, 'Current!A2:B', without);
    return next;
  }
}
