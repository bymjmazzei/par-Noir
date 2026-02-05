/**
 * Ray View — Tinder-style swipe interface
 * Swipe left = deny, right = approve
 */

import React, { useState, useEffect, useCallback } from 'react';
import { ThumbsDown, ThumbsUp, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { fetchQueue, submitVote, fetchPreviewBlobUrl, PrismQueueItem } from '../services/prismApi';

export function RayView() {
  const { session } = useAuth();
  const [items, setItems] = useState<PrismQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [swiping, setSwiping] = useState<'left' | 'right' | null>(null);

  const loadQueue = useCallback(async () => {
    if (!session?.accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchQueue(session.accessToken);
      setItems(data);
      setIndex(0);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [session?.accessToken]);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  // Load preview for current item
  useEffect(() => {
    if (!session?.accessToken || items.length === 0 || index >= items.length) {
      setPreviewUrl(null);
      return;
    }
    const item = items[index];
    let url: string | null = null;
    fetchPreviewBlobUrl(
      item.owner_pn_identifier,
      item.thumbnailFileId || item.file_id,
      session.accessToken,
      true
    )
      .then((u) => {
        setPreviewUrl(u);
        url = u;
      })
      .catch(() => setPreviewUrl(null));
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [session?.accessToken, items, index]);

  const handleVote = async (vote: 'approve' | 'deny') => {
    if (!session?.accessToken || items.length === 0 || index >= items.length) return;
    const item = items[index];
    setSwiping(vote === 'approve' ? 'right' : 'left');
    try {
      await submitVote(session.accessToken, item.id, vote);
      setIndex((i) => i + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSwiping(null);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <Loader2 className="h-10 w-10 animate-spin text-neutral-500 mb-4" />
        <p className="text-neutral-500">Loading queue...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-400 mb-4">{error}</p>
        <button
          type="button"
          onClick={loadQueue}
          className="px-4 py-2 bg-neutral-800 rounded-lg hover:bg-neutral-700"
        >
          Retry
        </button>
      </div>
    );
  }

  if (items.length === 0 || index >= items.length) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-neutral-400 text-lg mb-2">Queue empty</p>
        <p className="text-neutral-500 text-sm">No items to review right now. Check back later.</p>
        <button
          type="button"
          onClick={loadQueue}
          className="mt-4 px-4 py-2 text-neutral-400 hover:text-white"
        >
          Refresh
        </button>
      </div>
    );
  }

  const item = items[index];

  return (
    <div className="flex flex-col items-center max-w-md mx-auto">
      {/* Card */}
      <div
        className={`
          relative w-full aspect-[3/4] max-h-[70vh] rounded-2xl overflow-hidden
          bg-neutral-900 border border-neutral-800
          transition-transform duration-200
          ${swiping === 'left' ? '-translate-x-32 rotate-[-12deg] opacity-70' : ''}
          ${swiping === 'right' ? 'translate-x-32 rotate-[12deg] opacity-70' : ''}
        `}
      >
        {previewUrl ? (
          <img
            src={previewUrl}
            alt={item.name || item.file_id}
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-neutral-500">
            <Loader2 className="h-12 w-12 animate-spin" />
          </div>
        )}
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
          <p className="text-white font-medium truncate">{item.name || item.file_id}</p>
          <p className="text-neutral-400 text-sm">
            Flagged by {item.flag_source === 'bot' ? 'DMCA bot' : 'user report'}
          </p>
        </div>
      </div>

      {/* Swipe buttons */}
      <div className="flex gap-12 mt-8">
        <button
          type="button"
          onClick={() => handleVote('deny')}
          disabled={!!swiping}
          className="flex flex-col items-center gap-2 p-4 rounded-full bg-red-950/50 border border-red-900/50 hover:bg-red-900/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          aria-label="Deny"
        >
          <ThumbsDown className="h-10 w-10 text-red-400" />
          <span className="text-sm text-red-400">Deny</span>
        </button>
        <button
          type="button"
          onClick={() => handleVote('approve')}
          disabled={!!swiping}
          className="flex flex-col items-center gap-2 p-4 rounded-full bg-emerald-950/50 border border-emerald-900/50 hover:bg-emerald-900/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          aria-label="Approve"
        >
          <ThumbsUp className="h-10 w-10 text-emerald-400" />
          <span className="text-sm text-emerald-400">Approve</span>
        </button>
      </div>

      <p className="mt-4 text-neutral-500 text-sm">
        {items.length - index} item{items.length - index !== 1 ? 's' : ''} remaining
      </p>
    </div>
  );
}
