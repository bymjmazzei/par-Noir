/**
 * Notification Service (Frontend)
 * Handles notifications for feed subscriptions, comments, likes, etc.
 */

const API_ENDPOINT = process.env.REACT_APP_API_ENDPOINT || 'https://api.parnoir.com';

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
    userDid: string,
    options?: {
      limit?: number;
      offset?: number;
      unreadOnly?: boolean;
      type?: Notification['type'];
    }
  ): Promise<NotificationListResponse> {
    const params = new URLSearchParams();
    params.append('userDid', userDid);
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.offset) params.append('offset', options.offset.toString());
    if (options?.unreadOnly) params.append('unreadOnly', 'true');
    if (options?.type) params.append('type', options.type);

    const response = await fetch(`${API_ENDPOINT}/api/notifications?${params.toString()}`);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to get notifications' }));
      throw new Error(error.error_description || error.error || 'Failed to get notifications');
    }

    return response.json();
  }

  /**
   * Get unread notification count
   */
  static async getUnreadCount(userDid: string): Promise<number> {
    const response = await fetch(`${API_ENDPOINT}/api/notifications/unread-count?userDid=${userDid}`);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to get unread count' }));
      throw new Error(error.error_description || error.error || 'Failed to get unread count');
    }

    const data = await response.json();
    return data.count || 0;
  }

  /**
   * Mark notification as read
   */
  static async markAsRead(notificationId: string, userDid: string): Promise<void> {
    const response = await fetch(`${API_ENDPOINT}/api/notifications/${notificationId}/read`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ userDid })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to mark as read' }));
      throw new Error(error.error_description || error.error || 'Failed to mark as read');
    }
  }

  /**
   * Mark all notifications as read
   */
  static async markAllAsRead(userDid: string): Promise<number> {
    const response = await fetch(`${API_ENDPOINT}/api/notifications/read-all`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ userDid })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to mark all as read' }));
      throw new Error(error.error_description || error.error || 'Failed to mark all as read');
    }

    const data = await response.json();
    return data.markedRead || 0;
  }

  /**
   * Delete notification
   */
  static async deleteNotification(notificationId: string, userDid: string): Promise<void> {
    const response = await fetch(`${API_ENDPOINT}/api/notifications/${notificationId}?userDid=${userDid}`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to delete notification' }));
      throw new Error(error.error_description || error.error || 'Failed to delete notification');
    }
  }

  /**
   * Get notification preferences
   */
  static async getPreferences(userDid: string): Promise<NotificationPreferences> {
    const response = await fetch(`${API_ENDPOINT}/api/notifications/preferences?userDid=${userDid}`);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to get preferences' }));
      throw new Error(error.error_description || error.error || 'Failed to get preferences');
    }

    return response.json();
  }

  /**
   * Update notification preferences
   */
  static async updatePreferences(
    userDid: string,
    preferences: Partial<Omit<NotificationPreferences, 'user_did'>>
  ): Promise<NotificationPreferences> {
    const response = await fetch(`${API_ENDPOINT}/api/notifications/preferences`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userDid,
        ...preferences
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to update preferences' }));
      throw new Error(error.error_description || error.error || 'Failed to update preferences');
    }

    return response.json();
  }
}

