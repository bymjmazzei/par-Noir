import { useEffect, useLayoutEffect, useState, type RefObject } from 'react';

/** useLayoutEffect warns during static markup. The browser still measures before paint. */
const useFrameEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** Profile, like, comment, save, share, views. */
export const ENGAGEMENT_RAIL_SLOTS = 6;
export const ENGAGEMENT_RAIL_ICON_PX = 22;
export const ENGAGEMENT_RAIL_GAP_PX = 6;

/**
 * Phone chrome keeps the rail above the bottom nav and the caption band.
 * Fraction of the phone screen height.
 */
export const PHONE_OVERLAY_BOTTOM_FRACTION = 0.2;

export type EngagementRailLayout = {
  /** Profile circle and action icons share this size. */
  iconPx: number;
  gapPx: number;
  /** Clearance from the bottom of the feed frame (above the caption, or a reserved band). */
  bottomPx: number;
  /** Icon stack only. bottomPx + stackPx stays at or under the frame midpoint. */
  stackPx: number;
};

function naturalStackPx(): number {
  return (
    ENGAGEMENT_RAIL_SLOTS * ENGAGEMENT_RAIL_ICON_PX +
    (ENGAGEMENT_RAIL_SLOTS - 1) * ENGAGEMENT_RAIL_GAP_PX
  );
}

/**
 * Compact rail that never crosses the midpoint of the feed frame.
 * Tall frames keep the preferred icon and gap. Short frames scale both down together.
 * `occupiedBottomPx` reserves a band already taken by caption or phone chrome.
 */
export function engagementRailLayout(
  frameHeightPx: number,
  occupiedBottomPx?: number
): EngagementRailLayout {
  const height = Number.isFinite(frameHeightPx) ? Math.max(0, frameHeightPx) : 0;
  const natural = naturalStackPx();
  if (height <= 0) {
    return {
      iconPx: ENGAGEMENT_RAIL_ICON_PX,
      gapPx: ENGAGEMENT_RAIL_GAP_PX,
      bottomPx: occupiedBottomPx == null ? 40 : Math.max(0, occupiedBottomPx),
      stackPx: natural
    };
  }

  const midpoint = height / 2;
  const preferredBottom = Math.min(40, height * 0.06);
  const requested = occupiedBottomPx == null ? preferredBottom : Math.max(0, occupiedBottomPx);
  const bottomPx = Math.min(requested, midpoint);
  const budget = Math.max(0, midpoint - bottomPx);
  const scale = natural > 0 && budget < natural ? budget / natural : 1;
  return {
    iconPx: ENGAGEMENT_RAIL_ICON_PX * scale,
    gapPx: ENGAGEMENT_RAIL_GAP_PX * scale,
    bottomPx,
    stackPx: natural * scale
  };
}

/** A collapsed card footer is not a feed frame. Short phones still count. */
const MIN_FRAME_PX = 80;

function feedFrameOf(rail: HTMLElement): HTMLElement | null {
  const parent = rail.offsetParent instanceof HTMLElement ? rail.offsetParent : rail.parentElement;
  if (!parent || parent.clientHeight < MIN_FRAME_PX) return null;
  return parent;
}

/** Height of the rail's positioned frame (feed slide or phone screen). */
export function useFeedFrameHeight(railRef: RefObject<HTMLElement | null>): number {
  const [height, setHeight] = useState(0);
  useFrameEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const parent = rail.offsetParent instanceof HTMLElement ? rail.offsetParent : rail.parentElement;
    if (!parent) return;
    const measure = () => {
      const next = feedFrameOf(rail);
      setHeight(next ? next.clientHeight : 0);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(parent);
    return () => observer.disconnect();
  }, [railRef]);
  return height;
}
