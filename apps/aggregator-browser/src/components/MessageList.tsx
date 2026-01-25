/**
 * Message List Component
 * List of message threads and requests
 */

import React, { useState, useEffect } from 'react';
import { MessageCircle, UserPlus, Check, X, Clock, MoreVertical, Trash2 } from 'lucide-react';
import { MessageThread as MessageThreadType, MessageRequest, Message, getConversationMessages } from '../services/messageService';
import { getMessageThreads, getMessageRequests, respondToRequest, deleteConversation } from '../services/messageService';
import { getPendingRequests as getConnectionPendingRequests, acceptConnectionRequest, rejectConnectionRequest } from '../services/connectionService';
import { useUserState } from '../contexts/UserStateContext';
import { useToast } from '../hooks/useToast';

interface MessageListProps {
  onThreadSelect: (participantPnIdentifier: string, participantName?: string, preloadedMessages?: Message[], connectionId?: string, sharedSecret?: string, spreadsheetId?: string) => void;
}

export function MessageList({ onThreadSelect }: MessageListProps) {
  const { userState } = useUserState();
  const { success, error: showError } = useToast();
  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [requests, setRequests] = useState<MessageRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'threads' | 'requests'>('threads');
  const [processingRequests, setProcessingRequests] = useState<Set<string>>(new Set());
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<{ participantPnIdentifier: string; participantName?: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [preloadedMessages, setPreloadedMessages] = useState<Map<string, Message[]>>(new Map());

  // Load threads and requests
  useEffect(() => {
    if (!userState.isUnlocked || !userState.pnIdentifier) return;

    const loadData = async (isInitial = false) => {
      // Only show loading spinner on initial load
      if (isInitial) {
        setLoading(true);
      }
      
      try {
        const [threadsData, requestsData, connectionRequests] = await Promise.all([
          getMessageThreads(userState.pnIdentifier!),
          getMessageRequests(userState.pnIdentifier!),
          getConnectionPendingRequests(userState.pnIdentifier!)
        ]);
        setThreads(threadsData);
        
        // Preload last 10 messages for top 3-5 conversations (background, non-blocking)
        if (threadsData.length > 0 && userState.pnIdentifier) {
          const topConversations = threadsData.slice(0, 5).filter(t => t.participantPnIdentifier);
          // Preload in background without blocking UI
          Promise.all(
            topConversations.map(async (thread) => {
              try {
                const messages = await getConversationMessages(userState.pnIdentifier!, thread.participantPnIdentifier);
                setPreloadedMessages(prev => {
                  const next = new Map(prev);
                  next.set(thread.participantPnIdentifier, messages);
                  return next;
                });
              } catch (error) {
                // Silently fail - preloading is optional
                console.warn(`Failed to preload messages for ${thread.participantPnIdentifier}:`, error);
              }
            })
          ).catch(() => {
            // Ignore errors - preloading is optional
          });
        }
        
        // Combine message requests and connection requests
        const messageRequests = requestsData.filter(r => r.status === 'pending');
        const connectionRequestsList = connectionRequests.received
          .filter(conn => conn.userPnIdentifier) // Filter out invalid connections
          .map(conn => ({
            requestId: conn.connectionId,
            fromPnIdentifier: conn.userPnIdentifier!,
            toPnIdentifier: userState.pnIdentifier!,
            content: `Connection request from ${conn.userPnIdentifier.substring(0, 8)}...`,
            timestamp: conn.createdAt,
            status: 'pending' as const,
            isConnectionRequest: true,
            connectionId: conn.connectionId
          }));
        
        // Filter out requests that are currently being processed
        const filteredRequests = [...messageRequests, ...connectionRequestsList].filter(
          r => !processingRequests.has(r.requestId)
        );
        setRequests(filteredRequests);
      } catch (error) {
        console.error('Failed to load messages:', error);
      } finally {
        if (isInitial) {
          setLoading(false);
        }
      }
    };

    // Initial load
    loadData(true);

    // Poll for updates - only when tab is visible
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadData(false);
      }
    }, 10000);
    
    return () => clearInterval(interval);
  }, [userState.isUnlocked, userState.pnIdentifier]);

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

  const handleAcceptRequest = async (request: MessageRequest & { isConnectionRequest?: boolean; connectionId?: string }) => {
    if (!userState.pnIdentifier) return;

    // Prevent duplicate processing
    if (processingRequests.has(request.requestId)) {
      return; // Already processing
    }

    // Mark as processing and remove from UI immediately (optimistic UI)
    setProcessingRequests(prev => new Set(prev).add(request.requestId));
    setRequests(prev => prev.filter(r => r.requestId !== request.requestId));

    try {
      if (request.isConnectionRequest && request.connectionId) {
        // Handle connection request
        await acceptConnectionRequest(request.connectionId, userState.pnIdentifier);
        success('Connection request accepted');
      } else {
        // Handle message request
        await respondToRequest(request.requestId, userState.pnIdentifier, true);
        success('Message request accepted');
      }
      // Reload threads to show new conversation
      const threadsData = await getMessageThreads(userState.pnIdentifier!);
      setThreads(threadsData);
    } catch (error: any) {
      // Restore request on error
      setRequests(prev => [...prev, request]);
      showError(error.message || 'Failed to accept request');
    } finally {
      // Remove from processing set
      setProcessingRequests(prev => {
        const next = new Set(prev);
        next.delete(request.requestId);
        return next;
      });
    }
  };

  const handleDeclineRequest = async (request: MessageRequest & { isConnectionRequest?: boolean; connectionId?: string }) => {
    if (!userState.pnIdentifier) return;

    // Prevent duplicate processing
    if (processingRequests.has(request.requestId)) {
      return; // Already processing
    }

    // Mark as processing and remove from UI immediately (optimistic UI)
    setProcessingRequests(prev => new Set(prev).add(request.requestId));
    setRequests(prev => prev.filter(r => r.requestId !== request.requestId));

    try {
      if (request.isConnectionRequest && request.connectionId) {
        // Handle connection request
        await rejectConnectionRequest(request.connectionId, userState.pnIdentifier);
      } else {
        // Handle message request
        await respondToRequest(request.requestId, userState.pnIdentifier, false);
      }
    } catch (error: any) {
      // Restore request on error
      setRequests(prev => [...prev, request]);
      showError(error.message || 'Failed to decline request');
    } finally {
      // Remove from processing set
      setProcessingRequests(prev => {
        const next = new Set(prev);
        next.delete(request.requestId);
        return next;
      });
    }
  };

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
      const threadsData = await getMessageThreads(userState.pnIdentifier);
      setThreads(threadsData);
    } catch (error: any) {
      console.error('Failed to delete conversation:', error);
      // Restore thread on error
      const threadsData = await getMessageThreads(userState.pnIdentifier!);
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
      {/* Tabs */}
      <div className="flex border-b border-neutral-700">
        <button
          onClick={() => setActiveTab('threads')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'threads'
              ? 'text-white border-b-2 border-blue-500'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          Messages
          {threads.some(t => t.unreadCount > 0) && (
            <span className="ml-2 px-2 py-0.5 bg-blue-500 text-white text-xs rounded-full">
              {threads.reduce((sum, t) => sum + t.unreadCount, 0)}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('requests')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'requests'
              ? 'text-white border-b-2 border-blue-500'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          Requests
          {requests.length > 0 && (
            <span className="ml-2 px-2 py-0.5 bg-yellow-500 text-white text-xs rounded-full">
              {requests.length}
            </span>
          )}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400 mx-auto mb-2"></div>
            <p className="text-neutral-400 text-sm">Loading...</p>
          </div>
        ) : activeTab === 'threads' ? (
          threads.length === 0 ? (
            <div className="p-8 text-center">
              <MessageCircle className="h-12 w-12 text-neutral-400 mx-auto mb-3 opacity-50" />
              <p className="text-neutral-400">No messages yet</p>
            </div>
          ) : (
            <div className="divide-y divide-neutral-700">
              {threads.filter(t => t.participantPnIdentifier).map((thread) => (
                <div key={thread.participantPnIdentifier} className="relative">
                  <button
                    onClick={() => {
                      const preloaded = preloadedMessages.get(thread.participantPnIdentifier);
                      onThreadSelect(
                        thread.participantPnIdentifier, 
                        thread.participantName, 
                        preloaded,
                        thread.connectionId,
                        thread.sharedSecret,
                        thread.spreadsheetId
                      );
                    }}
                    className="w-full p-4 hover:bg-neutral-800 transition-colors text-left"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3 flex-1 min-w-0">
                        <div className="w-12 h-12 bg-blue-500/20 rounded-full flex items-center justify-center flex-shrink-0">
                          <span className="text-blue-400 font-semibold">
                            {(thread.participantName || thread.participantPnIdentifier || '?').charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-2 mb-1">
                            <h3 className="text-white font-medium truncate">
                              {thread.participantName || (thread.participantPnIdentifier || 'Unknown').substring(0, 16) + '...'}
                            </h3>
                            {thread.unreadCount > 0 && (
                              <span className="px-2 py-0.5 bg-blue-500 text-white text-xs rounded-full">
                                {thread.unreadCount}
                              </span>
                            )}
                          </div>
                          {thread.lastMessage && (
                            <p className="text-neutral-400 text-sm truncate">
                              {thread.lastMessage.content}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center space-x-2 flex-shrink-0">
                        {thread.lastMessage && (
                          <div className="text-neutral-500 text-xs">
                            {new Date(thread.lastMessage.timestamp).toLocaleDateString()}
                          </div>
                        )}
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
                      </div>
                    </div>
                  </button>
                </div>
              ))}
            </div>
          )
        ) : (
          requests.length === 0 ? (
            <div className="p-8 text-center">
              <UserPlus className="h-12 w-12 text-neutral-400 mx-auto mb-3 opacity-50" />
              <p className="text-neutral-400">No pending requests</p>
            </div>
          ) : (
            <div className="divide-y divide-neutral-700">
              {requests.map((request) => (
                <div key={request.requestId} className="p-4">
                  <div className="flex items-start space-x-3 mb-3">
                    <div className="w-10 h-10 bg-blue-500/20 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-blue-400 font-semibold text-sm">
                        {(request.fromPnIdentifier || '?').charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-white font-medium mb-1">
                        {(request.fromPnIdentifier?.substring(0, 16) || 'Unknown') + '...'}
                      </h3>
                      <p className="text-neutral-400 text-sm mb-2">{request.content}</p>
                      <p className="text-neutral-500 text-xs">
                        {new Date(request.timestamp).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleAcceptRequest(request)}
                      disabled={processingRequests.has(request.requestId)}
                      className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Check className="h-4 w-4" />
                      <span>{processingRequests.has(request.requestId) ? 'Processing...' : 'Accept'}</span>
                    </button>
                    <button
                      onClick={() => handleDeclineRequest(request)}
                      disabled={processingRequests.has(request.requestId)}
                      className="flex-1 px-4 py-2 bg-neutral-800 text-white rounded-lg hover:bg-neutral-700 transition-colors flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <X className="h-4 w-4" />
                      <span>{processingRequests.has(request.requestId) ? 'Processing...' : 'Decline'}</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
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

