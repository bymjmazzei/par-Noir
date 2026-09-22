import React, { useEffect, useRef, useState } from 'react';
import type { PenFlowBlock, PenSectionContent } from '@par-noir/pen-protocol';

function newId(): string {
  return `b_${crypto.randomUUID().slice(0, 8)}`;
}

function ensureBlocks(section: PenSectionContent): PenFlowBlock[] {
  if (section.blocks.length > 0) return section.blocks;
  return [{ id: newId(), type: 'paragraph', text: '' }];
}

function wrapSelection(el: HTMLTextAreaElement, before: string, after = before): string {
  const start = el.selectionStart;
  const end = el.selectionEnd;
  const value = el.value;
  const selected = value.slice(start, end) || 'text';
  return value.slice(0, start) + before + selected + after + value.slice(end);
}

/** Flow-first editor with a sticky format bar (word-processor chrome). */
export function FlowEditor({
  section,
  onChange,
  readOnly
}: {
  section: PenSectionContent;
  onChange: (next: PenSectionContent) => void;
  readOnly?: boolean;
}) {
  const blocks = ensureBlocks(section);
  const [focusId, setFocusId] = useState(blocks[0]?.id || '');
  const areaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  useEffect(() => {
    if (!section.blocks.length) {
      onChange({ ...section, blocks: [{ id: newId(), type: 'paragraph', text: '' }] });
    }
  }, [section.blocks.length]); // seed empty section once

  function commit(nextBlocks: PenFlowBlock[]) {
    onChange({ ...section, blocks: nextBlocks });
  }

  function updateBlock(id: string, patch: Partial<PenFlowBlock>) {
    commit(blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }

  function focused(): PenFlowBlock | undefined {
    return blocks.find((b) => b.id === focusId) || blocks[0];
  }

  function setFocusedType(type: PenFlowBlock['type'], level?: number) {
    const f = focused();
    if (!f || readOnly) return;
    updateBlock(f.id, { type, level });
  }

  function applyWrap(before: string, after?: string) {
    const f = focused();
    if (!f || readOnly || f.type === 'image') return;
    const el = areaRefs.current[f.id];
    if (!el) return;
    const next = wrapSelection(el, before, after);
    updateBlock(f.id, { text: next });
    requestAnimationFrame(() => {
      el.focus();
      const pos = el.selectionStart + before.length;
      el.setSelectionRange(pos, pos + (el.selectionEnd - el.selectionStart || 4));
    });
  }

  function addParagraphAfter(id?: string) {
    const nid = newId();
    const i = id ? blocks.findIndex((b) => b.id === id) : blocks.length - 1;
    const next = [...blocks];
    next.splice(i + 1, 0, { id: nid, type: 'paragraph', text: '' });
    commit(next);
    setFocusId(nid);
  }

  function addImage() {
    const ref = window.prompt('Image URL or attachment id') || '';
    if (!ref.trim()) return;
    const nid = newId();
    commit([...blocks, { id: nid, type: 'image', ref: ref.trim(), text: '' }]);
    setFocusId(nid);
  }

  function remove(id: string) {
    if (blocks.length <= 1) {
      commit([{ id: newId(), type: 'paragraph', text: '' }]);
      return;
    }
    commit(blocks.filter((b) => b.id !== id));
  }

  const active = focused();

  return (
    <div className="space-y-0">
      {!readOnly && (
        <div className="sticky top-0 z-20 -mx-1 mb-4 flex flex-wrap items-center gap-0.5 rounded-lg border border-line bg-white/95 px-2 py-1.5 shadow-sm backdrop-blur">
          <button
            type="button"
            className="pen-toolbar-btn font-semibold"
            aria-pressed={active?.type === 'heading' && active.level === 1}
            onClick={() => setFocusedType('heading', 1)}
            title="Heading"
          >
            H1
          </button>
          <button
            type="button"
            className="pen-toolbar-btn font-semibold"
            aria-pressed={active?.type === 'heading' && active.level === 2}
            onClick={() => setFocusedType('heading', 2)}
            title="Subheading"
          >
            H2
          </button>
          <button
            type="button"
            className="pen-toolbar-btn"
            aria-pressed={active?.type === 'paragraph'}
            onClick={() => setFocusedType('paragraph')}
            title="Body"
          >
            Body
          </button>
          <span className="mx-1 h-5 w-px bg-line" />
          <button type="button" className="pen-toolbar-btn font-bold" onClick={() => applyWrap('**')} title="Bold">
            B
          </button>
          <button type="button" className="pen-toolbar-btn italic" onClick={() => applyWrap('*')} title="Italic">
            I
          </button>
          <span className="mx-1 h-5 w-px bg-line" />
          <button
            type="button"
            className="pen-toolbar-btn"
            aria-pressed={active?.type === 'quote'}
            onClick={() => setFocusedType('quote')}
            title="Quote"
          >
            “”
          </button>
          <button
            type="button"
            className="pen-toolbar-btn"
            aria-pressed={active?.type === 'list'}
            onClick={() => setFocusedType('list')}
            title="List"
          >
            • List
          </button>
          <span className="mx-1 h-5 w-px bg-line" />
          <button type="button" className="pen-toolbar-btn" onClick={() => addParagraphAfter(focusId)} title="New block">
            ¶+
          </button>
          <button type="button" className="pen-toolbar-btn" onClick={addImage} title="Insert image">
            Image
          </button>
        </div>
      )}

      <div className="space-y-1">
        {blocks.map((b) => {
          if (b.type === 'image') {
            return (
              <div
                key={b.id}
                className={`group relative my-4 rounded-md border border-dashed border-line bg-stone-50 p-4 ${
                  focusId === b.id ? 'ring-2 ring-accent/30' : ''
                }`}
                onClick={() => setFocusId(b.id)}
              >
                <div className="text-xs uppercase tracking-wide text-mute">Image</div>
                <div className="mt-1 break-all font-ui text-sm text-stone-700">{b.ref}</div>
                {!readOnly && (
                  <button
                    type="button"
                    className="absolute right-2 top-2 text-xs text-mute opacity-0 group-hover:opacity-100"
                    onClick={() => remove(b.id)}
                  >
                    Remove
                  </button>
                )}
              </div>
            );
          }

          const isH = b.type === 'heading';
          const isQuote = b.type === 'quote';
          const isList = b.type === 'list';
          const textClass = isH
            ? b.level === 1
              ? 'font-display text-3xl font-semibold leading-tight'
              : 'font-display text-xl font-semibold leading-snug'
            : isQuote
              ? 'border-l-4 border-stone-300 pl-4 font-display text-lg italic text-stone-600'
              : isList
                ? 'font-display text-lg leading-relaxed before:mr-2 before:content-["•"]'
                : 'font-display text-lg leading-relaxed';

          return (
            <div key={b.id} className="relative">
              <textarea
                ref={(el) => {
                  areaRefs.current[b.id] = el;
                }}
                className={`w-full resize-none bg-transparent outline-none ${textClass}`}
                rows={Math.max(1, (b.text || '').split('\n').length)}
                value={b.text || ''}
                readOnly={readOnly}
                placeholder={isH ? 'Heading' : 'Start writing…'}
                onFocus={() => setFocusId(b.id)}
                onChange={(e) => {
                  updateBlock(b.id, { text: e.target.value });
                  e.target.style.height = 'auto';
                  e.target.style.height = `${e.target.scrollHeight}px`;
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !(b.text || '').includes('\n')) {
                    e.preventDefault();
                    addParagraphAfter(b.id);
                  }
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function PageGrid({
  toc,
  active,
  onSelect
}: {
  toc: string[];
  active: string;
  onSelect: (slug: string) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
      {toc.map((slug, i) => (
        <button
          key={slug}
          type="button"
          onClick={() => onSelect(slug)}
          className={`aspect-[3/4] rounded-md border p-3 text-left text-xs transition ${
            active === slug
              ? 'border-accent bg-teal-50 shadow-sm'
              : 'border-line bg-white hover:border-stone-300'
          }`}
        >
          <div className="text-mute">Page {i + 1}</div>
          <div className="mt-2 truncate font-medium capitalize text-ink">{slug}</div>
        </button>
      ))}
    </div>
  );
}
