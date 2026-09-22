import { useEffect, useState } from 'react';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { docToHtml, docToPlainText, normalizeSection } from '@par-noir/pen-protocol';
import {
  loadLocalDoc,
  PEN_DOC_UPDATED_EVENT,
  type LocalDocBundle
} from '../services/penLocalStore';

function resolveSectionHtml(bundle: LocalDocBundle, sectionSlug: string | null): string {
  const sections = bundle.sections.map((s) => normalizeSection(s));
  const preferred =
    (sectionSlug && sections.find((s) => s.slug === sectionSlug)) ||
    sections.find((s) => s.slug === 'body') ||
    sections.find((s) => s.slug === 'caption') ||
    sections[0];
  if (!preferred) return '';
  return docToHtml(preferred.doc);
}

function resolveSnippet(bundle: LocalDocBundle, sectionSlug: string | null): string {
  const sections = bundle.sections.map((s) => normalizeSection(s));
  const preferred =
    (sectionSlug && sections.find((s) => s.slug === sectionSlug)) ||
    sections.find((s) => s.slug === 'body') ||
    sections[0];
  if (!preferred) return '';
  return docToPlainText(preferred.doc).trim().slice(0, 280);
}

/** Live-resolving embed card — updates when the source doc is saved. */
export function PenEmbedView({ node, extension, selected }: NodeViewProps) {
  const pn = String(extension.options.pnIdentifier || '');
  const docId = String(node.attrs.docId || '');
  const sectionSlug = (node.attrs.sectionSlug as string | null) || null;
  const titleHint = String(node.attrs.title || '');

  const [bundle, setBundle] = useState<LocalDocBundle | null>(() =>
    pn && docId ? loadLocalDoc(pn, docId) : null
  );
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!pn || !docId) {
      setBundle(null);
      return;
    }
    setBundle(loadLocalDoc(pn, docId));
  }, [pn, docId, tick]);

  useEffect(() => {
    const onUpdated = (e: Event) => {
      const detail = (e as CustomEvent<{ pn?: string; docId?: string }>).detail;
      if (detail?.docId && detail.docId !== docId) return;
      if (detail?.pn && detail.pn !== pn) return;
      setTick((n) => n + 1);
    };
    window.addEventListener(PEN_DOC_UPDATED_EVENT, onUpdated);
    return () => window.removeEventListener(PEN_DOC_UPDATED_EVENT, onUpdated);
  }, [pn, docId]);

  const title = bundle?.manifest.title || titleHint || 'Missing document';
  const html = bundle ? resolveSectionHtml(bundle, sectionSlug) : '';
  const missing = !bundle;

  return (
    <NodeViewWrapper
      className={`pen-embed-card ${selected ? 'is-selected' : ''} ${missing ? 'is-missing' : ''}`}
      data-pen-embed=""
      data-doc-id={docId}
      data-section-slug={sectionSlug || undefined}
    >
      <div className="pen-embed-card-head" contentEditable={false}>
        <span className="pen-embed-card-badge">Pen</span>
        <span className="pen-embed-card-title">{title}</span>
        {sectionSlug && <span className="pen-embed-card-section">{sectionSlug}</span>}
        <span className="pen-embed-card-live" title="Live reference — updates when source is saved">
          live
        </span>
      </div>
      <div className="pen-embed-card-body" contentEditable={false}>
        {missing ? (
          <p className="pen-embed-card-missing">Source document unavailable</p>
        ) : html.trim() ? (
          <div className="pen-rich-html" dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <p className="pen-embed-card-empty">{resolveSnippet(bundle!, sectionSlug) || 'Empty'}</p>
        )}
      </div>
    </NodeViewWrapper>
  );
}
