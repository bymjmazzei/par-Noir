/** Build ClassFeedRail items from library docs or public template class ids. */

import { getClass, getTemplate } from '@par-noir/pen-protocol';
import type { ClassFeedRailItem } from '../components/ClassFeedRail';

export function resolveSummaryClassId(d: {
  classId?: string;
  templateId?: string;
}): string | undefined {
  if (d.classId) return d.classId;
  if (d.templateId) return getTemplate(d.templateId)?.classId;
  return undefined;
}

/** ALL + forms present in `classIds`, titles uppercased, sorted by title. */
export function buildClassFeedRailItems(classIds: Iterable<string>): ClassFeedRailItem[] {
  const unique = [...new Set([...classIds].filter(Boolean))];
  const forms = unique
    .map((id) => {
      const form = getClass(id);
      if (!form?.parentId) return null;
      return { id, label: (form.title || id).toUpperCase() };
    })
    .filter((x): x is ClassFeedRailItem => Boolean(x))
    .sort((a, b) => a.label.localeCompare(b.label));

  return [{ id: 'all', label: 'ALL' }, ...forms];
}

export function contentClassFallbackLabel(contentClass: string | undefined): string {
  if (contentClass === 'note') return 'NOTES';
  if (contentClass === 'collection') return 'COLLECTIONS';
  if (contentClass === 'media') return 'MEDIA';
  return (contentClass || 'OTHER').toUpperCase();
}
