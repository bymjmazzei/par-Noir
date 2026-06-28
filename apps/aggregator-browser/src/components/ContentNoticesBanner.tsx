/**
 * Content notices banner (DMCA / index removal) - in-app only.
 * Shows when user has pending review or taken-down notices. Taken down = removed from index only.
 */

import React, { useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { getContentNotices, type ContentNotice } from '../services/contentNoticesService';

interface ContentNoticesBannerProps {
  isUnlocked: boolean;
  enabled?: boolean;
}

export function ContentNoticesBanner({ isUnlocked, enabled = true }: ContentNoticesBannerProps) {
  const [notices, setNotices] = useState<ContentNotice[]>([]);

  useEffect(() => {
    if (!enabled || !isUnlocked) {
      setNotices([]);
      return;
    }
    let cancelled = false;
    getContentNotices()
      .then((list) => {
        if (!cancelled) setNotices(list);
      })
      .catch(() => {
        if (!cancelled) setNotices([]);
      });
    return () => { cancelled = true; };
  }, [enabled, isUnlocked]);

  if (notices.length === 0) return null;

  const pending = notices.filter((n) => n.type === 'pending_review');
  const takenDown = notices.filter((n) => n.type === 'taken_down');

  return (
    <div className="px-3 py-2 bg-amber-950/40 border-b border-amber-800/50 text-amber-200/90 text-sm flex items-center gap-2 flex-wrap">
      <AlertCircle className="h-4 w-4 flex-shrink-0" />
      {pending.length > 0 && (
        <span>
          {pending.length} item{pending.length !== 1 ? 's' : ''} pending copyright review.
        </span>
      )}
      {takenDown.length > 0 && (
        <span>
          {takenDown.length} item{takenDown.length !== 1 ? 's' : ''} removed from index (copyright). Your file remains in your Drive; we only stopped listing it.
        </span>
      )}
    </div>
  );
}
