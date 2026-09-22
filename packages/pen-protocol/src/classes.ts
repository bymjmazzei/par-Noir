/** Pen category / form registry — templates attach via classId (form). */

import type { PenTemplate } from './templates.js';
import { listStarterTemplates } from './templates.js';

export type PenClassKind = 'authored' | 'register' | 'dossier';

export type PenClassEntitlement = 'self-hosted';

export interface PenClass {
  id: string;
  title: string;
  description: string;
  kind: PenClassKind;
  /** Forms point at a category; categories omit parentId. */
  parentId?: string;
  /** When set, create/list may require matching storage tier. */
  entitlement?: PenClassEntitlement;
}

const CLASSES: PenClass[] = [
  {
    id: 'social',
    title: 'Social',
    description: 'Notes, posts, collections, and feeds for browse',
    kind: 'authored'
  },
  {
    id: 'social.note',
    title: 'Notes',
    description: 'Flow Notes for browse',
    kind: 'authored',
    parentId: 'social'
  },
  {
    id: 'social.post',
    title: 'Posts',
    description: 'Caption and media posts',
    kind: 'authored',
    parentId: 'social'
  },
  {
    id: 'social.collection',
    title: 'Collections',
    description: 'Ordered slides / story collections',
    kind: 'authored',
    parentId: 'social'
  },
  {
    id: 'social.feed',
    title: 'Feeds',
    description: 'Self-hosted and curated feed configs',
    kind: 'authored',
    parentId: 'social',
    entitlement: 'self-hosted'
  }
];

const byId = new Map(CLASSES.map((c) => [c.id, c]));

export function listClasses(): PenClass[] {
  return [...CLASSES];
}

export function listCategories(): PenClass[] {
  return CLASSES.filter((c) => !c.parentId);
}

export function listForms(categoryId: string): PenClass[] {
  return CLASSES.filter((c) => c.parentId === categoryId);
}

export function getClass(classId: string): PenClass | undefined {
  return byId.get(classId);
}

export function requireClass(classId: string): PenClass {
  const c = getClass(classId);
  if (!c) throw new Error(`unknown_pen_class:${classId}`);
  return c;
}

export function isPenForm(classId: string): boolean {
  const c = getClass(classId);
  return Boolean(c?.parentId);
}

export function isPenCategory(classId: string): boolean {
  const c = getClass(classId);
  return Boolean(c && !c.parentId);
}

export function listTemplatesByClass(
  classId: string,
  templates: PenTemplate[] = listStarterTemplates()
): PenTemplate[] {
  return templates.filter((t) => t.classId === classId);
}

export interface PenCategoryGroup {
  category: PenClass;
  forms: Array<{ form: PenClass; templates: PenTemplate[] }>;
}

export function listTemplatesGroupedByCategory(
  templates: PenTemplate[] = listStarterTemplates()
): PenCategoryGroup[] {
  return listCategories().map((category) => ({
    category,
    forms: listForms(category.id).map((form) => ({
      form,
      templates: listTemplatesByClass(form.id, templates)
    }))
  }));
}

export interface PenCatalogSearchHit {
  categories: PenClass[];
  forms: PenClass[];
  templates: PenTemplate[];
}

function matchesQuery(hay: string, q: string): boolean {
  return hay.toLowerCase().includes(q);
}

/** Empty query → empty results. */
export function searchPenCatalog(
  query: string,
  input: { classes?: PenClass[]; templates?: PenTemplate[] } = {}
): PenCatalogSearchHit {
  const q = query.trim().toLowerCase();
  if (!q) return { categories: [], forms: [], templates: [] };

  const classes = input.classes ?? listClasses();
  const templates = input.templates ?? listStarterTemplates();

  const categories: PenClass[] = [];
  const forms: PenClass[] = [];
  for (const c of classes) {
    const hit = matchesQuery(c.title, q) || matchesQuery(c.description, q);
    if (!hit) continue;
    if (c.parentId) forms.push(c);
    else categories.push(c);
  }

  const templateHits = templates.filter(
    (t) => matchesQuery(t.title, q) || matchesQuery(t.description, q) || matchesQuery(t.id, q)
  );

  return { categories, forms, templates: templateHits };
}

/**
 * Assert every template classId is a known form under a known category.
 * Throws on violation (used by tests; call at module load in tests only).
 */
export function assertTemplateClassInvariants(templates: PenTemplate[]): void {
  for (const t of templates) {
    if (!t.classId) throw new Error(`missing_classId:${t.id}`);
    const form = getClass(t.classId);
    if (!form) throw new Error(`unknown_classId:${t.id}:${t.classId}`);
    if (!form.parentId) throw new Error(`classId_must_be_form:${t.id}:${t.classId}`);
    const parent = getClass(form.parentId);
    if (!parent || parent.parentId) {
      throw new Error(`form_parent_must_be_category:${t.classId}:${form.parentId}`);
    }
  }
}
