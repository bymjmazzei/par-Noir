/**
 * Overscroll / pull-past-top soft refresh on a scroll container (or window).
 * Fires once per gesture when scrollTop === 0 and pull exceeds threshold.
 *
 * When `scrollRef` is provided, waits until `current` is set before binding —
 * otherwise listeners land on window and never see feed/discovery scrollers.
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
  /** Scroll element; null/omit = window / document scrollingElement. */
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
  const triggeredRef = useRef(false);
  const startYRef = useRef(0);
  const inflightRef = useRef(false);
  const wheelAccRef = useRef(0);

  onRefreshRef.current = onRefresh;
  onPullRef.current = onPullDistance;

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let detach: (() => void) | null = null;
    let raf = 0;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const resetPull = () => {
      armedRef.current = false;
      triggeredRef.current = false;
      startYRef.current = 0;
      wheelAccRef.current = 0;
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

    const bind = (scrollEl: HTMLElement | null) => {
      if (cancelled) return;
      detach?.();

      const resolveEl = (): HTMLElement | null => {
        if (scrollRef) return scrollRef.current;
        return (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
      };

      const onTouchStart = (e: TouchEvent) => {
        const el = resolveEl();
        if (getScrollTop(el) > 0) {
          armedRef.current = false;
          return;
        }
        armedRef.current = true;
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
        onPullRef.current?.(Math.min(delta, thresholdPx * 1.5));
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
      };

      const onTouchEnd = () => {
        if (!triggeredRef.current) resetPull();
      };

      const onWheel = (e: WheelEvent) => {
        if (inflightRef.current) return;
        const el = resolveEl();
        if (getScrollTop(el) > 0) {
          wheelAccRef.current = 0;
          return;
        }
        if (e.deltaY >= 0) {
          onPullRef.current?.(0);
          wheelAccRef.current = 0;
          return;
        }
        wheelAccRef.current += Math.abs(e.deltaY);
        onPullRef.current?.(Math.min(wheelAccRef.current, thresholdPx * 1.5));
        if (wheelAccRef.current >= thresholdPx) {
          wheelAccRef.current = 0;
          void fire();
        }
      };

      const onScroll = () => {
        if (getScrollTop(resolveEl()) > 0) {
          wheelAccRef.current = 0;
          onPullRef.current?.(0);
        }
      };

      // Bind on the scroll element when we have one; otherwise document/window.
      const touchTarget: EventTarget = scrollEl ?? document;
      const wheelTarget: EventTarget = scrollEl ?? window;

      touchTarget.addEventListener('touchstart', onTouchStart as EventListener, {
        passive: true,
        capture: true,
      });
      touchTarget.addEventListener('touchmove', onTouchMove as EventListener, {
        passive: true,
        capture: true,
      });
      touchTarget.addEventListener('touchend', onTouchEnd as EventListener, {
        passive: true,
        capture: true,
      });
      wheelTarget.addEventListener('wheel', onWheel as EventListener, {
        passive: true,
        capture: true,
      });
      wheelTarget.addEventListener('scroll', onScroll as EventListener, {
        passive: true,
        capture: true,
      });

      detach = () => {
        touchTarget.removeEventListener('touchstart', onTouchStart as EventListener, true);
        touchTarget.removeEventListener('touchmove', onTouchMove as EventListener, true);
        touchTarget.removeEventListener('touchend', onTouchEnd as EventListener, true);
        wheelTarget.removeEventListener('wheel', onWheel as EventListener, true);
        wheelTarget.removeEventListener('scroll', onScroll as EventListener, true);
      };
    };

    const tryAttach = () => {
      if (cancelled) return;
      // Window/document mode
      if (!scrollRef) {
        bind(null);
        return;
      }
      const el = scrollRef.current;
      if (el) {
        bind(el);
        return;
      }
      // Ref not mounted yet — poll briefly until it attaches
      raf = requestAnimationFrame(tryAttach);
    };

    tryAttach();
    // Safety: some layouts attach the ref after paint without another effect dep.
    if (scrollRef) {
      pollTimer = setInterval(() => {
        if (cancelled || !scrollRef.current) return;
        if (!detach) tryAttach();
        else {
          // Already bound; stop polling
          if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
          }
        }
      }, 200);
      // Stop polling after a few seconds
      setTimeout(() => {
        if (pollTimer) {
          clearInterval(pollTimer);
          pollTimer = null;
        }
      }, 5000);
    }

    return () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
      if (pollTimer) clearInterval(pollTimer);
      detach?.();
    };
  }, [enabled, scrollRef, thresholdPx]);
}
