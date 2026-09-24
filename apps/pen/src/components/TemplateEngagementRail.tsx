/**
 * Live engagement rail for Pen templates (catalog feed/modal) and overlay preview.
 * Browse-shaped chrome (creator + like/comment/save/share + USES). Pen-local — no aggregator-browser import.
 */

import { useEffect, useState, type ReactNode } from 'react';
import {
  fetchEngagementStats,
  type PenEngagementStats
} from '../services/penEngagementClient';
import { getTemplateUseCount } from '../services/penClassPrefs';

function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

function creatorInitials(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'pN';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] || ''}${parts[1]![0] || ''}`.toUpperCase();
}

export function TemplateEngagementRail({
  templateId,
  fileId,
  authorLabel = 'par Noir',
  userPnIdentifier,
  unlocked,
  readOnly = true,
  placement = 'aside',
  buildSlot
}: {
  templateId: string;
  fileId?: string | null;
  authorLabel?: string;
  userPnIdentifier?: string | null;
  unlocked: boolean;
  readOnly?: boolean;
  /** aside = outside phone (feed/modal); overlay = inside feed-tile preview. */
  placement?: 'aside' | 'overlay';
  buildSlot?: ReactNode;
}) {
  void userPnIdentifier;
  void unlocked;
  void readOnly;

  const [stats, setStats] = useState<PenEngagementStats>({
    likes: 0,
    comments: 0,
    shares: 0,
    saves: 0
  });
  const uses = getTemplateUseCount(userPnIdentifier, templateId);

  useEffect(() => {
    if (!fileId) {
      setStats({ likes: 0, comments: 0, shares: 0, saves: 0 });
      return;
    }
    let cancelled = false;
    void fetchEngagementStats(fileId)
      .then((s) => {
        if (!cancelled) setStats(s);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [fileId]);

  const rootClass =
    placement === 'overlay'
      ? 'pen-template-engagement-rail pen-template-engagement-rail--overlay pen-template-engagement-rail--readonly'
      : 'pen-template-engagement-rail pen-template-engagement-rail--aside pen-template-engagement-rail--readonly';

  return (
    <div className={rootClass} aria-hidden>
      <div className="pen-template-engagement-creator" title={authorLabel}>
        <span className="pen-template-engagement-avatar">{creatorInitials(authorLabel)}</span>
      </div>
      <div className="pen-template-engagement-stat">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.5">
          <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
        </svg>
        <span className="pen-template-engagement-count">{formatCount(stats.likes)}</span>
      </div>
      <div className="pen-template-engagement-stat">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" stroke="none">
          <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
        </svg>
        <span className="pen-template-engagement-count">{formatCount(stats.comments)}</span>
      </div>
      <div className="pen-template-engagement-stat">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" stroke="none">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </svg>
        <span className="pen-template-engagement-count">{formatCount(stats.saves || 0)}</span>
      </div>
      <div className="pen-template-engagement-stat">
        <svg width="22" height="22" viewBox="0 0 224 200" fill="currentColor">
          <path d="M0,90.56c2.45-9.18,8.97-10.47,16.68-13.68C82.51,49.42,150.89,27.58,216.79.2c3.35-.69,7.2.32,7.08,4.26l-69.12,188.52c-4.53,6.91-14.09,7.87-21.04,4.25-20.64-14.84-41-30.05-61.77-44.72-.7-.5-1.69.21-1.23-1.72L207.08,15.94,52.13,137.23,4.07,102.91l-4.07-7.38v-4.98Z" />
        </svg>
        <span className="pen-template-engagement-count">{formatCount(stats.shares)}</span>
      </div>
      <div className="pen-template-engagement-uses">
        <span className="pen-template-engagement-count">{formatCount(uses)}</span>
        <span className="pen-template-engagement-uses-label">USES</span>
      </div>
      {buildSlot ? <div className="pen-template-engagement-build-slot">{buildSlot}</div> : null}
    </div>
  );
}
