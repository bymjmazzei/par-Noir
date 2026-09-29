/** Page layer helpers — multi text/image objects on a section. */

import { docToPlainText, emptyTipTapDoc } from './richDoc.js';
import {
  DEFAULT_IMAGE_ASPECT,
  DEFAULT_VIDEO_ASPECT,
  sizeMediaLayerForAttach,
  snapLayoutToContentCenter,
  type LayerRect
} from './pageGeometry.js';
import { SEED_TABLE_DOC_PLACEHOLDER } from './seedRefs.js';
import { offsetLayerMotion } from './layerMotion.js';
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
  partial?: Partial<Pick<PenPageLayer, 'x' | 'y' | 'w' | 'h' | 'zIndex' | 'textDoc' | 'name'>>
): PenPageLayer {
  return {
    id: newLayerId(),
    kind: 'text',
    x: partial?.x ?? 24,
    y: partial?.y ?? 24,
    w: partial?.w ?? 280,
    h: partial?.h ?? 120,
    zIndex: partial?.zIndex ?? 1,
    name: partial?.name,
    textDoc: partial?.textDoc ?? emptyTipTapDoc()
  };
}

/** Display name: explicit name, else "Layer N" / "Group N" by back-to-front index. */
export function defaultLayerName(
  layer: PenPageLayer,
  allLayers: PenPageLayer[]
): string {
  if (layer.name?.trim()) return layer.name.trim();
  if (layer.kind === 'group') {
    const groups = allLayers.filter((l) => l.kind === 'group').sort((a, b) => a.zIndex - b.zIndex);
    const idx = groups.findIndex((l) => l.id === layer.id);
    return `Group ${idx >= 0 ? idx + 1 : 1}`;
  }
  const ordered = allLayers
    .filter((l) => l.kind !== 'group')
    .sort((a, b) => a.zIndex - b.zIndex);
  const idx = ordered.findIndex((l) => l.id === layer.id);
  return `Layer ${idx >= 0 ? idx + 1 : 1}`;
}

export function createGroupLayer(
  partial?: Partial<Pick<PenPageLayer, 'x' | 'y' | 'w' | 'h' | 'zIndex' | 'name'>>
): PenPageLayer {
  return {
    id: newLayerId(),
    kind: 'group',
    x: partial?.x ?? 24,
    y: partial?.y ?? 24,
    w: partial?.w ?? 200,
    h: partial?.h ?? 160,
    zIndex: partial?.zIndex ?? 1,
    name: partial?.name,
    backgroundColor: 'transparent'
  };
}

export function groupMembers(section: PenSectionContent, groupId: string): PenPageLayer[] {
  return (section.layers || []).filter((l) => l.parentGroupId === groupId);
}

export function recomputeGroupBounds(
  section: PenSectionContent,
  groupId: string
): PenSectionContent {
  const members = groupMembers(section, groupId);
  const group = (section.layers || []).find((l) => l.id === groupId && l.kind === 'group');
  if (!group) return section;
  if (!members.length) {
    return upsertLayer(section, {
      ...group,
      w: Math.max(group.w, 48),
      h: Math.max(group.h, 48)
    });
  }
  const minX = Math.min(...members.map((m) => m.x));
  const minY = Math.min(...members.map((m) => m.y));
  const maxR = Math.max(...members.map((m) => m.x + m.w));
  const maxB = Math.max(...members.map((m) => m.y + m.h));
  return upsertLayer(section, {
    ...group,
    x: minX,
    y: minY,
    w: Math.max(24, maxR - minX),
    h: Math.max(24, maxB - minY)
  });
}

