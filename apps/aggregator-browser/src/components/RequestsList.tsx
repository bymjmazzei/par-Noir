/**
 * Requests List Component
 * Displays message and connection requests
 */

import React, { useState, useEffect } from 'react';
import { UserPlus, Check, X } from 'lucide-react';
import { MessageRequest } from '../services/messageService';
import { getMessageRequests, respondToRequest } from '../services/messageService';
import { getPendingRequests as getConnectionPendingRequests, acceptConnectionRequest, rejectConnectionRequest } from '../services/connectionService';
import { getMessageThreads } from '../services/messageService';
import { useUserState } from '../contexts/UserStateContext';
import { useToast } from '../hooks/useToast';

interface RequestsListProps {
  onRequestAccept?: () => void; // Callback when a request is accepted (to reload threads)
}

export function RequestsList({ onRequestAccept }: RequestsListProps) {
  const { userState } = useUserState();
  const { success, error: showError } = useToast();
  const [requests, setRequests] = useState<MessageRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingRequests, setProcessingRequests] = useState<Set<string>>(new Set());

  // Load requests
  useEffect(() => {
    if (!userState.isUnlocked || !userState.pnIdentifier) return;

    const loadData = async () => {
      try {
        const [requestsData, connectionRequests] = await Promise.all([
          getMessageRequests(userState.pnIdentifier!),
          getConnectionPendingRequests(userState.pnIdentifier!)
        ]);
        
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
        console.error('Failed to load requests:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();

    // Poll for updates - only when tab is visible
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadData();
      }
    }, 30000); // 30 seconds
    
    return () => clearInterval(interval);
  }, [userState.isUnlocked, userState.pnIdentifier]);

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
        await acceptConnectionRequest(
          request.connectionId,
          userState.pnIdentifier,
          request.fromPnIdentifier
        );
        success('Connection request accepted');
      } else {
        // Handle message request
        await respondToRequest(request.requestId, userState.pnIdentifier, true);
        success('Message request accepted');
      }
      // Reload threads to show new conversation
      await getMessageThreads(userState.pnIdentifier!);
      // Notify parent to reload threads if callback provided
      onRequestAccept?.();
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

  if (!userState.isUnlocked || !userState.pnIdentifier) {
    return (
      <div className="h-full flex items-center justify-center bg-neutral-900">
        <div className="text-center">
          <UserPlus className="h-12 w-12 text-neutral-400 mx-auto mb-4" />
          <p className="text-neutral-400">Connect your pN to access requests</p>
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
        ) : requests.length === 0 ? (
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
        )}
      </div>
    </div>
  );
}
