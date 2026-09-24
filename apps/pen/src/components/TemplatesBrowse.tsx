/** Templates catalog — Social atom rail across list / gallery / feed. */

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  categoryIdForClass,
  getClass,
  listStarterTemplates,
  type PenTemplate
} from '@par-noir/pen-protocol';
import type { PenSession } from '../App';
import { BrowseFeedTilePreview } from './BrowseFeedTilePreview';
import { DocGalleryPreview } from './DocGalleryPreview';
import {
  TemplateGalleryThumb,
  templatePreviewBundle
} from './TemplateGalleryThumb';
import {
  personalTemplatesAsPenTemplates
} from '../services/penPersonalTemplates';
import { createDocFromPersonalOrStarter } from '../services/penPublish';
import type { PenBrowseDensity } from '../services/penClassPrefs';
import { incrementTemplateUseCount } from '../services/penClassPrefs';
import {
  buildSocialTemplateRailItems,
  isSocialTemplateRailClass,
  templateMatchesRailSelection
} from '../services/classFeedRailItems';
import { ClassFeedRail } from './ClassFeedRail';
import { TemplatesFeedScroller } from './TemplatesFeedScroller';
import { TemplateEngagementRail } from './TemplateEngagementRail';
import { SocialPhoneFrame } from './SocialPhoneFrame';

function ListIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function GalleryIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2" />
      <rect x="14" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2" />
      <rect x="3" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2" />
      <rect x="14" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function FeedIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="4" y="3" width="16" height="5" rx="1" stroke="currentColor" strokeWidth="2" />
      <rect x="4" y="10" width="16" height="5" rx="1" stroke="currentColor" strokeWidth="2" />
      <rect x="4" y="17" width="16" height="4" rx="1" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function formTitleFor(classId: string): string {
  return getClass(classId)?.title || classId;
}

