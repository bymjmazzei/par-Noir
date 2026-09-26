/** Shared gallery preview for catalog / personal templates. */

import {
  categoryIdForClass,
  emptySection,
  getTemplate,
  requireTemplate,
  templateAuthorLabel
} from '@par-noir/pen-protocol';
import {
  isPersonalTemplateId,
  loadPersonalTemplate
} from '../services/penPersonalTemplates';
import type { PenSession } from '../services/penSession';
import { DocGalleryPreview } from './DocGalleryPreview';
import { SocialFeedPhonePreview } from './SocialFeedPhonePreview';

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
        docId: personal.galleryPreviewDocId || 'preview',
        title: personal.title,
        docType: personal.docType,
        classId: personal.classId,
        templateId: personal.id,
        templateVersion: personal.version,
        groupId: 'preview',
        toc: personal.sections.map((s) => s.slug),
        createdAt: personal.createdAt,
        updatedAt: personal.createdAt,
        ...(personal.galleryPreviewRef
          ? {
              galleryPreviewRef: personal.galleryPreviewRef,
              galleryPreviewKind: personal.galleryPreviewKind,
              galleryPreviewPosterRef: personal.galleryPreviewPosterRef
            }
          : {})
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
      updatedAt: new Date().toISOString(),
      pageLayout: t.seedPageLayout,
      pagePresentation: t.seedPagePresentation,
      galleryAspect: t.seedGalleryAspect
    },
    sections: t.seedSections?.length
      ? t.seedSections
      : t.sections.map((s) => emptySection(s.slug))
  };
}

/** Thumb for a starter or personal template id — same phone stack as feed, scaled down. */
export function TemplateGalleryThumb({
  pn,
  templateId,
  session,
  phoneActiveFeedId = 'pen-templates'
}: {
  pn?: string;
  templateId: string;
  session?: PenSession | null;
  phoneActiveFeedId?: 'discovery' | 'public' | 'media' | 'notes' | 'collections' | 'pen-templates';
}) {
  const preview = templatePreviewBundle(pn, templateId);
  if (!preview) {
    return (
      <span className="pen-gallery-tile-glyph text-[10px] text-neutral-500">—</span>
    );
  }

  const social = categoryIdForClass(String(preview.manifest.classId || '')) === 'social';
  if (social) {
    return (
      <SocialFeedPhonePreview
        density="thumb"
        manifest={preview.manifest as never}
        sections={preview.sections}
        session={session}
        templateId={templateId}
        authorLabel={preview.authorDisplayName}
        phoneActiveFeedId={phoneActiveFeedId}
      />
    );
  }

  return (
    <DocGalleryPreview
      manifest={preview.manifest as never}
      sections={preview.sections}
      session={session}
    />
  );
}

/** Create new — white frame with centered +. */
export function CreateNewGalleryThumb() {
  return (
    <span className="pen-gallery-tile-glyph" aria-hidden>
      <span className="pen-gallery-tile-glyph-plus">+</span>
    </span>
  );
}

/** Notebook / folder — white frame with centered notebook icon. */
export function NotebookGalleryThumb() {
  return (
    <span className="pen-gallery-tile-glyph" aria-hidden>
      <svg
        className="pen-gallery-tile-glyph-icon"
        viewBox="0 0 24 24"
        fill="none"
      >
        <path
          d="M5 4.5A1.5 1.5 0 0 1 6.5 3H18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6.5A1.5 1.5 0 0 1 5 19.5v-15Z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path d="M9 3v18" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    </span>
  );
}
