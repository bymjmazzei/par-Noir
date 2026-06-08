/**
 * Notification Service
 * Handles push notifications for feed subscriptions, comments, likes, etc.
 * Stored in Google Drive (decentralized) - users own their data
 * Event-driven: When event A happens, triggers push notification
 * Uses Google Sheets for better performance and querying
 */

import crypto from 'crypto';
import { NotificationsSheetsService, Notification as SheetsNotification } from './notificationsSheetsService';
import { GoogleDriveToken } from './googleOAuth2Helper';

export interface Notification {
  notification_id: string;
  user_pn_identifier: string;
  type: 'feed_new_post' | 'feed_new_comment' | 'feed_new_like' | 'feed_new_subscriber' | 'comment_reply' | 'mention' | 'connection_request' | 'connection_accepted' | 'repost' | 'follow' | 'new_message' | 'data_point_request';
  title: string;
  message: string;
  data?: {
    feed_id?: string;
    file_id?: string;
    comment_id?: string;
    user_pn_identifier?: string;
    connection_id?: string;
    message_id?: string;
    thread_id?: string;
    [key: string]: any;
  };
  read: boolean;
  created_at: string;
}

export interface NotificationPreferences {
  user_pn_identifier: string;
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
    metadataFolderId: string,
    userPnIdentifier: string,
    accountId?: string
  ): Promise<NotificationsFile | null> {
    try {
      // Convert accessToken string to token object
      const token: GoogleDriveToken = { access_token: accessToken };
      const normalizedUserPnIdentifier = this.normalizeToPnIdentifier(userPnIdentifier);
      
      const spreadsheetId = await NotificationsSheetsService.getNotificationsSheet(
        token,
        metadataFolderId,
        normalizedUserPnIdentifier,
        accountId
      );
      const { notifications } = await NotificationsSheetsService.getNotifications(
        token,
        spreadsheetId,
        normalizedUserPnIdentifier,
        accountId,
        { limit: 500, offset: 0 }
      );
      const metadata = await NotificationsSheetsService.getMetadata(token, spreadsheetId, normalizedUserPnIdentifier, accountId);
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
    notificationsData: NotificationsFile,
    userPnIdentifier: string,
    accountId?: string
  ): Promise<void> {
    // Convert accessToken string to token object
    const token: GoogleDriveToken = { access_token: accessToken };
    // Normalize identifier before writing
    const normalizedIdentifier = this.normalizeToPnIdentifier(identifier);
    const normalizedUserPnIdentifier = this.normalizeToPnIdentifier(userPnIdentifier);
    const spreadsheetId = await NotificationsSheetsService.getNotificationsSheet(
      token,
      metadataFolderId,
      normalizedUserPnIdentifier,
      accountId
    );
    await NotificationsSheetsService.setAllNotifications(
      token,
      spreadsheetId,
      notificationsData.notifications,
      normalizedUserPnIdentifier,
      accountId
    );
    await NotificationsSheetsService.setMetadata(
      token,
      spreadsheetId,
      notificationsData.updatedAt,
      (notificationsData.preferences ?? null) as Record<string, unknown> | null,
      normalizedIdentifier,
      normalizedUserPnIdentifier,
      accountId
    );
  }

  /**
   * Create a notification
   */
  static async createNotification(
    accessToken: string,
    metadataFolderId: string,
    userPnIdentifier: string,
    notification: Omit<Notification, 'notification_id' | 'created_at' | 'read'>
  ): Promise<Notification> {
    // Use pn identifier directly (already normalized)
    // Normalize any legacy DID fields in notification data for backward compatibility
    const normalizedUserPnIdentifier = this.normalizeToPnIdentifier(userPnIdentifier);
    const normalizedData = notification.data ? { ...notification.data } : {};
    
    // Normalize user_pn_identifier, from_pn_identifier, to_pn_identifier in data if present (handles legacy field names)
    if (normalizedData.user_did) {
      normalizedData.user_pn_identifier = this.normalizeToPnIdentifier(normalizedData.user_did);
      delete normalizedData.user_did;
    }
    if (normalizedData.user_pn_identifier) {
      normalizedData.user_pn_identifier = this.normalizeToPnIdentifier(normalizedData.user_pn_identifier);
    }
    if (normalizedData.from_did) {
      normalizedData.from_pn_identifier = this.normalizeToPnIdentifier(normalizedData.from_did);
      delete normalizedData.from_did;
    }
    if (normalizedData.from_pn_identifier) {
      normalizedData.from_pn_identifier = this.normalizeToPnIdentifier(normalizedData.from_pn_identifier);
    }
    if (normalizedData.to_did) {
      normalizedData.to_pn_identifier = this.normalizeToPnIdentifier(normalizedData.to_did);
      delete normalizedData.to_did;
    }
    if (normalizedData.to_pn_identifier) {
      normalizedData.to_pn_identifier = this.normalizeToPnIdentifier(normalizedData.to_pn_identifier);
    }

    try {
      const notificationId = crypto.randomUUID();
      const now = new Date().toISOString();

      // Convert accessToken string to token object
      const token: GoogleDriveToken = { access_token: accessToken };

      // Get or create notifications sheet
      const spreadsheetId = await NotificationsSheetsService.getNotificationsSheet(
        token,
        metadataFolderId,
        normalizedUserPnIdentifier,
        undefined // accountId not available in this context
      );

      // Create notification entry
      const newNotification: SheetsNotification = {
        notification_id: notificationId,
        user_pn_identifier: normalizedUserPnIdentifier,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        data: normalizedData,
        read: false,
        created_at: now
      };

      // Append to sheet
      await NotificationsSheetsService.appendNotification(token, spreadsheetId, newNotification, normalizedUserPnIdentifier, undefined);

      try {
        const { emitNewNotification } = await import('./realtimeEvents');
        emitNewNotification(normalizedUserPnIdentifier, notification.type);
      } catch {
        /* optional realtime */
      }

      return newNotification;
    } catch (error) {
      console.error('[NotificationService] Error creating notification via sheets:', error);
      console.error('[NotificationService] Error details:', {
        userPnIdentifier,
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
    userPnIdentifier: string,
    accountId?: string,
    options?: {
      limit?: number;
      offset?: number;
      unreadOnly?: boolean;
      type?: Notification['type'];
    }
  ): Promise<{ notifications: Notification[]; total: number }> {
    try {
      // Convert accessToken string to token object
      const token: GoogleDriveToken = { access_token: accessToken };
      const normalizedUserPnIdentifier = this.normalizeToPnIdentifier(userPnIdentifier);
      
      // Get or create notifications sheet
      const spreadsheetId = await NotificationsSheetsService.getNotificationsSheet(
        token,
        metadataFolderId,
        normalizedUserPnIdentifier,
        accountId
      );

      // Get notifications from sheet
      const result = await NotificationsSheetsService.getNotifications(
        token,
        spreadsheetId,
        normalizedUserPnIdentifier,
        accountId,
        {
          limit: options?.limit,
          offset: options?.offset,
          unreadOnly: options?.unreadOnly,
          type: options?.type
        }
      );

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
    userPnIdentifier: string,
    notificationId: string,
    accountId?: string
  ): Promise<boolean> {
    try {
      // Convert accessToken string to token object
      const token: GoogleDriveToken = { access_token: accessToken };
      const normalizedUserPnIdentifier = this.normalizeToPnIdentifier(userPnIdentifier);
      
      // Get or create notifications sheet
      const spreadsheetId = await NotificationsSheetsService.getNotificationsSheet(
        token,
        metadataFolderId,
        normalizedUserPnIdentifier,
        accountId
      );

      // Mark as read in sheet
      return await NotificationsSheetsService.markAsRead(token, spreadsheetId, notificationId, normalizedUserPnIdentifier, accountId);
    } catch (error) {
      console.error('[NotificationService] Error marking notification as read via sheets:', error);
      console.error('[NotificationService] Error details:', {
        userPnIdentifier,
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
    userPnIdentifier: string,
    accountId?: string
  ): Promise<number> {
    try {
      // Convert accessToken string to token object
      const token: GoogleDriveToken = { access_token: accessToken };
      const normalizedUserPnIdentifier = this.normalizeToPnIdentifier(userPnIdentifier);
      
      // Get or create notifications sheet
      const spreadsheetId = await NotificationsSheetsService.getNotificationsSheet(
        token,
        metadataFolderId,
        normalizedUserPnIdentifier,
        accountId
      );

      // Mark all as read in sheet
      return await NotificationsSheetsService.markAllAsRead(token, spreadsheetId, normalizedUserPnIdentifier, accountId);
    } catch (error) {
      console.error('[NotificationService] Error marking all notifications as read via sheets:', error);
      console.error('[NotificationService] Error details:', {
        userPnIdentifier,
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
    userPnIdentifier: string,
    notificationId: string,
    accountId?: string
  ): Promise<boolean> {
    const normalizedUserPnIdentifier = this.normalizeToPnIdentifier(userPnIdentifier);
    const notificationsFile = await this.getNotificationsFile(accessToken, metadataFolderId, normalizedUserPnIdentifier, accountId);
    if (!notificationsFile) {
      return false;
    }

    const initialLength = notificationsFile.notifications.length;
    notificationsFile.notifications = notificationsFile.notifications.filter(
      n => n.notification_id !== notificationId
    );

    if (notificationsFile.notifications.length < initialLength) {
      notificationsFile.updatedAt = new Date().toISOString();
      await this.updateNotificationsFile(accessToken, metadataFolderId, normalizedUserPnIdentifier, notificationsFile, normalizedUserPnIdentifier, accountId);
      return true;
    }

    return false;
  }

  /**
   * Get unread count for a user
   */
  static async getUnreadCount(
    accessToken: string,
    metadataFolderId: string,
    userPnIdentifier: string,
    accountId?: string
  ): Promise<number> {
    try {
      // Convert accessToken string to token object
      const token: GoogleDriveToken = { access_token: accessToken };
      const normalizedUserPnIdentifier = this.normalizeToPnIdentifier(userPnIdentifier);
      
      // Get or create notifications sheet
      const spreadsheetId = await NotificationsSheetsService.getNotificationsSheet(
        token,
        metadataFolderId,
        normalizedUserPnIdentifier,
        accountId
      );

      // Get unread notifications count
      const result = await NotificationsSheetsService.getNotifications(
        token,
        spreadsheetId,
        normalizedUserPnIdentifier,
        accountId,
        {
          unreadOnly: true,
          limit: 500 // Capped; sufficient for unread count
        }
      );

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
    userPnIdentifier: string,
    accountId?: string
  ): Promise<NotificationPreferences> {
    const notificationsFile = await this.getNotificationsFile(accessToken, metadataFolderId, userPnIdentifier, accountId);
    
    if (!notificationsFile || !notificationsFile.preferences) {
      return this.getDefaultPreferences(userPnIdentifier);
    }

    return notificationsFile.preferences;
  }

  /**
   * Update notification preferences
   */
  static async updatePreferences(
    accessToken: string,
    metadataFolderId: string,
    userPnIdentifier: string,
    preferences: Partial<Omit<NotificationPreferences, 'user_pn_identifier'>>,
    accountId?: string
  ): Promise<NotificationPreferences> {
    let notificationsFile = await this.getNotificationsFile(accessToken, metadataFolderId, userPnIdentifier, accountId);
    const now = new Date().toISOString();

    if (!notificationsFile) {
      notificationsFile = {
        identifier: userPnIdentifier,
        updatedAt: now,
        notifications: [],
        preferences: this.getDefaultPreferences(userPnIdentifier)
      };
    }

    if (!notificationsFile.preferences) {
      notificationsFile.preferences = this.getDefaultPreferences(userPnIdentifier);
    }

    // Update preferences
    notificationsFile.preferences = {
      ...notificationsFile.preferences,
      ...preferences
    };
    notificationsFile.updatedAt = now;

    await this.updateNotificationsFile(accessToken, metadataFolderId, userPnIdentifier, notificationsFile, userPnIdentifier, accountId);
    return notificationsFile.preferences;
  }

  /**
   * Get default notification preferences
   */
  private static getDefaultPreferences(userPnIdentifier: string): NotificationPreferences {
    return {
      user_pn_identifier: userPnIdentifier,
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
    subscriberAccessTokens: Array<{ accessToken: string; metadataFolderId: string; userPnIdentifier: string }>
  ): Promise<void> {
    for (const subscriber of subscriberAccessTokens) {
      try {
        // Always create notification - preferences only control alerting/display, not storage
        await this.createNotification(
          subscriber.accessToken,
          subscriber.metadataFolderId,
          subscriber.userPnIdentifier,
          {
            user_pn_identifier: subscriber.userPnIdentifier, // Already normalized
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
        user_pn_identifier: fileOwnerDid, // Normalize in createNotification
        type: 'feed_new_comment',
        title: 'New comment on your post',
        message: `Someone commented on your post`,
        data: {
          file_id: fileId,
          comment_id: commentId,
          user_pn_identifier: commenterDid // Normalize in createNotification
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
        user_pn_identifier: fileOwnerDid, // Normalize in createNotification
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
        user_pn_identifier: creatorDid, // Normalize in createNotification
        type: 'feed_new_subscriber',
        title: 'New subscriber',
        message: `Someone subscribed to ${feedName}`,
        data: {
          feed_id: feedId,
          user_pn_identifier: subscriberDid // Normalize in createNotification
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
    requesterPnIdentifier: string,
    recipientPnIdentifier: string
  ): Promise<void> {
    // Use pn identifiers directly (already normalized)
    const normalizedRequesterPnIdentifier = this.normalizeToPnIdentifier(requesterPnIdentifier);
    const normalizedRecipientPnIdentifier = this.normalizeToPnIdentifier(recipientPnIdentifier);
    
    // Always create notification - preferences only control alerting/display, not storage
    await this.createNotification(
      accessToken,
      metadataFolderId,
        normalizedRecipientPnIdentifier,
      {
        user_pn_identifier: normalizedRecipientPnIdentifier,
        type: 'connection_request',
        title: 'New connection request',
        message: 'Someone wants to connect with you',
        data: {
          connection_id: connectionId,
          requester_pn_identifier: normalizedRequesterPnIdentifier
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
    acceptorPnIdentifier: string,
    requesterPnIdentifier: string
  ): Promise<void> {
    // Use pn identifiers directly (already normalized)
    // Always create notification - preferences only control alerting/display, not storage
    await this.createNotification(
      accessToken,
      metadataFolderId,
      requesterPnIdentifier,
      {
        user_pn_identifier: requesterPnIdentifier,
        type: 'connection_accepted',
        title: 'Connection accepted',
        message: 'Your connection request was accepted',
        data: {
          connection_id: connectionId,
          user_pn_identifier: acceptorPnIdentifier
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
        user_pn_identifier: originalOwnerDid, // Normalize in createNotification
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
    fromPnIdentifier: string,
    toPnIdentifier: string,
    threadId?: string
  ): Promise<void> {
    const normalizedTo = this.normalizeToPnIdentifier(toPnIdentifier);
    await this.createNotification(
      accessToken,
      metadataFolderId,
      normalizedTo,
      {
        user_pn_identifier: normalizedTo,
        type: 'new_message',
        title: 'New message',
        message: 'You have a new message',
        data: {
          message_id: messageId,
          from_pn_identifier: fromPnIdentifier,
          thread_id: threadId
        }
      }
    );
    // Send native push to recipient's devices
    const { PushService } = await import('./pushService');
    PushService.send(normalizedTo, {
      title: 'New message',
      body: 'You have a new message',
      data: { message_id: messageId, from_pn_identifier: fromPnIdentifier, thread_id: threadId || '' }
    }).catch((e) => console.warn('[NotificationService] Push send failed:', (e as Error)?.message));
  }
}
