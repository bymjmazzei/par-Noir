/**
 * Shared Library / Templates feed slide chrome:
 * social → phone + display-only in-device chrome (rail/engagement/nav) + live aside;
 * non-social → centered page preview at true format + live aside.
 */

import type { ReactNode } from 'react';
import { categoryIdForClass } from '@par-noir/pen-protocol';
import { SocialPhoneFrame } from './SocialPhoneFrame';
import { TemplateEngagementRail } from './TemplateEngagementRail';
import { PenPhoneBrowseChrome } from './PenPhoneBrowseChrome';
import { BrowseFeedTilePreview } from './BrowseFeedTilePreview';
import type { ClassFeedRailItem } from './ClassFeedRail';
import {
  DocGalleryPreview,
  resolveFeedTileAspect,
  resolvePageAspect
} from './DocGalleryPreview';
import { buildSocialTemplateRailItems } from '../services/classFeedRailItems';
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
  railItems,
  activeRailId
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
  /** In-phone display rail (defaults to Social template rail). */
  railItems?: ClassFeedRailItem[];
  activeRailId?: string;
}) {
  const social = categoryIdForClass(classId || manifest.classId || '') === 'social';
  const unlocked = Boolean(session?.pnIdentifier);
  const live = Boolean(fileId) && unlocked;
  // One aspect SoT for phone frame + feed tile (must not diverge).
  const pageAspectCss = resolvePageAspect(manifest);
  const feedAspect = resolveFeedTileAspect(manifest);
  const phoneRailItems = railItems ?? buildSocialTemplateRailItems();
  const phoneActiveRailId = activeRailId ?? 'all';

  const overlay = (
    <TemplateEngagementRail
      templateId={templateId}
      fileId={null}
      authorLabel={authorLabel}
      userPnIdentifier={session?.pnIdentifier}
      unlocked={unlocked}
      readOnly
      placement="overlay"
    />
  );

  const preview = social ? (
    <SocialPhoneFrame
      large
      aspectRatio={pageAspectCss}
      chrome={
        <PenPhoneBrowseChrome
          railItems={phoneRailItems}
          activeRailId={phoneActiveRailId}
          engagement={overlay}
        />
      }
    >
      <BrowseFeedTilePreview
        manifest={manifest}
        sections={sections}
        bare
        compact
        session={session}
        hideEngagementRail
        aspectRatio={feedAspect}
      />
    </SocialPhoneFrame>
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
