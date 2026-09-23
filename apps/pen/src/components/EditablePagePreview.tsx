import { useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  docToHtml,
  ensureDefaultTextLayer,
  getTextLayerDoc,
  normalizeSection,
  updateLayerLayout,
  type PenDocManifest,
  type PenPageLayer,
  type PenPageLayout,
  type PenSectionContent
} from '@par-noir/pen-protocol';
import { LayoutSurface, type LayoutItem } from '../layout';
import { LayersPopover } from './LayersPanel';
import { IconLayers } from './icons/PenIcons';

function layerToItem(layer: PenPageLayer): LayoutItem {
  return {
    id: layer.id,
    x: layer.x,
    y: layer.y,
    w: layer.w,
    h: layer.h,
    zIndex: layer.zIndex,
    positionLocked: layer.positionLocked
  };
}

function pageFrameClass(pageLayout: PenPageLayout | undefined): string {
  if (pageLayout === 'letter') return 'pen-page-letter';
  if (pageLayout === 'a4') return 'pen-page-a4';
  return 'max-w-[22rem] aspect-[3/4]';
}

function layerShellStyle(layer: PenPageLayer): CSSProperties {
  const style: CSSProperties = {
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
  const layersBtnRef = useRef<HTMLButtonElement>(null);
  const [layersOpen, setLayersOpen] = useState(false);
  const prepared = useMemo(() => ensureDefaultTextLayer(normalizeSection(section)), [section]);
  const layers = prepared.layers || [];
  const visibleLayers = layers.filter((l) => l.visible !== false);
  const items = visibleLayers.map(layerToItem);

  function onLayoutChange(nextItems: LayoutItem[]) {
    onSectionChange(updateLayerLayout(prepared, nextItems));
  }

  return (
    <div className="relative flex h-full flex-col bg-white">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-neutral-200 bg-white px-3 py-1.5">
        <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">Page</span>
        <div className="flex items-center gap-3">
          {onPageLayoutChange && (
            <select
              className="h-6 border-0 bg-transparent text-[11px] font-bold text-black outline-none"
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
            ref={layersBtnRef}
            type="button"
            aria-expanded={layersOpen}
            aria-pressed={layersOpen}
            aria-label="Layers"
            title="Layers"
            className={`inline-flex items-center ${
              layersOpen ? 'text-black' : 'text-neutral-400 hover:text-black'
            }`}
            onClick={() => setLayersOpen((o) => !o)}
          >
            <IconLayers />
          </button>
        </div>
      </div>

      <LayersPopover
        open={layersOpen}
        onClose={() => setLayersOpen(false)}
        anchorRef={layersBtnRef}
        section={section}
        activeLayerId={activeLayerId}
        onSelectLayer={onSelectLayer}
        onSectionChange={onSectionChange}
      />

      <div className="flex flex-1 items-start justify-center overflow-auto p-6">
        <div
          className={`relative w-full overflow-hidden border border-neutral-200 bg-white ${pageFrameClass(
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
                  <div
                    className="relative h-full w-full overflow-auto p-2 text-sm text-black"
                    dangerouslySetInnerHTML={{
                      __html: html || '<p class="text-neutral-400">Text</p>'
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
