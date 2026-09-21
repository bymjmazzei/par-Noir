/**
 * Visual pull indicator + overscroll binding for the active soft-refresh surface.
 */

import React, { useCallback, useState } from 'react';
import { useSoftRefresh } from '../contexts/SoftRefreshContext';
import { useOverscrollRefresh } from '../hooks/useOverscrollRefresh';

export interface OverscrollRefreshHostProps {
  /** Scroll container; omit / null for window scroll (e.g. home grid). */
  scrollRef?: React.RefObject<HTMLElement | null> | null;
  enabled?: boolean;
  /** Optional override; defaults to SoftRefreshContext.runSoftRefresh. */
  onRefresh?: () => void | Promise<void>;
  children?: React.ReactNode;
}

export function OverscrollRefreshHost({
  scrollRef = null,
  enabled = true,
  onRefresh,
  children,
}: OverscrollRefreshHostProps) {
  const { runSoftRefresh, isRefreshing } = useSoftRefresh();
  const [pullPx, setPullPx] = useState(0);
  const [busy, setBusy] = useState(false);

  const handleRefresh = useCallback(async () => {
    setBusy(true);
    try {
      if (onRefresh) await onRefresh();
      else await runSoftRefresh();
    } finally {
      setBusy(false);
      setPullPx(0);
    }
  }, [onRefresh, runSoftRefresh]);

  useOverscrollRefresh({
    scrollRef,
    enabled: enabled && !busy && !isRefreshing(),
    onRefresh: handleRefresh,
    onPullDistance: setPullPx,
  });

  const showIndicator = pullPx > 8 || busy;
  const progress = Math.min(1, pullPx / 72);

  return (
    <>
      {showIndicator ? (
        <div
          className="pointer-events-none fixed left-0 right-0 z-[60] flex justify-center"
          style={{ top: Math.min(48, 8 + pullPx * 0.35) }}
          aria-live="polite"
        >
          <div
            className="rounded-full bg-neutral-800/90 border border-neutral-600 px-3 py-1.5 text-xs text-neutral-200 shadow-lg"
            style={{ opacity: busy ? 1 : 0.45 + progress * 0.55 }}
          >
            {busy ? 'Refreshing…' : progress >= 1 ? 'Release to refresh' : 'Pull to refresh'}
          </div>
        </div>
      ) : null}
      {children}
    </>
  );
}
