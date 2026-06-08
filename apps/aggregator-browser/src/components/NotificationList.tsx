/**
 * Notification List Component
 * Displays full list of notifications
 */

import React, { useState, useEffect } from 'react';
import { Bell, Settings, Check, CheckCheck } from 'lucide-react';
import { NotificationService, Notification } from '../services/notificationService';
import { formatTimestamp } from '../utils/formatTimestamp';
import { useRealtimeSync } from '../hooks/useRealtimeSync';

interface NotificationListProps {
  userPnIdentifier: string;
  onPreferencesClick: () => void;
}

export function NotificationList({ userPnIdentifier, onPreferencesClick }: NotificationListProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);

  const LIMIT = 50;

  const loadNotifications = async (reset = false) => {
    setLoading(true);
    setError(null);

    try {
      const currentOffset = reset ? 0 : offset;
      const response = await NotificationService.getNotifications(userPnIdentifier, {
        limit: LIMIT,
        offset: currentOffset
      });

      if (reset) {
        setNotifications(response.notifications);
      } else {
        setNotifications(prev => [...prev, ...response.notifications]);
      }

      setOffset(currentOffset + response.notifications.length);
      setHasMore(response.notifications.length === LIMIT && response.total > currentOffset + response.notifications.length);
      
      // Update unread count
      const unreadResponse = await NotificationService.getUnreadCount(userPnIdentifier);
      setUnreadCount(unreadResponse);
    } catch (err: any) {
      setError(err.message || 'Failed to load notifications');
      console.error('Failed to load notifications:', err);
    } finally {
      setLoading(false);
    }
  };

  const socketConnected = useRealtimeSync(() => {
    loadNotifications(true);
  });

  useEffect(() => {
    loadNotifications(true);
    if (socketConnected) {
      return;
    }
    const interval = setInterval(() => {
      loadNotifications(true);
    }, 30000);
    return () => clearInterval(interval);
  }, [userPnIdentifier, socketConnected]);

  const handleMarkAsRead = async (notificationId: string) => {
    try {
      await NotificationService.markAsRead(notificationId, userPnIdentifier);
      setNotifications(prev =>
        prev.map(n => n.notification_id === notificationId ? { ...n, read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      const marked = await NotificationService.markAllAsRead(userPnIdentifier);
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  };

  const getNotificationIcon = (type: Notification['type']) => {
    switch (type) {
      case 'feed_new_post':
      case 'feed_new_comment':
      case 'comment_reply':
        return '💬';
      case 'feed_new_like':
        return '❤️';
      case 'feed_new_subscriber':
      case 'follow':
        return '👤';
      case 'connection_request':
      case 'connection_accepted':
        return '🤝';
      case 'new_message':
        return '✉️';
      case 'repost':
        return '🔄';
      case 'mention':
        return '📢';
      default:
        return '🔔';
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-neutral-700">
        <div className="flex items-center space-x-3">
          <Bell className="h-5 w-5 text-white" />
          <h3 className="text-white font-semibold">
            Notifications
            {unreadCount > 0 && (
              <span className="ml-2 px-2 py-0.5 bg-blue-500 text-white text-xs rounded-full">
                {unreadCount}
              </span>
            )}
          </h3>
        </div>
        <div className="flex items-center space-x-2">
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllAsRead}
              className="p-2 hover:bg-neutral-800 rounded transition-colors"
              title="Mark all as read"
            >
              <CheckCheck className="h-4 w-4 text-neutral-400" />
            </button>
          )}
          <button
            onClick={onPreferencesClick}
            className="p-2 hover:bg-neutral-800 rounded transition-colors"
            title="Notification preferences"
          >
            <Settings className="h-4 w-4 text-neutral-400" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {error && (
          <div className="p-4 text-red-400 text-sm">
            {error}
          </div>
        )}

        {!loading && notifications.length === 0 && !error && (
          <div className="p-8 text-center text-neutral-400">
            <Bell className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No notifications yet</p>
          </div>
        )}

        <div className="divide-y divide-neutral-800">
          {notifications.map((notification) => (
            <div
              key={notification.notification_id}
              className={`p-4 hover:bg-neutral-800 transition-colors cursor-pointer ${
                !notification.read ? 'bg-neutral-850' : ''
              }`}
              onClick={() => !notification.read && handleMarkAsRead(notification.notification_id)}
            >
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0 text-2xl">
                  {getNotificationIcon(notification.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="text-white text-sm font-medium">
                        {notification.title}
                      </p>
                      <p className="text-neutral-400 text-sm mt-1">
                        {notification.message}
                      </p>
                      <p className="text-neutral-500 text-xs mt-2">
                        {formatTimestamp(notification.created_at)}
                      </p>
                    </div>
                    {!notification.read && (
                      <div className="flex-shrink-0 ml-2">
                        <div className="h-2 w-2 bg-blue-500 rounded-full" />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {loading && (
          <div className="p-4 text-center text-neutral-400 text-sm">
            Loading...
          </div>
        )}

        {!hasMore && notifications.length > 0 && (
          <div className="p-4 text-center text-neutral-400 text-sm">
            No more notifications
          </div>
        )}
      </div>
    </div>
  );
}
