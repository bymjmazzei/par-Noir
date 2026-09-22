/** Shared layout item — rects are % of surface (0–100). */

export interface LayoutItem {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  zIndex: number;
}

export function clampLayoutItem(item: LayoutItem): LayoutItem {
  const w = Math.min(100, Math.max(4, item.w));
  const h = Math.min(100, Math.max(4, item.h));
  const x = Math.min(100 - w, Math.max(0, item.x));
  const y = Math.min(100 - h, Math.max(0, item.y));
  return { ...item, x, y, w, h };
}

export function bringToFront(items: LayoutItem[], id: string): LayoutItem[] {
  const maxZ = items.reduce((m, i) => Math.max(m, i.zIndex), 0);
  return items.map((i) => (i.id === id ? { ...i, zIndex: maxZ + 1 } : i));
}

export function sortByZ(items: LayoutItem[]): LayoutItem[] {
  return [...items].sort((a, b) => a.zIndex - b.zIndex);
}
