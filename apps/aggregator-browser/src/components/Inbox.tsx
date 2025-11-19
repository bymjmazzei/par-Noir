/**
 * Inbox Component
 * Tabbed interface for Messages and Notifications
 */

import React, { useState, useEffect } from 'react';
import { MessageCircle, Bell } from 'lucide-react';
import { MessageList } from './MessageList';
import { MessageThread } from './MessageThread';
import { NotificationBell } from './NotificationBell';
import { Notification } from '../services/notificationService';

interface InboxProps {
  onNotificationClick?: (notification: Notification) => void;
  initialThread?: {
    participantDid: string;
    participantName?: string;
  } | null;
}

export function Inbox({ onNotificationClick, initialThread = null }: InboxProps) {
  const [activeTab, setActiveTab] = useState<'messages' | 'notifications'>('messages');
  const [selectedThread, setSelectedThread] = useState<{
    participantDid: string;
    participantName?: string;
  } | null>(initialThread);
  
  // Update selectedThread if initialThread changes
  React.useEffect(() => {
    if (initialThread) {
      setSelectedThread(initialThread);
      setActiveTab('messages');
    }
  }, [initialThread]);

  if (selectedThread) {
    return (
      <MessageThread
        participantDid={selectedThread.participantDid}
        participantName={selectedThread.participantName}
        onBack={() => setSelectedThread(null)}
      />
    );
  }

  return (
    <div className="h-full flex flex-col bg-neutral-900" style={{ paddingBottom: '64px' }}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-neutral-700">
        <h2 className="text-white text-lg font-semibold">Inbox</h2>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-neutral-700">
        <button
          onClick={() => setActiveTab('messages')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors flex items-center justify-center space-x-2 ${
            activeTab === 'messages'
              ? 'text-white border-b-2 border-blue-500'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          <MessageCircle className="h-4 w-4" />
          <span>Messages</span>
        </button>
        <button
          onClick={() => setActiveTab('notifications')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors flex items-center justify-center space-x-2 ${
            activeTab === 'notifications'
              ? 'text-white border-b-2 border-blue-500'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          <Bell className="h-4 w-4" />
          <span>Notifications</span>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'messages' ? (
          <MessageList
            onThreadSelect={(participantDid, participantName) => {
              setSelectedThread({ participantDid, participantName });
            }}
          />
        ) : (
          <div className="h-full overflow-y-auto">
            {/* Notifications will be handled by NotificationBell component logic */}
            <div className="p-4">
              <p className="text-neutral-400 text-sm mb-4">
                Notifications are also available via the notification bell in the top navigation.
              </p>
              {/* TODO: Full notifications list view */}
              <div className="text-center py-12">
                <Bell className="h-12 w-12 text-neutral-400 mx-auto mb-3 opacity-50" />
                <p className="text-neutral-400">Full notifications view coming soon</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

