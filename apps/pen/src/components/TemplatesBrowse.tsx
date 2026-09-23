/** Templates catalog as taxonomy directory (Category → Form → Template). */

import { useMemo, useState } from 'react';
import {
  emptySection,
  getClass,
  getTemplate,
  listConsumerCategories,
  listStarterTemplates,
  listTemplatesGroupedByCategory,
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
import { ExplorerFolderGlyph } from './ExplorerFolderGlyph';

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

function Chevron({ expanded }: { expanded: boolean }) {
  return (
    <span className="pen-explorer-chevron" aria-expanded={expanded} aria-hidden>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
        <path
          d="M6 9l6 6 6-6"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function templatePreviewBundle(pn: string | undefined, templateId: string) {
  if (pn && isPersonalTemplateId(templateId)) {
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
  onSaved,
  onRequestUnlock
}: {
  session: PenSession | null;
  density: PenBrowseDensity;
  onDensity: (d: PenBrowseDensity) => void;
  onBack: () => void;
  onCreated: (docId: string) => void;
  onSaved?: () => void;
  /** When locked, creating requires unlock. */
  onRequestUnlock?: () => void;
}) {
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedHint, setSavedHint] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(() =>
    new Set(listConsumerCategories().map((c) => c.id))
  );
  const [expandedForms, setExpandedForms] = useState<Set<string>>(() => new Set());

  const catalog: PenTemplate[] = useMemo(
    () =>
      listStarterTemplates().filter((t) => {
        const form = getClass(t.classId);
        return !form || form.audience !== 'kit';
      }),
    []
  );

  const grouped = useMemo(
    () => listTemplatesGroupedByCategory(catalog, listConsumerCategories()),
    [catalog]
  );

  const flatForGallery = useMemo(
    () => grouped.flatMap((g) => g.forms.flatMap((f) => f.templates)),
    [grouped]
  );

  const preview = previewId
    ? templatePreviewBundle(session?.pnIdentifier, previewId)
    : null;

  function toggleCategory(id: string) {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleForm(id: string) {
    setExpandedForms((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

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
      onCreated(bundle.manifest.docId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create document');
    } finally {
      setBusy(false);
    }
  }

  function saveToMyTemplates(templateId: string) {
    if (!session) {
      onRequestUnlock?.();
      setError('Unlock to save templates.');
      return;
    }
    setError(null);
    try {
      ensureMyTemplatesNotebook(session.pnIdentifier);
      savePersonalTemplateFromCatalog(session.pnIdentifier, templateId);
      setSavedHint(true);
      window.setTimeout(() => setSavedHint(false), 1600);
      onSaved?.();
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
            title={session ? 'Use template' : 'Unlock to use'}
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
            ← {session ? 'My Library' : 'Pen'}
          </button>
          <h1 className="text-lg font-bold text-black">Templates</h1>
          <p className="text-sm text-neutral-500">
            Browse by category and form. Open a template to preview.
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
          {flatForGallery.length === 0 ? (
            <p className="pen-library-indent py-10 text-sm text-neutral-500">No templates available.</p>
          ) : density === 'gallery' ? (
            <div className="pen-gallery-wrap">
              <div className="pen-gallery-head" aria-hidden />
              <div className="pen-gallery">
                {grouped.map((g) => (
                  <div key={g.category.id} className="pen-template-gallery-group">
                    <h2 className="pen-template-dir-heading">{g.category.title}</h2>
                    {g.forms.map(({ form, templates }) =>
                      templates.length === 0 ? null : (
                        <div key={form.id} className="pen-template-gallery-form">
                          <h3 className="pen-template-dir-subheading">{form.title}</h3>
                          <div className="pen-gallery-tiles pen-gallery-tiles--lg">
                            {templates.map((t) => (
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
                                    <TemplateThumb
                                      pn={session?.pnIdentifier}
                                      templateId={t.id}
                                    />
                                  </span>
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="pen-explorer">
              <div className="pen-explorer-sticky-head">
                <div className="pen-explorer-scroll">
                  <table className="pen-explorer-table w-full text-left text-sm">
                    <thead className="text-[11px] tracking-wide">
                      <tr>
                        <th className="pen-explorer-action" aria-hidden />
                        <th className="pen-explorer-name-header px-3">Name</th>
                        <th className="pen-explorer-col-category px-3">Kind</th>
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
                      {grouped.map((g) => {
                        const catOpen = expandedCategories.has(g.category.id);
                        return (
                          <CategoryDirBlock
                            key={g.category.id}
                            categoryTitle={g.category.title}
                            categoryId={g.category.id}
                            expanded={catOpen}
                            onToggle={() => toggleCategory(g.category.id)}
                            forms={g.forms}
                            expandedForms={expandedForms}
                            onToggleForm={toggleForm}
                            onOpenTemplate={setPreviewId}
                          />
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

function CategoryDirBlock({
  categoryTitle,
  categoryId,
  expanded,
  onToggle,
  forms,
  expandedForms,
  onToggleForm,
  onOpenTemplate
}: {
  categoryTitle: string;
  categoryId: string;
  expanded: boolean;
  onToggle: () => void;
  forms: Array<{ form: { id: string; title: string }; templates: PenTemplate[] }>;
  expandedForms: Set<string>;
  onToggleForm: (id: string) => void;
  onOpenTemplate: (id: string) => void;
}) {
  void categoryId;
  return (
    <>
      <tr
        className={`pen-explorer-row pen-explorer-row--folder cursor-pointer ${
          expanded ? 'pen-explorer-row--folder-open' : ''
        }`}
        onClick={onToggle}
      >
        <td className="pen-explorer-action px-2 py-2 text-center">
          <span className="inline-block h-4 w-4" aria-hidden />
        </td>
        <td className="pen-explorer-name-cell px-3 py-2">
          <span className="pen-explorer-name-label text-black">
            <Chevron expanded={expanded} />
            <ExplorerFolderGlyph open={expanded} />
            <span className="min-w-0 truncate font-bold">{categoryTitle}</span>
          </span>
        </td>
        <td className="pen-explorer-col-category px-3 py-2 text-xs text-neutral-500">Category</td>
        <td className="pen-explorer-col-form px-3 py-2 text-xs text-black">—</td>
      </tr>
      {expanded &&
        forms.map(({ form, templates }) => {
          if (templates.length === 0) return null;
          const formOpen = expandedForms.has(form.id);
          return (
            <FormDirBlock
              key={form.id}
              formTitle={form.title}
              formId={form.id}
              expanded={formOpen}
              onToggle={() => onToggleForm(form.id)}
              templates={templates}
              onOpenTemplate={onOpenTemplate}
            />
          );
        })}
    </>
  );
}

function FormDirBlock({
  formTitle,
  formId,
  expanded,
  onToggle,
  templates,
  onOpenTemplate
}: {
  formTitle: string;
  formId: string;
  expanded: boolean;
  onToggle: () => void;
  templates: PenTemplate[];
  onOpenTemplate: (id: string) => void;
}) {
  void formId;
  return (
    <>
      <tr
        className={`pen-explorer-row pen-explorer-row--folder pen-explorer-row--child cursor-pointer ${
          expanded ? 'pen-explorer-row--folder-open' : ''
        }`}
        onClick={onToggle}
      >
        <td className="pen-explorer-action px-2 py-2 text-center">
          <span className="inline-block h-4 w-4" aria-hidden />
        </td>
        <td className="pen-explorer-name-cell pen-explorer-name-indent px-3 py-2">
          <span className="pen-explorer-name-label text-black">
            <Chevron expanded={expanded} />
            <ExplorerFolderGlyph open={expanded} />
            <span className="min-w-0 truncate font-medium">{formTitle}</span>
          </span>
        </td>
        <td className="pen-explorer-col-category px-3 py-2 text-xs text-neutral-500">Form</td>
        <td className="pen-explorer-col-form px-3 py-2 text-xs text-black">{formTitle}</td>
      </tr>
      {expanded &&
        templates.map((t) => (
          <tr
            key={t.id}
            className="pen-explorer-row pen-explorer-row--child pen-explorer-row--child-depth-2 cursor-pointer"
            onClick={() => onOpenTemplate(t.id)}
          >
            <td className="pen-explorer-action px-2 py-2 text-center">
              <span className="inline-block h-4 w-4" aria-hidden />
            </td>
            <td className="pen-explorer-name-cell pen-explorer-name-indent-2 px-3 py-2 font-medium text-black">
              <span className="pen-explorer-name-label">
                <span className="pen-explorer-twisty-spacer" aria-hidden />
                <span className="min-w-0 truncate">{t.title}</span>
              </span>
            </td>
            <td className="pen-explorer-col-category px-3 py-2 text-xs text-neutral-500">Template</td>
            <td className="pen-explorer-col-form px-3 py-2 text-xs text-black">{formTitle}</td>
          </tr>
        ))}
    </>
  );
}

function TemplateThumb({ pn, templateId }: { pn?: string; templateId: string }) {
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
