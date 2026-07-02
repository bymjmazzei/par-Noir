/**
 * Notification List Component
 * Displays full list of notifications
 */

import React, { useState, useEffect } from 'react';
import { Bell, Settings, Check, CheckCheck, X } from 'lucide-react';
import { NotificationService, Notification } from '../services/notificationService';
import { formatTimestamp } from '../utils/formatTimestamp';
import { useRealtimeSync } from '../hooks/useRealtimeSync';
import { useToast } from '../hooks/useToast';
import { ToastContainer } from './Toast';
import {
  acceptConnectionRequest,
  rejectConnectionRequest,
} from '../services/connectionService';
import {
  ensureLocalMessagingKeysForAccept,
  reportConnectionAcceptError,
} from '../services/messagingReconnect';

interface NotificationListProps {
  userPnIdentifier: string;
  onPreferencesClick: () => void;
  onConnectionRequestHandled?: () => void;
  onNavigateToRequests?: () => void;
}

export function NotificationList({
  userPnIdentifier,
  onPreferencesClick,
  onConnectionRequestHandled,
  onNavigateToRequests,
}: NotificationListProps) {
  const { success, error: showError, toasts, removeToast } = useToast();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [dismissedConnectionIds, setDismissedConnectionIds] = useState<Set<string>>(new Set());

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
      
      const unreadResponse = await NotificationService.getUnreadCount(userPnIdentifier);
      setUnreadCount(unreadResponse);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load notifications';
      setError(message);
      console.error('Failed to load notifications:', err);
    } finally {
      setLoading(false);
    }
  };

  const socketConnected = useRealtimeSync(['new_notification'], () => {
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
    } catch (err) {
      console.error('Failed to mark as read:', err);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await NotificationService.markAllAsRead(userPnIdentifier);
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    }
  };

  const getConnectionRequestMeta = (notification: Notification) => {
    const connectionId = notification.data?.connection_id as string | undefined;
    const requesterPn =
      (notification.data?.requester_pn_identifier as string | undefined) ||
      (notification.data?.requesterPnIdentifier as string | undefined);
    return { connectionId, requesterPn };
  };

  const handleAcceptConnection = async (
    notification: Notification,
    connectionId: string,
    requesterPn: string
  ) => {
    if (processingIds.has(notification.notification_id)) return;

    const keysError = ensureLocalMessagingKeysForAccept();
    if (keysError) {
      showError(keysError);
      return;
    }

    setProcessingIds(prev => new Set(prev).add(notification.notification_id));

    try {
      await acceptConnectionRequest(connectionId, userPnIdentifier, requesterPn);
      if (!notification.read) {
        await handleMarkAsRead(notification.notification_id);
      }
      setDismissedConnectionIds(prev => new Set(prev).add(notification.notification_id));
      success('Connection request accepted');
      onConnectionRequestHandled?.();
    } catch (err) {
      const message = reportConnectionAcceptError(err, undefined, {
        requesterPnIdentifier: requesterPn,
      });
      showError(message);
    } finally {
      setProcessingIds(prev => {
        const next = new Set(prev);
        next.delete(notification.notification_id);
        return next;
      });
    }
  };

  const handleDeclineConnection = async (
    notification: Notification,
    connectionId: string
  ) => {
    if (processingIds.has(notification.notification_id)) return;

    setProcessingIds(prev => new Set(prev).add(notification.notification_id));

    try {
      await rejectConnectionRequest(connectionId, userPnIdentifier);
      if (!notification.read) {
        await handleMarkAsRead(notification.notification_id);
      }
      setDismissedConnectionIds(prev => new Set(prev).add(notification.notification_id));
      onConnectionRequestHandled?.();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to decline connection request');
    } finally {
      setProcessingIds(prev => {
        const next = new Set(prev);
        next.delete(notification.notification_id);
        return next;
      });
    }
  };

  const handleNotificationBodyClick = (notification: Notification) => {
    if (notification.type === 'connection_request') {
      onNavigateToRequests?.();
      return;
    }
    if (!notification.read) {
      void handleMarkAsRead(notification.notification_id);
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

  const visibleNotifications = notifications.filter(
    n => !dismissedConnectionIds.has(n.notification_id)
  );

  return (
    <div className="h-full flex flex-col relative">
      <ToastContainer toasts={toasts} onClose={removeToast} />

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

        {!loading && visibleNotifications.length === 0 && !error && (
          <div className="p-8 text-center text-neutral-400">
            <Bell className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No notifications yet</p>
          </div>
        )}

        <div className="divide-y divide-neutral-800">
          {visibleNotifications.map((notification) => {
            const isConnectionRequest = notification.type === 'connection_request';
            const { connectionId, requesterPn } = getConnectionRequestMeta(notification);
            const canActOnConnection =
              isConnectionRequest && connectionId && requesterPn;
            const isProcessing = processingIds.has(notification.notification_id);

            return (
              <div
                key={notification.notification_id}
                className={`p-4 hover:bg-neutral-800 transition-colors ${
                  !notification.read ? 'bg-neutral-850' : ''
                } ${!isConnectionRequest ? 'cursor-pointer' : ''}`}
                onClick={() => {
                  if (!isConnectionRequest) {
                    handleNotificationBodyClick(notification);
                  }
                }}
              >
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0 text-2xl">
                    {getNotificationIcon(notification.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between">
                      <div
                        className={`flex-1 ${isConnectionRequest ? 'cursor-pointer' : ''}`}
                        onClick={(e) => {
                          if (isConnectionRequest) {
                            e.stopPropagation();
                            handleNotificationBodyClick(notification);
                          }
                        }}
                      >
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
                      {!notification.read && !isConnectionRequest && (
                        <div className="flex-shrink-0 ml-2">
                          <div className="h-2 w-2 bg-blue-500 rounded-full" />
                        </div>
                      )}
                    </div>

                    {canActOnConnection && (
                      <div
                        className="flex items-center space-x-2 mt-3"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            void handleAcceptConnection(
                              notification,
                              connectionId,
                              requesterPn
                            )
                          }
                          disabled={isProcessing}
                          className="flex-1 px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center space-x-1 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Check className="h-4 w-4" />
                          <span>{isProcessing ? 'Processing...' : 'Accept'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void handleDeclineConnection(notification, connectionId)
                          }
                          disabled={isProcessing}
                          className="flex-1 px-3 py-2 bg-neutral-800 text-white text-sm rounded-lg hover:bg-neutral-700 transition-colors flex items-center justify-center space-x-1 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <X className="h-4 w-4" />
                          <span>{isProcessing ? 'Processing...' : 'Decline'}</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {loading && (
          <div className="p-4 text-center text-neutral-400 text-sm">
            Loading...
          </div>
        )}

        {!hasMore && visibleNotifications.length > 0 && (
          <div className="p-4 text-center text-neutral-400 text-sm">
            No more notifications
          </div>
        )}
      </div>
    </div>
  );
}
