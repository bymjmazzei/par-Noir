/**
 * Shared Library / Templates feed slide chrome:
 * social → same phone stack as gallery thumbs (bevel + browse chrome + tile) + live aside;
 * non-social → centered page preview at true format + live aside.
 */

import type { ReactNode } from 'react';
import { categoryIdForClass } from '@par-noir/pen-protocol';
import { TemplateEngagementRail } from './TemplateEngagementRail';
import { SocialFeedPhonePreview } from './SocialFeedPhonePreview';
import { DocGalleryPreview } from './DocGalleryPreview';
import type { PenSession } from '../services/penSession';
import type { PenDocManifest, PenSectionContent } from '@par-noir/pen-protocol';

export function PenFeedSlideStage({
  classId,
  manifest,
  sections,
  session,
  templateId,
  fileId,
  authorLabel,
  buildSlot,
  onOpen,
  /** Browse feed highlight inside phone — Templates use pen-templates; Library uses pN. */
  phoneActiveFeedId = 'public'
}: {
  classId?: string;
  manifest: PenDocManifest;
  sections: PenSectionContent[];
  session: PenSession | null;
  templateId: string;
  fileId?: string | null;
  authorLabel?: string;
  buildSlot?: ReactNode;
  /** Library: open doc on preview click. Templates omit and use Build. */
  onOpen?: () => void;
  phoneActiveFeedId?: 'discovery' | 'public' | 'media' | 'notes' | 'collections' | 'pen-templates';
}) {
  const social = categoryIdForClass(classId || manifest.classId || '') === 'social';
  const unlocked = Boolean(session?.pnIdentifier);
  const live = Boolean(fileId) && unlocked;

  const preview = social ? (
    <SocialFeedPhonePreview
      large
      manifest={manifest}
      sections={sections}
      session={session}
      templateId={templateId}
      authorLabel={authorLabel}
      phoneActiveFeedId={phoneActiveFeedId}
    />
  ) : (
    <div className="pen-feed-page-slot">
      <DocGalleryPreview
        manifest={manifest}
        sections={sections}
        large
        session={session}
      />
    </div>
  );

  const previewBlock = onOpen ? (
    <button type="button" className="pen-doc-feed-slide-hit" onClick={onOpen}>
      {preview}
    </button>
  ) : (
    preview
  );

  return (
    <div className="pen-doc-feed-slide-stage pen-templates-feed-stage">
      <div className="pen-templates-feed-preview">{previewBlock}</div>
      <div className="pen-templates-feed-aside">
        <TemplateEngagementRail
          templateId={templateId}
          fileId={fileId ?? null}
          authorLabel={authorLabel}
          userPnIdentifier={session?.pnIdentifier}
          unlocked={unlocked}
          readOnly={!live}
          placement="aside"
          buildSlot={buildSlot}
        />
      </div>
    </div>
  );
}
