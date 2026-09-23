/** Page layer helpers — multi text/image objects on a section. */

import { emptyTipTapDoc, docToPlainText } from './richDoc.js';
import type { PenPageLayer, PenSectionContent, PenTipTapNode } from './types.js';

/** Synthetic id for the page frame (flow/letter/a4) — layer 0 in the Layers list. */
export const PAGE_LAYER_ID = '__page__';

export function isPageLayerId(id: string | null | undefined): boolean {
  return !id || id === PAGE_LAYER_ID;
}

function newLayerId(): string {
  return `layer_${Math.random().toString(36).slice(2, 10)}`;
}

export function createTextLayer(
  partial?: Partial<Pick<PenPageLayer, 'x' | 'y' | 'w' | 'h' | 'zIndex' | 'textDoc'>>
): PenPageLayer {
  return {
    id: newLayerId(),
    kind: 'text',
    x: partial?.x ?? 8,
    y: partial?.y ?? 8,
    w: partial?.w ?? 84,
    h: partial?.h ?? 40,
    zIndex: partial?.zIndex ?? 1,
    textDoc: partial?.textDoc ?? emptyTipTapDoc()
  };
}

export function createImageLayer(
  imageSrc: string,
  partial?: Partial<Pick<PenPageLayer, 'x' | 'y' | 'w' | 'h' | 'zIndex'>>
): PenPageLayer {
  return {
    id: newLayerId(),
    kind: 'image',
    x: partial?.x ?? 20,
    y: partial?.y ?? 20,
    w: partial?.w ?? 40,
    h: partial?.h ?? 30,
    zIndex: partial?.zIndex ?? 2,
    imageSrc
  };
}

export function createVideoLayer(
  videoSrc: string,
  partial?: Partial<Pick<PenPageLayer, 'x' | 'y' | 'w' | 'h' | 'zIndex'>>
): PenPageLayer {
  return {
    id: newLayerId(),
    kind: 'video',
    x: partial?.x ?? 20,
    y: partial?.y ?? 22,
    w: partial?.w ?? 48,
    h: partial?.h ?? 32,
    zIndex: partial?.zIndex ?? 2,
    videoSrc
  };
}

/**
 * Reorder stack: `orderedIdsFrontFirst[0]` is front (highest zIndex).
 * Ids must cover every existing layer.
 */
export function reorderLayersStack(
  section: PenSectionContent,
  orderedIdsFrontFirst: string[]
): PenSectionContent {
  const byId = new Map((section.layers || []).map((l) => [l.id, l]));
  if (orderedIdsFrontFirst.length !== byId.size) {
    throw new Error('reorder_layers_mismatch');
  }
  const n = orderedIdsFrontFirst.length;
  const layers = orderedIdsFrontFirst.map((id, i) => {
    const layer = byId.get(id);
    if (!layer) throw new Error(`unknown_layer:${id}`);
    return { ...layer, zIndex: n - i };
  });
  assertUniqueLayerIds(layers);
  return { ...section, layers };
}

export function patchLayerStyle(
  section: PenSectionContent,
  layerId: string,
  patch: Partial<
    Pick<
      PenPageLayer,
      | 'backgroundColor'
      | 'backgroundImage'
      | 'backgroundVideo'
      | 'backgroundGradient'
      | 'textShadow'
      | 'shadowColor'
      | 'shadowBlur'
      | 'shadowOffsetX'
      | 'shadowOffsetY'
      | 'blur'
      | 'opacity'
      | 'mixBlendMode'
      | 'blendAmount'
      | 'visible'
      | 'positionLocked'
    >
  >
): PenSectionContent {
  const existing = (section.layers || []).find((l) => l.id === layerId);
  if (!existing) throw new Error(`unknown_layer:${layerId}`);
  return upsertLayer(section, { ...existing, ...patch });
}

/** Keep geometry; swap layer kind to image or video (attachment on a text object). */
export function attachMediaToLayer(
  section: PenSectionContent,
  layerId: string,
  media: { kind: 'image'; src: string } | { kind: 'video'; src: string }
): PenSectionContent {
  const existing = (section.layers || []).find((l) => l.id === layerId);
  if (!existing) throw new Error(`unknown_layer:${layerId}`);
  const shared = {
    id: existing.id,
    x: existing.x,
    y: existing.y,
    w: existing.w,
    h: existing.h,
    zIndex: existing.zIndex,
    backgroundColor: existing.backgroundColor,
    backgroundImage: undefined as string | undefined,
    backgroundVideo: undefined as string | undefined,
    backgroundGradient: existing.backgroundGradient,
    textShadow: existing.textShadow,
    shadowColor: existing.shadowColor,
    shadowBlur: existing.shadowBlur,
    shadowOffsetX: existing.shadowOffsetX,
    shadowOffsetY: existing.shadowOffsetY,
    blur: existing.blur,
    opacity: existing.opacity,
    mixBlendMode: existing.mixBlendMode,
    blendAmount: existing.blendAmount,
    visible: existing.visible,
    positionLocked: existing.positionLocked
  };
  if (media.kind === 'image') {
    return upsertLayer(section, {
      ...shared,
      kind: 'image',
      imageSrc: media.src
    });
  }
  return upsertLayer(section, {
    ...shared,
    kind: 'video',
    videoSrc: media.src
  });
}

