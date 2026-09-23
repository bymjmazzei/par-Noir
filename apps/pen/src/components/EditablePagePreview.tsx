import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  collectFontFamiliesFromDoc,
  defaultEditorPagePresentation,
  docToHtml,
  getTextLayerDoc,
  isGooglePenFont,
  isPageLayerId,
  mergePagePresentation,
  normalizeSection,
  PAGE_LAYER_ID,
  patchLayerStyle,
  recomputeGroupBounds,
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
import { ensureGoogleFontsLoaded } from '../services/penGoogleFonts';
import type { PenSession } from '../services/penSession';

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

function bodyMarginStyle(presentation: PenPagePresentation): CSSProperties {
  const pad = Math.max(8, Math.min(72, Number(presentation.padding) || 40));
  return {
    padding: `${pad}px`,
    fontFamily: presentation.fontFamily || 'Georgia',
    fontSize: `${presentation.fontSize || 16}px`,
    color: presentation.textColor || '#111111',
    textAlign: presentation.textAlign || 'left'
  };
}

function resolveBodyWrap(layer: PenPageLayer): 'left' | 'right' {
  if (layer.bodyWrap === 'left' || layer.bodyWrap === 'right') return layer.bodyWrap;
  return layer.x + layer.w / 2 < 50 ? 'left' : 'right';
}

/**
 * Invisible float that only reserves L/R wrap space in Body.
 * Does not track X/Y — free absolute placement stays on LayoutSurface so
 * drag never fights float layout.
 */
function BodyWrapSpacer({ layer }: { layer: PenPageLayer }) {
  const side = resolveBodyWrap(layer);
  const w = Math.max(8, Math.min(70, layer.w));
  const h = Math.max(8, Math.min(70, layer.h));
  return (
    <div
      aria-hidden
      data-wrap={side}
      className="pointer-events-none"
      style={{
        float: side,
        width: `${w}%`,
        height: `${h}%`,
        margin: side === 'left' ? '0 0.75em 0.5em 0' : '0 0 0.5em 0.75em',
        shapeOutside: 'margin-box',
        visibility: 'hidden'
      }}
    />
  );
}

