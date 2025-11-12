/**
 * Notification Service
 * Handles push notifications for feed subscriptions, comments, likes, etc.
 * Event-driven: When event A happens, triggers push notification
 */

import { getDatabasePool } from '../utils/database';

export interface Notification {
  notification_id: string;
  user_did: string;
  type: 'feed_new_post' | 'feed_new_comment' | 'feed_new_like' | 'feed_new_subscriber' | 'comment_reply' | 'mention';
  title: string;
  message: string;
  data?: {
    feed_id?: string;
    file_id?: string;
    comment_id?: string;
    user_did?: string;
    [key: string]: any;
  };
  read: boolean;
  created_at: Date;
}

export interface NotificationPreferences {
  user_did: string;
  feed_new_post: boolean;
  feed_new_comment: boolean;
  feed_new_like: boolean;
  feed_new_subscriber: boolean;
  comment_reply: boolean;
  mention: boolean;
}

export class NotificationService {
  /**
   * Create a notification
   */
  static async createNotification(notification: Omit<Notification, 'notification_id' | 'created_at' | 'read'>): Promise<Notification> {
    const db = getDatabasePool();
    const notificationId = crypto.randomUUID();

    const result = await db.query(
      `INSERT INTO notifications (
        notification_id, user_did, type, title, message, data, read, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING *`,
      [
        notificationId,
        notification.user_did,
        notification.type,
        notification.title,
        notification.message,
        JSON.stringify(notification.data || {}),
        false
      ]
    );

    return this.mapRowToNotification(result.rows[0]);
  }

