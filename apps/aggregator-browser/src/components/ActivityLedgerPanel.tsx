/**
 * Activity Ledger Panel Component
 * Side panel that displays user's activity ledger
 */

import React, { useState, useEffect, useRef } from 'react';
import { X, Heart, MessageCircle, Share2, UserPlus, UserCheck, Bell, Eye } from 'lucide-react';
import { ActivityLedgerService, ActivityEntry } from '../services/activityLedgerService';
import { formatTimestamp } from '../utils/formatTimestamp';

interface ActivityLedgerPanelProps {
  isOpen: boolean;
  onClose: () => void;
  userPnIdentifier: string;
}

const ACTIVITY_ICONS: Record<string, React.ReactNode> = {
  like: <Heart className="h-4 w-4" />,
  comment: <MessageCircle className="h-4 w-4" />,
  share: <Share2 className="h-4 w-4" />,
  follow: <UserPlus className="h-4 w-4" />,
  connection_request: <UserPlus className="h-4 w-4" />,
  connection_accepted: <UserCheck className="h-4 w-4" />,
  feed_subscription: <Bell className="h-4 w-4" />,
  view: <Eye className="h-4 w-4" />,
  repost: <Share2 className="h-4 w-4" />
};

function getActivityIcon(activityType: string): React.ReactNode {
  return ACTIVITY_ICONS[activityType] || <Bell className="h-4 w-4" />;
}

function getActivityDescription(activity: ActivityEntry): string {
  const type = activity.activity_type;
  const actor = activity.actor_did ? 'Someone' : 'You';
  
  switch (type) {
    case 'like':
      return `${actor} liked ${activity.target_type === 'file' ? 'a post' : 'something'}`;
    case 'comment':
      return `${actor} commented on ${activity.target_type === 'file' ? 'a post' : 'something'}`;
    case 'share':
    case 'repost':
      return `${actor} shared ${activity.target_type === 'file' ? 'a post' : 'something'}`;
    case 'follow':
      return `${actor} followed ${activity.target_type === 'user' ? 'a user' : 'a feed'}`;
    case 'connection_request':
      return `${actor} sent a connection request`;
    case 'connection_accepted':
      return `${actor} accepted a connection request`;
    case 'feed_subscription':
      return `${actor} subscribed to a feed`;
    case 'view':
      return `${actor} viewed ${activity.target_type === 'file' ? 'a post' : 'something'}`;
    default:
      return `${actor} performed ${type}`;
  }
}

export function ActivityLedgerPanel({ isOpen, onClose, userPnIdentifier }: ActivityLedgerPanelProps) {
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);

  const LIMIT = 50;

  const loadActivities = async (reset = false) => {
    if (loadingRef.current) return;
    
    loadingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const currentOffset = reset ? 0 : offset;
      const response = await ActivityLedgerService.getActivities(userPnIdentifier, {
        limit: LIMIT,
        offset: currentOffset
      });

      if (reset) {
        setActivities(response.activities);
      } else {
        setActivities(prev => [...prev, ...response.activities]);
      }

      setOffset(currentOffset + response.activities.length);
      setHasMore(response.activities.length === LIMIT && response.total > currentOffset + response.activities.length);
    } catch (err: any) {
      setError(err.message || 'Failed to load activities');
      console.error('Failed to load activities:', err);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  };

  useEffect(() => {
    if (isOpen && userPnIdentifier) {
      loadActivities(true);
    }
  }, [isOpen, userPnIdentifier]);

  const handleScroll = () => {
    if (!scrollContainerRef.current || loading || !hasMore) return;

    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    if (scrollTop + clientHeight >= scrollHeight - 100) {
      loadActivities(false);
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
      <div
        className={`fixed left-0 top-0 bottom-0 w-full sm:w-96 bg-neutral-900 z-50 shadow-2xl transform transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-neutral-700">
          <h2 className="text-white text-lg font-semibold">Activity Ledger</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-neutral-800 rounded transition-colors"
            aria-label="Close activity ledger"
          >
            <X className="h-5 w-5 text-white" />
          </button>
        </div>

        {/* Content */}
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="h-[calc(100vh-64px)] overflow-y-auto"
        >
          {error && (
            <div className="p-4 text-red-400 text-sm">
              {error}
            </div>
          )}

          {!loading && activities.length === 0 && !error && (
            <div className="p-8 text-center text-neutral-400">
              <p>No activities yet</p>
            </div>
          )}

          <div className="divide-y divide-neutral-800">
            {activities.map((activity) => (
              <div
                key={activity.activity_id}
                className="p-4 hover:bg-neutral-800 transition-colors"
              >
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0 mt-1 text-neutral-400">
                    {getActivityIcon(activity.activity_type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm">
                      {getActivityDescription(activity)}
                    </p>
                    <p className="text-neutral-400 text-xs mt-1">
                      {formatTimestamp(activity.created_at)}
                    </p>
                    {activity.target_id && (
                      <p className="text-neutral-500 text-xs mt-1">
                        ID: {activity.target_id}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {loading && (
            <div className="p-4 text-center text-neutral-400 text-sm">
              Loading...
            </div>
          )}

          {!hasMore && activities.length > 0 && (
            <div className="p-4 text-center text-neutral-400 text-sm">
              No more activities
            </div>
          )}
        </div>
      </div>
    </>
  );
}
