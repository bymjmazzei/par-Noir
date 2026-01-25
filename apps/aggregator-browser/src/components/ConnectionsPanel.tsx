/**
 * Connections Panel Component
 * Displays and manages connections, followers, and following
 */

import React, { useState, useEffect, useMemo } from 'react';
import { X, Users, UserPlus, UserMinus, Check, X as XIcon } from 'lucide-react';
import { useUserState } from '../contexts/UserStateContext';
import { getUserProfile } from '../services/profileService';
import { PNOAuthService } from '../services/pnOAuthService';
import {
  getConnections,
  getPendingRequests,
  sendConnectionRequest,
  acceptConnectionRequest,
  rejectConnectionRequest,
  removeConnection,
  type Connection,
  type PendingRequests
} from '../services/connectionService';

interface Follower {
  followerPnIdentifier: string;
  followedAt: string;
  feedId?: string;
}

interface Following {
  targetType: 'user' | 'feed';
  targetPnIdentifier: string;
  followedAt: string;
}

interface ConnectionsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  userPnIdentifier: string;
  onCreatorClick?: (creatorId: string) => void;
}

import { API_ENDPOINT } from '../config/api';

function getAuthHeaders(): HeadersInit {
  const session = PNOAuthService.loadSession();
  const headers: HeadersInit = {
    'Content-Type': 'application/json'
  };
  
  if (session?.accessToken) {
    headers['Authorization'] = `Bearer ${session.accessToken}`;
  }
  
  return headers;
}

