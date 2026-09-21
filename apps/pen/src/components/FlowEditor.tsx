import React, { useMemo, useState } from 'react';
import type { PenFlowBlock, PenSectionContent } from '@par-noir/pen-protocol';

/** Flow-first editor: blocks reflow; images are inline blocks (no pasteboard). */
export function FlowEditor({
  section,
  onChange,
  readOnly
}: {
  section: PenSectionContent;
  onChange: (next: PenSectionContent) => void;
  readOnly?: boolean;
}) {
  const blocks = section.blocks;

  function updateBlock(id: string, patch: Partial<PenFlowBlock>) {
    onChange({
      ...section,
      blocks: blocks.map((b) => (b.id === id ? { ...b, ...patch } : b))
    });
  }

  function addParagraph() {
    const id = `b_${crypto.randomUUID().slice(0, 8)}`;
    onChange({
      ...section,
      blocks: [...blocks, { id, type: 'paragraph', text: '' }]
    });
  }

  function addImage() {
    const id = `b_${crypto.randomUUID().slice(0, 8)}`;
    const ref = window.prompt('Image ref / URL (attachment id)') || 'image';
    onChange({
      ...section,
      blocks: [...blocks, { id, type: 'image', ref, text: '' }]
    });
  }

  function move(id: string, dir: -1 | 1) {
    const i = blocks.findIndex((b) => b.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= blocks.length) return;
    const next = [...blocks];
    const tmp = next[i]!;
    next[i] = next[j]!;
    next[j] = tmp;
    onChange({ ...section, blocks: next });
  }

  function remove(id: string) {
    onChange({ ...section, blocks: blocks.filter((b) => b.id !== id) });
  }

  return (
    <div className="space-y-3">
      {blocks.map((b) => (
        <div key={b.id} className="rounded-lg border border-white/10 p-3 bg-black/20">
          {b.type === 'image' ? (
            <div className="flex items-center gap-3">
              <div className="w-16 h-16 rounded bg-neutral-800 flex items-center justify-center text-xs text-neutral-400">
                img
              </div>
              <div className="flex-1 text-sm text-neutral-300">{b.ref}</div>
            </div>
          ) : (
            <textarea
              className="w-full bg-transparent resize-y min-h-[4rem] outline-none text-base leading-relaxed"
              value={b.text || ''}
              readOnly={readOnly}
              placeholder="Write…"
              onChange={(e) => updateBlock(b.id, { text: e.target.value })}
            />
          )}
          {!readOnly && (
            <div className="flex gap-2 mt-2 text-xs text-neutral-500">
              <button type="button" onClick={() => move(b.id, -1)}>
                Up
              </button>
              <button type="button" onClick={() => move(b.id, 1)}>
                Down
              </button>
              <button type="button" onClick={() => remove(b.id)}>
                Remove
              </button>
            </div>
          )}
        </div>
      ))}
      {!readOnly && (
        <div className="flex gap-2">
          <button
            type="button"
            className="text-sm px-3 py-1.5 rounded border border-white/15 hover:bg-white/5"
            onClick={addParagraph}
          >
            Add text
          </button>
          <button
            type="button"
            className="text-sm px-3 py-1.5 rounded border border-white/15 hover:bg-white/5"
            onClick={addImage}
          >
            Add image
          </button>
        </div>
      )}
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
  const pages = useMemo(() => toc, [toc]);
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
      {pages.map((slug, i) => (
        <button
          key={slug}
          type="button"
          onClick={() => onSelect(slug)}
          className={`aspect-[3/4] rounded border text-xs p-2 ${
            active === slug ? 'border-white bg-white/10' : 'border-white/15 hover:bg-white/5'
          }`}
        >
          <div className="text-neutral-500">{i + 1}</div>
          <div className="mt-2 truncate">{slug}</div>
        </button>
      ))}
    </div>
  );
}
