import { useMemo, useRef } from 'react';
import {
  createImageLayer,
  createTextLayer,
  docToHtml,
  ensureDefaultTextLayer,
  getTextLayerDoc,
  normalizeSection,
  upsertLayer,
  updateLayerLayout,
  type PenDocManifest,
  type PenPageLayer,
  type PenPageLayout,
  type PenSectionContent
} from '@par-noir/pen-protocol';
import { LayoutSurface, type LayoutItem } from '../layout';

function layerToItem(layer: PenPageLayer): LayoutItem {
  return {
    id: layer.id,
    x: layer.x,
    y: layer.y,
    w: layer.w,
    h: layer.h,
    zIndex: layer.zIndex
  };
}

function pageFrameClass(pageLayout: PenPageLayout | undefined): string {
  if (pageLayout === 'letter') return 'pen-page-letter';
  if (pageLayout === 'a4') return 'pen-page-a4';
  return 'max-w-[22rem] aspect-[3/4]';
}

/** Editable page surface — LayoutSurface over section layers (dual-pane right side). */
export function EditablePagePreview({
  manifest,
  section,
  activeLayerId,
  onSelectLayer,
  onSectionChange
}: {
  manifest: PenDocManifest;
  section: PenSectionContent;
  activeLayerId: string | null;
  onSelectLayer: (id: string | null) => void;
  onSectionChange: (next: PenSectionContent) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const prepared = useMemo(() => ensureDefaultTextLayer(normalizeSection(section)), [section]);
  const layers = prepared.layers || [];
  const items = layers.map(layerToItem);

  function commitSection(next: PenSectionContent) {
    onSectionChange(next);
  }

  function onLayoutChange(nextItems: LayoutItem[]) {
    commitSection(updateLayerLayout(prepared, nextItems));
  }

  function addText() {
    const layer = createTextLayer({
      x: 12,
      y: 12 + (layers.length % 4) * 8,
      w: 50,
      h: 24,
      zIndex: layers.reduce((m, l) => Math.max(m, l.zIndex), 0) + 1
    });
    const next = upsertLayer(prepared, layer);
    commitSection(next);
    onSelectLayer(layer.id);
  }

  function addImageFromFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const src = String(reader.result || '');
      if (!src) return;
      const layer = createImageLayer(src, {
        x: 25,
        y: 25,
        w: 35,
        h: 30,
        zIndex: layers.reduce((m, l) => Math.max(m, l.zIndex), 0) + 1
      });
      commitSection(upsertLayer(prepared, layer));
      onSelectLayer(layer.id);
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="flex h-full flex-col bg-stone-200/90">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-stone-300 bg-stone-100 px-3 py-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
          Page
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="rounded border border-stone-300 bg-white px-2 py-0.5 text-[11px] text-stone-700 hover:bg-stone-50"
            onClick={addText}
          >
            Add text
          </button>
          <button
            type="button"
            className="rounded border border-stone-300 bg-white px-2 py-0.5 text-[11px] text-stone-700 hover:bg-stone-50"
            onClick={() => fileRef.current?.click()}
          >
            Add image
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) addImageFromFile(f);
              e.target.value = '';
            }}
          />
        </div>
      </div>
      <div className="flex flex-1 items-start justify-center overflow-auto p-6">
        <div
          className={`relative w-full overflow-hidden rounded-sm border border-stone-300 bg-white shadow-lg ${pageFrameClass(
            manifest.pageLayout
          )}`}
        >
          <LayoutSurface
            className="h-full min-h-[28rem] w-full"
            items={items}
            selectedId={activeLayerId}
            onSelect={onSelectLayer}
            onChange={onLayoutChange}
            renderItem={(item) => {
              const layer = layers.find((l) => l.id === item.id);
              if (!layer) return null;
              if (layer.kind === 'image' && layer.imageSrc) {
                return (
                  <img
                    src={layer.imageSrc}
                    alt=""
                    className="h-full w-full object-contain"
                    draggable={false}
                  />
                );
              }
              const html = docToHtml(getTextLayerDoc(layer));
              return (
                <div
                  className="h-full w-full overflow-auto p-2 text-sm text-stone-800"
                  dangerouslySetInnerHTML={{ __html: html || '<p class="text-stone-400">Text</p>' }}
                />
              );
            }}
          />
        </div>
      </div>
      {layers.length > 0 && (
        <div className="flex shrink-0 gap-1 overflow-x-auto border-t border-stone-300 bg-stone-100 px-2 py-1">
          {layers
            .slice()
            .sort((a, b) => a.zIndex - b.zIndex)
            .map((l, i) => (
              <button
                key={l.id}
                type="button"
                onClick={() => onSelectLayer(l.id)}
                className={`shrink-0 rounded px-2 py-0.5 text-[11px] ${
                  activeLayerId === l.id
                    ? 'bg-sky-100 text-sky-900'
                    : 'bg-white text-stone-600 hover:bg-stone-50'
                }`}
              >
                {l.kind === 'image' ? `Image ${i + 1}` : `Text ${i + 1}`}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
