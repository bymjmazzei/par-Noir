/**
 * Inbox Component
 * Tabbed interface for Messages and Notifications
 */

import React, { useState } from 'react';
import { Bell, List, Users, UserPlus, Inbox as InboxIcon } from 'lucide-react';
import { MessageList } from './MessageList';
import { MessageThread } from './MessageThread';
import { Notification } from '../services/notificationService';
import { ActivityLedgerPanel } from './ActivityLedgerPanel';
import { NotificationPreferences } from './NotificationPreferences';
import { NotificationList } from './NotificationList';
import { ConnectionsPanel } from './ConnectionsPanel';
import { RequestsList } from './RequestsList';
import { useUserState } from '../contexts/UserStateContext';
import { CreateGroupModal } from './CreateGroupModal';
import type { SelectedInboxThread } from '../types/messaging';
import { listGroups } from '../services/groupService';

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
  const [selectedThread, setSelectedThread] = useState<SelectedInboxThread | null>(
    initialThread
      ? { kind: 'dm', participantPnIdentifier: initialThread.participantPnIdentifier, participantName: initialThread.participantName }
      : null
  );
  const [showNotificationPreferences, setShowNotificationPreferences] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);

  // Update selectedThread if initialThread changes
  React.useEffect(() => {
    if (initialThread) {
      setSelectedThread({
        kind: 'dm',
        participantPnIdentifier: initialThread.participantPnIdentifier,
        participantName: initialThread.participantName
      });
      setActiveView('messages');
    }
  }, [initialThread]);

  if (selectedThread) {
    if (selectedThread.kind === 'group') {
      return (
        <MessageThread
          groupId={selectedThread.groupId}
          groupTitle={selectedThread.title}
          ownerPnIdentifier={selectedThread.ownerPnIdentifier}
          accessRole={selectedThread.accessRole}
          wrappedChatKey={selectedThread.wrappedChatKey}
          spreadsheetId={selectedThread.spreadsheetId}
          preloadedMessages={selectedThread.preloadedMessages}
          onBack={() => setSelectedThread(null)}
        />
      );
    }
    return (
      <MessageThread
        participantPnIdentifier={selectedThread.participantPnIdentifier}
        participantName={selectedThread.participantName}
        preloadedMessages={selectedThread.preloadedMessages}
        onBack={() => setSelectedThread(null)}
        connectionId={selectedThread.connectionId}
        kemCiphertext={selectedThread.kemCiphertext}
        spreadsheetId={selectedThread.spreadsheetId}
      />
    );
  }

  return (
    <div className="h-full flex flex-col bg-neutral-900" style={{ paddingBottom: '64px' }}>
      {/* Header with Icon Navigation */}
      <div className="flex items-center justify-start p-4 border-b border-neutral-700">
        {/* Icons on the left */}
        <div className="flex items-center space-x-2">
          {activeView === 'messages' && userState.isUnlocked && userState.pnIdentifier && (
            <button
              type="button"
              onClick={() => setShowCreateGroup(true)}
              className="mr-2 rounded-lg bg-neutral-800 px-3 py-1.5 text-xs text-white hover:bg-neutral-700"
            >
              New group
            </button>
          )}
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
          <MessageList onThreadSelect={(thread) => setSelectedThread(thread)} />
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

      {showCreateGroup && userState.pnIdentifier && (
        <CreateGroupModal
          ownerPnIdentifier={userState.pnIdentifier}
          onClose={() => setShowCreateGroup(false)}
          onCreated={async (groupId, title) => {
            setShowCreateGroup(false);
            if (!userState.pnIdentifier) return;
            try {
              const groups = await listGroups(userState.pnIdentifier);
              const row = groups.find(
                (g) => g.groupId === groupId && g.memberPnIdentifier === userState.pnIdentifier
              );
              setSelectedThread({
                kind: 'group',
                groupId,
                title,
                ownerPnIdentifier: row?.ownerPnIdentifier || userState.pnIdentifier,
                accessRole: row?.accessRole || 'readWrite',
                wrappedChatKey: row?.wrappedChatKey || '',
                spreadsheetId: row?.conversationSpreadsheetId
              });
            } catch {
              setSelectedThread({
                kind: 'group',
                groupId,
                title,
                ownerPnIdentifier: userState.pnIdentifier,
                accessRole: 'readWrite',
                wrappedChatKey: ''
              });
            }
          }}
        />
      )}
    </div>
  );
}