/** Create an empty group folder (or wrap selected object ids). */
export function createGroupFromSelection(
  section: PenSectionContent,
  ids: string[] = []
): { section: PenSectionContent; groupId: string } {
  const set = new Set(ids);
  const members = (section.layers || []).filter(
    (l) => set.has(l.id) && l.kind !== 'group'
  );
  const groupCount = (section.layers || []).filter((l) => l.kind === 'group').length;
  let minX = 24;
  let minY = 24;
  let maxR = 224;
  let maxB = 184;
  if (members.length) {
    minX = Math.min(...members.map((m) => m.x));
    minY = Math.min(...members.map((m) => m.y));
    maxR = Math.max(...members.map((m) => m.x + m.w));
    maxB = Math.max(...members.map((m) => m.y + m.h));
  }
  const maxZ = (section.layers || []).reduce((m, l) => Math.max(m, l.zIndex), 0);
  const group = createGroupLayer({
    x: minX,
    y: minY,
    w: Math.max(48, maxR - minX),
    h: Math.max(48, maxB - minY),
    zIndex: maxZ + 1,
    name: `Group ${groupCount + 1}`
  });
  let next = upsertLayer(section, group);
  const prevGroups = new Set(
    members.map((m) => m.parentGroupId).filter((g): g is string => Boolean(g))
  );
  for (const m of members) {
    next = upsertLayer(next, { ...m, parentGroupId: group.id });
  }
  for (const prev of prevGroups) {
    next = recomputeGroupBounds(next, prev);
  }
  return { section: recomputeGroupBounds(next, group.id), groupId: group.id };
}

/**
 * Copy a widget's layers into the host section as one group.
 * New layer ids. Children are not position-locked. The source template is not mutated.
 */
export function copyWidgetLayersIntoSection(
  host: PenSectionContent,
  sourceLayers: PenPageLayer[],
  name: string,
  widgetTemplateId?: string
): { section: PenSectionContent; groupId: string } {
  const src = sourceLayers.filter((l) => l.kind !== 'group');
  if (!src.length) {
    const stack = (host.layers || []).filter((l) => !l.parentGroupId).length;
    const maxZ = (host.layers || []).reduce((m, l) => Math.max(m, l.zIndex), 0);
    const group = createGroupLayer({
      x: 16,
      y: 16 + stack * 12,
      w: 240,
      h: 180,
      zIndex: maxZ + 1,
      name: name.trim() || 'Widget'
    });
    if (widgetTemplateId) group.widgetTemplateId = widgetTemplateId;
    return { section: upsertLayer(host, group), groupId: group.id };
  }
  const minX = Math.min(...src.map((l) => l.x));
  const minY = Math.min(...src.map((l) => l.y));
  const maxR = Math.max(...src.map((l) => l.x + l.w));
  const maxB = Math.max(...src.map((l) => l.y + l.h));
  const stack = (host.layers || []).filter((l) => !l.parentGroupId).length;
  const originX = 16;
  const originY = 16 + stack * 12;
  const dx = originX - minX;
  const dy = originY - minY;
  const maxZ = (host.layers || []).reduce((m, l) => Math.max(m, l.zIndex), 0);
  const group = createGroupLayer({
    x: originX,
    y: originY,
    w: Math.max(48, maxR - minX),
    h: Math.max(48, maxB - minY),
    zIndex: maxZ + src.length + 1,
    name: name.trim() || 'Widget'
  });
  if (widgetTemplateId) group.widgetTemplateId = widgetTemplateId;
  const sourceGroup = sourceLayers.find((layer) => layer.kind === 'group');
  if (sourceGroup?.durationSec && sourceGroup.durationSec > 0) {
    group.durationSec = sourceGroup.durationSec;
  }
  if (sourceGroup?.motion) {
    group.motion = offsetLayerMotion(
      sourceGroup.motion,
      group.x - sourceGroup.x,
      group.y - sourceGroup.y
    );
  }
  let next = upsertLayer(host, group);
  src.forEach((layer, i) => {
    const { id: _dropId, parentGroupId: _dropParent, spreadsheetId: _dropSheet, ...rest } = layer;
    next = upsertLayer(next, {
      ...rest,
      motion: offsetLayerMotion(layer.motion, dx, dy),
      id: newLayerId(),
      parentGroupId: group.id,
      positionLocked: false,
      x: layer.x + dx,
      y: layer.y + dy,
      zIndex: maxZ + 1 + i
    });
  });
  return { section: recomputeGroupBounds(next, group.id), groupId: group.id };
}

export function setLayerParentGroup(
  section: PenSectionContent,
  layerId: string,
  parentGroupId: string | null
): PenSectionContent {
  const layer = (section.layers || []).find((l) => l.id === layerId);
  if (!layer || layer.kind === 'group') return section;
  if (parentGroupId === layerId) return section;
  const prev = layer.parentGroupId || null;
  let next = upsertLayer(section, { ...layer, parentGroupId: parentGroupId || undefined });
  if (prev) next = recomputeGroupBounds(next, prev);
  if (parentGroupId) next = recomputeGroupBounds(next, parentGroupId);
  return next;
}

