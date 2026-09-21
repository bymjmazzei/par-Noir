/**
 * Overscroll / pull-past-top soft refresh on a scroll container (or window).
 * Fires once per gesture when scrollTop === 0 and pull exceeds threshold.
 */

import { useEffect, useRef } from 'react';

const DEFAULT_THRESHOLD_PX = 72;

/** Pure gate used by the overscroll gesture (unit-tested). */
export function shouldTriggerSoftRefresh(opts: {
  scrollTop: number;
  pullDeltaPx: number;
  thresholdPx?: number;
  inflight?: boolean;
}): boolean {
  if (opts.inflight) return false;
  if (opts.scrollTop > 0) return false;
  const threshold = opts.thresholdPx ?? DEFAULT_THRESHOLD_PX;
  return opts.pullDeltaPx >= threshold;
}

export interface UseOverscrollRefreshOptions {
  /** Scroll element; null = window / document scrollingElement. */
  scrollRef?: React.RefObject<HTMLElement | null> | null;
  onRefresh: () => void | Promise<void>;
  /** Disable while false (e.g. compose overlays). */
  enabled?: boolean;
  thresholdPx?: number;
  /** Called with pull distance while gesturing (0 when idle). */
  onPullDistance?: (px: number) => void;
}

function getScrollTop(el: HTMLElement | null): number {
  if (!el) {
    return window.scrollY || document.documentElement.scrollTop || 0;
  }
  return el.scrollTop;
}

export function useOverscrollRefresh({
  scrollRef,
  onRefresh,
  enabled = true,
  thresholdPx = DEFAULT_THRESHOLD_PX,
  onPullDistance,
}: UseOverscrollRefreshOptions): void {
  const onRefreshRef = useRef(onRefresh);
  const onPullRef = useRef(onPullDistance);
  const armedRef = useRef(false);
  const pullingRef = useRef(false);
  const startYRef = useRef(0);
  const triggeredRef = useRef(false);
  const inflightRef = useRef(false);

  onRefreshRef.current = onRefresh;
  onPullRef.current = onPullDistance;

  useEffect(() => {
    if (!enabled) return;

    const resolveEl = (): HTMLElement | null => {
      if (scrollRef?.current) return scrollRef.current;
      return (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
    };

    const resetPull = () => {
      pullingRef.current = false;
      armedRef.current = false;
      triggeredRef.current = false;
      startYRef.current = 0;
      onPullRef.current?.(0);
    };

    const fire = async () => {
      if (inflightRef.current || triggeredRef.current) return;
      triggeredRef.current = true;
      inflightRef.current = true;
      onPullRef.current?.(0);
      try {
        await onRefreshRef.current();
      } finally {
        inflightRef.current = false;
        resetPull();
      }
    };

    const onTouchStart = (e: TouchEvent) => {
      const el = resolveEl();
      if (getScrollTop(el) > 0) {
        armedRef.current = false;
        return;
      }
      armedRef.current = true;
      pullingRef.current = false;
      triggeredRef.current = false;
      startYRef.current = e.touches[0]?.clientY ?? 0;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!armedRef.current || inflightRef.current) return;
      const el = resolveEl();
      if (getScrollTop(el) > 0) {
        resetPull();
        return;
      }
      const y = e.touches[0]?.clientY ?? 0;
      const delta = y - startYRef.current;
      if (delta <= 0) {
        onPullRef.current?.(0);
        return;
      }
      pullingRef.current = true;
      onPullRef.current?.(Math.min(delta, thresholdPx * 1.5));
      if (delta >= thresholdPx && !triggeredRef.current) {
        if (
          shouldTriggerSoftRefresh({
            scrollTop: 0,
            pullDeltaPx: delta,
            thresholdPx,
            inflight: inflightRef.current,
          })
        ) {
          void fire();
        }
      }
    };

    const onTouchEnd = () => {
      if (!triggeredRef.current) resetPull();
    };

    const onWheel = (e: WheelEvent) => {
      if (inflightRef.current) return;
      const el = resolveEl();
      if (getScrollTop(el) > 0) return;
      // Trackpad / mouse: negative deltaY = scroll up (pull past top when already at top)
      if (e.deltaY >= 0) {
        onPullRef.current?.(0);
        return;
      }
      const pull = Math.min(Math.abs(e.deltaY), thresholdPx * 1.5);
      onPullRef.current?.(pull);
      if (Math.abs(e.deltaY) >= thresholdPx * 0.35) {
        // Accumulate small wheel ticks toward threshold via a simple burst window
        startYRef.current += Math.abs(e.deltaY);
        if (startYRef.current >= thresholdPx) {
          startYRef.current = 0;
          void fire();
        }
      }
    };

    // Reset wheel accumulation when user scrolls down or leaves top
    const onScroll = () => {
      const el = resolveEl();
      if (getScrollTop(el) > 0) {
        startYRef.current = 0;
        onPullRef.current?.(0);
      }
    };

    const target: EventTarget = scrollRef?.current ?? window;
    // Prefer listening on the scroll element when available; fall back to window.
    const listenTarget: EventTarget =
      scrollRef && !scrollRef.current ? window : target;

    // Re-bind when ref attaches: use capture on window for touch/wheel so nested scrollers work
    const touchTarget: EventTarget = scrollRef?.current ?? document;
    touchTarget.addEventListener('touchstart', onTouchStart as EventListener, { passive: true });
    touchTarget.addEventListener('touchmove', onTouchMove as EventListener, { passive: true });
    touchTarget.addEventListener('touchend', onTouchEnd as EventListener, { passive: true });
    listenTarget.addEventListener('wheel', onWheel as EventListener, { passive: true });
    listenTarget.addEventListener('scroll', onScroll as EventListener, { passive: true });

    return () => {
      touchTarget.removeEventListener('touchstart', onTouchStart as EventListener);
      touchTarget.removeEventListener('touchmove', onTouchMove as EventListener);
      touchTarget.removeEventListener('touchend', onTouchEnd as EventListener);
      listenTarget.removeEventListener('wheel', onWheel as EventListener);
      listenTarget.removeEventListener('scroll', onScroll as EventListener);
    };
  }, [enabled, scrollRef, thresholdPx]);
}
