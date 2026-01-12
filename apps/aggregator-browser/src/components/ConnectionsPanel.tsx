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
  followerDid: string;
  followedAt: string;
  feedId?: string;
}

interface Following {
  targetType: 'user' | 'feed';
  targetId: string;
  followedAt: string;
}

interface ConnectionsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  userDid: string;
  onCreatorClick?: (creatorId: string) => void;
}

const API_ENDPOINT = process.env.REACT_APP_API_ENDPOINT || 'https://api.parnoir.com';

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

export function ConnectionsPanel({ isOpen, onClose, userDid, onCreatorClick }: ConnectionsPanelProps) {
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

  useEffect(() => {
    if (isOpen && userDid) {
      loadData();
    }
  }, [isOpen, userDid, activeTab]);

  const loadData = async () => {
    setLoading(true);
    setError(null);

    try {
      if (activeTab === 'connections') {
        // Load connections and pending requests
        const [connectionsData, pendingData] = await Promise.all([
          getConnections(userDid),
          getPendingRequests(userDid)
        ]);
        setConnections(connectionsData);
        setPendingRequests(pendingData);
        
        // Load display names for all connections and pending requests
        const allUserDids = new Set<string>();
        connectionsData.forEach(c => allUserDids.add(c.userDid));
        pendingData.sent.forEach(c => allUserDids.add(c.userDid));
        pendingData.received.forEach(c => allUserDids.add(c.userDid));
        
        loadDisplayNames(Array.from(allUserDids));
      } else if (activeTab === 'followers') {
        const response = await fetch(`${API_ENDPOINT}/api/connections/followers?userDid=${userDid}`, {
          headers: getAuthHeaders()
        });
        if (response.ok) {
          const data = await response.json();
          setFollowers(data.followers || []);
        }
      } else if (activeTab === 'following') {
        const response = await fetch(`${API_ENDPOINT}/api/connections/following?userDid=${userDid}`, {
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

  const loadDisplayNames = async (userDids: string[]) => {
    const toLoad = userDids.filter(did => !displayNames.has(did) && !loadingNames.has(did));
    if (toLoad.length === 0) return;

    setLoadingNames(prev => new Set([...prev, ...toLoad]));

    try {
      const namePromises = toLoad.map(async (did) => {
        try {
          const profile = await getUserProfile(did);
          return { did, name: profile.displayName || did };
        } catch (error) {
          return { did, name: did };
        }
      });

      const results = await Promise.all(namePromises);
      setDisplayNames(prev => {
        const next = new Map(prev);
        results.forEach(({ did, name }) => next.set(did, name));
        return next;
      });
    } catch (error) {
      console.error('Failed to load display names:', error);
    } finally {
      setLoadingNames(prev => {
        const next = new Set(prev);
        toLoad.forEach(did => next.delete(did));
        return next;
      });
    }
  };

  const getDisplayName = (userDid: string): string => {
    return displayNames.get(userDid) || userDid;
  };

  const handleConnect = async (targetUserDid: string) => {
    try {
      await sendConnectionRequest(userDid, targetUserDid);
      await loadData();
    } catch (error) {
      console.error('Failed to connect:', error);
      setError('Failed to send connection request');
    }
  };

  const handleDisconnect = async (connectionId: string) => {
    try {
      await removeConnection(connectionId, userDid);
      await loadData();
    } catch (error) {
      console.error('Failed to disconnect:', error);
      setError('Failed to remove connection');
    }
  };

  const handleAccept = async (connectionId: string) => {
    try {
      await acceptConnectionRequest(connectionId, userDid);
      await loadData();
    } catch (error) {
      console.error('Failed to accept:', error);
      setError('Failed to accept connection request');
    }
  };

  const handleReject = async (connectionId: string) => {
    try {
      await rejectConnectionRequest(connectionId, userDid);
      await loadData();
    } catch (error) {
      console.error('Failed to reject:', error);
      setError('Failed to reject connection request');
    }
  };

  const handleCancel = async (connectionId: string) => {
    try {
      await rejectConnectionRequest(connectionId, userDid);
      await loadData();
    } catch (error) {
      console.error('Failed to cancel:', error);
      setError('Failed to cancel connection request');
    }
  };

  const handleFollow = async (targetType: 'user' | 'feed', targetId: string) => {
    try {
      const response = await fetch(`${API_ENDPOINT}/api/connections/follow`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          userDid,
          targetType,
          targetId
        })
      });

      if (response.ok) {
        loadData(); // Reload data
      }
    } catch (error) {
      console.error('Failed to follow:', error);
    }
  };

  const handleUnfollow = async (targetType: 'user' | 'feed', targetId: string) => {
    try {
      const response = await fetch(`${API_ENDPOINT}/api/connections/unfollow`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          userDid,
          targetType,
          targetId
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
                              onClick={() => onCreatorClick?.(request.userDid)}
                              className="flex-1 text-left hover:opacity-80 transition-opacity"
                            >
                              <p className="text-white text-sm font-medium">
                                {getDisplayName(request.userDid)}
                              </p>
                              <p className="text-neutral-400 text-xs">Wants to connect</p>
                            </button>
                            <div className="flex items-center space-x-2 ml-3">
                              <button
                                onClick={() => handleAccept(request.connectionId)}
                                className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs rounded transition-colors"
                              >
                                Accept
                              </button>
                              <button
                                onClick={() => handleReject(request.connectionId)}
                                className="px-3 py-1.5 bg-neutral-700 hover:bg-neutral-600 text-white text-xs rounded transition-colors"
                              >
                                Reject
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
                              onClick={() => onCreatorClick?.(request.userDid)}
                              className="flex-1 text-left hover:opacity-80 transition-opacity"
                            >
                              <p className="text-white text-sm font-medium">
                                {getDisplayName(request.userDid)}
                              </p>
                              <p className="text-neutral-400 text-xs">Request sent</p>
                            </button>
                            <button
                              onClick={() => handleCancel(request.connectionId)}
                              className="px-3 py-1.5 bg-neutral-700 hover:bg-neutral-600 text-white text-xs rounded transition-colors ml-3"
                            >
                              Cancel
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
                          onClick={() => onCreatorClick?.(connection.userDid)}
                          className="flex-1 text-left hover:opacity-80 transition-opacity"
                        >
                          <p className="text-white text-sm font-medium">
                            {getDisplayName(connection.userDid)}
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
                      <p className="text-white text-sm">{follower.followerDid.substring(0, 16)}...</p>
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
                        {item.targetType === 'user' ? '👤' : '📰'} {item.targetId.substring(0, 16)}...
                      </p>
                      <p className="text-neutral-400 text-xs">
                        {item.targetType === 'user' ? 'User' : 'Feed'} • {new Date(item.followedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <button
                      onClick={() => handleUnfollow(item.targetType, item.targetId)}
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
