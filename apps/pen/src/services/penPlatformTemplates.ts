/**
 * Mirror platform starter templates into owner's Yours + IR path buffer.
 * Used for system / allowlisted pNs so each starter has a personal root
 * (`par-noir-pen/templates/{personalId}/` path key) before Connect-to-feed publish.
 */

import {
  emptySection,
  getClass,
  listStarterTemplates,
  templateManifestPath,
  templateRootPath,
  type PenTemplate
} from '@par-noir/pen-protocol';
import {
  listPersonalTemplates,
  savePersonalTemplateFromCatalog
} from './penPersonalTemplates';

const irStoreKey = (pn: string, templateId: string) =>
  `pen_cloud_template_ir:${pn}:${templateManifestPath(templateId)}`;

/** Consumer (non-kit) platform starters — same filter as TemplatesBrowse. */
export function listConsumerStarterTemplates(): PenTemplate[] {
  return listStarterTemplates().filter((t) => {
    const form = getClass(t.classId);
    return !form || form.audience !== 'kit';
  });
}

function writeIrFromStarter(pn: string, personalId: string, starter: PenTemplate): void {
  const now = new Date().toISOString();
  const sections =
    starter.seedSections?.length
      ? starter.seedSections.map((s) => ({ ...s }))
      : starter.sections.map((s) => emptySection(s.slug));
  const blob = {
    v: 1 as const,
    templateId: personalId,
    cloudPath: templateRootPath(personalId),
    basedOnTemplateId: starter.id,
    manifest: {
      docId: personalId,
      title: starter.title,
      docType: starter.docType,
      classId: starter.classId,
      templateId: starter.id,
      templateVersion: starter.version || '1',
      basedOnTemplateId: starter.id,
      groupId: personalId,
      toc: starter.sections.map((s) => s.slug),
      createdAt: now,
      updatedAt: now,
      pageLayout: starter.seedPageLayout,
      pagePresentation: starter.seedPagePresentation,
      galleryAspect: starter.seedGalleryAspect
    },
    sections,
    savedAt: now
  };
  try {
    localStorage.setItem(irStoreKey(pn, personalId), JSON.stringify(blob));
  } catch {
    /* quota — personal Yours still holds seeds */
  }
}

/**
 * Ensure every consumer starter exists as a personal template (+ IR buffer)
 * under this pN. Idempotent by `basedOnTemplateId`.
 */
export function ensurePlatformTemplateRoots(pn: string): {
  created: number;
  skipped: number;
  total: number;
} {
  const existing = listPersonalTemplates(pn);
  const based = new Set(existing.map((t) => t.basedOnTemplateId).filter(Boolean));
  let created = 0;
  let skipped = 0;
  const starters = listConsumerStarterTemplates();
  for (const starter of starters) {
    if (based.has(starter.id)) {
      skipped += 1;
      continue;
    }
    const personal = savePersonalTemplateFromCatalog(pn, starter.id, starter.title);
    writeIrFromStarter(pn, personal.id, starter);
    based.add(starter.id);
    created += 1;
  }
  return { created, skipped, total: starters.length };
}