/** Move a group root and all members by the same delta. */
export function moveGroupByDelta(
  section: PenSectionContent,
  groupId: string,
  dx: number,
  dy: number
): PenSectionContent {
  const layers = (section.layers || []).map((l) => {
    if (l.id === groupId || l.parentGroupId === groupId) {
      return { ...l, x: l.x + dx, y: l.y + dy };
    }
    return l;
  });
  return recomputeGroupBounds({ ...section, layers }, groupId);
}

export type LayerAlignMode =
  | 'left'
  | 'centerH'
  | 'right'
  | 'top'
  | 'middleV'
  | 'bottom';

export function alignLayers(
  section: PenSectionContent,
  ids: string[],
  mode: LayerAlignMode
): PenSectionContent {
  const set = new Set(ids);
  const targets = (section.layers || []).filter((l) => set.has(l.id));
  if (targets.length < 2) return section;
  const minX = Math.min(...targets.map((l) => l.x));
  const maxR = Math.max(...targets.map((l) => l.x + l.w));
  const minY = Math.min(...targets.map((l) => l.y));
  const maxB = Math.max(...targets.map((l) => l.y + l.h));
  const midX = (minX + maxR) / 2;
  const midY = (minY + maxB) / 2;
  const layers = (section.layers || []).map((l) => {
    if (!set.has(l.id)) return l;
    if (mode === 'left') return { ...l, x: minX };
    if (mode === 'right') return { ...l, x: maxR - l.w };
    if (mode === 'centerH') return { ...l, x: midX - l.w / 2 };
    if (mode === 'top') return { ...l, y: minY };
    if (mode === 'bottom') return { ...l, y: maxB - l.h };
    if (mode === 'middleV') return { ...l, y: midY - l.h / 2 };
    return l;
  });
  return { ...section, layers };
}

export function distributeLayers(
  section: PenSectionContent,
  ids: string[],
  axis: 'h' | 'v'
): PenSectionContent {
  const set = new Set(ids);
  const targets = (section.layers || [])
    .filter((l) => set.has(l.id))
    .sort((a, b) => (axis === 'h' ? a.x - b.x : a.y - b.y));
  if (targets.length < 3) return section;
  const first = targets[0]!;
  const last = targets[targets.length - 1]!;
  if (axis === 'h') {
    const span = last.x + last.w - first.x;
    const totalW = targets.reduce((s, l) => s + l.w, 0);
    const gap = (span - totalW) / (targets.length - 1);
    let cursor = first.x;
    const pos = new Map<string, number>();
    for (const t of targets) {
      pos.set(t.id, cursor);
      cursor += t.w + gap;
    }
    return {
      ...section,
      layers: (section.layers || []).map((l) =>
        pos.has(l.id) ? { ...l, x: pos.get(l.id)! } : l
      )
    };
  }
  const span = last.y + last.h - first.y;
  const totalH = targets.reduce((s, l) => s + l.h, 0);
  const gap = (span - totalH) / (targets.length - 1);
  let cursor = first.y;
  const pos = new Map<string, number>();
  for (const t of targets) {
    pos.set(t.id, cursor);
    cursor += t.h + gap;
  }
  return {
    ...section,
    layers: (section.layers || []).map((l) =>
      pos.has(l.id) ? { ...l, y: pos.get(l.id)! } : l
    )
  };
}

/**
 * Snap layer center to content-box midlines (CSS px).
 * Pass contentW/contentH; falls back to Letter content box when omitted.
 */
export function snapLayoutToPageCenter(
  item: LayerRect,
  opts?: {
    threshold?: number;
    thresholdPx?: number;
    enabled?: boolean;
    contentW?: number;
    contentH?: number;
    guides?: { x?: number[]; y?: number[] };
  }
): { x: number; y: number; snappedX: boolean; snappedY: boolean } {
  const contentW = opts?.contentW ?? 736;
  const contentH = opts?.contentH ?? 976;
  return snapLayoutToContentCenter(item, contentW, contentH, {
    enabled: opts?.enabled,
    thresholdPx: opts?.thresholdPx ?? opts?.threshold ?? 12,
    guides: opts?.guides
  });
}


