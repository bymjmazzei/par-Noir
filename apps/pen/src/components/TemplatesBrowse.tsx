/** Templates catalog browse + preview (starter pack). */

import { useMemo, useState } from 'react';
import {
  emptySection,
  getClass,
  getTemplate,
  listStarterTemplates,
  requireTemplate,
  type PenTemplate
} from '@par-noir/pen-protocol';
import type { PenSession } from '../App';
import { TemplateLivePreview } from './TemplateLivePreview';
import {
  isPersonalTemplateId,
  loadPersonalTemplate,
  savePersonalTemplateFromCatalog
} from '../services/penPersonalTemplates';
import { createDocFromPersonalOrStarter } from '../services/penPublish';
import { ensureMyTemplatesNotebook } from '../services/penFolders';
import type { PenBrowseDensity } from '../services/penClassPrefs';

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

function templatePreviewBundle(pn: string, templateId: string) {
  if (isPersonalTemplateId(templateId)) {
    const personal = loadPersonalTemplate(pn, templateId);
    if (!personal) return null;
    const based = getTemplate(personal.basedOnTemplateId);
    return {
      title: personal.title,
      description: based?.description || 'Personal template',
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
    sections: t.sections.map((s) => emptySection(s.slug))
  };
}

export function TemplatesBrowse({
  session,
  density,
  onDensity,
  onBack,
  onCreated,
  onSaved
}: {
  session: PenSession;
  density: PenBrowseDensity;
  onDensity: (d: PenBrowseDensity) => void;
  onBack: () => void;
  onCreated: (docId: string) => void;
  onSaved: () => void;
}) {
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedHint, setSavedHint] = useState(false);

  const catalog: PenTemplate[] = useMemo(
    () =>
      listStarterTemplates().filter((t) => {
        const form = getClass(t.classId);
        return !form || form.audience !== 'kit';
      }),
    []
  );

  const preview = previewId ? templatePreviewBundle(session.pnIdentifier, previewId) : null;

  async function useTemplate(templateId: string) {
    setBusy(true);
    setError(null);
    try {
      const bundle = await createDocFromPersonalOrStarter({
        session,
        templateId
      });
      onCreated(bundle.manifest.docId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create document');
    } finally {
      setBusy(false);
    }
  }

  function saveToMyTemplates(templateId: string) {
    setError(null);
    try {
      ensureMyTemplatesNotebook(session.pnIdentifier);
      savePersonalTemplateFromCatalog(session.pnIdentifier, templateId);
      setSavedHint(true);
      window.setTimeout(() => setSavedHint(false), 1600);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save template');
    }
  }

  if (preview && previewId) {
    return (
      <div className="pen-library-body flex min-h-0 flex-1 flex-col">
        <div className="pen-template-preview-chrome">
          <div className="min-w-0">
            <button
              type="button"
              className="text-sm text-neutral-600 hover:text-black"
              onClick={() => setPreviewId(null)}
            >
              ← Back
            </button>
            <h2 className="truncate text-base font-bold text-black">{preview.title}</h2>
            {preview.description && (
              <p className="truncate text-xs text-neutral-500">{preview.description}</p>
            )}
          </div>
          <button
            type="button"
            disabled={busy}
            title="Use template"
            aria-label="Use template"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center border border-neutral-300 bg-white text-xl font-light text-black hover:bg-neutral-50 disabled:opacity-30"
            onClick={() => void useTemplate(previewId)}
          >
            +
          </button>
        </div>
        {error && <p className="px-4 pt-2 text-sm text-red-600">{error}</p>}
        <div className="pen-template-preview-frame">
          <div className="mx-auto max-w-lg overflow-hidden rounded-lg border border-neutral-200 bg-neutral-950 shadow-sm">
            <TemplateLivePreview
              manifest={preview.manifest as never}
              sections={preview.sections}
            />
          </div>
        </div>
        <div className="pen-template-save-ribbon" role="toolbar" aria-label="Template actions">
          <button
            type="button"
            disabled={busy}
            className="pen-ribbon-btn"
            onClick={() => saveToMyTemplates(previewId)}
          >
            {savedHint ? 'Saved' : 'Save to My templates'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="pen-library-heading">
        <div className="min-w-0 flex-1">
          <button
            type="button"
            className="text-sm text-neutral-600 hover:text-black"
            onClick={onBack}
          >
            ← My Library
          </button>
          <h1 className="text-lg font-bold text-black">Templates</h1>
          <p className="text-sm text-neutral-500">
            Browse starter templates. Open one to preview, then + to create.
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
          </div>
        </div>
      </div>

      {error && <p className="px-4 pt-2 text-sm text-red-600">{error}</p>}

      <div className="pen-library-body">
        <div className="pen-library-sheet">
        {catalog.length === 0 ? (
          <p className="pen-library-indent py-10 text-sm text-neutral-500">No templates available.</p>
        ) : density === 'gallery' ? (
          <div className="pen-gallery-wrap">
            <div className="pen-gallery-head" aria-hidden />
            <div className="pen-gallery">
              <div className="pen-gallery-tiles pen-gallery-tiles--lg">
                {catalog.map((t) => (
                  <div key={t.id} className="pen-gallery-slot pen-gallery-slot--lg">
                    <button
                      type="button"
                      className="pen-gallery-tile pen-gallery-tile--lg"
                      onClick={() => setPreviewId(t.id)}
                    >
                      <div className="pen-gallery-tile-title">
                        <span className="pen-gallery-tile-title-text">{t.title}</span>
                      </div>
                      <span className="pen-gallery-tile-preview relative bg-neutral-100">
                        <TemplateThumb pn={session.pnIdentifier} templateId={t.id} />
                      </span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="pen-explorer">
            <div className="pen-explorer-sticky-head">
              <div className="pen-explorer-scroll">
                <table className="pen-explorer-table w-full text-left text-sm">
                  <thead className="text-[11px] tracking-wide">
                    <tr>
                      <th className="pen-explorer-name-header px-3">Name</th>
                      <th className="pen-explorer-col-category px-3">Category</th>
                      <th className="pen-explorer-col-form px-3">Form</th>
                    </tr>
                  </thead>
                </table>
              </div>
              <div className="pen-library-title-rule" aria-hidden />
            </div>
            <div className="pen-explorer-body">
              <div className="pen-explorer-scroll">
                <table className="pen-explorer-table w-full text-left text-sm">
                  <tbody>
                    {catalog.map((t) => {
                      const form = getClass(t.classId);
                      const cat = form?.parentId ? getClass(form.parentId) : undefined;
                      return (
                        <tr
                          key={t.id}
                          className="cursor-pointer hover:bg-neutral-50"
                          onClick={() => setPreviewId(t.id)}
                        >
                          <td className="pen-explorer-name-cell px-3 py-2 font-medium text-black">
                            {t.title}
                          </td>
                          <td className="pen-explorer-col-category px-3 py-2 text-xs text-black">
                            {cat?.title || '—'}
                          </td>
                          <td className="pen-explorer-col-form px-3 py-2 text-xs text-black">
                            {form?.title || '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}

function TemplateThumb({ pn, templateId }: { pn: string; templateId: string }) {
  const preview = templatePreviewBundle(pn, templateId);
  if (!preview) {
    return (
      <span className="flex h-full items-center justify-center text-[10px] text-neutral-500">—</span>
    );
  }
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute left-1/2 top-0 origin-top -translate-x-1/2 scale-[0.5]">
        <div className="h-[360px] w-[200px]">
          <TemplateLivePreview
            manifest={preview.manifest as never}
            sections={preview.sections}
            compact
          />
        </div>
      </div>
    </div>
  );
}
