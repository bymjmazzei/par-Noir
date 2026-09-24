/**
 * Live engagement rail for public pen-templates (IndexedFile fileId only).
 */

import { useEffect, useState } from 'react';
import {
  fetchEngagementStats,
  fetchViewerLiked,
  recordSharePublic,
  toggleLikePublic,
  type PenEngagementStats
} from '../services/penEngagementClient';

function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

export function TemplateEngagementRail({
  fileId,
  userPnIdentifier,
  unlocked
}: {
  fileId: string;
  userPnIdentifier?: string | null;
  unlocked: boolean;
}) {
  const [stats, setStats] = useState<PenEngagementStats>({ likes: 0, comments: 0, shares: 0 });
  const [liked, setLiked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchEngagementStats(fileId)
      .then((s) => {
        if (!cancelled) setStats(s);
      })
      .catch(() => undefined);
    if (unlocked && userPnIdentifier) {
      void fetchViewerLiked(fileId, userPnIdentifier)
        .then((v) => {
          if (!cancelled) setLiked(v);
        })
        .catch(() => undefined);
    } else {
      setLiked(false);
    }
    return () => {
      cancelled = true;
    };
  }, [fileId, unlocked, userPnIdentifier]);

  async function onLike(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    if (!unlocked || !userPnIdentifier) {
      setHint('Unlock to like');
      window.setTimeout(() => setHint(null), 1600);
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      const { liked: next } = await toggleLikePublic(fileId, userPnIdentifier);
      setLiked(next);
      setStats((s) => ({
        ...s,
        likes: Math.max(0, s.likes + (next ? 1 : -1))
      }));
    } catch {
      setHint('Like failed');
      window.setTimeout(() => setHint(null), 1600);
    } finally {
      setBusy(false);
    }
  }

  async function onShare(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    if (!unlocked || !userPnIdentifier) {
      setHint('Unlock to share');
      window.setTimeout(() => setHint(null), 1600);
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      await recordSharePublic(fileId, userPnIdentifier);
      setStats((s) => ({ ...s, shares: s.shares + 1 }));
      setHint('Shared');
      window.setTimeout(() => setHint(null), 1200);
    } catch {
      setHint('Share failed');
      window.setTimeout(() => setHint(null), 1600);
    } finally {
      setBusy(false);
    }
  }

  function onComment(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    setHint(unlocked ? 'Comments open in browse TEMPLATES' : 'Unlock to comment');
    window.setTimeout(() => setHint(null), 2000);
  }

  return (
    <div className="pen-template-engagement-rail" onClick={(e) => e.stopPropagation()}>
      {hint ? <p className="pen-template-engagement-hint">{hint}</p> : null}
      <button
        type="button"
        className={`pen-template-engagement-btn${liked ? ' is-liked' : ''}`}
        aria-label="Like"
        aria-pressed={liked}
        disabled={busy}
        onClick={(e) => void onLike(e)}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
        </svg>
        <span className="pen-template-engagement-count">{formatCount(stats.likes)}</span>
      </button>
      <button
        type="button"
        className="pen-template-engagement-btn"
        aria-label="Comment"
        onClick={onComment}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
        </svg>
        <span className="pen-template-engagement-count">{formatCount(stats.comments)}</span>
      </button>
      <button
        type="button"
        className="pen-template-engagement-btn"
        aria-label="Share"
        disabled={busy}
        onClick={(e) => void onShare(e)}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
        </svg>
        <span className="pen-template-engagement-count">{formatCount(stats.shares)}</span>
      </button>
    </div>
  );
}
