/** Build ClassFeedRail items from library docs or public template class ids. */

import { getClass, getTemplate } from '@par-noir/pen-protocol';
import type { ClassFeedRailItem } from '../components/ClassFeedRail';

/**
 * Social building-block forms for the Templates surface (all densities).
 * Fixed order — not derived from dataset presence.
 */
export const SOCIAL_TEMPLATE_RAIL_FORMS = [
  'social.note',
  'social.metric',
  'social.audio',
  'social.post',
  'social.collection',
  'social.set'
] as const;

export type SocialTemplateRailFormId = (typeof SOCIAL_TEMPLATE_RAIL_FORMS)[number];

/** Category-level chips after Social atoms (Projects = journal / list / letter / note). */
export const TEMPLATE_RAIL_CATEGORIES = ['projects'] as const;

export type TemplateRailCategoryId = (typeof TEMPLATE_RAIL_CATEGORIES)[number];

const SOCIAL_TEMPLATE_RAIL_LABELS: Record<SocialTemplateRailFormId, string> = {
  'social.note': 'note',
  'social.metric': 'metric',
  'social.audio': 'audio',
  'social.post': 'post',
  'social.collection': 'collection',
  'social.set': 'set'
};

const TEMPLATE_RAIL_CATEGORY_LABELS: Record<TemplateRailCategoryId, string> = {
  projects: 'projects'
};

const SOCIAL_TEMPLATE_RAIL_SET = new Set<string>(SOCIAL_TEMPLATE_RAIL_FORMS);

export function isProjectsRailClass(classId: string | undefined): boolean {
  if (!classId) return false;
  if (classId === 'projects' || classId.startsWith('projects.')) return true;
  return getClass(classId)?.parentId === 'projects';
}

/** Templates surface allowlist: Social atoms + Projects forms. */
export function isSocialTemplateRailClass(classId: string | undefined): boolean {
  if (!classId) return false;
  if (SOCIAL_TEMPLATE_RAIL_SET.has(classId)) return true;
  return isProjectsRailClass(classId);
}

/** Whether a template belongs under the active rail chip. */
export function templateMatchesRailSelection(
  classId: string | undefined,
  activeId: string
): boolean {
  if (!classId || !isSocialTemplateRailClass(classId)) return false;
  if (activeId === 'all') return true;
  if (activeId === 'projects') return isProjectsRailClass(classId);
  return classId === activeId;
}

/** ALL + Social atoms + category chips (Templates list / gallery / feed). */
export function buildSocialTemplateRailItems(): ClassFeedRailItem[] {
  return [
    { id: 'all', label: 'ALL' },
    ...SOCIAL_TEMPLATE_RAIL_FORMS.map((id) => ({
      id,
      label: SOCIAL_TEMPLATE_RAIL_LABELS[id]
    })),
    ...TEMPLATE_RAIL_CATEGORIES.map((id) => ({
      id,
      label: TEMPLATE_RAIL_CATEGORY_LABELS[id]
    }))
  ];
}

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
