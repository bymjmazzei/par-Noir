/**
 * Notification Service
 * Handles push notifications for feed subscriptions, comments, likes, etc.
 * Stored in Google Drive (decentralized) - users own their data
 * Event-driven: When event A happens, triggers push notification
 * Uses Google Sheets for better performance and querying
 */

import crypto from 'crypto';
import { NotificationsSheetsService, Notification as SheetsNotification } from './notificationsSheetsService';

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
  connection_request: boolean;
  connection_accepted: boolean;
  repost: boolean;
}

export interface NotificationsFile {
  identifier: string;
  updatedAt: string;
  notifications: Notification[];
  preferences?: NotificationPreferences;
}

export class NotificationService {
  /**
   * Normalize identifier to pn-identifier format
   */
  private static normalizeToPnIdentifier(did: string): string {
    return did.startsWith('pn-') ? did : `pn-${did}`;
  }

  /**
   * Get notifications file from user's Google Drive (Sheets).
   */
  static async getNotificationsFile(
    accessToken: string,
    metadataFolderId: string
  ): Promise<NotificationsFile | null> {
    try {
      const spreadsheetId = await NotificationsSheetsService.getNotificationsSheet(
        accessToken,
        metadataFolderId
      );
      const { notifications } = await NotificationsSheetsService.getNotifications(
        accessToken,
        spreadsheetId,
        { limit: 999999, offset: 0 }
      );
      const metadata = await NotificationsSheetsService.getMetadata(accessToken, spreadsheetId);
      const updatedAt = metadata?.updatedAt ?? (notifications[0]?.created_at ?? new Date().toISOString());
      const preferences = metadata?.preferences as NotificationPreferences | undefined;
      // Normalize identifier when reading (handles legacy data)
      const identifier = metadata?.identifier ?? '';
      const normalizedIdentifier = identifier.startsWith('pn-') ? identifier : (identifier ? `pn-${identifier}` : '');
      return {
        identifier: normalizedIdentifier,
        updatedAt,
        notifications,
        ...(preferences && { preferences })
      };
    } catch (error) {
      console.error('Error getting notifications file:', error);
      return null;
    }
  }

  /**
   * Create or update notifications file (Sheets).
   */
  static async updateNotificationsFile(
    accessToken: string,
    metadataFolderId: string,
    identifier: string,
    notificationsData: NotificationsFile
  ): Promise<void> {
    // Normalize identifier before writing
    const normalizedIdentifier = this.normalizeToPnIdentifier(identifier);
    const spreadsheetId = await NotificationsSheetsService.getNotificationsSheet(
      accessToken,
      metadataFolderId
    );
    await NotificationsSheetsService.setAllNotifications(
      accessToken,
      spreadsheetId,
      notificationsData.notifications
    );
    await NotificationsSheetsService.setMetadata(
      accessToken,
      spreadsheetId,
      notificationsData.updatedAt,
      (notificationsData.preferences ?? null) as Record<string, unknown> | null,
      normalizedIdentifier
    );
  }