/** Editor-only line. Vertical guides store the x; horizontal guides store the y. */
export function createGuideLayer(
  axis: 'vertical' | 'horizontal',
  positionPx: number
): PenPageLayer {
  return {
    id: newLayerId(),
    kind: 'guide',
    guideAxis: axis,
    x: axis === 'vertical' ? positionPx : 0,
    y: axis === 'horizontal' ? positionPx : 0,
    w: 0,
    h: 0,
    zIndex: 0,
    name: axis === 'vertical' ? 'Vertical guide' : 'Horizontal guide'
  };
}

export function createImageLayer(
  imageSrc: string,
  partial?: Partial<Pick<PenPageLayer, 'x' | 'y' | 'w' | 'h' | 'zIndex'>>
): PenPageLayer {
  return {
    id: newLayerId(),
    kind: 'image',
    x: partial?.x ?? 48,
    y: partial?.y ?? 48,
    w: partial?.w ?? 200,
    h: partial?.h ?? 160,
    zIndex: partial?.zIndex ?? 2,
    imageSrc
  };
}

export function createVideoLayer(
  videoSrc: string,
  partial?: Partial<Pick<PenPageLayer, 'x' | 'y' | 'w' | 'h' | 'zIndex'>>
): PenPageLayer {
  const defaultW = 240;
  const defaultH = Math.round(defaultW / DEFAULT_VIDEO_ASPECT);
  return {
    id: newLayerId(),
    kind: 'video',
    x: partial?.x ?? 48,
    y: partial?.y ?? 56,
    w: partial?.w ?? defaultW,
    h: partial?.h ?? defaultH,
    zIndex: partial?.zIndex ?? 2,
    videoSrc
  };
}

/** Frame hosting a cloud primitive / Pen doc by refDocId. */
export function createEmbedLayer(
  refDocId: string,
  partial?: Partial<
    Pick<PenPageLayer, 'x' | 'y' | 'w' | 'h' | 'zIndex' | 'name' | 'refSectionSlug' | 'positionLocked'>
  >
): PenPageLayer {
  return {
    id: newLayerId(),
    kind: 'embed',
    x: partial?.x ?? 24,
    y: partial?.y ?? 80,
    w: partial?.w ?? 320,
    h: partial?.h ?? 200,
    zIndex: partial?.zIndex ?? 2,
    name: partial?.name ?? 'Embed',
    refDocId,
    refSectionSlug: partial?.refSectionSlug,
    positionLocked: partial?.positionLocked ?? false,
    backgroundColor: '#1a1a1a',
    strokeColor: '#444444',
    strokeWidth: 1
  };
}

/** Interactive sticker (poll vote / CTA). Click handler is stub until engagement write path. */
export function createInteractiveLayer(
  input: {
    behavior: NonNullable<PenPageLayer['behavior']>;
    bindDocId: string;
    bindRowId?: string;
    label?: string;
  },
  partial?: Partial<Pick<PenPageLayer, 'x' | 'y' | 'w' | 'h' | 'zIndex' | 'name' | 'positionLocked'>>
): PenPageLayer {
  return {
    id: newLayerId(),
    kind: 'interactive',
    x: partial?.x ?? 40,
    y: partial?.y ?? 120,
    w: partial?.w ?? 280,
    h: partial?.h ?? 44,
    zIndex: partial?.zIndex ?? 5,
    name: partial?.name ?? input.label ?? 'Sticker',
    behavior: input.behavior,
    bindDocId: input.bindDocId,
    bindRowId: input.bindRowId,
    label: input.label ?? 'Vote',
    positionLocked: partial?.positionLocked ?? true,
    backgroundColor: '#2563eb',
    strokeColor: '#1d4ed8',
    strokeWidth: 1
  };
}

function requireRealDocId(id: string, error: string): string {
  const trimmed = (id || '').trim();
  if (!trimmed || trimmed === SEED_TABLE_DOC_PLACEHOLDER) throw new Error(error);
  return trimmed;
}

/** Embed bound to a real doc id. Empty and seed placeholders are refused. */
export function createBoundEmbedLayer(
  refDocId: string,
  partial?: Partial<
    Pick<PenPageLayer, 'x' | 'y' | 'w' | 'h' | 'zIndex' | 'name' | 'refSectionSlug' | 'positionLocked'>
  >
): PenPageLayer {
  const layer = createEmbedLayer(requireRealDocId(refDocId, 'embed_missing_refDocId'), partial);
  assertEmbedLayer(layer);
  return layer;
}

