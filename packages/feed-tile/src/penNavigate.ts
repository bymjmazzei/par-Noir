import type { PenGoTo } from '@par-noir/pen-protocol';

export function resolveNavigatePageIndex(
  goTo: PenGoTo,
  currentIndex: number,
  pageCount: number,
  slugs: string[]
): number | null {
  if (pageCount <= 0) return null;
  const clamp = (i: number) => Math.max(0, Math.min(pageCount - 1, i));
  if (goTo === 'next') return clamp(currentIndex + 1);
  if (goTo === 'prev') return clamp(currentIndex - 1);
  if (goTo === 'first') return 0;
  if (goTo === 'last') return pageCount - 1;
  if (goTo.startsWith('page:')) {
    const n = Number(goTo.slice(5));
    return Number.isFinite(n) ? clamp(n) : null;
  }
  if (goTo.startsWith('slug:')) {
    const slug = goTo.slice(5);
    const idx = slugs.indexOf(slug);
    return idx >= 0 ? idx : null;
  }
  return null;
}

export function saveIcsFile(effect: { ics: string; filename: string }): void {
  const blob = new Blob([effect.ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = effect.filename;
  a.click();
  URL.revokeObjectURL(url);
}
