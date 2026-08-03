import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Smartphone, Lock } from 'lucide-react';
import { notificationsService, Notification } from '../utils/notificationsService';
import { getTimeAgo } from '../utils/helpers';
import {
  fetchDriveNotifications,
  markDriveNotificationRead,
  type DriveNotification,
} from '../services/driveNotificationsApi';
import { PN_SHOW_DEVICE_PAIRING_QR_EVENT } from '../constants/deviceEvents';

interface NotificationsButtonProps {
  isPWA?: boolean;
  apiToken?: string | null;
  pnIdentifier?: string | null;
  isKeyedSession?: boolean;
  /** Switch to Recovery so pairing QR panel is visible */
  onOpenRecoveryForPairing?: () => void;
}

type UnifiedNotification = {
  id: string;
  source: 'local' | 'drive';
  title: string;
  message: string;
  type: string;
  priority: Notification['priority'] | 'high';
  read: boolean;
  timestamp: string;
  action?: string;
};

const NotificationsButton: React.FC<NotificationsButtonProps> = ({
  isPWA = false,
  apiToken = null,
  pnIdentifier = null,
  isKeyedSession = false,
  onOpenRecoveryForPairing,
}) => {
  const [notifications, setNotifications] = useState<UnifiedNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [hasUnlockedIdentity, setHasUnlockedIdentity] = useState(false);

  const loadNotifications = useCallback(async () => {
    const hasUnlocked = (notificationsService as any).currentUnlockedIdentity !== null;
    setHasUnlockedIdentity(hasUnlocked);

    const local = await notificationsService.getNotifications();
    const localMapped: UnifiedNotification[] = local.map((n) => ({
      id: n.id,
      source: 'local' as const,
      title: n.title,
      message: n.message,
      type: n.type,
      priority: n.priority,
      read: n.read,
      timestamp: n.timestamp,
    }));

    let driveMapped: UnifiedNotification[] = [];
    if (apiToken && pnIdentifier && isKeyedSession) {
      try {
        const result = await fetchDriveNotifications(pnIdentifier, apiToken, { limit: 30 });
        driveMapped = result.notifications.map((n: DriveNotification) => ({
          id: n.notification_id,
          source: 'drive' as const,
          title: n.title,
          message: n.message,
          type: n.type,
          priority: n.type === 'device_unkeyed_unlock' ? 'high' : 'medium',
          read: n.read,
          timestamp: n.created_at,
          action: typeof n.data?.action === 'string' ? n.data.action : undefined,
        }));
      } catch {
        /* Drive may be custody-only or temporarily unavailable */
      }
    }

    const merged = [...driveMapped, ...localMapped].sort(
      (a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp)
    );
    setNotifications(merged);
    setUnreadCount(merged.filter((n) => !n.read).length);
  }, [apiToken, pnIdentifier, isKeyedSession]);

  useEffect(() => {
    void loadNotifications();
    const interval = setInterval(() => void loadNotifications(), 30000);
    const onFocus = () => void loadNotifications();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [loadNotifications]);

  const handleNotificationClick = async (notification: UnifiedNotification) => {
    if (notification.source === 'local') {
      await notificationsService.markAsRead([notification.id]);
      if ((notification as unknown as Notification).actionUrl) {
        window.location.href = (notification as unknown as Notification).actionUrl!;
      }
    } else if (apiToken && pnIdentifier) {
      try {
        await markDriveNotificationRead(notification.id, pnIdentifier, apiToken);
      } catch {
        /* continue to action */
      }
      if (
        notification.type === 'device_unkeyed_unlock' ||
        notification.action === 'show_device_pairing_qr'
      ) {
        try {
          sessionStorage.setItem('pn_pending_show_pairing_qr', '1');
        } catch {
          /* ignore */
        }
        onOpenRecoveryForPairing?.();
        try {
          window.dispatchEvent(new CustomEvent(PN_SHOW_DEVICE_PAIRING_QR_EVENT));
        } catch {
          /* non-DOM */
        }
      }
    }

    setShowDropdown(false);
    await loadNotifications();
  };

  const handleMarkAllAsRead = async () => {
    const locals = await notificationsService.getNotifications();
    await notificationsService.markAsRead(locals.map((n) => n.id));
    if (apiToken && pnIdentifier) {
      for (const n of notifications.filter((x) => x.source === 'drive' && !x.read)) {
        try {
          await markDriveNotificationRead(n.id, pnIdentifier, apiToken);
        } catch {
          /* best-effort */
        }
      }
    }
    await loadNotifications();
  };

  const handleClearAll = async () => {
    const currentNotifications = await notificationsService.getNotifications();
    for (const notification of currentNotifications) {
      await notificationsService.deleteNotification(notification.id);
    }
    setNotifications((prev) => prev.filter((n) => n.source === 'drive'));
    await loadNotifications();
  };

  const handleTestNotification = async () => {
    await notificationsService.createTestNotification('Test User');
    alert('Test notification sent!');
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'recovery-request':
        return <Lock className="w-4 h-4" />;
      case 'custodian-approval':
        return '👥';
      case 'integration-update':
        return '🔗';
      case 'security-alert':
      case 'device_unkeyed_unlock':
        return '⚠️';
      case 'sync-complete':
        return <RefreshCw className="w-4 h-4" />;
      case 'device-pairing':
        return <Smartphone className="w-4 h-4" />;
      default:
        return '📢';
    }
  };

  const getPriorityColor = (priority: UnifiedNotification['priority']) => {
    switch (priority) {
      case 'critical':
        return 'text-red-500';
      case 'high':
        return 'text-orange-500';
      case 'medium':
        return 'text-yellow-500';
      case 'low':
        return 'text-blue-500';
      default:
        return 'text-gray-500';
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className={`relative p-2 rounded-lg hover:bg-hover transition-colors ${
          isPWA ? 'text-text-primary' : 'text-text-secondary'
        }`}
        title="Notifications"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-5 5v-5z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.29 13.7a1.94 1.94 0 0 0 3.42 0" />
        </svg>

        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {showDropdown && (
        <div className="absolute right-0 mt-2 w-80 bg-modal-bg border border-border rounded-lg shadow-xl z-50">
          <div className="flex items-center justify-between p-4 border-b border-border">
            <h3 className="text-lg font-semibold text-text-primary">Notifications</h3>
            <div className="flex items-center space-x-2">
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllAsRead}
                  className="text-xs text-text-secondary hover:text-text-primary"
                >
                  Mark all read
                </button>
              )}
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="text-xs text-text-secondary hover:text-text-primary"
              >
                Settings
              </button>
            </div>
          </div>

          {showSettings && (
            <div className="p-4 border-b border-border bg-background-secondary">
              <h4 className="text-sm font-medium text-text-primary mb-3">Notification Settings</h4>

              {process.env.NODE_ENV === 'development' && (
                <div className="mb-3">
                  <button
                    onClick={handleTestNotification}
                    className="px-3 py-1 text-xs bg-primary text-bg-primary rounded hover:bg-accent transition-colors"
                  >
                    Send Test Notification
                  </button>
                </div>
              )}

              <div className="space-y-2 text-xs">
                {Object.entries(notificationsService.getSettings()).map(([key, value]) => {
                  if (typeof value === 'boolean') {
                    return (
                      <label key={key} className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={value}
                          onChange={(e) => {
                            notificationsService.updateSettings({ [key]: e.target.checked });
                          }}
                          className="rounded"
                        />
                        <span className="text-text-secondary capitalize">
                          {key.replace(/([A-Z])/g, ' $1').toLowerCase()}
                        </span>
                      </label>
                    );
                  }
                  return null;
                })}
              </div>
            </div>
          )}

          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-4 text-center text-text-secondary">
                <p className="text-sm">
                  {hasUnlockedIdentity
                    ? 'No notifications for this ID'
                    : 'Unlock an ID to see notifications'}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {notifications.map((notification) => (
                  <div
                    key={`${notification.source}-${notification.id}`}
                    onClick={() => handleNotificationClick(notification)}
                    className={`p-4 hover:bg-hover cursor-pointer transition-colors ${
                      !notification.read ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                    }`}
                  >
                    <div className="flex items-start space-x-3">
                      <div className="text-lg">{getNotificationIcon(notification.type)}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <h4
                            className={`text-sm font-medium text-text-primary ${
                              !notification.read ? 'font-semibold' : ''
                            }`}
                          >
                            {notification.title}
                          </h4>
                          <span className={`text-xs ${getPriorityColor(notification.priority)}`}>
                            {notification.priority}
                          </span>
                        </div>
                        <p className="text-xs text-text-secondary mt-1 line-clamp-2">
                          {notification.message}
                        </p>
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-xs text-text-secondary">
                            {getTimeAgo(new Date(notification.timestamp))}
                          </span>
                          {!notification.read && (
                            <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {notifications.some((n) => n.source === 'local') && (
            <div className="p-3 border-t border-border">
              <button
                onClick={handleClearAll}
                className="w-full text-xs text-text-secondary hover:text-red-500 transition-colors"
              >
                Clear local notifications
              </button>
            </div>
          )}
        </div>
      )}

      {showDropdown && (
        <div className="fixed inset-0 z-40" onClick={() => setShowDropdown(false)} />
      )}
    </div>
  );
};

export default NotificationsButton;
