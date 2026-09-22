import { useMemo, useRef, type CSSProperties } from 'react';
import {
  createImageLayer,
  createTextLayer,
  createVideoLayer,
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

function layerShellStyle(layer: PenPageLayer): CSSProperties {
  const style: React.CSSProperties = {
    backgroundColor: layer.backgroundColor || 'rgba(255,255,255,0.95)',
    textShadow: layer.textShadow,
    filter: layer.blur ? `blur(${layer.blur}px)` : undefined
  };
  if (layer.backgroundImage) {
    style.backgroundImage = `url(${layer.backgroundImage})`;
    style.backgroundSize = 'cover';
    style.backgroundPosition = 'center';
  }
  return style;
}

/** Editable page surface — LayoutSurface over section layers (dual-pane right side). */
export function EditablePagePreview({
  manifest,
  section,
  activeLayerId,
  onSelectLayer,
  onSectionChange,
  onPageLayoutChange
}: {
  manifest: PenDocManifest;
  section: PenSectionContent;
  activeLayerId: string | null;
  onSelectLayer: (id: string | null) => void;
  onSectionChange: (next: PenSectionContent) => void;
  onPageLayoutChange?: (layout: PenPageLayout) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const prepared = useMemo(() => ensureDefaultTextLayer(normalizeSection(section)), [section]);
  const layers = prepared.layers || [];
  const items = layers.map(layerToItem);

  function commitSection(next: PenSectionContent) {
    onSectionChange(next);
  }

  function onLayoutChange(nextItems: LayoutItem[]) {
    commitSection(updateLayerLayout(prepared, nextItems));
  }

  function maxZ() {
    return layers.reduce((m, l) => Math.max(m, l.zIndex), 0);
  }

  function addText() {
    const layer = createTextLayer({
      x: 12,
      y: 12 + (layers.length % 4) * 8,
      w: 50,
      h: 24,
      zIndex: maxZ() + 1
    });
    commitSection(upsertLayer(prepared, layer));
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
        zIndex: maxZ() + 1
      });
      commitSection(upsertLayer(prepared, layer));
      onSelectLayer(layer.id);
    };
    reader.readAsDataURL(file);
  }

  function addVideoFromFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const src = String(reader.result || '');
      if (!src) return;
      const layer = createVideoLayer(src, { zIndex: maxZ() + 1 });
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
          {onPageLayoutChange && (
            <select
              className="h-6 rounded border border-stone-300 bg-white px-1 text-[11px]"
              value={manifest.pageLayout || 'flow'}
              title="Page layout"
              onChange={(e) => onPageLayoutChange(e.target.value as PenPageLayout)}
            >
              <option value="flow">Flow</option>
              <option value="letter">Letter</option>
              <option value="a4">A4</option>
            </select>
          )}
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
          <button
            type="button"
            className="rounded border border-stone-300 bg-white px-2 py-0.5 text-[11px] text-stone-700 hover:bg-stone-50"
            onClick={() => videoRef.current?.click()}
          >
            Add video
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
          <input
            ref={videoRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) addVideoFromFile(f);
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
              const shell = layerShellStyle(layer);
              if (layer.kind === 'image' && layer.imageSrc) {
                return (
                  <div className="relative h-full w-full" style={shell}>
                    {layer.backgroundVideo && (
                      <video
                        src={layer.backgroundVideo}
                        className="absolute inset-0 h-full w-full object-cover opacity-40"
                        muted
                        loop
                        autoPlay
                        playsInline
                      />
                    )}
                    <img
                      src={layer.imageSrc}
                      alt=""
                      className="relative h-full w-full object-contain"
                      draggable={false}
                    />
                  </div>
                );
              }
              if (layer.kind === 'video' && layer.videoSrc) {
                return (
                  <div className="h-full w-full" style={shell}>
                    <video
                      src={layer.videoSrc}
                      className="h-full w-full object-contain"
                      controls
                      playsInline
                    />
                  </div>
                );
              }
              const html = docToHtml(getTextLayerDoc(layer));
              return (
                <div className="relative h-full w-full overflow-hidden" style={shell}>
                  {layer.backgroundVideo && (
                    <video
                      src={layer.backgroundVideo}
                      className="absolute inset-0 h-full w-full object-cover opacity-50"
                      muted
                      loop
                      autoPlay
                      playsInline
                    />
                  )}
                  <div
                    className="relative h-full w-full overflow-auto p-2 text-sm text-stone-800"
                    dangerouslySetInnerHTML={{
                      __html: html || '<p class="text-stone-400">Text</p>'
                    }}
                  />
                </div>
              );
            }}
          />
        </div>
      </div>
    </div>
  );
}
