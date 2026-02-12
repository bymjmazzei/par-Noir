/**
 * Content notices (DMCA / index removal) - in-app only.
 * Shows pending review and taken-down notices. Taken down = removed from index only; file stays in user's Drive.
 */

import React, { useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { getContentNotices, type ContentNotice } from '../services/contentNoticesService';

interface ContentNoticesSectionProps {
  accessToken: string | null | undefined;
}

export function ContentNoticesSection({ accessToken }: ContentNoticesSectionProps) {
  const [notices, setNotices] = useState<ContentNotice[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!accessToken) {
      setNotices([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getContentNotices(accessToken)
      .then((list) => {
        if (!cancelled) setNotices(list);
      })
      .catch(() => {
        if (!cancelled) setNotices([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [accessToken]);

  if (loading || notices.length === 0) return null;

  const pending = notices.filter((n) => n.type === 'pending_review');
  const takenDown = notices.filter((n) => n.type === 'taken_down');

  return (
    <section className="rounded-lg border border-white/10 bg-neutral-900/60 p-4 mb-6">
      <h3 className="font-semibold text-sm text-neutral-300 mb-2 flex items-center gap-2">
        <AlertCircle className="h-4 w-4" />
        Content status
      </h3>
      {pending.length > 0 && (
        <div className="mb-2 text-sm text-amber-200/90">
          <strong>{pending.length} item{pending.length !== 1 ? 's' : ''} pending review.</strong>
          <span className="text-neutral-400 ml-1">Content was flagged for copyright review; human reviewers will decide.</span>
        </div>
      )}
      {takenDown.length > 0 && (
        <div className="text-sm text-neutral-300">
          <strong>{takenDown.length} item{takenDown.length !== 1 ? 's' : ''} removed from index (copyright).</strong>
          <p className="text-neutral-400 mt-1">
            These items have been removed from the par Noir index and third-party indexes only. Your file is still in your Google Drive; we do not host or delete your files.
          </p>
        </div>
      )}
    </section>
  );
}
