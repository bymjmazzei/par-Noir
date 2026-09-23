/** Personal templates (local only — not community marketplace). */

import {
  emptySection,
  getTemplate,
  requireTemplate,
  type PenClass,
  type PenDocType,
  type PenSectionContent,
  type PenTemplate
} from '@par-noir/pen-protocol';
import type { LocalDocBundle } from './penLocalStore';

const storeKey = (pn: string) => `pen_personal_templates_v1:${pn}`;

export interface PersonalTemplate {
  id: string;
  title: string;
  classId: string;
  docType: PenDocType;
  /** Source starter template id (for versioning hint). */
  basedOnTemplateId: string;
  version: string;
  sections: Array<{ slug: string; title: string; required?: boolean }>;
  /** Starter section bodies copied from the source doc. */
  seedSections: PenSectionContent[];
  createdAt: string;
}

export function listPersonalTemplates(pn: string): PersonalTemplate[] {
  try {
    const raw = localStorage.getItem(storeKey(pn));
    return raw ? (JSON.parse(raw) as PersonalTemplate[]) : [];
  } catch {
    return [];
  }
}

function saveAll(pn: string, list: PersonalTemplate[]) {
  localStorage.setItem(storeKey(pn), JSON.stringify(list));
}

export function savePersonalTemplateFromDoc(
  pn: string,
  bundle: LocalDocBundle,
  opts?: {
    title?: string;
    classId?: string;
    docType?: PenDocType;
    basedOnTemplateId?: string;
    sections?: PersonalTemplate['sections'];
    seedSections?: PenSectionContent[];
  }
): PersonalTemplate {
  const id = `personal_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const now = new Date().toISOString();
  const basedOnId = opts?.basedOnTemplateId || bundle.manifest.templateId;
  const based = getTemplate(basedOnId) || getTemplate(bundle.manifest.templateId);
  const classId = opts?.classId || bundle.manifest.classId;
  const docType = opts?.docType || bundle.manifest.docType;
  const seedSections = opts?.seedSections || bundle.sections.map((s) => ({ ...s }));
  let sections: PersonalTemplate['sections'];
  if (opts?.sections) {
    sections = opts.sections;
  } else if (based) {
    sections = based.sections.map((s) => ({
      slug: s.slug,
      title: s.title,
      required: s.required !== false
    }));
  } else {
    sections = bundle.manifest.toc.map((slug) => ({
      slug,
      title: slug,
      required: true
    }));
  }
  const tpl: PersonalTemplate = {
    id,
    title: opts?.title?.trim() || `${bundle.manifest.title || 'Untitled'} template`,
    classId,
    docType,
    basedOnTemplateId: basedOnId,
    version: '1',
    sections,
    seedSections,
    createdAt: now
  };
  const list = listPersonalTemplates(pn).filter((t) => t.id !== id);
  list.unshift(tpl);
  saveAll(pn, list);
  try {
    void import('./penPrefsCloud').then((m) => m.schedulePrefsCloudPush(pn));
  } catch {
    /* ignore */
  }
  return tpl;
}

/** Map personal templates into PenTemplate shapes for the New… picker. */
export function personalTemplatesAsPenTemplates(pn: string): PenTemplate[] {
  return listPersonalTemplates(pn).map((t) => ({
    id: t.id,
    title: t.title,
    description: `Personal · based on ${t.basedOnTemplateId}`,
    docType: t.docType,
    classId: t.classId,
    version: t.version,
    sections: t.sections.map((s) => ({
      slug: s.slug,
      title: s.title,
      required: s.required !== false
    })),
    agentStarter:
      'Continue from the saved seed sections for {{template_id}}. Sections: {{section_list}}. {{user_input}}'
  }));
}

export function isPersonalTemplateId(id: string): boolean {
  return id.startsWith('personal_');
}

export function loadPersonalTemplate(pn: string, id: string): PersonalTemplate | undefined {
  return listPersonalTemplates(pn).find((t) => t.id === id);
}

/** Save a starter (or personal) catalog template into My templates. */
export function savePersonalTemplateFromCatalog(
  pn: string,
  templateId: string,
  title?: string
): PersonalTemplate {
  if (isPersonalTemplateId(templateId)) {
    const existing = loadPersonalTemplate(pn, templateId);
    if (existing) return existing;
  }
  const based =
    getTemplate(templateId) ||
    (isPersonalTemplateId(templateId) ? undefined : requireTemplate(templateId));
  if (!based) {
    throw new Error('template_not_found');
  }
  const id = `personal_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const now = new Date().toISOString();
  const seedSections = based.sections.map((s) => emptySection(s.slug));
  const tpl: PersonalTemplate = {
    id,
    title: title?.trim() || based.title,
    classId: based.classId,
    docType: based.docType,
    basedOnTemplateId: based.id,
    version: based.version || '1',
    sections: based.sections.map((s) => ({
      slug: s.slug,
      title: s.title,
      required: s.required !== false
    })),
    seedSections,
    createdAt: now
  };
  const list = listPersonalTemplates(pn);
  list.unshift(tpl);
  saveAll(pn, list);
  try {
    void import('./penPrefsCloud').then((m) => m.schedulePrefsCloudPush(pn));
  } catch {
    /* ignore */
  }
  return tpl;
}

/** Synthetic class entries so personal templates still resolve in trail UI. */
export function personalTemplateClassStub(t: PersonalTemplate): PenClass {
  return {
    id: t.classId,
    title: t.classId.split('.').pop() || t.classId,
    description: 'Personal template class',
    kind: 'authored',
    audience: 'consumer',
    parentId: t.classId.includes('.') ? t.classId.split('.')[0] : undefined
  };
}
