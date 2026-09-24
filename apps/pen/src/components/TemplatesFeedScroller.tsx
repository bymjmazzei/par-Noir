/**
 * Templates feed density — catalog IR previews (Social atoms).
 * View-only engagement outside the phone; Build opens the editor.
 */

import type { ReactNode } from 'react';
import type { PenTemplate } from '@par-noir/pen-protocol';
import { categoryIdForClass } from '@par-noir/pen-protocol';
import type { PenSession } from '../services/penSession';
import { SnapFeedShell } from './SnapFeedShell';
import { SocialPhoneFrame } from './SocialPhoneFrame';
import { TemplateEngagementRail } from './TemplateEngagementRail';
import { BrowseFeedTilePreview } from './BrowseFeedTilePreview';
import { templatePreviewBundle } from './TemplateGalleryThumb';

export function TemplatesFeedScroller({
  rail,
  templates,
  session,
  busy,
  onBuild
}: {
  rail: ReactNode;
  templates: PenTemplate[];
  session: PenSession | null;
  busy?: boolean;
  onBuild: (templateId: string) => void;
}) {
  return (
    <SnapFeedShell
      rail={rail}
      count={templates.length}
      slideKeys={templates.map((t) => t.id)}
      empty={
        <div className="pen-doc-feed-empty">
          <p className="text-sm text-neutral-500">No templates in this class.</p>
        </div>
      }
      renderSlide={(index) => {
        const t = templates[index];
        if (!t) return null;
        return (
          <TemplateFeedSlide
            templateId={t.id}
            session={session}
            busy={busy}
            onBuild={() => onBuild(t.id)}
          />
        );
      }}
    />
  );
}

function TemplateFeedSlide({
  templateId,
  session,
  busy,
  onBuild
}: {
  templateId: string;
  session: PenSession | null;
  busy?: boolean;
  onBuild: () => void;
}) {
  const preview = templatePreviewBundle(session?.pnIdentifier, templateId);
  if (!preview) {
    return (
      <div className="pen-doc-feed-empty">
        <p className="text-sm text-neutral-500">Template unavailable.</p>
      </div>
    );
  }
  const social = categoryIdForClass(preview.manifest.classId || '') === 'social';
  const tile = (
    <BrowseFeedTilePreview
      manifest={preview.manifest}
      sections={preview.sections}
      bare
      compact
      session={session}
      hideEngagementRail
    />
  );

  return (
    <div className="pen-doc-feed-slide-stage pen-templates-feed-stage">
      <div className="pen-templates-feed-preview">
        {social ? (
          <SocialPhoneFrame large>{tile}</SocialPhoneFrame>
        ) : (
          <div className="pen-feed-tile-slot">{tile}</div>
        )}
      </div>
      <div className="pen-templates-feed-aside">
        <TemplateEngagementRail
          templateId={templateId}
          fileId={null}
          authorLabel={preview.authorDisplayName}
          userPnIdentifier={session?.pnIdentifier}
          unlocked={Boolean(session?.pnIdentifier)}
          readOnly
          placement="aside"
          buildSlot={
            <button
              type="button"
              className="pen-templates-feed-build"
              disabled={busy}
              title={session ? 'Build from template' : 'Unlock to build'}
              aria-label="Build"
              onClick={onBuild}
            >
              Build
            </button>
          }
        />
      </div>
    </div>
  );
}
