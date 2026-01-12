/**
 * Notification Service
 * Handles push notifications for feed subscriptions, comments, likes, etc.
 * Stored in Google Drive (decentralized) - users own their data
 * Event-driven: When event A happens, triggers push notification
 * Uses Google Sheets for better performance and querying
 */

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
  private static readonly NOTIFICATIONS_FILE_NAME = 'notifications.json';

  /**
   * Get notifications file from user's Google Drive
   */
  static async getNotificationsFile(
    accessToken: string,
    metadataFolderId: string
  ): Promise<NotificationsFile | null> {
    try {
      // Search for notifications.json in metadata folder
      const searchQuery = `name='${this.NOTIFICATIONS_FILE_NAME}' and '${metadataFolderId}' in parents and trashed=false`;
      const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(searchQuery)}&fields=files(id)&pageSize=1`;
      
      const searchResponse = await fetch(searchUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      if (!searchResponse.ok || searchResponse.status === 404) {
        return null;
      }

      const searchData = await searchResponse.json() as { files?: Array<{ id: string }> };
      
      if (!searchData.files || searchData.files.length === 0) {
        return null;
      }

      // Download notifications file
      const fileId = searchData.files[0].id;
      const getResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
        { headers: { 'Authorization': `Bearer ${accessToken}` } }
      );

      if (!getResponse.ok) {
        return null;
      }

      try {
        return await getResponse.json() as NotificationsFile;
      } catch {
        return null;
      }
    } catch (error) {
      console.error('Error getting notifications file:', error);
      return null;
    }
  }

  /**
   * Create or update notifications file
   */
  static async updateNotificationsFile(
    accessToken: string,
    metadataFolderId: string,
    identifier: string,
    notificationsData: NotificationsFile
  ): Promise<void> {
    const notificationsContent = JSON.stringify(notificationsData, null, 2);

    try {
      // Search for existing notifications.json
      const searchQuery = `name='${this.NOTIFICATIONS_FILE_NAME}' and '${metadataFolderId}' in parents and trashed=false`;
      const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(searchQuery)}&fields=files(id)&pageSize=1`;
      
      const searchResponse = await fetch(searchUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      if (searchResponse.ok) {
        const searchData = await searchResponse.json() as { files?: Array<{ id: string }> };
        
        if (searchData.files && searchData.files.length > 0) {
          // Update existing file
          const fileId = searchData.files[0].id;
          await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json; charset=UTF-8'
            },
            body: notificationsContent
          });
          return;
        }
      }

      // Create new file
      const boundary = `----WebKitFormBoundary${Date.now()}`;
      const metadataPart = JSON.stringify({
        name: this.NOTIFICATIONS_FILE_NAME,
        parents: [metadataFolderId]
      });

      const multipartBody = [
        `--${boundary}`,
        'Content-Disposition: form-data; name="metadata"',
        'Content-Type: application/json',
        '',
        metadataPart,
        `--${boundary}`,
        'Content-Disposition: form-data; name="file"; filename="notifications.json"',
        'Content-Type: application/json',
        '',
        notificationsContent,
        `--${boundary}--`
      ].join('\r\n');

      await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`
        },
        body: multipartBody
      });
    } catch (error) {
      console.error('Error updating notifications file:', error);
      throw error;
    }
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
    try {
      const notificationId = crypto.randomUUID();
      const now = new Date().toISOString();

      // Get or create notifications sheet
      const spreadsheetId = await NotificationsSheetsService.getOrCreateNotificationsSheet(
        accessToken,
        metadataFolderId
      );

      // Create notification entry
      const newNotification: SheetsNotification = {
        notification_id: notificationId,
        user_did: userDid,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        data: notification.data || {},
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
      const spreadsheetId = await NotificationsSheetsService.getOrCreateNotificationsSheet(
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
      // Return empty for now - can add JSON fallback later if needed
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
      const spreadsheetId = await NotificationsSheetsService.getOrCreateNotificationsSheet(
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
      const spreadsheetId = await NotificationsSheetsService.getOrCreateNotificationsSheet(
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
      const spreadsheetId = await NotificationsSheetsService.getOrCreateNotificationsSheet(
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
    // Always create notification - preferences only control alerting/display, not storage
    await this.createNotification(
      accessToken,
      metadataFolderId,
      recipientDid,
      {
        user_did: recipientDid,
        type: 'connection_request',
        title: 'New connection request',
        message: 'Someone wants to connect with you',
        data: {
          connection_id: connectionId,
          user_did: requesterDid
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
    // Always create notification - preferences only control alerting/display, not storage
    await this.createNotification(
      accessToken,
      metadataFolderId,
      requesterDid,
      {
        user_did: requesterDid,
        type: 'connection_accepted',
        title: 'Connection accepted',
        message: 'Your connection request was accepted',
        data: {
          connection_id: connectionId,
          user_did: acceptorDid
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
    await this.createNotification(
      accessToken,
      metadataFolderId,
      toDid,
      {
        user_did: toDid,
        type: 'new_message',
        title: 'New message',
        message: 'You have a new message',
        data: {
          message_id: messageId,
          from_did: fromDid,
          thread_id: threadId
        }
      }
    );
  }
}
