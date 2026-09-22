/** Dashboard prefs + home view (no secrets). */

const pinsKey = (pn: string) => `pen.categoryPins:${pn}`;
const homeViewKey = (pn: string) => `pen.homeView:${pn}`;
const dashboardKey = (pn: string) => `pen.dashboard:${pn}`;

export type PenHomeView = 'all' | 'category' | 'dashboard';

export type DashboardSlotId = 'calendar' | 'schedule' | 'todo' | 'recent_notes';

/** Packed grid tile (not absolute % LayoutItem). */
export interface DashboardGridTile {
  id: DashboardSlotId;
  col: number;
  row: number;
  colSpan: number;
  rowSpan: number;
}

export interface DashboardPrefs {
  binds: Partial<Record<DashboardSlotId, string>>;
  hidden?: DashboardSlotId[];
  layout: DashboardGridTile[];
}

export const DASHBOARD_COLS = 2;

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

export function defaultDashboardGrid(): DashboardGridTile[] {
  return [
    { id: 'calendar', col: 0, row: 0, colSpan: 1, rowSpan: 1 },
    { id: 'schedule', col: 1, row: 0, colSpan: 1, rowSpan: 1 },
    { id: 'todo', col: 0, row: 1, colSpan: 1, rowSpan: 1 },
    { id: 'recent_notes', col: 1, row: 1, colSpan: 1, rowSpan: 1 }
  ];
}

export function defaultDashboardPrefs(): DashboardPrefs {
  return { binds: {}, layout: defaultDashboardGrid() };
}

function isAbsoluteLegacyLayout(layout: unknown[]): boolean {
  return layout.some(
    (t) =>
      t &&
      typeof t === 'object' &&
      ('x' in (t as object) || 'y' in (t as object)) &&
      !('col' in (t as object))
  );
}

function isValidGridLayout(layout: unknown[]): layout is DashboardGridTile[] {
  if (!layout.length) return false;
  return layout.every((t) => {
    if (!t || typeof t !== 'object') return false;
    const o = t as Record<string, unknown>;
    return (
      typeof o.id === 'string' &&
      typeof o.col === 'number' &&
      typeof o.row === 'number' &&
      typeof o.colSpan === 'number' &&
      typeof o.rowSpan === 'number'
    );
  });
}

/** Swap two tiles' grid positions (1×1). */
export function swapDashboardTiles(
  layout: DashboardGridTile[],
  aId: string,
  bId: string
): DashboardGridTile[] {
  const a = layout.find((t) => t.id === aId);
  const b = layout.find((t) => t.id === bId);
  if (!a || !b || a.id === b.id) return layout;
  return layout.map((t) => {
    if (t.id === a.id) return { ...t, col: b.col, row: b.row, colSpan: b.colSpan, rowSpan: b.rowSpan };
    if (t.id === b.id) return { ...t, col: a.col, row: a.row, colSpan: a.colSpan, rowSpan: a.rowSpan };
    return t;
  });
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
    let layout = defaultDashboardGrid();
    if (Array.isArray(parsed.layout) && parsed.layout.length) {
      if (isAbsoluteLegacyLayout(parsed.layout as unknown[])) {
        layout = defaultDashboardGrid();
      } else if (isValidGridLayout(parsed.layout as unknown[])) {
        layout = parsed.layout as DashboardGridTile[];
      }
    }
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

export function setDashboardLayout(pn: string, layout: DashboardGridTile[]): DashboardPrefs {
  const cur = loadDashboardPrefs(pn);
  const next = { ...cur, layout };
  saveDashboardPrefs(pn, next);
  return next;
}
