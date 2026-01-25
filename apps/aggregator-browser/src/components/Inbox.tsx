/**
 * Inbox Component
 * Tabbed interface for Messages and Notifications
 */

import React, { useState, useEffect } from 'react';
import { MessageCircle, Bell, List, Users } from 'lucide-react';
import { MessageList } from './MessageList';
import { MessageThread } from './MessageThread';
import { NotificationBell } from './NotificationBell';
import { Notification } from '../services/notificationService';
import { ActivityLedgerPanel } from './ActivityLedgerPanel';
import { NotificationPreferences } from './NotificationPreferences';
import { NotificationList } from './NotificationList';
import { ConnectionsPanel } from './ConnectionsPanel';
import { useUserState } from '../contexts/UserStateContext';

interface InboxProps {
  onNotificationClick?: (notification: Notification) => void;
  initialThread?: {
    participantPnIdentifier: string;
    participantName?: string;
  } | null;
  onCreatorClick?: (creatorId: string) => void;
}

export function Inbox({ onNotificationClick, initialThread = null, onCreatorClick }: InboxProps) {
  const { userState } = useUserState();
  const [activeTab, setActiveTab] = useState<'messages' | 'notifications'>('messages');
  const [selectedThread, setSelectedThread] = useState<{
    participantPnIdentifier: string;
    participantName?: string;
  } | null>(initialThread);
  const [showActivityLedger, setShowActivityLedger] = useState(false);
  const [showNotificationPreferences, setShowNotificationPreferences] = useState(false);
  const [showConnectionsPanel, setShowConnectionsPanel] = useState(false);
  
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
        participantPnIdentifier={selectedThread.participantPnIdentifier}
        participantName={selectedThread.participantName}
        onBack={() => setSelectedThread(null)}
      />
    );
  }

  return (
    <div className="h-full flex flex-col bg-neutral-900" style={{ paddingBottom: '64px' }}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-neutral-700 relative">
        <div className="flex items-center space-x-2">
          <button 
            onClick={() => setShowActivityLedger(true)} 
            className="p-2 hover:bg-neutral-800 rounded transition-colors"
            aria-label="Open activity ledger"
          >
            <List className="h-5 w-5 text-white" />
          </button>
          {userState.isUnlocked && userState.pnIdentifier && (
            <button 
              onClick={() => setShowConnectionsPanel(true)} 
              className="p-2 hover:bg-neutral-800 rounded transition-colors relative"
              aria-label="Open connections"
            >
              <Users className="h-5 w-5 text-white" />
            </button>
          )}
        </div>
        <h2 className="text-white text-lg font-semibold absolute left-1/2 transform -translate-x-1/2">Inbox</h2>
        <div className="w-9" /> {/* Spacer for centering */}
      </div>

      {/* Activity Ledger Panel */}
      {userState.isUnlocked && userState.pnIdentifier && (
        <ActivityLedgerPanel
          isOpen={showActivityLedger}
          onClose={() => setShowActivityLedger(false)}
          userPnIdentifier={userState.pnIdentifier}
        />
      )}

      {/* Notification Preferences */}
      {userState.isUnlocked && userState.pnIdentifier && (
        <NotificationPreferences
          isOpen={showNotificationPreferences}
          onClose={() => setShowNotificationPreferences(false)}
        />
      )}

      {/* Connections Panel */}
      {userState.isUnlocked && userState.pnIdentifier && (
        <ConnectionsPanel
          isOpen={showConnectionsPanel}
          onClose={() => setShowConnectionsPanel(false)}
          userPnIdentifier={userState.pnIdentifier}
          onCreatorClick={onCreatorClick}
        />
      )}

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
            onThreadSelect={(participantPnIdentifier, participantName) => {
              setSelectedThread({ participantPnIdentifier, participantName });
            }}
          />
        ) : (
          <div className="h-full overflow-y-auto">
            {userState.isUnlocked && userState.pnIdentifier ? (
              <NotificationList
                userPnIdentifier={userState.pnIdentifier}
                onPreferencesClick={() => setShowNotificationPreferences(true)}
              />
            ) : (
              <div className="p-4">
                <p className="text-neutral-400 text-sm mb-4">
                  Unlock your identity to view notifications.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

