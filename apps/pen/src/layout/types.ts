/** Shared layout item — rects are CSS px in the content box. */

export interface LayoutItem {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  zIndex: number;
  positionLocked?: boolean;
  /** CSS px. Set by the top-left corner dot on a button. */
  cornerRadius?: number;
  /** Button layers show the corner-radius dot. */
  roundable?: boolean;
  /** Frame rotation on the page, degrees. */
  rotate?: number;
}

export type LayoutBounds = { width: number; height: number };

const MIN = 24;

export function clampLayoutItem(
  item: LayoutItem,
  bounds?: LayoutBounds,
  freePlacement = false
): LayoutItem {
  const w = Math.max(MIN, item.w);
  const h = Math.max(MIN, item.h);
  if (freePlacement) return { ...item, w, h };
  const contentW = Math.max(MIN, bounds?.width ?? 736);
  const contentH = Math.max(MIN, bounds?.height ?? 976);
  const width = Math.min(contentW, w);
  const height = Math.min(contentH, h);
  const x = Math.min(Math.max(0, contentW - width), Math.max(0, item.x));
  const y = Math.min(Math.max(0, contentH - height), Math.max(0, item.y));
  return { ...item, x, y, w: width, h: height };
}

export function bringToFront(items: LayoutItem[], id: string): LayoutItem[] {
  const maxZ = items.reduce((m, i) => Math.max(m, i.zIndex), 0);
  return items.map((i) => (i.id === id ? { ...i, zIndex: maxZ + 1 } : i));
}

/** Swap zIndex with the layer immediately below in stack order. */
export function sendBackward(items: LayoutItem[], id: string): LayoutItem[] {
  const sorted = sortByZ(items);
  const idx = sorted.findIndex((i) => i.id === id);
  if (idx <= 0) return items;
  const below = sorted[idx - 1]!;
  const cur = sorted[idx]!;
  return items.map((i) => {
    if (i.id === cur.id) return { ...i, zIndex: below.zIndex };
    if (i.id === below.id) return { ...i, zIndex: cur.zIndex };
    return i;
  });
}

export function sortByZ(items: LayoutItem[]): LayoutItem[] {
  return [...items].sort((a, b) => a.zIndex - b.zIndex);
}
