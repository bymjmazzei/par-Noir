import { useEffect, useLayoutEffect, useState, type RefObject } from 'react';

/** useLayoutEffect warns during static markup. The browser still measures before paint. */
const useFrameEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** Profile, like, comment, save, share, views. */
export const ENGAGEMENT_RAIL_SLOTS = 6;
/** Gap stays a fraction of the icon so both grow and shrink together. */
export const ENGAGEMENT_RAIL_GAP_RATIO = 0.28;
/** The stack fills this fraction of the lower half. 0.9 is 10% under a full half-frame. */
export const ENGAGEMENT_RAIL_SCALE = 0.9;
/** Fallback before the frame is measured. */
export const ENGAGEMENT_RAIL_ICON_PX = 40;
export const ENGAGEMENT_RAIL_GAP_PX = ENGAGEMENT_RAIL_ICON_PX * ENGAGEMENT_RAIL_GAP_RATIO;

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

function stackFromIcon(iconPx: number): { gapPx: number; stackPx: number } {
  const gapPx = iconPx * ENGAGEMENT_RAIL_GAP_RATIO;
  const stackPx =
    ENGAGEMENT_RAIL_SLOTS * iconPx + (ENGAGEMENT_RAIL_SLOTS - 1) * gapPx;
  return { gapPx, stackPx };
}

/**
 * The icon stack fills most of the lower half of the feed frame.
 * Icon and gap scale together with the frame, so a resize does not only open the gaps.
 * `occupiedBottomPx` reserves a band already taken by caption or phone chrome.
 */
export function engagementRailLayout(
  frameHeightPx: number,
  occupiedBottomPx?: number
): EngagementRailLayout {
  const height = Number.isFinite(frameHeightPx) ? Math.max(0, frameHeightPx) : 0;
  if (height <= 0) {
    const { gapPx, stackPx } = stackFromIcon(ENGAGEMENT_RAIL_ICON_PX);
    return {
      iconPx: ENGAGEMENT_RAIL_ICON_PX,
      gapPx,
      bottomPx: occupiedBottomPx == null ? 40 : Math.max(0, occupiedBottomPx),
      stackPx
    };
  }

  const midpoint = height / 2;
  const preferredBottom = Math.min(40, height * 0.06);
  const requested = occupiedBottomPx == null ? preferredBottom : Math.max(0, occupiedBottomPx);
  const bottomPx = Math.min(requested, midpoint);
  const budget = Math.max(0, midpoint - bottomPx);
  const slots = ENGAGEMENT_RAIL_SLOTS + (ENGAGEMENT_RAIL_SLOTS - 1) * ENGAGEMENT_RAIL_GAP_RATIO;
  const iconPx = slots > 0 ? (budget / slots) * ENGAGEMENT_RAIL_SCALE : 0;
  const { gapPx, stackPx } = stackFromIcon(iconPx);
  return { iconPx, gapPx, bottomPx, stackPx };
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