/**
 * Interactive sticker bound to a real doc id.
 * New stickers are movable unless `positionLocked` is set.
 */
export function createBoundInteractiveLayer(
  input: {
    behavior: NonNullable<PenPageLayer['behavior']>;
    bindDocId: string;
    bindRowId?: string;
    label?: string;
  },
  partial?: Partial<Pick<PenPageLayer, 'x' | 'y' | 'w' | 'h' | 'zIndex' | 'name' | 'positionLocked'>>
): PenPageLayer {
  const layer = createInteractiveLayer(
    {
      ...input,
      bindDocId: requireRealDocId(input.bindDocId, 'interactive_missing_bindDocId')
    },
    { positionLocked: false, ...partial }
  );
  assertInteractiveLayer(layer);
  return layer;
}

export function assertEmbedLayer(layer: PenPageLayer): void {
  if (layer.kind !== 'embed') throw new Error('not_embed_layer');
  if (!layer.refDocId?.trim()) throw new Error('embed_missing_refDocId');
}

export function assertInteractiveLayer(layer: PenPageLayer): void {
  if (layer.kind !== 'interactive') throw new Error('not_interactive_layer');
  if (!layer.bindDocId?.trim()) throw new Error('interactive_missing_bindDocId');
  if (!layer.behavior) throw new Error('interactive_missing_behavior');
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
      | 'strokeColor'
      | 'strokeWidth'
      | 'strokeStyle'
      | 'strokeAlign'
      | 'name'
      | 'parentGroupId'
      | 'bodyWrap'
      | 'mediaFilter'
      | 'mediaCrop'
      | 'x'
      | 'y'
      | 'w'
      | 'h'
      | 'mediaMask'
      | 'mediaMaskSize'
      | 'mediaMaskAngle'
      | 'mediaMaskFeather'
      | 'mediaMaskText'
      | 'mediaScale'
      | 'mediaX'
      | 'mediaY'
      | 'mediaRotate'
      | 'rotate'
      | 'timelineTrackId'
      | 'mediaMirror'
      | 'playbackRate'
      | 'mediaGain'
      | 'mediaMuted'
      | 'mediaReversed'
      | 'reverseProxySrc'
      | 'paintOverlaySrc'
      | 'audioTracks'
      | 'imageSrc'
      | 'videoSrc'
      | 'editProxySrc'
      | 'refDocId'
      | 'refSectionSlug'
      | 'behavior'
      | 'bindDocId'
      | 'bindRowId'
      | 'label'
      | 'correct'
      | 'openUrl'
      | 'submitTo'
      | 'revealLayerId'
      | 'allocateTotal'
      | 'cornerRadius'
      | 'textColor'
      | 'widgetTemplateId'
      | 'spreadsheetId'
    >
  >
): PenSectionContent {
  const existing = (section.layers || []).find((l) => l.id === layerId);
  if (!existing) throw new Error(`unknown_layer:${layerId}`);
  return upsertLayer(section, { ...existing, ...patch });
}

/** CSS stroke for preview — inside = border, outside = outline, center = half each. */
export function layerStrokeStyle(layer: PenPageLayer): {
  border?: string;
  outline?: string;
  outlineOffset?: number;
  boxShadow?: string;
} {
  const w = layer.strokeWidth ?? 0;
  if (!w || !layer.strokeColor) return {};
  const color = layer.strokeColor;
  const style = layer.strokeStyle || 'solid';
  const align = layer.strokeAlign || 'center';
  if (align === 'inside') {
    return { border: `${w}px ${style} ${color}` };
  }
  if (align === 'outside') {
    return { outline: `${w}px ${style} ${color}`, outlineOffset: 0 };
  }
  const half = Math.max(0.5, w / 2);
  return {
    border: `${half}px ${style} ${color}`,
    boxShadow: `0 0 0 ${half}px ${color}`
  };
}

/**
 * Convert a text (or other) object layer to image/video.
 * Resizes the frame to the media aspect (contain in the prior box, then the page).
 */
