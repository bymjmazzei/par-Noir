/**
 * Inbox Component
 * Tabbed interface for Messages and Notifications
 */

import React, { useState, useEffect } from 'react';
import { MessageCircle, Bell, List, Users, UserPlus, Inbox as InboxIcon } from 'lucide-react';
import { MessageList } from './MessageList';
import { MessageThread } from './MessageThread';
import { Notification } from '../services/notificationService';
import { ActivityLedgerPanel } from './ActivityLedgerPanel';
import { NotificationPreferences } from './NotificationPreferences';
import { NotificationList } from './NotificationList';
import { ConnectionsPanel } from './ConnectionsPanel';
import { RequestsList } from './RequestsList';
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
  const [activeView, setActiveView] = useState<'messages' | 'notifications' | 'requests' | 'activity' | 'connections'>('messages');
  const [selectedThread, setSelectedThread] = useState<{
    participantPnIdentifier: string;
    participantName?: string;
    preloadedMessages?: any[];
    connectionId?: string;
    sharedSecret?: string;
    spreadsheetId?: string;
  } | null>(initialThread);
  const [showNotificationPreferences, setShowNotificationPreferences] = useState(false);
  
  // Update selectedThread if initialThread changes
  React.useEffect(() => {
    if (initialThread) {
      setSelectedThread(initialThread);
      setActiveView('messages');
    }
  }, [initialThread]);

  if (selectedThread) {
    return (
      <MessageThread
        participantPnIdentifier={selectedThread.participantPnIdentifier}
        participantName={selectedThread.participantName}
        preloadedMessages={selectedThread.preloadedMessages}
        onBack={() => setSelectedThread(null)}
        connectionId={selectedThread.connectionId}
        sharedSecret={selectedThread.sharedSecret}
        spreadsheetId={selectedThread.spreadsheetId}
      />
    );
  }

  const getViewTitle = (view: typeof activeView): string => {
    switch (view) {
      case 'messages':
        return 'Inbox';
      case 'notifications':
        return 'Notifications';
      case 'requests':
        return 'Requests';
      case 'activity':
        return 'Activity Ledger';
      case 'connections':
        return 'Connections';
      default:
        return 'Inbox';
    }
  };

  return (
    <div className="h-full flex flex-col bg-neutral-900" style={{ paddingBottom: '64px' }}>
      {/* Header with Icon Navigation */}
      <div className="flex items-center justify-between p-4 border-b border-neutral-700">
        {/* Title on the left */}
        <h2 className="text-white text-lg font-semibold">{getViewTitle(activeView)}</h2>
        
        {/* Icons on the right */}
        <div className="flex items-center space-x-2 pr-16">
          <button 
            onClick={() => setActiveView('messages')} 
            className={`p-2 rounded transition-colors ${
              activeView === 'messages'
                ? 'text-blue-400'
                : 'hover:bg-neutral-800 text-white'
            }`}
            aria-label="Messages"
            title="Messages"
          >
            <InboxIcon className="h-5 w-5" />
          </button>
          <button 
            onClick={() => setActiveView('notifications')} 
            className={`p-2 rounded transition-colors ${
              activeView === 'notifications'
                ? 'text-blue-400'
                : 'hover:bg-neutral-800 text-white'
            }`}
            aria-label="Notifications"
            title="Notifications"
          >
            <Bell className="h-5 w-5" />
          </button>
          <button 
            onClick={() => setActiveView('requests')} 
            className={`p-2 rounded transition-colors ${
              activeView === 'requests'
                ? 'text-blue-400'
                : 'hover:bg-neutral-800 text-white'
            }`}
            aria-label="Requests"
            title="Requests"
          >
            <UserPlus className="h-5 w-5" />
          </button>
          {userState.isUnlocked && userState.pnIdentifier && (
            <>
              <button 
                onClick={() => setActiveView('activity')} 
                className={`p-2 rounded transition-colors ${
                  activeView === 'activity'
                    ? 'text-blue-400'
                    : 'hover:bg-neutral-800 text-white'
                }`}
                aria-label="Activity Ledger"
                title="Activity Ledger"
              >
                <List className="h-5 w-5" />
              </button>
              <button 
                onClick={() => setActiveView('connections')} 
                className={`p-2 rounded transition-colors ${
                  activeView === 'connections'
                    ? 'text-blue-400'
                    : 'hover:bg-neutral-800 text-white'
                }`}
                aria-label="Connections"
                title="Connections"
              >
                <Users className="h-5 w-5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Notification Preferences (overlay) */}
      {userState.isUnlocked && userState.pnIdentifier && (
        <NotificationPreferences
          isOpen={showNotificationPreferences}
          onClose={() => setShowNotificationPreferences(false)}
        />
      )}

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeView === 'messages' ? (
          <MessageList
            onThreadSelect={(participantPnIdentifier, participantName, preloadedMessages, connectionId, sharedSecret, spreadsheetId) => {
              setSelectedThread({ participantPnIdentifier, participantName, preloadedMessages, connectionId, sharedSecret, spreadsheetId });
            }}
          />
        ) : activeView === 'notifications' ? (
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
        ) : activeView === 'requests' ? (
          <RequestsList />
        ) : activeView === 'activity' ? (
          userState.isUnlocked && userState.pnIdentifier ? (
            <ActivityLedgerPanel userPnIdentifier={userState.pnIdentifier} />
          ) : (
            <div className="p-4">
              <p className="text-neutral-400 text-sm mb-4">
                Unlock your identity to view activity ledger.
              </p>
            </div>
          )
        ) : activeView === 'connections' ? (
          userState.isUnlocked && userState.pnIdentifier ? (
            <ConnectionsPanel
              userPnIdentifier={userState.pnIdentifier}
              onCreatorClick={onCreatorClick}
            />
          ) : (
            <div className="p-4">
              <p className="text-neutral-400 text-sm mb-4">
                Unlock your identity to view connections.
              </p>
            </div>
          )
        ) : null}
      </div>
    </div>
  );
}