export function ConnectionsPanel({ isOpen, onClose, userPnIdentifier, onCreatorClick }: ConnectionsPanelProps) {
  const { userState } = useUserState();
  const [activeTab, setActiveTab] = useState<'connections' | 'followers' | 'following'>('connections');
  const [connections, setConnections] = useState<Connection[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PendingRequests>({ sent: [], received: [] });
  const [followers, setFollowers] = useState<Follower[]>([]);
  const [following, setFollowing] = useState<Following[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [displayNames, setDisplayNames] = useState<Map<string, string>>(new Map());
  const [loadingNames, setLoadingNames] = useState<Set<string>>(new Set());
  const [processingConnections, setProcessingConnections] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isOpen && userPnIdentifier) {
      loadData();
    }
  }, [isOpen, userPnIdentifier, activeTab]);

  const loadData = async () => {
    setLoading(true);
    setError(null);

    try {
      if (activeTab === 'connections') {
        // Load connections and pending requests
        const [connectionsData, pendingData] = await Promise.all([
          getConnections(userPnIdentifier),
          getPendingRequests(userPnIdentifier)
        ]);
        setConnections(connectionsData);
        setPendingRequests(pendingData);
        
        // Load display names for all connections and pending requests
        const allUserPnIdentifiers = new Set<string>();
        connectionsData.forEach(c => allUserPnIdentifiers.add(c.userPnIdentifier));
        pendingData.sent.forEach(c => allUserPnIdentifiers.add(c.userPnIdentifier));
        pendingData.received.forEach(c => allUserPnIdentifiers.add(c.userPnIdentifier));
        
        loadDisplayNames(Array.from(allUserPnIdentifiers));
      } else if (activeTab === 'followers') {
        const response = await fetch(`${API_ENDPOINT}/api/connections/followers?userPnIdentifier=${userPnIdentifier}`, {
          headers: getAuthHeaders()
        });
        if (response.ok) {
          const data = await response.json();
          setFollowers(data.followers || []);
        }
      } else if (activeTab === 'following') {
        const response = await fetch(`${API_ENDPOINT}/api/connections/following?userPnIdentifier=${userPnIdentifier}`, {
          headers: getAuthHeaders()
        });
        if (response.ok) {
          const data = await response.json();
          setFollowing(data.following || []);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load data');
      console.error('Failed to load:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadDisplayNames = async (userPnIdentifiers: string[]) => {
    const toLoad = userPnIdentifiers.filter(pnId => !displayNames.has(pnId) && !loadingNames.has(pnId));
    if (toLoad.length === 0) return;

    setLoadingNames(prev => new Set([...prev, ...toLoad]));

    try {
      const namePromises = toLoad.map(async (pnId) => {
        try {
          const profile = await getUserProfile(pnId);
          return { pnId, name: profile.displayName || pnId };
        } catch (error) {
          return { pnId, name: pnId };
        }
      });

      const results = await Promise.all(namePromises);
      setDisplayNames(prev => {
        const next = new Map(prev);
        results.forEach(({ pnId, name }) => next.set(pnId, name));
        return next;
      });
    } catch (error) {
      console.error('Failed to load display names:', error);
    } finally {
      setLoadingNames(prev => {
        const next = new Set(prev);
        toLoad.forEach(pnId => next.delete(pnId));
        return next;
      });
    }
  };

  const getDisplayName = (userPnIdentifier: string): string => {
    return displayNames.get(userPnIdentifier) || userPnIdentifier;
  };

  const handleConnect = async (targetUserPnIdentifier: string) => {
    try {
      await sendConnectionRequest(userPnIdentifier, targetUserPnIdentifier);
      await loadData();
    } catch (error) {
      console.error('Failed to connect:', error);
      setError('Failed to send connection request');
    }
  };

  const handleDisconnect = async (connectionId: string) => {
    try {
      await removeConnection(connectionId, userPnIdentifier);
      await loadData();
    } catch (error) {
      console.error('Failed to disconnect:', error);
      setError('Failed to remove connection');
    }
  };

  const handleAccept = async (connectionId: string) => {
    // Prevent duplicate processing
    if (processingConnections.has(connectionId)) {
      return; // Already processing
    }

    // Mark as processing and remove from UI immediately (optimistic UI)
    setProcessingConnections(prev => new Set(prev).add(connectionId));
    const originalRequest = pendingRequests.received.find(r => r.connectionId === connectionId);
    setPendingRequests(prev => ({
      ...prev,
      received: prev.received.filter(r => r.connectionId !== connectionId)
    }));

    try {
      await acceptConnectionRequest(connectionId, userPnIdentifier);
      await loadData();
    } catch (error) {
      // Restore request on error
      if (originalRequest) {
        setPendingRequests(prev => ({
          ...prev,
          received: [...prev.received, originalRequest]
        }));
      }
      console.error('Failed to accept:', error);
      setError('Failed to accept connection request');
    } finally {
      // Remove from processing set
      setProcessingConnections(prev => {
        const next = new Set(prev);
        next.delete(connectionId);
        return next;
      });
    }
  };

  const handleReject = async (connectionId: string) => {
    // Prevent duplicate processing
    if (processingConnections.has(connectionId)) {
      return; // Already processing
    }

    // Mark as processing and remove from UI immediately (optimistic UI)
    setProcessingConnections(prev => new Set(prev).add(connectionId));
    const originalRequest = pendingRequests.received.find(r => r.connectionId === connectionId);
    setPendingRequests(prev => ({
      ...prev,
      received: prev.received.filter(r => r.connectionId !== connectionId)
    }));

    try {
      await rejectConnectionRequest(connectionId, userPnIdentifier);
      await loadData();
    } catch (error) {
      // Restore request on error
      if (originalRequest) {
        setPendingRequests(prev => ({
          ...prev,
          received: [...prev.received, originalRequest]
        }));
      }
      console.error('Failed to reject:', error);
      setError('Failed to reject connection request');
    } finally {
      // Remove from processing set
      setProcessingConnections(prev => {
        const next = new Set(prev);
        next.delete(connectionId);
        return next;
      });
    }
  };

  const handleCancel = async (connectionId: string) => {
    try {
      await rejectConnectionRequest(connectionId, userPnIdentifier);
      await loadData();
    } catch (error) {
      console.error('Failed to cancel:', error);
      setError('Failed to cancel connection request');
    }
  };

  const handleFollow = async (targetType: 'user' | 'feed', targetPnIdentifier: string) => {
    try {
      const response = await fetch(`${API_ENDPOINT}/api/connections/follow`, {
        method: 'POST',
        headers: getAuthHeaders(),
          body: JSON.stringify({
            userPnIdentifier,
            targetType,
            targetId: targetPnIdentifier // API still expects targetId in request body
          })
      });

      if (response.ok) {
        loadData(); // Reload data
      }
    } catch (error) {
      console.error('Failed to follow:', error);
    }
  };

  const handleUnfollow = async (targetType: 'user' | 'feed', targetPnIdentifier: string) => {
    try {
      const response = await fetch(`${API_ENDPOINT}/api/connections/unfollow`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          userPnIdentifier,
          targetType,
          targetId: targetPnIdentifier // API still expects targetId in request body
        })
      });

      if (response.ok) {
        loadData(); // Reload data
      }
    } catch (error) {
      console.error('Failed to unfollow:', error);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 bottom-0 w-full sm:w-96 bg-neutral-900 z-50 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-neutral-700">
          <div className="flex items-center space-x-3">
            <Users className="h-5 w-5 text-white" />
            <h2 className="text-white text-lg font-semibold">
              Connections
              {pendingRequests.received.length > 0 && (
                <span className="ml-2 px-2 py-0.5 bg-blue-500 text-white text-xs rounded-full">
                  {pendingRequests.received.length}
                </span>
              )}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-neutral-800 rounded transition-colors"
            aria-label="Close"
          >
            <X className="h-5 w-5 text-white" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-neutral-700">
          <button
            onClick={() => setActiveTab('connections')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'connections'
                ? 'text-white border-b-2 border-blue-500'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            Connections
          </button>
          <button
            onClick={() => setActiveTab('followers')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'followers'
                ? 'text-white border-b-2 border-blue-500'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            Followers
          </button>
          <button
            onClick={() => setActiveTab('following')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'following'
                ? 'text-white border-b-2 border-blue-500'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            Following
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {error && (
            <div className="text-red-400 text-sm mb-4">{error}</div>
          )}

          {loading && (
            <div className="text-center text-neutral-400 text-sm">Loading...</div>
          )}

          {!loading && activeTab === 'connections' && (
            <div className="space-y-4">
              {/* Pending Requests Section */}
              {(pendingRequests.received.length > 0 || pendingRequests.sent.length > 0) && (
                <div className="space-y-3">
                  {pendingRequests.received.length > 0 && (
                    <div>
                      <h3 className="text-neutral-400 text-xs font-semibold uppercase mb-2">Pending Received</h3>
                      <div className="space-y-2">
                        {pendingRequests.received.map((request) => (
                          <div
                            key={request.connectionId}
                            className="p-3 bg-neutral-800 rounded-lg flex items-center justify-between"
                          >
                            <button
                              onClick={() => onCreatorClick?.(request.userPnIdentifier)}
                              className="flex-1 text-left hover:opacity-80 transition-opacity"
                            >
                              <p className="text-white text-sm font-medium">
                                {getDisplayName(request.userPnIdentifier)}
                              </p>
                              <p className="text-neutral-400 text-xs">Wants to connect</p>
                            </button>
                            <div className="flex items-center space-x-2 ml-3">
                              <button
                                onClick={() => handleAccept(request.connectionId)}
                                disabled={processingConnections.has(request.connectionId)}
                                className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {processingConnections.has(request.connectionId) ? 'Processing...' : 'Accept'}
                              </button>
                              <button
                                onClick={() => handleReject(request.connectionId)}
                                disabled={processingConnections.has(request.connectionId)}
                                className="px-3 py-1.5 bg-neutral-700 hover:bg-neutral-600 text-white text-xs rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {processingConnections.has(request.connectionId) ? 'Processing...' : 'Reject'}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {pendingRequests.sent.length > 0 && (
                    <div>
                      <h3 className="text-neutral-400 text-xs font-semibold uppercase mb-2">Pending Sent</h3>
                      <div className="space-y-2">
                        {pendingRequests.sent.map((request) => (
                          <div
                            key={request.connectionId}
                            className="p-3 bg-neutral-800 rounded-lg flex items-center justify-between"
                          >
                            <button
                              onClick={() => onCreatorClick?.(request.userPnIdentifier)}
                              className="flex-1 text-left hover:opacity-80 transition-opacity"
                            >
                              <p className="text-white text-sm font-medium">
                                {getDisplayName(request.userPnIdentifier)}
                              </p>
                              <p className="text-neutral-400 text-xs">Pending request</p>
                            </button>
                            <button
                              onClick={() => handleCancel(request.connectionId)}
                              className="px-3 py-1.5 bg-neutral-700 hover:bg-neutral-600 text-white text-xs rounded transition-colors ml-3"
                            >
                              Revoke
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Connections Section */}
              <div>
                {(pendingRequests.received.length > 0 || pendingRequests.sent.length > 0) && (
                  <h3 className="text-neutral-400 text-xs font-semibold uppercase mb-2">Connections</h3>
                )}
                {connections.length === 0 ? (
                  <div className="text-center text-neutral-400 py-8">
                    <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No connections yet</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {connections.map((connection) => (
                      <div
                        key={connection.connectionId}
                        className="p-3 bg-neutral-800 rounded-lg flex items-center justify-between"
                      >
                        <button
                          onClick={() => onCreatorClick?.(connection.userPnIdentifier)}
                          className="flex-1 text-left hover:opacity-80 transition-opacity"
                        >
                          <p className="text-white text-sm font-medium">
                            {getDisplayName(connection.userPnIdentifier)}
                          </p>
                          <p className="text-neutral-400 text-xs">
                            {connection.status === 'accepted' ? 'Connected' : connection.status}
                          </p>
                        </button>
                        {connection.status === 'accepted' && (
                          <button
                            onClick={() => handleDisconnect(connection.connectionId)}
                            className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs rounded transition-colors ml-3"
                          >
                            Disconnect
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {!loading && activeTab === 'followers' && (
            <div className="space-y-2">
              {followers.length === 0 ? (
                <div className="text-center text-neutral-400 py-8">
                  <UserPlus className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No followers yet</p>
                  <p className="text-xs mt-2">Followers appear here when you have a paid feed</p>
                </div>
              ) : (
                followers.map((follower, index) => (
                  <div
                    key={index}
                    className="p-3 bg-neutral-800 rounded-lg flex items-center justify-between"
                  >
                    <div className="flex-1">
                      <p className="text-white text-sm">{follower.followerPnIdentifier?.substring(0, 16) || 'Unknown'}...</p>
                      <p className="text-neutral-400 text-xs">
                        Followed {new Date(follower.followedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {!loading && activeTab === 'following' && (
            <div className="space-y-2">
              {following.length === 0 ? (
                <div className="text-center text-neutral-400 py-8">
                  <UserPlus className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>Not following anyone yet</p>
                </div>
              ) : (
                following.map((item, index) => (
                  <div
                    key={index}
                    className="p-3 bg-neutral-800 rounded-lg flex items-center justify-between"
                  >
                    <div className="flex-1">
                      <p className="text-white text-sm">
                        {item.targetType === 'user' ? '👤' : '📰'} {item.targetPnIdentifier?.substring(0, 16) || 'Unknown'}...
                      </p>
                      <p className="text-neutral-400 text-xs">
                        {item.targetType === 'user' ? 'User' : 'Feed'} • {new Date(item.followedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <button
                      onClick={() => handleUnfollow(item.targetType, item.targetPnIdentifier)}
                      className="p-2 hover:bg-neutral-700 rounded transition-colors"
                      title="Unfollow"
                    >
                      <UserMinus className="h-4 w-4 text-neutral-400" />
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
