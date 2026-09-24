/** Home prefs (no secrets). */

const pinsKey = (pn: string) => `pen.categoryPins:${pn}`;
const browseDensityKey = (pn: string) => `pen.browseDensity:${pn}`;

export type PenBrowseDensity = 'list' | 'gallery' | 'feed';

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
    if (raw === 'gallery' || raw === 'list' || raw === 'feed') return raw;
    return 'list';
  } catch {
    return 'list';
  }
}

export function saveBrowseDensity(pn: string, density: PenBrowseDensity): void {
  localStorage.setItem(browseDensityKey(pn), density);
}

const templateUsesKey = (pn: string) => `pen.templateUses:${pn || '_anon'}`;

/** Device-local “times used” count (Build / useTemplate). */
export function getTemplateUseCount(pn: string | null | undefined, templateId: string): number {
  try {
    const raw = localStorage.getItem(templateUsesKey(pn || '_anon'));
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const n = Number(parsed[templateId] ?? 0);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

export function incrementTemplateUseCount(
  pn: string | null | undefined,
  templateId: string
): number {
  const key = templateUsesKey(pn || '_anon');
  let map: Record<string, number> = {};
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      for (const [id, v] of Object.entries(parsed)) {
        const n = Number(v);
        if (Number.isFinite(n) && n > 0) map[id] = Math.floor(n);
      }
    }
  } catch {
    map = {};
  }
  const next = (map[templateId] || 0) + 1;
  map[templateId] = next;
  localStorage.setItem(key, JSON.stringify(map));
  return next;
}
