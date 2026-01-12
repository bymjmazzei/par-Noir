/**
 * Notification Preferences Component
 * Settings panel for notification preferences
 */

import React, { useState, useEffect } from 'react';
import { X, Settings } from 'lucide-react';
import { NotificationService, NotificationPreferences } from '../services/notificationService';
import { useUserState } from '../contexts/UserStateContext';

interface NotificationPreferencesProps {
  isOpen: boolean;
  onClose: () => void;
}

export function NotificationPreferences({ isOpen, onClose }: NotificationPreferencesProps) {
  const { userState } = useUserState();
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen && userState.isUnlocked && userState.pnIdentifier) {
      loadPreferences();
    }
  }, [isOpen, userState.isUnlocked, userState.pnIdentifier]);

  const loadPreferences = async () => {
    if (!userState.pnIdentifier) return;
    
    setLoading(true);
    try {
      const prefs = await NotificationService.getPreferences(userState.pnIdentifier);
      setPreferences(prefs);
    } catch (error) {
      console.error('Failed to load preferences:', error);
      // Use defaults if load fails (only reactions enabled by default)
      setPreferences({
        user_did: userState.pnIdentifier,
        feed_new_post: false,
        feed_new_comment: true,
        feed_new_like: true,
        feed_new_subscriber: false,
        comment_reply: true,
        mention: false,
        connection_request: true,
        connection_accepted: true,
        repost: true
      });
    } finally {
      setLoading(false);
    }
  };

  const updatePreference = async (key: keyof Omit<NotificationPreferences, 'user_did'>, value: boolean) => {
    if (!preferences || !userState.pnIdentifier) return;

    const updated = { ...preferences, [key]: value };
    setPreferences(updated);
    setSaving(true);

    try {
      await NotificationService.updatePreferences(userState.pnIdentifier, { [key]: value });
    } catch (error) {
      console.error('Failed to update preference:', error);
      // Revert on error
      setPreferences(preferences);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  if (!preferences) {
    return (
      <>
        <div className="fixed inset-0 bg-black bg-opacity-50 z-40" onClick={onClose} />
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="bg-neutral-900 rounded-lg p-6 max-w-md w-full mx-4">
            <div className="text-center text-neutral-400">Loading preferences...</div>
          </div>
        </div>
      </>
    );
  }

  const toggleItems = [
    { key: 'feed_new_post' as const, label: 'New posts in subscribed feeds' },
    { key: 'feed_new_comment' as const, label: 'Comments on feed posts' },
    { key: 'feed_new_like' as const, label: 'Likes on your posts' },
    { key: 'feed_new_subscriber' as const, label: 'New feed subscribers' },
    { key: 'comment_reply' as const, label: 'Replies to your comments' },
    { key: 'mention' as const, label: 'Mentions' },
    { key: 'connection_request' as const, label: 'Connection requests' },
    { key: 'connection_accepted' as const, label: 'Connection accepted' },
    { key: 'repost' as const, label: 'Reposts' }
  ];

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-neutral-900 rounded-lg shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-neutral-700">
            <div className="flex items-center space-x-3">
              <Settings className="h-5 w-5 text-white" />
              <h2 className="text-white text-xl font-semibold">Notification Preferences</h2>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-neutral-800 rounded transition-colors"
              aria-label="Close"
            >
              <X className="h-5 w-5 text-white" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            <p className="text-neutral-400 text-sm mb-6">
              Choose which notifications you want to receive. Default settings only notify you about reactions (likes, comments, shares, messages).
            </p>

            <div className="space-y-4">
              {toggleItems.map((item) => (
                <div
                  key={item.key}
                  className="flex items-center justify-between p-4 bg-neutral-800 rounded-lg hover:bg-neutral-750 transition-colors"
                >
                  <label
                    htmlFor={item.key}
                    className="flex-1 text-white text-sm cursor-pointer"
                  >
                    {item.label}
                  </label>
                  <button
                    onClick={() => updatePreference(item.key, !preferences[item.key])}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      preferences[item.key] ? 'bg-blue-500' : 'bg-neutral-600'
                    }`}
                    role="switch"
                    aria-checked={preferences[item.key]}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        preferences[item.key] ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="p-6 border-t border-neutral-700">
            <button
              onClick={onClose}
              className="w-full px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
