/**
 * Message List Component
 * List of message threads and requests
 */

import React, { useState, useEffect } from 'react';
import { MessageCircle, UserPlus, Check, X, Clock } from 'lucide-react';
import { MessageThread as MessageThreadType, MessageRequest } from '../services/messageService';
import { getMessageThreads, getMessageRequests, respondToRequest } from '../services/messageService';
import { getPendingRequests as getConnectionPendingRequests, acceptConnectionRequest, rejectConnectionRequest } from '../services/connectionService';
import { useUserState } from '../contexts/UserStateContext';
import { useToast } from '../hooks/useToast';

interface MessageListProps {
  onThreadSelect: (participantDid: string, participantName?: string) => void;
}

export function MessageList({ onThreadSelect }: MessageListProps) {
  const { userState } = useUserState();
  const { success, error: showError } = useToast();
  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [requests, setRequests] = useState<MessageRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'threads' | 'requests'>('threads');

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
        
        // Combine message requests and connection requests
        const messageRequests = requestsData.filter(r => r.status === 'pending');
        const connectionRequestsList = connectionRequests.received.map(conn => ({
          requestId: conn.connectionId,
          fromDid: conn.userDid,
          toDid: userState.pnIdentifier!,
          content: `Connection request from ${conn.userDid.substring(0, 8)}...`,
          timestamp: conn.createdAt,
          status: 'pending' as const,
          isConnectionRequest: true,
          connectionId: conn.connectionId
        }));
        
        setRequests([...messageRequests, ...connectionRequestsList]);
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

  const handleAcceptRequest = async (request: MessageRequest & { isConnectionRequest?: boolean; connectionId?: string }) => {
    if (!userState.pnIdentifier) return;

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
      setRequests(prev => prev.filter(r => r.requestId !== request.requestId));
      // Reload threads to show new conversation
      const threadsData = await getMessageThreads(userState.pnIdentifier!);
      setThreads(threadsData);
    } catch (error: any) {
      showError(error.message || 'Failed to accept request');
    }
  };

  const handleDeclineRequest = async (request: MessageRequest & { isConnectionRequest?: boolean; connectionId?: string }) => {
    if (!userState.pnIdentifier) return;

    try {
      if (request.isConnectionRequest && request.connectionId) {
        // Handle connection request
        await rejectConnectionRequest(request.connectionId, userState.pnIdentifier);
      } else {
        // Handle message request
        await respondToRequest(request.requestId, userState.pnIdentifier, false);
      }
      setRequests(prev => prev.filter(r => r.requestId !== request.requestId));
    } catch (error: any) {
      showError(error.message || 'Failed to decline request');
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
              {threads.map((thread) => (
                <button
                  key={thread.participantDid}
                  onClick={() => onThreadSelect(thread.participantDid, thread.participantName)}
                  className="w-full p-4 hover:bg-neutral-800 transition-colors text-left"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3 flex-1 min-w-0">
                      <div className="w-12 h-12 bg-blue-500/20 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-blue-400 font-semibold">
                          {(thread.participantName || thread.participantDid).charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2 mb-1">
                          <h3 className="text-white font-medium truncate">
                            {thread.participantName || thread.participantDid.substring(0, 16) + '...'}
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
                    {thread.lastMessage && (
                      <div className="text-neutral-500 text-xs ml-2 flex-shrink-0">
                        {new Date(thread.lastMessage.timestamp).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                </button>
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
                        {request.fromDid.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-white font-medium mb-1">
                        {request.fromDid.substring(0, 16) + '...'}
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
                      className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center space-x-2"
                    >
                      <Check className="h-4 w-4" />
                      <span>Accept</span>
                    </button>
                    <button
                      onClick={() => handleDeclineRequest(request)}
                      className="flex-1 px-4 py-2 bg-neutral-800 text-white rounded-lg hover:bg-neutral-700 transition-colors flex items-center justify-center space-x-2"
                    >
                      <X className="h-4 w-4" />
                      <span>Decline</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}