/** Editable page surface — Body (section.doc) under optional overlay layers. */
export function EditablePagePreview({
  manifest,
  section,
  activeLayerId,
  onSelectLayer,
  onSectionChange,
  onPageLayoutChange,
  onPresentationChange,
  onSnapChange,
  session
}: {
  manifest: PenDocManifest;
  section: PenSectionContent;
  activeLayerId: string | null;
  onSelectLayer: (id: string | null) => void;
  onSectionChange: (next: PenSectionContent) => void;
  onPageLayoutChange?: (layout: PenPageLayout) => void;
  onPresentationChange?: (next: Partial<PenPagePresentation>) => void;
  onSnapChange?: (enabled: boolean) => void;
  session?: PenSession | null;
}) {
  const layersBtnRef = useRef<HTMLButtonElement>(null);
  const [layersOpen, setLayersOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([PAGE_LAYER_ID]);
  const [fontsReady, setFontsReady] = useState(true);
  const prepared = useMemo(() => normalizeSection(section), [section]);
  const layers = prepared.layers || [];
  /** Wrap objects stay on LayoutSurface (free move); spacers only drive text wrap. */
  const wrapLayers = useMemo(
    () => layers.filter((l) => l.visible !== false && Boolean(l.bodyWrap)),
    [layers]
  );
  const absoluteLayers = useMemo(
    () => layers.filter((l) => l.visible !== false),
    [layers]
  );
  const items = absoluteLayers.map(layerToItem);
  const groupIds = useMemo(
    () => new Set(layers.filter((l) => l.kind === 'group').map((l) => l.id)),
    [layers]
  );
  const presentation = mergePagePresentation(
    defaultEditorPagePresentation(),
    (() => {
      const raw = manifest.pagePresentation;
      if (!raw) return undefined;
      if (
        raw.backgroundColor === '#000000' &&
        !raw.backgroundImage &&
        !raw.backgroundGradient &&
        !raw.backgroundVideo
      ) {
        return { ...raw, backgroundColor: 'transparent' };
      }
      return raw;
    })()
  );
  const snapEnabled = Boolean(manifest.snapToPageGuides);

  const activeObject = layers.find((l) => l.id === activeLayerId) || null;
  const pageActive = isPageLayerId(activeLayerId);
  const multiSelected = selectedIds.filter((id) => id !== PAGE_LAYER_ID).length >= 2;
  const layersButtonTitle = multiSelected
    ? 'Multiple'
    : pageActive
      ? pageLayerLabel(manifest.pageLayout)
      : activeObject
        ? layerDisplayLabel(activeObject, layers)
        : 'Layers';

  useEffect(() => {
    const families = collectFontFamiliesFromDoc({
      sections: [prepared],
      pagePresentationFontFamily: presentation.fontFamily
    });
    const google = families.filter((f) => isGooglePenFont(f));
    if (google.length) {
      setFontsReady(false);
      ensureGoogleFontsLoaded(google);
      const done = () => setFontsReady(true);
      if (typeof document !== 'undefined' && document.fonts?.ready) {
        void document.fonts.ready.then(done).catch(done);
      } else {
        done();
      }
    } else {
      setFontsReady(true);
    }
  }, [prepared, presentation.fontFamily]);

  function onLayoutChange(nextItems: LayoutItem[]) {
    let next = updateLayerLayout(prepared, nextItems);
    // Keep wrap side in sync with horizontal position while still wrapped
    for (const item of nextItems) {
      const layer = next.layers?.find((l) => l.id === item.id);
      if (!layer?.bodyWrap) continue;
      const side: 'left' | 'right' = item.x + item.w / 2 < 50 ? 'left' : 'right';
      if (layer.bodyWrap !== side) {
        next = patchLayerStyle(next, item.id, { bodyWrap: side });
      }
    }
    const groups = new Set(
      (next.layers || [])
        .filter((l) => l.parentGroupId)
        .map((l) => l.parentGroupId!)
    );
    for (const gid of groups) {
      next = recomputeGroupBounds(next, gid);
    }
    onSectionChange(next);
  }

  function selectLayer(id: string | null) {
    const next = id || PAGE_LAYER_ID;
    onSelectLayer(next);
    setSelectedIds([next]);
  }

  function getLinkedIds(id: string): string[] {
    if (!groupIds.has(id)) return [];
    return layers.filter((l) => l.parentGroupId === id).map((l) => l.id);
  }

  const frameStyle: CSSProperties = pageFrameStyle(presentation);
  const bodyHtml = docToHtml(prepared.doc);
  const bodyStyle = bodyMarginStyle(presentation);

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
              selectLayer(PAGE_LAYER_ID);
            }}
          >
            <option value="flow">Flow</option>
            <option value="letter">Letter</option>
            <option value="a4">A4</option>
          </select>
        )}
        {onSnapChange && (
          <button
            type="button"
            title={snapEnabled ? 'Snap to page center on' : 'Snap to page center off'}
            aria-pressed={snapEnabled}
            className={`shrink-0 rounded px-1.5 text-[10px] font-bold uppercase tracking-wide ${
              snapEnabled ? 'bg-neutral-900 text-white' : 'text-neutral-400 hover:text-black'
            }`}
            onClick={() => onSnapChange(!snapEnabled)}
          >
            Snap
          </button>
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
            session={session}
            docId={manifest.docId}
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
            className={`inline-flex max-w-[10rem] items-center gap-1 truncate px-1 text-[11px] font-bold ${
              layersOpen ? 'text-black' : 'text-neutral-500 hover:text-black'
            }`}
            onClick={() => setLayersOpen((o) => !o)}
          >
            <IconLayers className="shrink-0" />
            <span className="truncate">{layersButtonTitle}</span>
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
        selectedIds={selectedIds}
        onSelectedIdsChange={setSelectedIds}
      />

      <div className="flex flex-1 items-start justify-center overflow-auto bg-neutral-100 p-6">
        <div
          className={`relative w-full overflow-hidden border border-neutral-200 bg-white ${pageFrameClass(
            manifest.pageLayout
          )}`}
          style={frameStyle}
          onClick={(e) => {
            if (e.target === e.currentTarget) selectLayer(PAGE_LAYER_ID);
          }}
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

          {/* Body — flow text; invisible wrap spacers reserve float space */}
          <div
            className={`pen-rich-html absolute inset-0 z-0 overflow-auto ${
              fontsReady ? '' : 'opacity-90'
            }`}
            style={bodyStyle}
            onClick={(e) => {
              e.stopPropagation();
              selectLayer(PAGE_LAYER_ID);
            }}
          >
            {wrapLayers.map((layer) => (
              <BodyWrapSpacer key={layer.id} layer={layer} />
            ))}
            <div
              dangerouslySetInnerHTML={{
                __html: bodyHtml || '<p class="text-neutral-400">Start writing…</p>'
              }}
            />
          </div>

          {/* All objects (including wrap) — free absolute move/resize */}
          <LayoutSurface
            className="pointer-events-none absolute inset-0 z-[1] h-full w-full"
            items={items}
            selectedId={pageActive ? null : activeLayerId}
            snapToPageCenter={snapEnabled}
            getLinkedIds={getLinkedIds}
            resizeDisabledIds={groupIds}
            onSelect={(id) => selectLayer(id || PAGE_LAYER_ID)}
            onChange={onLayoutChange}
            renderItem={(item) => {
              const layer = layers.find((l) => l.id === item.id);
              if (!layer) return null;
              const shell = layerPreviewStyle(layer);
              if (layer.kind === 'group') {
                return (
                  <div
                    className="h-full w-full"
                    style={shell}
                    title={layerDisplayLabel(layer, layers)}
                  />
                );
              }
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
                      className="pen-rich-html relative h-full w-full overflow-auto p-2 text-sm"
                      style={{
                        fontFamily: presentation.fontFamily || undefined,
                        color: presentation.textColor || '#111'
                      }}
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
                    className="pen-rich-html relative h-full w-full overflow-auto p-2 text-sm"
                    style={{
                      fontFamily: presentation.fontFamily || undefined,
                      color: presentation.textColor || '#111'
                    }}
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
