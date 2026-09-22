/** Dashboard prefs + home view (no secrets). */

import type { LayoutItem } from '../layout/types';

const pinsKey = (pn: string) => `pen.categoryPins:${pn}`;
const homeViewKey = (pn: string) => `pen.homeView:${pn}`;
const dashboardKey = (pn: string) => `pen.dashboard:${pn}`;

export type PenHomeView = 'all' | 'category' | 'dashboard';

export type DashboardSlotId = 'calendar' | 'schedule' | 'todo' | 'recent_notes';

export interface DashboardPrefs {
  binds: Partial<Record<DashboardSlotId, string>>;
  hidden?: DashboardSlotId[];
  layout: LayoutItem[];
}

export const DASHBOARD_SLOTS: Array<{
  id: DashboardSlotId;
  title: string;
  classId: string | null;
  templateId: string | null;
}> = [
  { id: 'calendar', title: 'Calendar', classId: 'time.calendar', templateId: 'calendar.basic.v1' },
  { id: 'schedule', title: 'Schedule', classId: 'time.schedule', templateId: 'schedule.basic.v1' },
  { id: 'todo', title: 'To-do', classId: 'projects.list', templateId: 'list.basic.v1' },
  { id: 'recent_notes', title: 'Recent notes', classId: null, templateId: null }
];

export function defaultDashboardLayout(): LayoutItem[] {
  return [
    { id: 'calendar', x: 2, y: 2, w: 47, h: 46, zIndex: 1 },
    { id: 'schedule', x: 51, y: 2, w: 47, h: 46, zIndex: 2 },
    { id: 'todo', x: 2, y: 50, w: 47, h: 48, zIndex: 3 },
    { id: 'recent_notes', x: 51, y: 50, w: 47, h: 48, zIndex: 4 }
  ];
}

export function defaultDashboardPrefs(): DashboardPrefs {
  return { binds: {}, layout: defaultDashboardLayout() };
}

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
    if (raw === 'all' || raw === 'category' || raw === 'dashboard') return raw;
    return 'dashboard';
  } catch {
    return 'dashboard';
  }
}

export function saveHomeView(pn: string, view: PenHomeView): void {
  localStorage.setItem(homeViewKey(pn), view);
}

export function loadDashboardPrefs(pn: string): DashboardPrefs {
  try {
    const raw = localStorage.getItem(dashboardKey(pn));
    if (!raw) return defaultDashboardPrefs();
    const parsed = JSON.parse(raw) as Partial<DashboardPrefs>;
    const layout =
      Array.isArray(parsed.layout) && parsed.layout.length
        ? (parsed.layout as LayoutItem[])
        : defaultDashboardLayout();
    return {
      binds: parsed.binds && typeof parsed.binds === 'object' ? parsed.binds : {},
      hidden: Array.isArray(parsed.hidden) ? (parsed.hidden as DashboardSlotId[]) : undefined,
      layout
    };
  } catch {
    return defaultDashboardPrefs();
  }
}

export function saveDashboardPrefs(pn: string, prefs: DashboardPrefs): void {
  localStorage.setItem(dashboardKey(pn), JSON.stringify(prefs));
}

export function setDashboardBind(
  pn: string,
  slot: DashboardSlotId,
  docId: string | undefined
): DashboardPrefs {
  const cur = loadDashboardPrefs(pn);
  const binds = { ...cur.binds };
  if (docId) binds[slot] = docId;
  else delete binds[slot];
  const next = { ...cur, binds };
  saveDashboardPrefs(pn, next);
  return next;
}

export function setDashboardLayout(pn: string, layout: LayoutItem[]): DashboardPrefs {
  const cur = loadDashboardPrefs(pn);
  const next = { ...cur, layout };
  saveDashboardPrefs(pn, next);
  return next;
}
