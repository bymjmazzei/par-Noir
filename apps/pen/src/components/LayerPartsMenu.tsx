import { useEffect, useMemo, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import {
  insertLayerPart,
  listLayerParts,
  partIdAtContentIndex,
  type InsertLayerPartKind,
  type LayerPart,
  type PenTipTapNode
} from '@par-noir/pen-protocol';

export interface DocSectionTocItem {
  slug: string;
  title: string;
  required?: boolean;
}

/**
 * Writing ▾ — parts outline of the active object (Body or text layer).
 * When the document has multiple IR sections, a Document group sits above Parts.
 */
export function LayerPartsMenu({
  doc,
  editor,
  onDocChange,
  writingEnabled,
  documentSections,
  activeSlug,
  onSelectDocumentSection
}: {
  doc: PenTipTapNode | undefined;
  editor: Editor | null;
  onDocChange: (next: PenTipTapNode) => void;
  writingEnabled: boolean;
  documentSections?: DocSectionTocItem[];
  activeSlug?: string;
  onSelectDocumentSection?: (slug: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [activePartId, setActivePartId] = useState('body');
  const [addOpen, setAddOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const parts = useMemo(() => listLayerParts(doc), [doc]);
  const activePart: LayerPart = parts.find((p) => p.id === activePartId) || parts[0]!;
  const showDocument = Boolean(documentSections && documentSections.length > 1);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setAddOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  useEffect(() => {
    if (!editor) return;
    const sync = () => {
      const index = editor.state.selection.$from.index(0);
      setActivePartId(partIdAtContentIndex(doc, index));
    };
    editor.on('selectionUpdate', sync);
    editor.on('update', sync);
    sync();
    return () => {
      editor.off('selectionUpdate', sync);
      editor.off('update', sync);
    };
  }, [editor, doc]);

  function jumpToPart(part: LayerPart) {
    setActivePartId(part.id);
    setOpen(false);
    if (!editor) return;
    let targetPos = 1;
    let i = 0;
    editor.state.doc.forEach((_node, offset) => {
      if (i === part.index) targetPos = offset + 1;
      i += 1;
    });
    editor.chain().focus().setTextSelection(targetPos).run();
  }

  function addPart(kind: InsertLayerPartKind) {
    if (!writingEnabled) return;
    const next = insertLayerPart(doc, kind);
    const nextParts = listLayerParts(next);
    const last = nextParts[nextParts.length - 1];
    if (last) setActivePartId(last.id);
    onDocChange(next);
    setAddOpen(false);
    setOpen(false);
  }

  return (
    <div className="relative flex min-w-0 items-center gap-1" ref={rootRef}>
      <button
        type="button"
        className="inline-flex max-w-full items-center gap-1 rounded border border-stone-300 bg-white px-2.5 py-1 text-[12px] font-medium text-stone-800 hover:bg-stone-50 disabled:opacity-50"
        aria-expanded={open}
        disabled={!writingEnabled && !showDocument}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="truncate">{activePart?.label || 'Body'}</span>
        <span className="shrink-0 text-[10px] text-stone-400" aria-hidden>
          ▾
        </span>
      </button>
      {writingEnabled && (
        <div className="relative">
          <button
            type="button"
            title="Add part"
            aria-label="Add part"
            className="inline-flex h-7 w-7 items-center justify-center rounded border border-stone-300 bg-white text-stone-700 hover:bg-stone-50"
            onClick={() => setAddOpen((v) => !v)}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </button>
          {addOpen && (
            <div className="absolute left-0 top-full z-40 mt-1 min-w-[9rem] overflow-hidden rounded-md border border-stone-200 bg-white py-1 shadow-lg">
              <button
                type="button"
                className="flex w-full px-2.5 py-1.5 text-left text-[12px] text-stone-700 hover:bg-stone-50"
                onClick={() => addPart('heading')}
              >
                Heading
              </button>
              <button
                type="button"
                className="flex w-full px-2.5 py-1.5 text-left text-[12px] text-stone-700 hover:bg-stone-50"
                onClick={() => addPart('blockquote')}
              >
                Quote
              </button>
              <button
                type="button"
                className="flex w-full px-2.5 py-1.5 text-left text-[12px] text-stone-700 hover:bg-stone-50"
                onClick={() => addPart('paragraph')}
              >
                Paragraph
              </button>
            </div>
          )}
        </div>
      )}
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 min-w-[12rem] max-w-[18rem] overflow-hidden rounded-md border border-stone-200 bg-white py-1 shadow-lg">
          {showDocument && documentSections && (
            <>
              <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-stone-400">
                Document
              </div>
              {documentSections.map((s) => (
                <button
                  key={s.slug}
                  type="button"
                  className={`flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-[12px] ${
                    s.slug === activeSlug
                      ? 'bg-sky-50 font-medium text-sky-950'
                      : 'text-stone-700 hover:bg-stone-50'
                  }`}
                  onClick={() => {
                    onSelectDocumentSection?.(s.slug);
                    setOpen(false);
                  }}
                >
                  <span className="truncate">{s.title}</span>
                </button>
              ))}
            </>
          )}
          <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-stone-400">
            Parts
          </div>
          {!writingEnabled && (
            <p className="px-2.5 py-1.5 text-[11px] text-stone-400">
              Select Body or a text layer to write.
            </p>
          )}
          {writingEnabled &&
            parts.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-[12px] ${
                  p.id === activePart.id
                    ? 'bg-sky-50 font-medium text-sky-950'
                    : 'text-stone-700 hover:bg-stone-50'
                }`}
                onClick={() => jumpToPart(p)}
              >
                <span className="truncate">{p.label}</span>
                {p.kind === 'heading' && (
                  <span className="shrink-0 text-[10px] text-stone-400">H{p.level || 1}</span>
                )}
                {p.kind === 'blockquote' && (
                  <span className="shrink-0 text-[10px] text-stone-400">Quote</span>
                )}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
