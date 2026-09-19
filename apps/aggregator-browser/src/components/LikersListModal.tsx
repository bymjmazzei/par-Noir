/**
 * Likers list sheet — long-press like opens this over the current post.
 * Tap a row → that pN's browse Me page via onCreatorClick.
 */

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { User, X } from 'lucide-react';
import { API_ENDPOINT } from '../config/api';

export interface LikerEntry {
  pnIdentifier: string;
  displayName: string | null;
  likedAt: string;
}

interface LikersListModalProps {
  fileId: string;
  onClose: () => void;
  onCreatorClick?: (pnIdentifier: string) => void;
}

function formatRelativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (sec < 60) return 'just now';
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h`;
  if (sec < 86400 * 30) return `${Math.floor(sec / 86400)}d`;
  return new Date(iso).toLocaleDateString();
}

function shortPn(pn: string): string {
  const s = pn.startsWith('pn-') ? pn.slice(3) : pn;
  return s.length > 12 ? `${s.slice(0, 8)}…` : s;
}

export function LikersListModal({ fileId, onClose, onCreatorClick }: LikersListModalProps) {
  const [likes, setLikes] = useState<LikerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`${API_ENDPOINT}/api/engagement/${encodeURIComponent(fileId)}/likes`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`likes_${res.status}`);
        return res.json() as Promise<{ likes?: LikerEntry[] }>;
      })
      .then((body) => {
        if (cancelled) return;
        setLikes(Array.isArray(body.likes) ? body.likes : []);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load likes');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fileId]);

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0]?.clientY ?? null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStartY.current;
    touchStartY.current = null;
    if (start == null) return;
    const end = e.changedTouches[0]?.clientY;
    if (end == null) return;
    if (end - start > 80) onClose();
  };

  return createPortal(
    <>
      <div
        ref={backdropRef}
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
        style={{
          zIndex: 999999,
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
        }}
      />
      <div
        ref={sheetRef}
        className="bg-neutral-900 rounded-t-2xl flex flex-col"
        style={{
          zIndex: 999999,
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          maxHeight: '70vh',
          pointerEvents: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-12 h-1 bg-neutral-700 rounded-full" />
        </div>
        <div className="flex items-center justify-between px-4 pb-3 border-b border-neutral-700">
          <h2 className="text-lg font-semibold text-white">Likes</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-neutral-400 hover:text-white"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {loading ? (
            <p className="text-center text-neutral-400 py-10 text-sm">Loading…</p>
          ) : error ? (
            <p className="text-center text-neutral-400 py-10 text-sm">{error}</p>
          ) : likes.length === 0 ? (
            <p className="text-center text-neutral-400 py-10 text-sm">No likes yet</p>
          ) : (
            <ul className="divide-y divide-neutral-800">
              {likes.map((liker) => {
                const label = liker.displayName?.trim() || shortPn(liker.pnIdentifier);
                const initial = label.charAt(0).toUpperCase();
                return (
                  <li key={liker.pnIdentifier}>
                    <button
                      type="button"
                      className="w-full flex items-center gap-3 px-3 py-3 text-left hover:bg-neutral-800/80 transition-colors"
                      onClick={() => {
                        onCreatorClick?.(liker.pnIdentifier);
                        onClose();
                      }}
                    >
                      <div className="h-10 w-10 rounded-full bg-neutral-700 flex items-center justify-center text-white text-sm font-medium flex-shrink-0">
                        {initial || <User className="h-5 w-5" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-white text-sm font-medium truncate">{label}</div>
                        {liker.likedAt ? (
                          <div className="text-neutral-500 text-xs">{formatRelativeTime(liker.likedAt)}</div>
                        ) : null}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </>,
    document.body
  );
}
