/**
 * Screen view is one layer surface. Pages are the publish cuts.
 * A layer can sit on any page, or across the cut.
 */

import {
  layerSampleTime,
  pageLayerToSheet,
  recomputeGroupBounds,
  sampleSectionLayers,
  sheetLayerToPage,
  writeLayerAtPlayhead,
  type PenPageLayer,
  type PenPagePresentation,
  type PenSectionContent
} from '@par-noir/pen-protocol';
import { LayoutSurface, type LayoutItem } from '../layout';
import { layerChromeStyle } from './LayerObjectToolbar';
import { PageGuides } from './PageGuides';
import { PreviewLayerFace } from './PreviewLayerFace';
import type { PenSession } from '../services/penSession';

export function ScreenLayerStage({
  sections,
  pageWidth,
  pageHeight,
  pad,
  presentation,
  activeLayerId,
  session,
  docId,
  buttonCaptionById,
  votedOptionByGroup,
  inputValues,
  onInputValue,
  onSelectLayer,
  onSectionsChange,
  onPollVote,
  onWidgetAction,
  snapToPageCenter = false,
  playheadSec = 0,
  freePlacement = false,
  guideSpan
}: {
  sections: PenSectionContent[];
  pageWidth: number;
  pageHeight: number;
  pad: number;
  presentation: PenPagePresentation;
  activeLayerId: string | null;
  session?: PenSession | null;
  docId?: string;
  buttonCaptionById?: Record<string, string>;
  votedOptionByGroup?: Record<string, string>;
  inputValues?: Record<string, string>;
  onInputValue?: (layerId: string, value: string) => void;
  onSelectLayer: (id: string | null) => void;
  onSectionsChange: (next: PenSectionContent[]) => void;
  onPollVote?: (layer: PenPageLayer) => void;
  onWidgetAction?: (layer: PenPageLayer) => void;
  snapToPageCenter?: boolean;
  /** Section clock. Sampled for display; drags write keys when the layer has them. */
  playheadSec?: number;
  /** Non-flow artboard. Layers may sit past the page; render still clips. */
  freePlacement?: boolean;
  /** Workspace past this strip. Guide lines run through it. */
  guideSpan?: { left: number; right: number; top: number; bottom: number };
}) {
  const owner = new Map<string, { index: number; slug: string }>();
  const sampledById = new Map<string, PenPageLayer>();
  const items: LayoutItem[] = [];
  const guides: Array<{ id: string; axis: 'vertical' | 'horizontal'; position: number; index: number }> = [];
  sections.forEach((section, index) => {
    for (const layer of sampleSectionLayers(section, playheadSec)) {
      sampledById.set(layer.id, layer);
      if (layer.visible === false || layer.bodyWrap) continue;
      if (layer.kind === 'guide') {
        const at = pageLayerToSheet(layer, index, pageWidth, pad);
        const axis = layer.guideAxis === 'horizontal' ? 'horizontal' : 'vertical';
        guides.push({
          id: layer.id,
          axis,
          position: axis === 'horizontal' ? at.y : at.x,
          index
        });
        continue;
      }
      owner.set(layer.id, { index, slug: section.slug });
      const at = pageLayerToSheet(layer, index, pageWidth, pad);
      items.push({
        id: layer.id,
        x: at.x,
        y: at.y,
        w: layer.w,
        h: layer.h,
        rotate: layer.rotate ?? layer.mediaRotate,
        zIndex: layer.zIndex,
        positionLocked: layer.positionLocked,
        cornerRadius: layer.cornerRadius,
        roundable: layer.kind === 'interactive'
      });
    }
  });

  return (
    <>
    <PageGuides
      guides={guides}
      span={guideSpan}
      onMove={(id, position) => {
        const guide = guides.find((item) => item.id === id);
        if (!guide) return;
        const local = sheetLayerToPage({ x: position, y: position }, guide.index, pageWidth, pad);
        onSectionsChange(
          sections.map((section, index) => {
            if (index !== guide.index) return section;
            return {
              ...section,
              layers: (section.layers || []).map((layer) =>
                layer.id === id
                  ? {
                      ...layer,
                      x: guide.axis === 'horizontal' ? layer.x : local.x,
                      y: guide.axis === 'horizontal' ? local.y : layer.y
                    }
                  : layer
              )
            };
          })
        );
      }}
    />
    <LayoutSurface
      className="pointer-events-none absolute inset-0 z-20 overflow-visible"
      bounds={{ width: sections.length * pageWidth, height: pageHeight }}
      freePlacement={freePlacement}
      frameStyle={(item) => {
        const layer = sampledById.get(item.id);
        return layer ? layerChromeStyle(layer) : {};
      }}
      items={items}
      selectedId={activeLayerId}
      snapToPageCenter={snapToPageCenter}
      guideSpan={guideSpan}
      snapGuides={{
        x: guides.filter((guide) => guide.axis === 'vertical').map((guide) => guide.position),
        y: guides.filter((guide) => guide.axis === 'horizontal').map((guide) => guide.position)
      }}
      onSelect={(id) => onSelectLayer(id)}
      getLinkedIds={(id) => {
        for (const section of sections) {
          const layers = section.layers || [];
          if (!layers.some((layer) => layer.id === id && layer.kind === 'group')) continue;
          return layers.filter((layer) => layer.parentGroupId === id).map((layer) => layer.id);
        }
        return [];
      }}
      onChange={(next) => {
        const targetOf = new Map<string, { index: number; layout: LayoutItem }>();
        for (const item of next) {
          const center = item.x + item.w / 2;
          const index = Math.min(sections.length - 1, Math.max(0, Math.floor(center / pageWidth)));
          const local = sheetLayerToPage(item, index, pageWidth, pad);
          targetOf.set(item.id, { index, layout: { ...item, x: local.x, y: local.y } });
        }
        const drafts: PenSectionContent[] = sections.map((section) => ({
          ...section,
          layers: (section.layers || []).filter((layer) => !targetOf.has(layer.id))
        }));
        for (const section of sections) {
          for (const layer of section.layers || []) {
            const hit = targetOf.get(layer.id);
            if (!hit) continue;
            const sourceSection = sections.find((entry) =>
              entry.layers?.some((item) => item.id === layer.id)
            );
            const moved = writeLayerAtPlayhead(
              layer,
              layerSampleTime(sourceSection || section, layer, playheadSec),
              {
                x: hit.layout.x,
                y: hit.layout.y,
                w: hit.layout.w,
                h: hit.layout.h
              }
            );
            moved.zIndex = hit.layout.zIndex;
            if (hit.layout.cornerRadius != null) moved.cornerRadius = hit.layout.cornerRadius;
            drafts[hit.index].layers = [...(drafts[hit.index].layers || []), moved];
          }
        }
        onSectionsChange(
          drafts.map((section) => {
            let nextSection: PenSectionContent = section;
            const groups = new Set(
              (nextSection.layers || [])
                .filter((layer) => layer.parentGroupId)
                .map((layer) => layer.parentGroupId!)
            );
            for (const groupId of groups) {
              nextSection = recomputeGroupBounds(nextSection, groupId);
            }
            return { ...nextSection, layerGeom: 'px' as const };
          })
        );
      }}
      renderItem={(item) => {
        const hit = owner.get(item.id);
        const section = sections[hit?.index ?? 0];
        const layer = sampledById.get(item.id) || section?.layers?.find((entry) => entry.id === item.id);
        if (!section || !layer) return null;
        return (
          <PreviewLayerFace
            layer={layer}
            layers={section.layers || []}
            section={section}
            presentation={presentation}
            session={session}
            docId={docId}
            buttonCaptionById={buttonCaptionById}
            votedOptionByGroup={votedOptionByGroup}
            inputValues={inputValues}
            onInputValue={onInputValue}
            selected={activeLayerId === layer.id}
            onSelect={() => onSelectLayer(layer.id)}
            onSectionChange={(next) =>
              onSectionsChange(sections.map((entry) => (entry.slug === next.slug ? next : entry)))
            }
            onPollVote={onPollVote}
            onWidgetAction={onWidgetAction}
          />
        );
      }}
    />
    </>
  );
}
