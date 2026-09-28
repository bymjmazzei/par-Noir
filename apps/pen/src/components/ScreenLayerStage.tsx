/**
 * Screen view is one layer surface. Pages are the publish cuts.
 * A layer can sit on any page, or across the cut.
 */

import {
  pageLayerToSheet,
  recomputeGroupBounds,
  sheetLayerToPage,
  type PenPageLayer,
  type PenPagePresentation,
  type PenSectionContent
} from '@par-noir/pen-protocol';
import { LayoutSurface, type LayoutItem } from '../layout';
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
  onSelectLayer,
  onSectionsChange,
  onPollVote,
  onWidgetAction
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
  onSelectLayer: (id: string | null) => void;
  onSectionsChange: (next: PenSectionContent[]) => void;
  onPollVote?: (layer: PenPageLayer) => void;
  onWidgetAction?: (layer: PenPageLayer) => void;
}) {
  const owner = new Map<string, { index: number; slug: string }>();
  const items: LayoutItem[] = [];
  sections.forEach((section, index) => {
    for (const layer of section.layers || []) {
      if (layer.visible === false || layer.bodyWrap) continue;
      owner.set(layer.id, { index, slug: section.slug });
      const at = pageLayerToSheet(layer, index, pageWidth, pad);
      items.push({
        id: layer.id,
        x: at.x,
        y: at.y,
        w: layer.w,
        h: layer.h,
        zIndex: layer.zIndex,
        positionLocked: layer.positionLocked,
        cornerRadius: layer.cornerRadius,
        roundable: layer.kind === 'interactive'
      });
    }
  });

  return (
    <LayoutSurface
      className="pointer-events-none absolute inset-0 z-20"
      bounds={{ width: sections.length * pageWidth, height: pageHeight }}
      items={items}
      selectedId={activeLayerId}
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
            const moved = {
              ...layer,
              x: hit.layout.x,
              y: hit.layout.y,
              w: hit.layout.w,
              h: hit.layout.h,
              zIndex: hit.layout.zIndex
            };
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
        const layer = section?.layers?.find((entry) => entry.id === item.id);
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
  );
}
