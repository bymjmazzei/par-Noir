/**
 * Same phone stack as Templates/Library feed: bevel + browse chrome + feed tile.
 * Gallery thumbs reuse this at smaller size; landscape uses a 16:9 bevel.
 */

import type { PenDocManifest, PenSectionContent } from '@par-noir/pen-protocol';
import { SocialPhoneFrame } from './SocialPhoneFrame';
import { PenPhoneBrowseChrome } from './PenPhoneBrowseChrome';
import { TemplateEngagementRail } from './TemplateEngagementRail';
import { BrowseFeedTilePreview } from './BrowseFeedTilePreview';
import {
  resolveFeedTileAspect,
  resolvePhoneFrameAspect
} from './DocGalleryPreview';
import type { PenSession } from '../services/penSession';

export function SocialFeedPhonePreview({
  manifest,
  sections,
  session,
  templateId,
  authorLabel,
  phoneActiveFeedId = 'public',
  large
}: {
  manifest: PenDocManifest;
  sections: PenSectionContent[];
  session?: PenSession | null;
  templateId: string;
  authorLabel?: string;
  phoneActiveFeedId?: 'discovery' | 'public' | 'media' | 'notes' | 'collections' | 'pen-templates';
  large?: boolean;
}) {
  const phoneAspectCss = resolvePhoneFrameAspect(manifest);
  const feedAspect = resolveFeedTileAspect(manifest);
  const unlocked = Boolean(session?.pnIdentifier);

  return (
    <SocialPhoneFrame
      large={large}
      aspectRatio={phoneAspectCss}
      chrome={
        <PenPhoneBrowseChrome
          activeFeedId={phoneActiveFeedId}
          engagement={
            <TemplateEngagementRail
              templateId={templateId}
              fileId={null}
              authorLabel={authorLabel}
              userPnIdentifier={session?.pnIdentifier}
              unlocked={unlocked}
              readOnly
              placement="overlay"
            />
          }
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
  );
}
