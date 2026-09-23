/** Page layer helpers — multi text/image objects on a section. */

import { emptyTipTapDoc } from './richDoc.js';
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
    x: partial?.x ?? 8,
    y: partial?.y ?? 8,
    w: partial?.w ?? 84,
    h: partial?.h ?? 40,
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
    x: partial?.x ?? 10,
    y: partial?.y ?? 10,
    w: partial?.w ?? 40,
    h: partial?.h ?? 40,
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
    return upsertLayer(section, { ...group, w: Math.max(group.w, 8), h: Math.max(group.h, 8) });
  }
  const minX = Math.min(...members.map((m) => m.x));
  const minY = Math.min(...members.map((m) => m.y));
  const maxR = Math.max(...members.map((m) => m.x + m.w));
  const maxB = Math.max(...members.map((m) => m.y + m.h));
  return upsertLayer(section, {
    ...group,
    x: minX,
    y: minY,
    w: Math.max(4, maxR - minX),
    h: Math.max(4, maxB - minY)
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
  let minX = 10;
  let minY = 10;
  let maxR = 50;
  let maxB = 50;
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
    w: Math.max(8, maxR - minX),
    h: Math.max(8, maxB - minY),
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

/** Snap layer center to page center when within threshold (%). */
export function snapLayoutToPageCenter(
  item: { x: number; y: number; w: number; h: number },
  opts?: { threshold?: number; enabled?: boolean }
): { x: number; y: number; snappedX: boolean; snappedY: boolean } {
  if (opts?.enabled === false) {
    return { x: item.x, y: item.y, snappedX: false, snappedY: false };
  }
  const thr = opts?.threshold ?? 2.5;
  const cx = item.x + item.w / 2;
  const cy = item.y + item.h / 2;
  let x = item.x;
  let y = item.y;
  let snappedX = false;
  let snappedY = false;
  if (Math.abs(cx - 50) <= thr) {
    x = 50 - item.w / 2;
    snappedX = true;
  }
  if (Math.abs(cy - 50) <= thr) {
    y = 50 - item.h / 2;
    snappedY = true;
  }
  return { x, y, snappedX, snappedY };
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
      | 'strokeColor'
      | 'strokeWidth'
      | 'strokeStyle'
      | 'strokeAlign'
      | 'name'
      | 'parentGroupId'
      | 'bodyWrap'
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

