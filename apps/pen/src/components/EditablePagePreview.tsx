import { useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  defaultPagePresentation,
  docToHtml,
  getTextLayerDoc,
  isPageLayerId,
  mergePagePresentation,
  normalizeSection,
  PAGE_LAYER_ID,
  updateLayerLayout,
  type PenDocManifest,
  type PenPageLayer,
  type PenPageLayout,
  type PenPagePresentation,
  type PenSectionContent
} from '@par-noir/pen-protocol';
import { LayoutSurface, type LayoutItem } from '../layout';
import { LayersPopover, layerDisplayLabel, pageLayerLabel } from './LayersPanel';
import { IconLayers } from './icons/PenIcons';
import {
  LayerObjectToolbar,
  layerPreviewStyle,
  pageFrameStyle
} from './LayerObjectToolbar';

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

/** Editable page surface — LayoutSurface over section layers (dual-pane right side). */
export function EditablePagePreview({
  manifest,
  section,
  activeLayerId,
  onSelectLayer,
  onSectionChange,
  onPageLayoutChange,
  onPresentationChange
}: {
  manifest: PenDocManifest;
  section: PenSectionContent;
  activeLayerId: string | null;
  onSelectLayer: (id: string | null) => void;
  onSectionChange: (next: PenSectionContent) => void;
  onPageLayoutChange?: (layout: PenPageLayout) => void;
  onPresentationChange?: (next: Partial<PenPagePresentation>) => void;
}) {
  const layersBtnRef = useRef<HTMLButtonElement>(null);
  const [layersOpen, setLayersOpen] = useState(false);
  const prepared = useMemo(() => normalizeSection(section), [section]);
  const layers = prepared.layers || [];
  const visibleLayers = layers.filter((l) => l.visible !== false);
  const items = visibleLayers.map(layerToItem);
  const presentation = mergePagePresentation(
    defaultPagePresentation(),
    manifest.pagePresentation || undefined
  );

  const activeObject = layers.find((l) => l.id === activeLayerId) || null;
  const pageActive = isPageLayerId(activeLayerId);
  const layersButtonTitle = pageActive
    ? pageLayerLabel(manifest.pageLayout)
    : activeObject
      ? layerDisplayLabel(
          activeObject,
          [...layers].sort((a, b) => b.zIndex - a.zIndex).findIndex((l) => l.id === activeObject.id)
        )
      : 'Layers';

  function onLayoutChange(nextItems: LayoutItem[]) {
    onSectionChange(updateLayerLayout(prepared, nextItems));
  }

  const frameStyle: CSSProperties = pageFrameStyle(presentation);

  return (
    <div className="relative flex h-full flex-col bg-white">
      <div className="flex shrink-0 items-center gap-2 border-b border-neutral-200 bg-white px-2 py-1.5">
        <span className="shrink-0 text-[11px] font-bold uppercase tracking-wider text-neutral-400">
          Page
        </span>
        {onPageLayoutChange && (
          <select
            className="h-6 shrink-0 border-0 bg-transparent text-[11px] font-bold text-black outline-none"
            value={manifest.pageLayout || 'flow'}
            title="Page layout"
            onChange={(e) => {
              onPageLayoutChange(e.target.value as PenPageLayout);
              onSelectLayer(PAGE_LAYER_ID);
            }}
          >
            <option value="flow">Flow</option>
            <option value="letter">Letter</option>
            <option value="a4">A4</option>
          </select>
        )}

        <div className="ml-auto flex min-w-0 items-center gap-1">
          <LayerObjectToolbar
            target={
              pageActive || !activeObject
                ? { kind: 'page' }
                : { kind: 'layer', layer: activeObject }
            }
            presentation={presentation}
            section={prepared}
            onPresentationChange={onPresentationChange}
            onSectionChange={onSectionChange}
          />
          <button
            ref={layersBtnRef}
            type="button"
            aria-expanded={layersOpen}
            aria-pressed={layersOpen}
            aria-label={layersButtonTitle}
            title={layersButtonTitle}
            className={`inline-flex max-w-[9rem] items-center gap-1 truncate px-1 text-[11px] font-bold ${
              layersOpen ? 'text-black' : 'text-neutral-500 hover:text-black'
            }`}
            onClick={() => setLayersOpen((o) => !o)}
          >
            {activeObject || pageActive ? (
              <span className="truncate">{layersButtonTitle}</span>
            ) : (
              <IconLayers />
            )}
          </button>
        </div>
      </div>

      <LayersPopover
        open={layersOpen}
        onClose={() => setLayersOpen(false)}
        anchorRef={layersBtnRef}
        section={section}
        activeLayerId={activeLayerId || PAGE_LAYER_ID}
        onSelectLayer={onSelectLayer}
        onSectionChange={onSectionChange}
        pageLayout={manifest.pageLayout}
      />

      <div className="flex flex-1 items-start justify-center overflow-auto p-6">
        <div
          className={`relative w-full overflow-hidden border border-neutral-200 ${pageFrameClass(
            manifest.pageLayout
          )}`}
          style={frameStyle}
          onClick={() => onSelectLayer(PAGE_LAYER_ID)}
        >
          {presentation.backgroundVideo && (
            <video
              src={presentation.backgroundVideo}
              className="pointer-events-none absolute inset-0 h-full w-full object-cover"
              autoPlay
              muted
              loop
              playsInline
            />
          )}
          <LayoutSurface
            className="relative z-[1] h-full min-h-[28rem] w-full"
            items={items}
            selectedId={pageActive ? null : activeLayerId}
            onSelect={(id) => onSelectLayer(id || PAGE_LAYER_ID)}
            onChange={onLayoutChange}
            renderItem={(item) => {
              const layer = layers.find((l) => l.id === item.id);
              if (!layer) return null;
              const shell = layerPreviewStyle(layer);
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
              if (layer.backgroundVideo) {
                return (
                  <div className="relative h-full w-full overflow-hidden" style={shell}>
                    <video
                      src={layer.backgroundVideo}
                      className="absolute inset-0 h-full w-full object-cover"
                      autoPlay
                      muted
                      loop
                      playsInline
                    />
                    <div
                      className="relative h-full w-full overflow-auto p-2 text-sm text-black"
                      dangerouslySetInnerHTML={{
                        __html:
                          docToHtml(getTextLayerDoc(layer)) ||
                          '<p class="text-neutral-400">Text</p>'
                      }}
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
