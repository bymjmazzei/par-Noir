/**
 * Templates feed density — catalog IR previews (Social atoms).
 * Display-only engagement overlay on phone; live aside when fileId known.
 */

import type { ReactNode } from 'react';
import type { PenTemplate } from '@par-noir/pen-protocol';
import type { PenSession } from '../services/penSession';
import { SnapFeedShell } from './SnapFeedShell';
import { PenFeedSlideStage } from './PenFeedSlideStage';
import { templatePreviewBundle } from './TemplateGalleryThumb';
import { resolveTemplateEngagementFileId } from '../services/templateEngagementFileId';

export function TemplatesFeedScroller({
  rail,
  templates,
  session,
  busy,
  onBuild,
  fileIdByTemplateId
}: {
  rail: ReactNode;
  templates: PenTemplate[];
  session: PenSession | null;
  busy?: boolean;
  onBuild: (templateId: string) => void;
  fileIdByTemplateId?: Map<string, string>;
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
        const preview = templatePreviewBundle(session?.pnIdentifier, t.id);
        if (!preview) {
          return (
            <div className="pen-doc-feed-empty">
              <p className="text-sm text-neutral-500">Template unavailable.</p>
            </div>
          );
        }
        const fileId = resolveTemplateEngagementFileId(t.id, fileIdByTemplateId);
        return (
          <PenFeedSlideStage
            classId={preview.manifest.classId || t.classId}
            manifest={preview.manifest as never}
            sections={preview.sections}
            session={session}
            templateId={t.id}
            fileId={fileId}
            authorLabel={preview.authorDisplayName}
            phoneActiveFeedId="pen-templates"
            buildSlot={
              <button
                type="button"
                className="pen-templates-feed-build"
                disabled={busy}
                title={session ? 'Build from template' : 'Unlock to build'}
                aria-label="Build"
                onClick={() => onBuild(t.id)}
              >
                Build
              </button>
            }
          />
        );
      }}
    />
  );
}