  /**
   * Create a notification
   */
  static async createNotification(
    accessToken: string,
    metadataFolderId: string,
    userDid: string,
    notification: Omit<Notification, 'notification_id' | 'created_at' | 'read'>
  ): Promise<Notification> {
    // Normalize userDid and all DIDs in notification data
    const normalizedUserDid = this.normalizeToPnIdentifier(userDid);
    const normalizedData = notification.data ? { ...notification.data } : {};
    
    // Normalize user_did, from_did, to_did in data if present
    if (normalizedData.user_did) {
      normalizedData.user_did = this.normalizeToPnIdentifier(normalizedData.user_did);
    }
    if (normalizedData.from_did) {
      normalizedData.from_did = this.normalizeToPnIdentifier(normalizedData.from_did);
    }
    if (normalizedData.to_did) {
      normalizedData.to_did = this.normalizeToPnIdentifier(normalizedData.to_did);
    }

    try {
      const notificationId = crypto.randomUUID();
      const now = new Date().toISOString();

      // Get or create notifications sheet
      const spreadsheetId = await NotificationsSheetsService.getNotificationsSheet(
        accessToken,
        metadataFolderId
      );

      // Create notification entry
      const newNotification: SheetsNotification = {
        notification_id: notificationId,
        user_did: normalizedUserDid,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        data: normalizedData,
        read: false,
        created_at: now
      };

      // Append to sheet
      await NotificationsSheetsService.appendNotification(accessToken, spreadsheetId, newNotification);

      return newNotification;
    } catch (error) {
      console.error('[NotificationService] Error creating notification via sheets:', error);
      console.error('[NotificationService] Error details:', {
        userDid,
        notificationType: notification.type,
        metadataFolderId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }

  /**
   * Get notifications for a user
   */
  static async getUserNotifications(
    accessToken: string,
    metadataFolderId: string,
    options?: {
      limit?: number;
      offset?: number;
      unreadOnly?: boolean;
      type?: Notification['type'];
    }
  ): Promise<{ notifications: Notification[]; total: number }> {
    try {
      // Get or create notifications sheet
      const spreadsheetId = await NotificationsSheetsService.getNotificationsSheet(
        accessToken,
        metadataFolderId
      );

      // Get notifications from sheet
      const result = await NotificationsSheetsService.getNotifications(accessToken, spreadsheetId, {
        limit: options?.limit,
        offset: options?.offset,
        unreadOnly: options?.unreadOnly,
        type: options?.type
      });

      return result;
    } catch (error) {
      console.error('[NotificationService] Error getting notifications via sheets:', error);
      console.error('[NotificationService] Error details:', {
        metadataFolderId,
        options,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      return { notifications: [], total: 0 };
    }
  }

  /**
   * Mark notification as read
   */
  static async markAsRead(
    accessToken: string,
    metadataFolderId: string,
    userDid: string,
    notificationId: string
  ): Promise<boolean> {
    try {
      // Get or create notifications sheet
      const spreadsheetId = await NotificationsSheetsService.getNotificationsSheet(
        accessToken,
        metadataFolderId
      );

      // Mark as read in sheet
      return await NotificationsSheetsService.markAsRead(accessToken, spreadsheetId, notificationId);
    } catch (error) {
      console.error('[NotificationService] Error marking notification as read via sheets:', error);
      console.error('[NotificationService] Error details:', {
        userDid,
        notificationId,
        metadataFolderId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      return false;
    }
  }

  /**
   * Mark all notifications as read for a user
   */
  static async markAllAsRead(
    accessToken: string,
    metadataFolderId: string,
    userDid: string
  ): Promise<number> {
    try {
      // Get or create notifications sheet
      const spreadsheetId = await NotificationsSheetsService.getNotificationsSheet(
        accessToken,
        metadataFolderId
      );

      // Mark all as read in sheet
      return await NotificationsSheetsService.markAllAsRead(accessToken, spreadsheetId, userDid);
    } catch (error) {
      console.error('[NotificationService] Error marking all notifications as read via sheets:', error);
      console.error('[NotificationService] Error details:', {
        userDid,
        metadataFolderId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      return 0;
    }
  }

  /**
   * Delete notification
   */
  static async deleteNotification(
    accessToken: string,
    metadataFolderId: string,
    userDid: string,
    notificationId: string
  ): Promise<boolean> {
    const notificationsFile = await this.getNotificationsFile(accessToken, metadataFolderId);
    if (!notificationsFile) {
      return false;
    }

    const initialLength = notificationsFile.notifications.length;
    notificationsFile.notifications = notificationsFile.notifications.filter(
      n => n.notification_id !== notificationId
    );

    if (notificationsFile.notifications.length < initialLength) {
      notificationsFile.updatedAt = new Date().toISOString();
      await this.updateNotificationsFile(accessToken, metadataFolderId, userDid, notificationsFile);
      return true;
    }

    return false;
  }

  /**
   * Get unread count for a user
   */
  static async getUnreadCount(
    accessToken: string,
    metadataFolderId: string
  ): Promise<number> {
    try {
      // Get or create notifications sheet
      const spreadsheetId = await NotificationsSheetsService.getNotificationsSheet(
        accessToken,
        metadataFolderId
      );

      // Get unread notifications count
      const result = await NotificationsSheetsService.getNotifications(accessToken, spreadsheetId, {
        unreadOnly: true,
        limit: 10000 // Get all unread to count them
      });

      return result.total;
    } catch (error) {
      console.error('[NotificationService] Error getting unread count via sheets:', error);
      console.error('[NotificationService] Error details:', {
        metadataFolderId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      return 0;
    }
  }

  /**
   * Get notification preferences for a user
   */
  static async getPreferences(
    accessToken: string,
    metadataFolderId: string,
    userDid: string
  ): Promise<NotificationPreferences> {
    const notificationsFile = await this.getNotificationsFile(accessToken, metadataFolderId);
    
    if (!notificationsFile || !notificationsFile.preferences) {
      return this.getDefaultPreferences(userDid);
    }

    return notificationsFile.preferences;
  }

  /**
   * Update notification preferences
   */
  static async updatePreferences(
    accessToken: string,
    metadataFolderId: string,
    userDid: string,
    preferences: Partial<Omit<NotificationPreferences, 'user_did'>>
  ): Promise<NotificationPreferences> {
    let notificationsFile = await this.getNotificationsFile(accessToken, metadataFolderId);
    const now = new Date().toISOString();

    if (!notificationsFile) {
      notificationsFile = {
        identifier: userDid,
        updatedAt: now,
        notifications: [],
        preferences: this.getDefaultPreferences(userDid)
      };
    }

    if (!notificationsFile.preferences) {
      notificationsFile.preferences = this.getDefaultPreferences(userDid);
    }

    // Update preferences
    notificationsFile.preferences = {
      ...notificationsFile.preferences,
      ...preferences
    };
    notificationsFile.updatedAt = now;

    await this.updateNotificationsFile(accessToken, metadataFolderId, userDid, notificationsFile);
    return notificationsFile.preferences;
  }

  /**
   * Get default notification preferences
   */
  private static getDefaultPreferences(userDid: string): NotificationPreferences {
    return {
      user_did: userDid,
      feed_new_post: true,
      feed_new_comment: true,
      feed_new_like: false,
      feed_new_subscriber: true,
      comment_reply: true,
      mention: true,
      connection_request: true,
      connection_accepted: true,
      repost: true
    };
  }

  /**
   * Notify subscribers when a new post is added to a feed
   */
  static async notifyFeedNewPost(
    feedId: string,
    fileId: string,
    feedName: string,
    creatorDid: string,
    subscriberAccessTokens: Array<{ accessToken: string; metadataFolderId: string; userDid: string }>
  ): Promise<void> {
    for (const subscriber of subscriberAccessTokens) {
      try {
        // Always create notification - preferences only control alerting/display, not storage
        await this.createNotification(
          subscriber.accessToken,
          subscriber.metadataFolderId,
          subscriber.userDid,
          {
            user_did: subscriber.userDid,
            type: 'feed_new_post',
            title: `New post in ${feedName}`,
            message: `A new post has been added to ${feedName}`,
            data: {
              feed_id: feedId,
              file_id: fileId,
              creator_did: creatorDid
            }
          }
        );
      } catch (error) {
        console.error('Failed to send feed post notification:', error);
        // Continue with other subscribers
      }
    }
  }

  /**
   * Notify file owner when someone comments on their file
   */
  static async notifyFileComment(
    accessToken: string,
    metadataFolderId: string,
    fileId: string,
    commentId: string,
    commenterDid: string,
    fileOwnerDid: string
  ): Promise<void> {
    // Don't notify if commenter is the owner
    if (commenterDid === fileOwnerDid) {
      return;
    }

    // Always create notification - preferences only control alerting/display, not storage
    await this.createNotification(
      accessToken,
      metadataFolderId,
      fileOwnerDid,
      {
        user_did: fileOwnerDid,
        type: 'feed_new_comment',
        title: 'New comment on your post',
        message: `Someone commented on your post`,
        data: {
          file_id: fileId,
          comment_id: commentId,
          user_did: commenterDid
        }
      }
    );
  }

  /**
   * Notify file owner when someone likes their file
   */
  static async notifyFileLike(
    accessToken: string,
    metadataFolderId: string,
    fileId: string,
    likerDid: string,
    fileOwnerDid: string
  ): Promise<void> {
    // Don't notify if liker is the owner
    if (likerDid === fileOwnerDid) {
      return;
    }

    // Always create notification - preferences only control alerting/display, not storage
    await this.createNotification(
      accessToken,
      metadataFolderId,
      fileOwnerDid,
      {
        user_did: fileOwnerDid,
        type: 'feed_new_like',
        title: 'New like on your post',
        message: `Someone liked your post`,
        data: {
          file_id: fileId,
          user_did: likerDid
        }
      }
    );
  }

  /**
   * Notify feed creator when someone subscribes
   */
  static async notifyFeedSubscription(
    accessToken: string,
    metadataFolderId: string,
    feedId: string,
    subscriberDid: string,
    creatorDid: string,
    feedName: string
  ): Promise<void> {
    // Always create notification - preferences only control alerting/display, not storage
    await this.createNotification(
      accessToken,
      metadataFolderId,
      creatorDid,
      {
        user_did: creatorDid,
        type: 'feed_new_subscriber',
        title: 'New subscriber',
        message: `Someone subscribed to ${feedName}`,
        data: {
          feed_id: feedId,
          user_did: subscriberDid
        }
      }
    );
  }

  /**
   * Notify user when they receive a connection request
   */
  static async notifyConnectionRequest(
    accessToken: string,
    metadataFolderId: string,
    connectionId: string,
    requesterDid: string,
    recipientDid: string
  ): Promise<void> {
    // Normalize DIDs to pn-identifiers
    const normalizedRequesterDid = this.normalizeToPnIdentifier(requesterDid);
    const normalizedRecipientDid = this.normalizeToPnIdentifier(recipientDid);
    
    // Always create notification - preferences only control alerting/display, not storage
    await this.createNotification(
      accessToken,
      metadataFolderId,
      normalizedRecipientDid,
      {
        user_did: normalizedRecipientDid,
        type: 'connection_request',
        title: 'New connection request',
        message: 'Someone wants to connect with you',
        data: {
          connection_id: connectionId,
          user_did: normalizedRequesterDid
        }
      }
    );
  }

  /**
   * Notify user when their connection request is accepted
   */
  static async notifyConnectionAccepted(
    accessToken: string,
    metadataFolderId: string,
    connectionId: string,
    acceptorDid: string,
    requesterDid: string
  ): Promise<void> {
    // Normalize DIDs to pn-identifiers
    const normalizedAcceptorDid = this.normalizeToPnIdentifier(acceptorDid);
    const normalizedRequesterDid = this.normalizeToPnIdentifier(requesterDid);
    
    // Always create notification - preferences only control alerting/display, not storage
    await this.createNotification(
      accessToken,
      metadataFolderId,
      normalizedRequesterDid,
      {
        user_did: normalizedRequesterDid,
        type: 'connection_accepted',
        title: 'Connection accepted',
        message: 'Your connection request was accepted',
        data: {
          connection_id: connectionId,
          user_did: normalizedAcceptorDid
        }
      }
    );
  }

  /**
   * Notify user when someone reposts their content
   */
  static async notifyRepost(
    accessToken: string,
    metadataFolderId: string,
    fileId: string,
    reposterDid: string,
    originalOwnerDid: string
  ): Promise<void> {
    // Don't notify if reposter is the owner
    if (reposterDid === originalOwnerDid) {
      return;
    }

    // Always create notification - preferences only control alerting/display, not storage
    await this.createNotification(
      accessToken,
      metadataFolderId,
      originalOwnerDid,
      {
        user_did: originalOwnerDid,
        type: 'repost',
        title: 'Your post was reposted',
        message: 'Someone reposted your content',
        data: {
          file_id: fileId,
          user_did: reposterDid
        }
      }
    );
  }

  /**
   * Notify user when they receive a new message
   */
  static async notifyNewMessage(
    accessToken: string,
    metadataFolderId: string,
    messageId: string,
    fromDid: string,
    toDid: string,
    threadId?: string
  ): Promise<void> {
    // Normalize DIDs to pn-identifiers
    const normalizedFromDid = this.normalizeToPnIdentifier(fromDid);
    const normalizedToDid = this.normalizeToPnIdentifier(toDid);
    
    await this.createNotification(
      accessToken,
      metadataFolderId,
      normalizedToDid,
      {
        user_did: normalizedToDid,
        type: 'new_message',
        title: 'New message',
        message: 'You have a new message',
        data: {
          message_id: messageId,
          from_did: normalizedFromDid,
          thread_id: threadId
        }
      }
    );
  }
}
