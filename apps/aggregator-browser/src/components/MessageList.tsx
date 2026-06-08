/**
 * Message List Component
 * List of message threads and requests
 */

import React, { useState, useEffect, useRef } from 'react';
import { MessageCircle, MoreVertical, Trash2, Users } from 'lucide-react';
import { MessageThread as MessageThreadType } from '../services/messageService';
import { getInboxThreads, deleteConversation } from '../services/messageService';
import type { SelectedInboxThread } from '../types/messaging';
import { useUserState } from '../contexts/UserStateContext';
import { useToast } from '../hooks/useToast';
import { inboxCacheService } from '../services/inboxCacheService';
import { getUserProfile } from '../services/profileService';
import { useRealtimeSync } from '../hooks/useRealtimeSync';

interface MessageListProps {
  onThreadSelect: (thread: SelectedInboxThread) => void;
}

export function MessageList({ onThreadSelect }: MessageListProps) {
  const { userState, getDisplayName, setUserDisplayName } = useUserState();
  const { success, error: showError } = useToast();
  const [threads, setThreads] = useState<MessageThreadType[]>([]);
  const [loading, setLoading] = useState(true);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<{ participantPnIdentifier: string; participantName?: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const loadingDisplayNamesRef = useRef<Set<string>>(new Set());

  const socketConnected = useRealtimeSync(() => {
    if (userState.pnIdentifier) {
      getInboxThreads(userState.pnIdentifier).then(setThreads).catch(() => {});
    }
  });

  // Load display names for participants
  const loadDisplayNames = async (participantPnIdentifiers: string[]) => {
    const toLoad = participantPnIdentifiers.filter(
      pnId => 
        pnId && 
        !loadingDisplayNamesRef.current.has(pnId) &&
        getDisplayName(pnId) === pnId // Only load if we don't have a display name
    );
    
    if (toLoad.length === 0) return;
    
    toLoad.forEach(pnId => loadingDisplayNamesRef.current.add(pnId));
    
    try {
      const profilePromises = toLoad.map(async (pnId) => {
        try {
          const profile = await getUserProfile(pnId);
          if (profile.displayName) {
            setUserDisplayName(pnId, profile.displayName);
          }
          return { pnId, displayName: profile.displayName };
        } catch (error) {
          console.debug('Failed to load display name for', pnId, error);
          return { pnId, displayName: undefined };
        } finally {
          loadingDisplayNamesRef.current.delete(pnId);
        }
      });
      
      await Promise.all(profilePromises);
    } catch (error) {
      console.error('Failed to load display names:', error);
      toLoad.forEach(pnId => loadingDisplayNamesRef.current.delete(pnId));
    }
  };

  // Load threads and requests
  useEffect(() => {
    if (!userState.isUnlocked || !userState.pnIdentifier) return;

    // Load from cache instantly (no API call)
    const cachedInbox = inboxCacheService.get(userState.pnIdentifier);
    if (cachedInbox && cachedInbox.length > 0) {
      // Convert cached entries to MessageThread format for display
      // Create minimal lastMessage object with timestamp for date display (no content preview)
      const cachedThreads: MessageThreadType[] = cachedInbox.map(entry => ({
        participantPnIdentifier: entry.participantPnIdentifier,
        participantName: undefined,
        lastMessage: {
          messageId: '',
          fromPnIdentifier: '',
          toPnIdentifier: entry.participantPnIdentifier,
          content: '', // No preview
          timestamp: entry.lastMessageAt,
          read: false,
          encrypted: false
        },
        unreadCount: 0, // Will be updated from API
        messages: [],
        // Include cached credentials for fast conversation loading (critical for optimization!)
        spreadsheetId: entry.spreadsheetId,
        connectionId: entry.connectionId,
        kemCiphertext: entry.kemCiphertext
      }));
      setThreads(cachedThreads);
      setLoading(false); // Show instantly, no loading spinner
      
      // Load display names for cached participants
      const participantIds = cachedInbox
        .map(entry => entry.participantPnIdentifier)
        .filter(Boolean) as string[];
      loadDisplayNames(participantIds);
    } else {
      setLoading(true); // Only show loading if no cache
    }

    const loadData = async (isInitial = false) => {
      try {
        const threadsData = await getInboxThreads(userState.pnIdentifier!);
        
        // Update threads (keep timestamp but remove preview content)
        const threadsWithoutPreview = threadsData.map(thread => ({
          ...thread,
          lastMessage: thread.lastMessage ? {
            messageId: '',
            fromPnIdentifier: '',
            toPnIdentifier: thread.participantPnIdentifier,
            content: '', // No preview
            timestamp: thread.lastMessage.timestamp,
            read: false,
            encrypted: false
          } : undefined
        }));
        setThreads(threadsWithoutPreview);
        
        // Load display names for all participants
        const participantIds = threadsData
          .map(thread => thread.participantPnIdentifier)
          .filter(Boolean) as string[];
        loadDisplayNames(participantIds);
        
        // Update cache with latest data (including conversation credentials for fast loading)
        const inboxEntries = threadsData
          .filter(thread => thread.participantPnIdentifier)
          .map(thread => ({
            threadType: thread.threadType || 'dm',
            participantPnIdentifier: thread.participantPnIdentifier,
            lastMessageAt: thread.lastMessage?.timestamp || new Date().toISOString(),
            spreadsheetId: thread.spreadsheetId,
            connectionId: thread.threadType === 'group' ? thread.ownerPnIdentifier : thread.connectionId,
            kemCiphertext: thread.kemCiphertext,
            groupId: thread.groupId,
            groupTitle: thread.groupTitle,
            ownerPnIdentifier: thread.ownerPnIdentifier
          }))
          .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
        inboxCacheService.set(userState.pnIdentifier!, inboxEntries);
      } catch (error) {
        console.error('Failed to load messages:', error);
      } finally {
        if (isInitial) {
          setLoading(false);
        }
      }
    };

    // Initial load from API (background refresh)
    loadData(true);

    // Poll for updates - only when tab is visible and socket is disconnected
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible' && !socketConnected) {
        loadData(false);
      }
    }, 30000);
    
    return () => clearInterval(interval);
  }, [userState.isUnlocked, userState.pnIdentifier, socketConnected]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      // Check if click is outside any menu
      const menuElements = document.querySelectorAll('[data-menu-id]');
      let clickedInsideMenu = false;
      menuElements.forEach((menu) => {
        if (menu.contains(target)) {
          clickedInsideMenu = true;
        }
      });
      if (!clickedInsideMenu && openMenuId !== null) {
        setOpenMenuId(null);
      }
    };

    if (openMenuId !== null) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [openMenuId]);

  const handleDeleteConversation = async (participantPnIdentifier: string) => {
    if (!userState.isUnlocked || !userState.pnIdentifier || deleting) {
      return;
    }

    setDeleting(true);
    try {
      // Optimistically remove from list
      setThreads(prev => prev.filter(t => t.participantPnIdentifier !== participantPnIdentifier));
      
      await deleteConversation(userState.pnIdentifier, participantPnIdentifier);
      success('Conversation deleted');
      
      // Refresh thread list to ensure consistency
      const threadsData = await getInboxThreads(userState.pnIdentifier);
      setThreads(threadsData);
    } catch (error: any) {
      console.error('Failed to delete conversation:', error);
      // Restore thread on error
      const threadsData = await getInboxThreads(userState.pnIdentifier!);
      setThreads(threadsData);
      const errorMessage = error?.message || 'Failed to delete conversation';
      showError(errorMessage);
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(null);
      setOpenMenuId(null);
    }
  };

  if (!userState.isUnlocked || !userState.pnIdentifier) {
    return (
      <div className="h-full flex items-center justify-center bg-neutral-900">
        <div className="text-center">
          <MessageCircle className="h-12 w-12 text-neutral-400 mx-auto mb-4" />
          <p className="text-neutral-400">Connect your pN to access messages</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-neutral-900">
      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400 mx-auto mb-2"></div>
            <p className="text-neutral-400 text-sm">Loading...</p>
          </div>
        ) : threads.length === 0 ? (
          <div className="p-8 text-center">
            <MessageCircle className="h-12 w-12 text-neutral-400 mx-auto mb-3 opacity-50" />
            <p className="text-neutral-400">No messages yet</p>
          </div>
        ) : (
          <div className="divide-y divide-neutral-700">
            {threads.filter(t => t.participantPnIdentifier).map((thread) => {
              const isGroup = thread.threadType === 'group';
              const rowKey = isGroup ? `group-${thread.groupId}` : thread.participantPnIdentifier;
              const label = isGroup
                ? (thread.groupTitle || 'Group')
                : (() => {
                    const displayName = getDisplayName(thread.participantPnIdentifier);
                    return displayName !== thread.participantPnIdentifier
                      ? displayName
                      : (thread.participantPnIdentifier || 'Unknown').substring(0, 16) + '...';
                  })();
              return (
              <div key={rowKey} className="relative">
                <button
                  onClick={() => {
                    if (isGroup && thread.groupId && thread.ownerPnIdentifier) {
                      onThreadSelect({
                        kind: 'group',
                        groupId: thread.groupId,
                        title: thread.groupTitle || 'Group',
                        ownerPnIdentifier: thread.ownerPnIdentifier,
                        accessRole: thread.accessRole || 'readWrite',
                        wrappedChatKey: thread.wrappedChatKey || '',
                        spreadsheetId: thread.spreadsheetId
                      });
                    } else {
                      onThreadSelect({
                        kind: 'dm',
                        participantPnIdentifier: thread.participantPnIdentifier,
                        participantName: thread.participantName,
                        connectionId: thread.connectionId,
                        kemCiphertext: thread.kemCiphertext,
                        spreadsheetId: thread.spreadsheetId
                      });
                    }
                  }}
                  className="w-full p-4 hover:bg-neutral-800 transition-colors text-left"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3 flex-1 min-w-0">
                      <div className="w-12 h-12 bg-blue-500/20 rounded-full flex items-center justify-center flex-shrink-0">
                        {isGroup ? (
                          <Users className="h-6 w-6 text-blue-400" />
                        ) : (
                        <span className="text-blue-400 font-semibold">
                          {(label || '?').charAt(0).toUpperCase()}
                        </span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2">
                          <h3 className="text-white font-medium truncate">
                            {label}
                          </h3>
                          {thread.unreadCount > 0 && (
                            <span className="px-2 py-0.5 bg-blue-500 text-white text-xs rounded-full">
                              {thread.unreadCount}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2 flex-shrink-0">
                      {thread.lastMessage && (
                        <div className="text-neutral-500 text-xs">
                          {new Date(thread.lastMessage.timestamp).toLocaleDateString()}
                        </div>
                      )}
                      {!isGroup && (
                      <div 
                        className="relative" 
                        data-menu-id={thread.participantPnIdentifier}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() => setOpenMenuId(openMenuId === thread.participantPnIdentifier ? null : thread.participantPnIdentifier)}
                          className="text-neutral-400 hover:text-white transition-colors p-2"
                          aria-label="Menu"
                        >
                          <MoreVertical className="h-5 w-5" />
                        </button>
                        {openMenuId === thread.participantPnIdentifier && (
                          <div 
                            className="absolute right-0 mt-2 w-48 bg-neutral-800 border border-neutral-700 rounded-lg shadow-lg z-10"
                            data-menu-id={thread.participantPnIdentifier}
                          >
                            <button
                              onClick={() => {
                                setOpenMenuId(null);
                                setShowDeleteConfirm({
                                  participantPnIdentifier: thread.participantPnIdentifier,
                                  participantName: thread.participantName
                                });
                              }}
                              className="w-full text-left px-4 py-2 text-red-400 hover:bg-neutral-700 flex items-center space-x-2"
                            >
                              <Trash2 className="h-4 w-4" />
                              <span>Delete Conversation</span>
                            </button>
                          </div>
                        )}
                      </div>
                      )}
                    </div>
                  </div>
                </button>
              </div>
            );
            })}
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-neutral-800 rounded-lg p-6 max-w-md w-full mx-4 border border-neutral-700">
            <h3 className="text-white font-semibold text-lg mb-2">Delete Conversation</h3>
            <p className="text-neutral-400 text-sm mb-6">
              Are you sure you want to delete this conversation? This will disconnect you from this user and you will no longer see this conversation. The other user will still be able to see the conversation on their end.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowDeleteConfirm(null);
                  setOpenMenuId(null);
                }}
                className="px-4 py-2 text-neutral-400 hover:text-white transition-colors"
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteConversation(showDeleteConfirm.participantPnIdentifier)}
                disabled={deleting}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

