import React, { useState, useEffect } from 'react';
import { RefreshCw, Smartphone, Lock } from 'lucide-react';
import { notificationsService, Notification } from '../utils/notificationsService';
import { getTimeAgo } from '../utils/helpers';

interface NotificationsButtonProps {
  isPWA?: boolean;
}

const NotificationsButton: React.FC<NotificationsButtonProps> = ({ isPWA = false }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    const loadNotifications = () => {
      // Only show notifications for the currently unlocked identity
      const currentIdentity = notificationsService.getCurrentUnlockedIdentity();
      
      if (currentIdentity) {
        const identityNotifications = notificationsService.getNotificationsForCurrentIdentity();
        const unread = notificationsService.getUnreadCountForCurrentIdentity();
        setNotifications(identityNotifications);
        setUnreadCount(unread);
      } else {
        // No ID unlocked, show empty state
        setNotifications([]);
        setUnreadCount(0);
      }
    };

    loadNotifications();
    
    // Refresh notifications every 30 seconds
    const interval = setInterval(loadNotifications, 30000);
    
    return () => clearInterval(interval);
  }, []);

  const handleNotificationClick = async (notification: Notification) => {
    await notificationsService.markAsRead(notification.id);
    
    // Navigate to action URL if available
    if (notification.actionUrl) {
      window.location.href = notification.actionUrl;
    }
    
    setShowDropdown(false);
    
    // Refresh notifications for current identity
    const currentIdentity = notificationsService.getCurrentUnlockedIdentity();
    if (currentIdentity) {
      const identityNotifications = notificationsService.getNotificationsForCurrentIdentity();
      const unread = notificationsService.getUnreadCountForCurrentIdentity();
      setNotifications(identityNotifications);
      setUnreadCount(unread);
    }
  };

  const handleMarkAllAsRead = async () => {
    await notificationsService.markAllAsRead();
    const currentIdentity = notificationsService.getCurrentUnlockedIdentity();
    if (currentIdentity) {
      const identityNotifications = notificationsService.getNotificationsForCurrentIdentity();
      const unread = notificationsService.getUnreadCountForCurrentIdentity();
      setNotifications(identityNotifications);
      setUnreadCount(unread);
    }
  };

  const handleClearAll = async () => {
    // Only clear notifications for the current identity
    const currentIdentity = notificationsService.getCurrentUnlockedIdentity();
    if (currentIdentity) {
      const currentNotifications = notificationsService.getNotificationsForCurrentIdentity();
      for (const notification of currentNotifications) {
        await notificationsService.deleteNotification(notification.id);
      }
      setNotifications([]);
      setUnreadCount(0);
    }
  };

  const getNotificationIcon = (type: Notification['type']) => {
    switch (type) {
      case 'recovery-request':
        return <Lock className="w-4 h-4" />;
      case 'custodian-approval':
        return '👥';
      case 'integration-update':
        return '🔗';
      case 'security-alert':
        return '⚠️';
      case 'sync-complete':
        return <RefreshCw className="w-4 h-4" />;
      case 'device-pairing':
        return <Smartphone className="w-4 h-4" />;
      default:
        return '📢';
    }
  };

  const getPriorityColor = (priority: Notification['priority']) => {
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
      {/* Notifications Button */}
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
        
        {/* Unread Badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Notifications Dropdown */}
      {showDropdown && (
        <div className="absolute right-0 mt-2 w-80 bg-modal-bg border border-border rounded-lg shadow-xl z-50">
          {/* Header */}
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

          {/* Settings Panel */}
          {showSettings && (
            <div className="p-4 border-b border-border bg-background-secondary">
              <h4 className="text-sm font-medium text-text-primary mb-3">Notification Settings</h4>
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

          {/* Notifications List */}
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-4 text-center text-text-secondary">
                <div className="text-2xl mb-2">📭</div>
                <p className="text-sm">
                  {notificationsService.getCurrentUnlockedIdentity() 
                    ? 'No notifications for this ID' 
                    : 'Unlock an ID to see notifications'
                  }
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    onClick={() => handleNotificationClick(notification)}
                    className={`p-4 hover:bg-hover cursor-pointer transition-colors ${
                      !notification.read ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                    }`}
                  >
                    <div className="flex items-start space-x-3">
                      <div className="text-lg">{getNotificationIcon(notification.type)}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <h4 className={`text-sm font-medium text-text-primary ${
                            !notification.read ? 'font-semibold' : ''
                          }`}>
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

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="p-3 border-t border-border">
              <button
                onClick={handleClearAll}
                className="w-full text-xs text-text-secondary hover:text-red-500 transition-colors"
              >
                Clear all notifications
              </button>
            </div>
          )}
        </div>
      )}

      {/* Backdrop */}
      {showDropdown && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowDropdown(false)}
        />
      )}
    </div>
  );
};

export default NotificationsButton;
