/** Shared gallery preview for catalog / personal templates. */

import {
  emptySection,
  getTemplate,
  requireTemplate,
  templateAuthorLabel
} from '@par-noir/pen-protocol';
import {
  isPersonalTemplateId,
  loadPersonalTemplate
} from '../services/penPersonalTemplates';
import { DocGalleryPreview } from './DocGalleryPreview';

export function templatePreviewBundle(pn: string | undefined, templateId: string) {
  if (pn && isPersonalTemplateId(templateId)) {
    const personal = loadPersonalTemplate(pn, templateId);
    if (!personal) return null;
    const based = getTemplate(personal.basedOnTemplateId);
    return {
      title: personal.title,
      description: based?.description || 'Personal template',
      authorDisplayName: 'You',
      manifest: {
        docId: 'preview',
        title: personal.title,
        docType: personal.docType,
        classId: personal.classId,
        templateId: personal.id,
        templateVersion: personal.version,
        groupId: 'preview',
        toc: personal.sections.map((s) => s.slug),
        createdAt: personal.createdAt,
        updatedAt: personal.createdAt
      },
      sections: personal.seedSections.length
        ? personal.seedSections
        : personal.sections.map((s) => emptySection(s.slug))
    };
  }
  const t = getTemplate(templateId) || requireTemplate(templateId);
  return {
    title: t.title,
    description: t.description || '',
    authorDisplayName: templateAuthorLabel(t),
    manifest: {
      docId: 'preview',
      title: t.title,
      docType: t.docType,
      classId: t.classId,
      templateId: t.id,
      templateVersion: t.version,
      groupId: 'preview',
      toc: t.sections.map((s) => s.slug),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    sections: t.seedSections?.length
      ? t.seedSections
      : t.sections.map((s) => emptySection(s.slug))
  };
}

/** Thumb for a starter or personal template id. */
export function TemplateGalleryThumb({
  pn,
  templateId
}: {
  pn?: string;
  templateId: string;
}) {
  const preview = templatePreviewBundle(pn, templateId);
  if (!preview) {
    return (
      <span className="flex h-full w-full items-center justify-center text-[10px] text-neutral-500">
        —
      </span>
    );
  }
  return (
    <DocGalleryPreview
      manifest={preview.manifest as never}
      sections={preview.sections}
    />
  );
}

/** Blank paper tile used for Create new. */
export function CreateNewGalleryThumb() {
  return (
    <div className="pen-gallery-doc-page pen-gallery-doc-page--paper pen-gallery-tile-blank">
      <span className="pen-gallery-tile-blank-plus" aria-hidden>
        +
      </span>
    </div>
  );
}

/** Notebook / folder tile (same chrome as doc/template thumbs). */
export function NotebookGalleryThumb({ label }: { label?: string }) {
  return (
    <div className="pen-gallery-doc-page pen-gallery-doc-page--paper pen-gallery-tile-notebook">
      <div className="pen-gallery-tile-notebook-spine" aria-hidden />
      <div className="pen-gallery-tile-notebook-body">
        <div className="pen-gallery-doc-paper-title">{label || 'Notebook'}</div>
        <div className="pen-gallery-tile-notebook-lines" aria-hidden>
          <span />
          <span />
          <span />
          <span />
        </div>
      </div>
    </div>
  );
}
