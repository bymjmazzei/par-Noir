/**
 * Notification Bell Component
 * Shows notification badge and dropdown
 */

import { useState, useEffect } from 'react';
import { Bell, Check, Trash2, X } from 'lucide-react';
import { useUserState } from '../contexts/UserStateContext';
import { NotificationService, Notification } from '../services/notificationService';
import { PNOAuthService } from '../services/pnOAuthService';
import { useToast } from '../hooks/useToast';
import { LoadingSkeleton } from './LoadingSkeleton';
import { useRealtimeSync } from '../hooks/useRealtimeSync';

interface NotificationBellProps {
  onNotificationClick?: (notification: Notification) => void;
}

export function NotificationBell({ onNotificationClick }: NotificationBellProps) {
  const { userState } = useUserState();
  const { error: showError } = useToast();
  const [showDropdown, setShowDropdown] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const loadUnreadCount = async () => {
    if (!userState.isUnlocked || !userState.pnIdentifier) return;
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    try {
      const token = await PNOAuthService.getValidAccessToken();
      if (!token) return;
      const result = await NotificationService.getNotifications(userState.pnIdentifier, {
        limit: 100,
        unreadOnly: true
      });
      const engagementNotifications = result.notifications.filter((n) => n.type !== 'new_message');
      setUnreadCount(engagementNotifications.length);
    } catch (error: unknown) {
      const err = error as { message?: string; status?: number };
      if (err?.message?.includes('429') || err?.status === 429) {
        return;
      }
      console.error('Failed to load unread count:', error);
    }
  };

  const socketConnected = useRealtimeSync(['new_notification'], () => {
    loadUnreadCount();
  });

  useEffect(() => {
    if (showDropdown && userState.isUnlocked && userState.pnIdentifier) {
      loadNotifications();
    }
  }, [showDropdown, userState.isUnlocked, userState.pnIdentifier]);

  useEffect(() => {
    if (!userState.isUnlocked || !userState.pnIdentifier) {
      return;
    }

    loadUnreadCount();
    if (socketConnected) {
      return;
    }
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      void loadUnreadCount();
    }, 30000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void loadUnreadCount();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [userState.isUnlocked, userState.pnIdentifier, socketConnected]);

  const loadNotifications = async () => {
    if (!userState.isUnlocked || !userState.pnIdentifier) {
      return;
    }

    setLoading(true);
    try {
      const result = await NotificationService.getNotifications(userState.pnIdentifier, {
        limit: 20,
        unreadOnly: false
      });
      // Filter out message notifications - those appear in the messages section
      const engagementNotifications = result.notifications.filter(n => n.type !== 'new_message');
      setNotifications(engagementNotifications);
      
      // Update unread count (excluding message notifications)
      const count = engagementNotifications.filter(n => !n.read).length;
      setUnreadCount(count);
    } catch (error: any) {
      // Don't show error for 429 rate limiting
      if (error?.message?.includes('429') || error?.status === 429) {
        console.warn('Rate limited when loading notifications');
        return;
      }
      console.error('Failed to load notifications:', error);
      showError(error.message || 'Failed to load notifications');
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAsRead = async (notificationId: string) => {
    if (!userState.isUnlocked || !userState.pnIdentifier) {
      return;
    }

    try {
      await NotificationService.markAsRead(notificationId, userState.pnIdentifier);
      setNotifications(prev =>
        prev.map(n =>
          n.notification_id === notificationId ? { ...n, read: true } : n
        )
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error: any) {
      console.error('Failed to mark as read:', error);
      showError(error.message || 'Failed to mark as read');
    }
  };

  const handleMarkAllAsRead = async () => {
    if (!userState.isUnlocked || !userState.pnIdentifier) {
      return;
    }

    try {
      await NotificationService.markAllAsRead(userState.pnIdentifier);
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (error: any) {
      console.error('Failed to mark all as read:', error);
      showError(error.message || 'Failed to mark all as read');
    }
  };

  const handleDelete = async (notificationId: string) => {
    if (!userState.isUnlocked || !userState.pnIdentifier) {
      return;
    }

    try {
      await NotificationService.deleteNotification(notificationId, userState.pnIdentifier);
      setNotifications(prev => prev.filter(n => n.notification_id !== notificationId));
      // Update unread count if deleted notification was unread
      const deleted = notifications.find(n => n.notification_id === notificationId);
      if (deleted && !deleted.read) {
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch (error: any) {
      console.error('Failed to delete notification:', error);
      showError(error.message || 'Failed to delete notification');
    }
  };

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.read) {
      handleMarkAsRead(notification.notification_id);
    }
    onNotificationClick?.(notification);
    setShowDropdown(false);
  };

  if (!userState.isUnlocked || !userState.pnIdentifier) {
    return null;
  }

  return (
    <div className="relative">
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="relative p-2 text-text-secondary hover:text-white transition-colors"
        title="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {showDropdown && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowDropdown(false)}
          />

          {/* Dropdown */}
          <div className="absolute right-0 mt-2 w-80 bg-neutral-900 border border-neutral-700 rounded-xl shadow-xl z-50 max-h-[600px] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-neutral-700">
              <h3 className="text-white font-semibold">Notifications</h3>
              <div className="flex items-center space-x-2">
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllAsRead}
                    className="text-xs text-blue-400 hover:text-blue-300"
                  >
                    Mark all read
                  </button>
                )}
                <button
                  onClick={() => setShowDropdown(false)}
                  className="text-text-secondary hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Notifications List */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="p-4 space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <LoadingSkeleton key={i} />
                  ))}
                </div>
              ) : notifications.length === 0 ? (
                <div className="p-8 text-center">
                  <Bell className="h-12 w-12 text-text-secondary mx-auto mb-3 opacity-50" />
                  <p className="text-text-secondary text-sm">No notifications</p>
                </div>
              ) : (
                <div className="divide-y divide-neutral-700">
                  {notifications.map((notification) => (
                    <div
                      key={notification.notification_id}
                      className={`p-4 hover:bg-neutral-800 transition-colors cursor-pointer ${
                        !notification.read ? 'bg-blue-500/5' : ''
                      }`}
                      onClick={() => handleNotificationClick(notification)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-2 mb-1">
                            <h4 className="text-white text-sm font-medium">
                              {notification.title}
                            </h4>
                            {!notification.read && (
                              <span className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0"></span>
                            )}
                          </div>
                          <p className="text-text-secondary text-xs mb-2 line-clamp-2">
                            {notification.message}
                          </p>
                          <p className="text-text-secondary text-xs">
                            {new Date(notification.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex items-center space-x-1 ml-2">
                          {!notification.read && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleMarkAsRead(notification.notification_id);
                              }}
                              className="p-1 text-text-secondary hover:text-white transition-colors"
                              title="Mark as read"
                            >
                              <Check className="h-4 w-4" />
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(notification.notification_id);
                            }}
                            className="p-1 text-text-secondary hover:text-red-400 transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