export function attachMediaToLayer(
  section: PenSectionContent,
  layerId: string,
  media: { kind: 'image'; src: string } | { kind: 'video'; src: string },
  opts?: {
    /** width / height; defaults 16:9 video, 1:1 image */
    aspectRatio?: number;
    pageWidth?: number;
    pageHeight?: number;
  }
): PenSectionContent {
  const existing = (section.layers || []).find((l) => l.id === layerId);
  if (!existing) throw new Error(`unknown_layer:${layerId}`);
  const aspect =
    opts?.aspectRatio && opts.aspectRatio > 0
      ? opts.aspectRatio
      : media.kind === 'video'
        ? DEFAULT_VIDEO_ASPECT
        : DEFAULT_IMAGE_ASPECT;
  const pageW = opts?.pageWidth ?? Math.max(existing.x + existing.w, 736);
  const pageH = opts?.pageHeight ?? Math.max(existing.y + existing.h, 976);
  const fitted = sizeMediaLayerForAttach(
    { x: existing.x, y: existing.y, w: existing.w, h: existing.h },
    aspect,
    pageW,
    pageH
  );
  const shared = {
    id: existing.id,
    x: fitted.x,
    y: fitted.y,
    w: fitted.w,
    h: fitted.h,
    zIndex: existing.zIndex,
    name: existing.name,
    parentGroupId: existing.parentGroupId,
    backgroundColor: undefined as string | undefined,
    backgroundImage: undefined as string | undefined,
    backgroundVideo: undefined as string | undefined,
    backgroundGradient: undefined as string | undefined,
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
    positionLocked: existing.positionLocked,
    bodyWrap: existing.bodyWrap,
    strokeColor: existing.strokeColor,
    strokeWidth: existing.strokeWidth,
    strokeStyle: existing.strokeStyle,
    strokeAlign: existing.strokeAlign,
    audioTracks: existing.audioTracks
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
 * Normalize layers for the editor. Body prose lives in section.doc (layer 0);
 * do not auto-seed overlay text boxes from prose.
 */
export function ensureDefaultTextLayer(section: PenSectionContent): PenSectionContent {
  return { ...section, layers: section.layers ?? [] };
}

/**
 * Collapse legacy migrate that copied section.doc into a lone layer_primary overlay box.
 * Keeps section.doc; drops that overlay so Body paints full-page.
 */
export function collapseLegacyPrimaryTextLayer(
  section: PenSectionContent
): PenSectionContent {
  const layers = section.layers || [];
  if (layers.length !== 1) return section;
  const only = layers[0]!;
  if (only.id !== 'layer_primary' || only.kind !== 'text') return section;
  return { ...section, layers: [] };
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
  const target = (section.layers || []).find((l) => l.id === layerId);
  const parentId = target?.parentGroupId || null;
  let layers = (section.layers || [])
    .map((l) =>
      l.parentGroupId === layerId ? { ...l, parentGroupId: undefined } : l
    )
    .filter((l) => l.id !== layerId);
  let next: PenSectionContent = { ...section, layers };
  if (parentId) next = recomputeGroupBounds(next, parentId);
  return next;
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
  layouts: Array<{
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
    zIndex: number;
    cornerRadius?: number;
  }>
): PenSectionContent {
  const byId = new Map(layouts.map((l) => [l.id, l]));
  const layers = (section.layers || []).map((layer) => {
    const hit = byId.get(layer.id);
    if (!hit) return layer;
    const next = { ...layer, x: hit.x, y: hit.y, w: hit.w, h: hit.h, zIndex: hit.zIndex };
    if (hit.cornerRadius != null) next.cornerRadius = hit.cornerRadius;
    return next;
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

/** Sync a text layer or button face. A button also keeps `label` as the plain text. */
export function setTextLayerDoc(
  section: PenSectionContent,
  layerId: string,
  textDoc: PenTipTapNode,
  opts?: { syncDoc?: boolean }
): PenSectionContent {
  const existing = (section.layers || []).find((l) => l.id === layerId);
  if (!existing || (existing.kind !== 'text' && existing.kind !== 'interactive')) {
    throw new Error(`unknown_text_layer:${layerId}`);
  }
  const nextLayer: PenPageLayer = { ...existing, textDoc };
  if (existing.kind === 'interactive') {
    const plain = docToPlainText(textDoc);
    nextLayer.label = plain;
    if (plain) nextLayer.name = plain;
  }
  const next = upsertLayer(section, nextLayer);
  if (existing.kind === 'text' && opts?.syncDoc !== false) {
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