/** Drop media attachment; restore an empty text layer at the same rect. */
export function clearLayerAttachment(
  section: PenSectionContent,
  layerId: string
): PenSectionContent {
  const existing = (section.layers || []).find((l) => l.id === layerId);
  if (!existing) throw new Error(`unknown_layer:${layerId}`);
  return upsertLayer(section, {
    id: existing.id,
    kind: 'text',
    x: existing.x,
    y: existing.y,
    w: existing.w,
    h: existing.h,
    zIndex: existing.zIndex,
    backgroundColor: existing.backgroundColor,
    textShadow: existing.textShadow,
    blur: existing.blur,
    textDoc: existing.kind === 'text' ? existing.textDoc : emptyTipTapDoc()
  });
}

/**
 * If section has no layers and has non-empty prose, seed one text layer from section.doc
 * (legacy migrate). Blank docs stay with zero object layers — the page frame is layer 0 in UI.
 */
export function ensureDefaultTextLayer(section: PenSectionContent): PenSectionContent {
  if (section.layers && section.layers.length > 0) return section;
  const plain = docToPlainText(section.doc || emptyTipTapDoc()).trim();
  if (!plain) {
    return { ...section, layers: section.layers ?? [] };
  }
  const layer: PenPageLayer = {
    id: 'layer_primary',
    kind: 'text',
    x: 8,
    y: 8,
    w: 84,
    h: 70,
    zIndex: 1,
    textDoc: section.doc || emptyTipTapDoc()
  };
  return { ...section, layers: [layer] };
}

/** Box/text shadow CSS from structured shadow fields (or legacy textShadow). */
export function layerShadowCss(layer: Pick<
  PenPageLayer,
  'textShadow' | 'shadowColor' | 'shadowBlur' | 'shadowOffsetX' | 'shadowOffsetY'
>): string | undefined {
  if (
    layer.shadowBlur != null ||
    layer.shadowOffsetX != null ||
    layer.shadowOffsetY != null ||
    layer.shadowColor
  ) {
    const x = layer.shadowOffsetX ?? 0;
    const y = layer.shadowOffsetY ?? 0;
    const b = layer.shadowBlur ?? 0;
    const c = layer.shadowColor || 'rgba(0,0,0,0.45)';
    if (!b && !x && !y) return undefined;
    return `${x}px ${y}px ${b}px ${c}`;
  }
  return layer.textShadow || undefined;
}

export function upsertLayer(
  section: PenSectionContent,
  layer: PenPageLayer
): PenSectionContent {
  const layers = [...(section.layers || [])];
  const idx = layers.findIndex((l) => l.id === layer.id);
  if (idx >= 0) layers[idx] = layer;
  else layers.push(layer);
  assertUniqueLayerIds(layers);
  return { ...section, layers };
}

export function removeLayer(section: PenSectionContent, layerId: string): PenSectionContent {
  return {
    ...section,
    layers: (section.layers || []).filter((l) => l.id !== layerId)
  };
}

export function reorderLayer(
  section: PenSectionContent,
  layerId: string,
  zIndex: number
): PenSectionContent {
  const layers = (section.layers || []).map((l) =>
    l.id === layerId ? { ...l, zIndex } : l
  );
  return { ...section, layers };
}

export function updateLayerLayout(
  section: PenSectionContent,
  layouts: Array<{ id: string; x: number; y: number; w: number; h: number; zIndex: number }>
): PenSectionContent {
  const byId = new Map(layouts.map((l) => [l.id, l]));
  const layers = (section.layers || []).map((layer) => {
    const hit = byId.get(layer.id);
    if (!hit) return layer;
    return { ...layer, x: hit.x, y: hit.y, w: hit.w, h: hit.h, zIndex: hit.zIndex };
  });
  return { ...section, layers };
}

export function getTextLayerDoc(layer: PenPageLayer): PenTipTapNode {
  return layer.textDoc || emptyTipTapDoc();
}

/** Sync section.doc from the primary (lowest zIndex) text layer. */
export function syncDocFromPrimaryTextLayer(section: PenSectionContent): PenSectionContent {
  const texts = (section.layers || [])
    .filter((l) => l.kind === 'text')
    .sort((a, b) => a.zIndex - b.zIndex);
  if (!texts.length) return section;
  return { ...section, doc: getTextLayerDoc(texts[0]!) };
}

/** Sync a specific text layer's textDoc; also write section.doc when syncDoc is true. */
export function setTextLayerDoc(
  section: PenSectionContent,
  layerId: string,
  textDoc: PenTipTapNode,
  opts?: { syncDoc?: boolean }
): PenSectionContent {
  const existing = (section.layers || []).find((l) => l.id === layerId);
  if (!existing || existing.kind !== 'text') {
    throw new Error(`unknown_text_layer:${layerId}`);
  }
  const next = upsertLayer(section, { ...existing, textDoc });
  if (opts?.syncDoc !== false) {
    return { ...next, doc: textDoc };
  }
  return next;
}

export function assertUniqueLayerIds(layers: PenPageLayer[]): void {
  const seen = new Set<string>();
  for (const l of layers) {
    if (seen.has(l.id)) throw new Error(`duplicate_layer_id:${l.id}`);
    seen.add(l.id);
  }
}

/**
 * Stable fingerprint of layer visibility + position locks (remix structural signal).
 * Body text alone does not change this fingerprint.
 */
export function layerLockFingerprint(sections: PenSectionContent[]): string {
  const parts: string[] = [];
  for (const s of sections) {
    const layers = [...(s.layers || [])].sort((a, b) => a.id.localeCompare(b.id));
    for (const l of layers) {
      parts.push(
        `${s.slug}:${l.id}:v=${l.visible === false ? 0 : 1}:p=${l.positionLocked ? 1 : 0}:` +
          `${Math.round(l.x)}/${Math.round(l.y)}/${Math.round(l.w)}/${Math.round(l.h)}`
      );
    }
  }
  return parts.join('|');
}