  /**
   * Get notifications for a user
   */
  static async getUserNotifications(
    userDid: string,
    options?: {
      limit?: number;
      offset?: number;
      unreadOnly?: boolean;
      type?: Notification['type'];
    }
  ): Promise<{ notifications: Notification[]; total: number }> {
    const db = getDatabasePool();
    const limit = options?.limit || 50;
    const offset = options?.offset || 0;

    let query = `
      SELECT * FROM notifications
      WHERE user_did = $1
    `;
    const params: any[] = [userDid];
    let paramIndex = 2;

    if (options?.unreadOnly) {
      query += ` AND read = false`;
    }

    if (options?.type) {
      query += ` AND type = $${paramIndex}`;
      params.push(options.type);
      paramIndex++;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await db.query(query, params);

    // Get total count
    let countQuery = `SELECT COUNT(*) FROM notifications WHERE user_did = $1`;
    const countParams: any[] = [userDid];
    if (options?.unreadOnly) {
      countQuery += ` AND read = false`;
    }
    if (options?.type) {
      countQuery += ` AND type = $2`;
      countParams.push(options.type);
    }
    const countResult = await db.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    return {
      notifications: result.rows.map(row => this.mapRowToNotification(row)),
      total
    };
  }

  /**
   * Mark notification as read
   */
  static async markAsRead(notificationId: string, userDid: string): Promise<boolean> {
    const db = getDatabasePool();

    const result = await db.query(
      `UPDATE notifications 
       SET read = true 
       WHERE notification_id = $1 AND user_did = $2
       RETURNING *`,
      [notificationId, userDid]
    );

    return result.rows.length > 0;
  }

  /**
   * Mark all notifications as read for a user
   */
  static async markAllAsRead(userDid: string): Promise<number> {
    const db = getDatabasePool();

    const result = await db.query(
      `UPDATE notifications 
       SET read = true 
       WHERE user_did = $1 AND read = false
       RETURNING notification_id`,
      [userDid]
    );

    return result.rows.length;
  }

  /**
   * Delete notification
   */
  static async deleteNotification(notificationId: string, userDid: string): Promise<boolean> {
    const db = getDatabasePool();

    const result = await db.query(
      `DELETE FROM notifications 
       WHERE notification_id = $1 AND user_did = $2
       RETURNING notification_id`,
      [notificationId, userDid]
    );

    return result.rows.length > 0;
  }

  /**
   * Get unread count for a user
   */
  static async getUnreadCount(userDid: string): Promise<number> {
    const db = getDatabasePool();

    const result = await db.query(
      `SELECT COUNT(*) FROM notifications 
       WHERE user_did = $1 AND read = false`,
      [userDid]
    );

    return parseInt(result.rows[0].count);
  }

  /**
   * Get notification preferences for a user
   */
  static async getPreferences(userDid: string): Promise<NotificationPreferences> {
    const db = getDatabasePool();

    const result = await db.query(
      `SELECT * FROM notification_preferences WHERE user_did = $1`,
      [userDid]
    );

    if (result.rows.length === 0) {
      // Return default preferences
      return {
        user_did: userDid,
        feed_new_post: true,
        feed_new_comment: true,
        feed_new_like: false,
        feed_new_subscriber: true,
        comment_reply: true,
        mention: true
      };
    }

    return result.rows[0];
  }

  /**
   * Update notification preferences
   */
  static async updatePreferences(
    userDid: string,
    preferences: Partial<Omit<NotificationPreferences, 'user_did'>>
  ): Promise<NotificationPreferences> {
    const db = getDatabasePool();

    // Check if preferences exist
    const existing = await db.query(
      `SELECT * FROM notification_preferences WHERE user_did = $1`,
      [userDid]
    );

    if (existing.rows.length === 0) {
      // Insert new preferences
      await db.query(
        `INSERT INTO notification_preferences (
          user_did, feed_new_post, feed_new_comment, feed_new_like,
          feed_new_subscriber, comment_reply, mention
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          userDid,
          preferences.feed_new_post ?? true,
          preferences.feed_new_comment ?? true,
          preferences.feed_new_like ?? false,
          preferences.feed_new_subscriber ?? true,
          preferences.comment_reply ?? true,
          preferences.mention ?? true
        ]
      );
    } else {
      // Update existing preferences
      const updates: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (preferences.feed_new_post !== undefined) {
        updates.push(`feed_new_post = $${paramIndex++}`);
        values.push(preferences.feed_new_post);
      }
      if (preferences.feed_new_comment !== undefined) {
        updates.push(`feed_new_comment = $${paramIndex++}`);
        values.push(preferences.feed_new_comment);
      }
      if (preferences.feed_new_like !== undefined) {
        updates.push(`feed_new_like = $${paramIndex++}`);
        values.push(preferences.feed_new_like);
      }
      if (preferences.feed_new_subscriber !== undefined) {
        updates.push(`feed_new_subscriber = $${paramIndex++}`);
        values.push(preferences.feed_new_subscriber);
      }
      if (preferences.comment_reply !== undefined) {
        updates.push(`comment_reply = $${paramIndex++}`);
        values.push(preferences.comment_reply);
      }
      if (preferences.mention !== undefined) {
        updates.push(`mention = $${paramIndex++}`);
        values.push(preferences.mention);
      }

      if (updates.length > 0) {
        values.push(userDid);
        await db.query(
          `UPDATE notification_preferences 
           SET ${updates.join(', ')} 
           WHERE user_did = $${paramIndex}`,
          values
        );
      }
    }

    return this.getPreferences(userDid);
  }

  /**
   * Notify subscribers when a new post is added to a feed
   */
  static async notifyFeedNewPost(feedId: string, fileId: string, feedName: string, creatorDid: string): Promise<void> {
    const db = getDatabasePool();

    // Get all subscribers for this feed
    const subscribers = await db.query(
      `SELECT user_did FROM feed_subscriptions WHERE feed_id = $1`,
      [feedId]
    );

    // Get preferences for each subscriber and create notifications
    for (const sub of subscribers.rows) {
      const prefs = await this.getPreferences(sub.user_did);
      
      if (prefs.feed_new_post) {
        await this.createNotification({
          user_did: sub.user_did,
          type: 'feed_new_post',
          title: `New post in ${feedName}`,
          message: `A new post has been added to ${feedName}`,
          data: {
            feed_id: feedId,
            file_id: fileId,
            creator_did: creatorDid
          }
        });
      }
    }
  }

  /**
   * Notify file owner when someone comments on their file
   */
  static async notifyFileComment(fileId: string, commentId: string, commenterDid: string, fileOwnerDid: string): Promise<void> {
    // Don't notify if commenter is the owner
    if (commenterDid === fileOwnerDid) {
      return;
    }

    const prefs = await this.getPreferences(fileOwnerDid);
    
    if (prefs.feed_new_comment) {
      await this.createNotification({
        user_did: fileOwnerDid,
        type: 'feed_new_comment',
        title: 'New comment on your post',
        message: `Someone commented on your post`,
        data: {
          file_id: fileId,
          comment_id: commentId,
          user_did: commenterDid
        }
      });
    }
  }

  /**
   * Notify file owner when someone likes their file
   */
  static async notifyFileLike(fileId: string, likerDid: string, fileOwnerDid: string): Promise<void> {
    // Don't notify if liker is the owner
    if (likerDid === fileOwnerDid) {
      return;
    }

    const prefs = await this.getPreferences(fileOwnerDid);
    
    if (prefs.feed_new_like) {
      await this.createNotification({
        user_did: fileOwnerDid,
        type: 'feed_new_like',
        title: 'New like on your post',
        message: `Someone liked your post`,
        data: {
          file_id: fileId,
          user_did: likerDid
        }
      });
    }
  }

  /**
   * Notify feed creator when someone subscribes
   */
  static async notifyFeedSubscription(feedId: string, subscriberDid: string, creatorDid: string, feedName: string): Promise<void> {
    const prefs = await this.getPreferences(creatorDid);
    
    if (prefs.feed_new_subscriber) {
      await this.createNotification({
        user_did: creatorDid,
        type: 'feed_new_subscriber',
        title: 'New subscriber',
        message: `Someone subscribed to ${feedName}`,
        data: {
          feed_id: feedId,
          user_did: subscriberDid
        }
      });
    }
  }

  /**
   * Map database row to Notification object
   */
  private static mapRowToNotification(row: any): Notification {
    return {
      notification_id: row.notification_id,
      user_did: row.user_did,
      type: row.type,
      title: row.title,
      message: row.message,
      data: row.data ? (typeof row.data === 'string' ? JSON.parse(row.data) : row.data) : {},
      read: row.read,
      created_at: row.created_at
    };
  }
}

