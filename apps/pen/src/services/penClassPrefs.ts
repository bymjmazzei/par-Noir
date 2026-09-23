/** Home prefs (no secrets). */

const pinsKey = (pn: string) => `pen.categoryPins:${pn}`;
const browseDensityKey = (pn: string) => `pen.browseDensity:${pn}`;

export type PenBrowseDensity = 'list' | 'gallery';

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

export function savePinnedCategoryIds(pn: string, ids: string[], opts?: { silent?: boolean }): void {
  localStorage.setItem(pinsKey(pn), JSON.stringify([...new Set(ids)]));
  if (opts?.silent) return;
  try {
    void import('./penPrefsCloud').then((m) => m.schedulePrefsCloudPush(pn));
  } catch {
    /* ignore */
  }
}

export function togglePinnedCategory(pn: string, categoryId: string): string[] {
  const cur = loadPinnedCategoryIds(pn);
  const next = cur.includes(categoryId) ? cur.filter((id) => id !== categoryId) : [...cur, categoryId];
  savePinnedCategoryIds(pn, next);
  return next;
}

export function loadBrowseDensity(pn: string): PenBrowseDensity {
  try {
    const raw = localStorage.getItem(browseDensityKey(pn));
    if (raw === 'gallery' || raw === 'list') return raw;
    return 'list';
  } catch {
    return 'list';
  }
}

export function saveBrowseDensity(pn: string, density: PenBrowseDensity): void {
  localStorage.setItem(browseDensityKey(pn), density);
}
