/** Client prefs: pinned Pen category ids (no secrets). */

const key = (pn: string) => `pen.categoryPins:${pn}`;

export function loadPinnedCategoryIds(pn: string): string[] {
  try {
    const raw = localStorage.getItem(key(pn));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function savePinnedCategoryIds(pn: string, ids: string[]): void {
  localStorage.setItem(key(pn), JSON.stringify([...new Set(ids)]));
}

export function togglePinnedCategory(pn: string, categoryId: string): string[] {
  const cur = loadPinnedCategoryIds(pn);
  const next = cur.includes(categoryId) ? cur.filter((id) => id !== categoryId) : [...cur, categoryId];
  savePinnedCategoryIds(pn, next);
  return next;
}
