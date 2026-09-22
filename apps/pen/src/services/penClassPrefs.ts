/** Client prefs: pinned Pen category ids + home list view (no secrets). */

const pinsKey = (pn: string) => `pen.categoryPins:${pn}`;
const homeViewKey = (pn: string) => `pen.homeView:${pn}`;

export type PenHomeView = 'all' | 'category';

export function loadPinnedCategoryIds(pn: string): string[] {
  try {
    const raw = localStorage.getItem(pinsKey(pn));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function savePinnedCategoryIds(pn: string, ids: string[]): void {
  localStorage.setItem(pinsKey(pn), JSON.stringify([...new Set(ids)]));
}

export function togglePinnedCategory(pn: string, categoryId: string): string[] {
  const cur = loadPinnedCategoryIds(pn);
  const next = cur.includes(categoryId) ? cur.filter((id) => id !== categoryId) : [...cur, categoryId];
  savePinnedCategoryIds(pn, next);
  return next;
}

export function loadHomeView(pn: string): PenHomeView {
  try {
    const raw = localStorage.getItem(homeViewKey(pn));
    return raw === 'category' ? 'category' : 'all';
  } catch {
    return 'all';
  }
}

export function saveHomeView(pn: string, view: PenHomeView): void {
  localStorage.setItem(homeViewKey(pn), view);
}