export function TemplatesBrowse({
  session,
  density,
  onDensity,
  onBack,
  onCreated,
  onSaved,
  onRequestUnlock,
  initialPreviewId
}: {
  session: PenSession | null;
  density: PenBrowseDensity;
  onDensity: (d: PenBrowseDensity) => void;
  onBack: () => void;
  onCreated: (docId: string) => void;
  onSaved?: () => void;
  /** When locked, creating requires unlock. */
  onRequestUnlock?: () => void;
  /** Open a template preview on mount (e.g. ?template=). */
  initialPreviewId?: string | null;
}) {
  void onSaved;
  const [previewId, setPreviewId] = useState<string | null>(() => initialPreviewId || null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeClassId, setActiveClassId] = useState('all');

  const railItems = useMemo(() => buildSocialTemplateRailItems(), []);

  useEffect(() => {
    if (initialPreviewId) setPreviewId(initialPreviewId);
  }, [initialPreviewId]);

  const catalog: PenTemplate[] = useMemo(() => {
    const starters = listStarterTemplates().filter((t) => {
      const form = getClass(t.classId);
      if (form?.audience === 'kit') return false;
      return isSocialTemplateRailClass(t.classId);
    });
    const yours = session?.pnIdentifier
      ? personalTemplatesAsPenTemplates(session.pnIdentifier).filter((t) =>
          isSocialTemplateRailClass(t.classId)
        )
      : [];
    return [...yours, ...starters];
  }, [session?.pnIdentifier]);

  const filtered = useMemo(() => {
    return catalog.filter((t) => templateMatchesRailSelection(t.classId, activeClassId));
  }, [catalog, activeClassId]);

  const preview = previewId
    ? templatePreviewBundle(session?.pnIdentifier, previewId)
    : null;

  async function useTemplate(templateId: string) {
    if (!session) {
      onRequestUnlock?.();
      setError('Unlock to create a document from this template.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const bundle = await createDocFromPersonalOrStarter({
        session,
        templateId
      });
      incrementTemplateUseCount(session.pnIdentifier, templateId);
      onCreated(bundle.manifest.docId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create document');
    } finally {
      setBusy(false);
    }
  }

  const previewIsSocial =
    preview?.manifest?.classId != null &&
    categoryIdForClass(String(preview.manifest.classId)) === 'social';

  const rail: ReactNode = (
    <ClassFeedRail
      items={railItems}
      activeId={activeClassId}
      onSelect={setActiveClassId}
    />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="pen-library-heading">
        <div className="min-w-0 flex-1">
          <button
            type="button"
            className="text-sm text-neutral-600 hover:text-black"
            onClick={onBack}
          >
            ← {session ? 'My Library' : 'Pen'}
          </button>
          <h1 className="text-lg font-bold text-black">Templates</h1>
          <p className="text-sm text-neutral-500">
            Building blocks — note, audio, media, collection, set, projects. Feed is a view of this
            catalog.
          </p>
        </div>
        <div className="pen-library-heading-tools">
          <div className="flex items-center justify-end gap-0" role="group" aria-label="Browse density">
            <button
              type="button"
              title="List"
              aria-label="List view"
              aria-pressed={density === 'list'}
              onClick={() => onDensity('list')}
              className={`inline-flex h-8 w-8 items-center justify-center ${
                density === 'list' ? 'text-black' : 'text-neutral-600 hover:text-neutral-800'
              }`}
            >
              <ListIcon />
            </button>
            <button
              type="button"
              title="Gallery"
              aria-label="Gallery view"
              aria-pressed={density === 'gallery'}
              onClick={() => onDensity('gallery')}
              className={`inline-flex h-8 w-8 items-center justify-center ${
                density === 'gallery' ? 'text-black' : 'text-neutral-600 hover:text-neutral-800'
              }`}
            >
              <GalleryIcon />
            </button>
            <button
              type="button"
              title="Feed"
              aria-label="Feed view"
              aria-pressed={density === 'feed'}
              onClick={() => onDensity('feed')}
              className={`inline-flex h-8 w-8 items-center justify-center ${
                density === 'feed' ? 'text-black' : 'text-neutral-600 hover:text-neutral-800'
              }`}
            >
              <FeedIcon />
            </button>
          </div>
        </div>
      </div>

      {error && <p className="px-4 pt-2 text-sm text-red-600">{error}</p>}

      <div className="pen-library-body">
        <div className="pen-library-sheet">
          {density === 'feed' ? (
            <TemplatesFeedScroller
              rail={rail}
              templates={filtered}
              session={session}
              busy={busy}
              onBuild={(id) => void useTemplate(id)}
            />
          ) : (
            <>
              <div className="pen-doc-feed-rail">{rail}</div>
              {filtered.length === 0 ? (
                <p className="pen-library-indent py-10 text-sm text-neutral-500">
                  No templates in this class.
                </p>
              ) : density === 'gallery' ? (
                <div className="pen-gallery-wrap pen-templates-gallery">
                  <div className="pen-gallery">
                    <div className="pen-gallery-tiles">
                      {filtered.map((t) => (
                        <div key={t.id} className="pen-gallery-slot">
                          <button
                            type="button"
                            className="pen-gallery-tile"
                            onClick={() => setPreviewId(t.id)}
                          >
                            <div className="pen-gallery-tile-title">
                              <span className="pen-gallery-tile-title-text">{t.title}</span>
                            </div>
                            <span className="pen-gallery-tile-preview">
                              <TemplateGalleryThumb
                                pn={session?.pnIdentifier}
                                templateId={t.id}
                                session={session}
                              />
                            </span>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="pen-explorer">
                  <div className="pen-explorer-scroll">
                    <table className="pen-explorer-table w-full text-left text-sm">
                      <thead className="text-[11px] tracking-wide">
                        <tr>
                          <th className="pen-explorer-action" aria-hidden />
                          <th className="pen-explorer-name-header px-3">Name</th>
                          <th className="pen-explorer-col-form px-3">Form</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((t) => (
                          <tr
                            key={t.id}
                            className="pen-explorer-row cursor-pointer"
                            onClick={() => setPreviewId(t.id)}
                          >
                            <td className="pen-explorer-action px-2 py-2 text-center">
                              <span className="inline-block h-4 w-4" aria-hidden />
                            </td>
                            <td className="pen-explorer-name-cell px-3 py-2 font-medium text-black">
                              <span className="pen-explorer-name-label">
                                <span className="min-w-0 truncate">{t.title}</span>
                              </span>
                            </td>
                            <td className="pen-explorer-col-form px-3 py-2 text-xs text-black">
                              {formTitleFor(t.classId)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {preview && previewId ? (
        <div
          className="pen-template-preview-overlay"
          role="presentation"
          onClick={() => setPreviewId(null)}
        >
          <div
            className="pen-template-preview-modal"
            role="dialog"
            aria-modal="true"
            aria-label={preview.title}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pen-template-preview-modal-bar">
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-base font-bold text-black">{preview.title}</h2>
                <p className="truncate text-xs text-neutral-500">
                  authored by {preview.authorDisplayName}
                </p>
                {preview.description ? (
                  <p className="mt-1 line-clamp-2 text-xs text-neutral-500">{preview.description}</p>
                ) : null}
              </div>
              <button
                type="button"
                className="pen-template-icon-btn"
                aria-label="Close preview"
                title="Close"
                onClick={() => setPreviewId(null)}
              >
                <CloseIcon />
              </button>
            </div>
            <div className="pen-template-preview-modal-body pen-template-preview-modal-body--with-rail">
              <div className="pen-template-preview-modal-stage">
                {previewIsSocial ? (
                  <SocialPhoneFrame large>
                    <BrowseFeedTilePreview
                      manifest={preview.manifest as never}
                      sections={preview.sections}
                      bare
                      compact
                      session={session}
                      hideEngagementRail
                    />
                  </SocialPhoneFrame>
                ) : (
                  <DocGalleryPreview
                    manifest={preview.manifest as never}
                    sections={preview.sections}
                    large
                    session={session}
                  />
                )}
              </div>
              <TemplateEngagementRail
                templateId={previewId}
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
                    onClick={() => void useTemplate(previewId)}
                  >
                    Build
                  </button>
                }
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
