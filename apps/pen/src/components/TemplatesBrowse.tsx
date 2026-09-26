/** Templates catalog body — Social atom rail across list / gallery / feed.
 * Page chrome (heading, density tools, red rail, footer) is owned by the notebook shell.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  categoryIdForClass,
  getClass,
  listStarterTemplates,
  type PenTemplate
} from '@par-noir/pen-protocol';
import type { PenSession } from '../App';
import { DocGalleryPreview } from './DocGalleryPreview';
import {
  TemplateGalleryThumb,
  templatePreviewBundle
} from './TemplateGalleryThumb';
import { personalTemplatesAsPenTemplates } from '../services/penPersonalTemplates';
import { createDocFromPersonalOrStarter } from '../services/penPublish';
import type { PenBrowseDensity } from '../services/penClassPrefs';
import { incrementTemplateUseCount } from '../services/penClassPrefs';
import {
  buildSocialTemplateRailItems,
  isSocialCategoryClass,
  templateMatchesRailSelection
} from '../services/classFeedRailItems';
import { ClassFeedRail } from './ClassFeedRail';
import { TemplatesFeedScroller } from './TemplatesFeedScroller';
import { TemplateEngagementRail } from './TemplateEngagementRail';
import { SocialFeedPhonePreview } from './SocialFeedPhonePreview';
import { fetchPublicPenTemplates } from '../services/penCentralIndex';
import {
  buildTemplateFileIdMap,
  resolveTemplateEngagementFileId
} from '../services/templateEngagementFileId';

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ChevronIcon({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d={dir === 'left' ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function formTitleFor(classId: string): string {
  return getClass(classId)?.title || classId;
}

export function TemplatesBrowse({
  session,
  density,
  onCreated,
  onSaved,
  onRequestUnlock,
  initialPreviewId
}: {
  session: PenSession | null;
  density: PenBrowseDensity;
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
  const [fileIdByTemplateId, setFileIdByTemplateId] = useState<Map<string, string>>(
    () => new Map()
  );

  const railItems = useMemo(() => buildSocialTemplateRailItems(), []);

  useEffect(() => {
    if (initialPreviewId) setPreviewId(initialPreviewId);
  }, [initialPreviewId]);

  useEffect(() => {
    let cancelled = false;
    void fetchPublicPenTemplates({ limit: 200 })
      .then((entries) => {
        if (cancelled) return;
        setFileIdByTemplateId(buildTemplateFileIdMap(entries));
      })
      .catch(() => {
        if (!cancelled) setFileIdByTemplateId(new Map());
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const catalog: PenTemplate[] = useMemo(() => {
    const starters = listStarterTemplates().filter((t) => {
      const form = getClass(t.classId);
      if (form?.audience === 'kit') return false;
      return isSocialCategoryClass(t.classId);
    });
    const yours = session?.pnIdentifier
      ? personalTemplatesAsPenTemplates(session.pnIdentifier).filter((t) =>
          isSocialCategoryClass(t.classId)
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

  const previewFileId = previewId
    ? resolveTemplateEngagementFileId(previewId, fileIdByTemplateId)
    : null;
  const previewLive = Boolean(previewFileId) && Boolean(session?.pnIdentifier);

  const previewIndex = useMemo(() => {
    if (!previewId) return -1;
    return filtered.findIndex((t) => t.id === previewId);
  }, [filtered, previewId]);

  const goPreviewRelative = useCallback(
    (delta: number) => {
      if (previewIndex < 0 || filtered.length === 0) return;
      const next = previewIndex + delta;
      if (next < 0 || next >= filtered.length) return;
      setPreviewId(filtered[next]!.id);
    },
    [filtered, previewIndex]
  );

  useEffect(() => {
    if (!previewId || density === 'feed') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goPreviewRelative(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goPreviewRelative(1);
      } else if (e.key === 'Escape') {
        setPreviewId(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [previewId, density, goPreviewRelative]);

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
    <>
      {error && <p className="px-4 pt-2 text-sm text-red-600">{error}</p>}

      {density === 'feed' ? (
        <TemplatesFeedScroller
          rail={rail}
          templates={filtered}
          session={session}
          busy={busy}
          onBuild={(id) => void useTemplate(id)}
          fileIdByTemplateId={fileIdByTemplateId}
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

      {preview && previewId ? (
        <div
          className="pen-template-preview-overlay"
          role="presentation"
          onClick={() => setPreviewId(null)}
        >
          {density !== 'feed' && previewIndex > 0 ? (
            <button
              type="button"
              className="pen-template-preview-nav pen-template-preview-nav--prev"
              aria-label="Previous template"
              title="Previous"
              onClick={(e) => {
                e.stopPropagation();
                goPreviewRelative(-1);
              }}
            >
              <ChevronIcon dir="left" />
            </button>
          ) : null}
          {density !== 'feed' &&
          previewIndex >= 0 &&
          previewIndex < filtered.length - 1 ? (
            <button
              type="button"
              className="pen-template-preview-nav pen-template-preview-nav--next"
              aria-label="Next template"
              title="Next"
              onClick={(e) => {
                e.stopPropagation();
                goPreviewRelative(1);
              }}
            >
              <ChevronIcon dir="right" />
            </button>
          ) : null}
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
                  <SocialFeedPhonePreview
                    large
                    manifest={preview.manifest as never}
                    sections={preview.sections}
                    session={session}
                    templateId={previewId}
                    authorLabel={preview.authorDisplayName}
                    phoneActiveFeedId="pen-templates"
                  />
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
                fileId={previewFileId}
                authorLabel={preview.authorDisplayName}
                userPnIdentifier={session?.pnIdentifier}
                unlocked={Boolean(session?.pnIdentifier)}
                readOnly={!previewLive}
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
    </>
  );
}
