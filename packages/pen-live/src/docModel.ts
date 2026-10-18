/**
 * Pen doc ⇄ Y.Doc.
 *
 * Shape:
 *   meta:      Y.Map { title, toc }
 *   sections:  Y.Map<slug, Y.Map {
 *     body:       Y.XmlFragment (section TipTap doc)
 *     fields:     Y.Map (other PenSectionContent fields, last writer wins per key)
 *     layers:     Y.Map<layerId, Y.Map (layer props LWW; textDoc = Y.XmlFragment; clips = Y.Array)>
 *     layerOrder: Y.Array<layerId>
 *   }>
 *
 * The bridge writes only what the local user changed since the last state it
 * exchanged with the app, so concurrent remote edits to other keys survive.
 */

import * as Y from 'yjs';
import { updateYFragment, yXmlFragmentToProsemirrorJSON } from 'y-prosemirror';
import type { Schema } from '@tiptap/pm/model';
import type {
  PenPageLayer,
  PenSectionContent,
  PenTimelineClip,
  PenTipTapNode
} from '@par-noir/pen-protocol';

/** Transaction origin for updates that arrived from peers (relay, sync, snapshot). */
export const PEN_LIVE_REMOTE = 'pen-live-remote';
/** Transaction origin for bridge writes of local app state. */
export const PEN_LIVE_LOCAL = 'pen-live-local';

export interface PenLiveDocState {
  title: string;
  toc: string[];
  sections: PenSectionContent[];
}

/** Remote change set. `sections` maps slug → new content, or null when deleted. */
export interface PenLiveRemoteChange {
  title?: string;
  toc?: string[];
  sections: Map<string, PenSectionContent | null>;
}

type AnyMap = Y.Map<any>;

const SECTION_SKIP = new Set(['slug', 'doc', 'layers']);
const LAYER_SKIP = new Set(['textDoc', 'clips']);
const EMPTY_DOC: PenTipTapNode = { type: 'doc', content: [{ type: 'paragraph' }] };

function metaMap(ydoc: Y.Doc): AnyMap {
  return ydoc.getMap('meta');
}

export function penLiveSectionsMap(ydoc: Y.Doc): Y.Map<AnyMap> {
  return ydoc.getMap('sections');
}

export function penLiveHasContent(ydoc: Y.Doc): boolean {
  return penLiveSectionsMap(ydoc).size > 0;
}

export function sectionBodyFragment(ydoc: Y.Doc, slug: string): Y.XmlFragment | null {
  const body = penLiveSectionsMap(ydoc).get(slug)?.get('body');
  return body instanceof Y.XmlFragment ? body : null;
}

export function layerTextFragment(
  ydoc: Y.Doc,
  slug: string,
  layerId: string
): Y.XmlFragment | null {
  const layers = penLiveSectionsMap(ydoc).get(slug)?.get('layers') as AnyMap | undefined;
  const text = (layers?.get(layerId) as AnyMap | undefined)?.get('textDoc');
  return text instanceof Y.XmlFragment ? text : null;
}

function clone<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

function sameJson(a: unknown, b: unknown): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

function writeFragment(ydoc: Y.Doc, frag: Y.XmlFragment, json: PenTipTapNode, schema: Schema): void {
  const node = schema.nodeFromJSON(json);
  updateYFragment(ydoc, frag, node, { mapping: new Map(), isOMark: new Map() } as any);
}

function readFragment(frag: Y.XmlFragment): PenTipTapNode {
  const json = yXmlFragmentToProsemirrorJSON(frag) as PenTipTapNode;
  return json.content && json.content.length > 0 ? json : clone(EMPTY_DOC);
}

/** Write keys the user changed (prev → next). With no prev, write everything. */
function writeFields(
  target: AnyMap,
  prev: Record<string, unknown> | undefined,
  next: Record<string, unknown>,
  skip: Set<string>
): void {
  const keys = new Set([...Object.keys(prev || {}), ...Object.keys(next)]);
  for (const key of keys) {
    if (skip.has(key)) continue;
    const nv = next[key];
    if (prev && sameJson(prev[key], nv)) continue;
    if (nv === undefined) {
      if (target.has(key)) target.delete(key);
    } else if (!sameJson(target.get(key), nv)) {
      target.set(key, clone(nv));
    }
  }
  if (!prev) {
    for (const key of Array.from(target.keys())) {
      if (!skip.has(key) && !(key in next)) target.delete(key);
    }
  }
}

function childOf<T extends Y.AbstractType<any>>(map: AnyMap, key: string, make: () => T): T {
  const cur = map.get(key);
  if (cur instanceof Y.AbstractType) return cur as T;
  const fresh = make();
  map.set(key, fresh);
  return fresh;
}

function mergeClips(
  arr: Y.Array<PenTimelineClip>,
  prev: PenTimelineClip[] | undefined,
  next: PenTimelineClip[]
): void {
  const prevById = new Map((prev || []).map((c) => [c.id, c]));
  const nextById = new Map(next.map((c) => [c.id, c]));
  for (let i = arr.length - 1; i >= 0; i--) {
    const cur = arr.get(i);
    const want = nextById.get(cur.id);
    if (!want) {
      if (!prev || prevById.has(cur.id)) arr.delete(i, 1);
      continue;
    }
    const userChanged = !prev || !sameJson(prevById.get(cur.id), want);
    if (userChanged && !sameJson(cur, want)) {
      arr.delete(i, 1);
      arr.insert(i, [clone(want)]);
    }
  }
  const present = new Set(arr.toArray().map((c) => c.id));
  for (const clip of next) {
    if (!present.has(clip.id) && (!prev || !prevById.has(clip.id))) arr.push([clone(clip)]);
  }
}

function writeLayer(
  ydoc: Y.Doc,
  lmap: AnyMap,
  prev: PenPageLayer | undefined,
  next: PenPageLayer,
  schema: Schema
): void {
  writeFields(
    lmap,
    prev as unknown as Record<string, unknown> | undefined,
    next as unknown as Record<string, unknown>,
    LAYER_SKIP
  );
  if (!prev || prev.textDoc !== next.textDoc) {
    if (next.textDoc === undefined) {
      if (lmap.has('textDoc')) lmap.delete('textDoc');
    } else {
      writeFragment(ydoc, childOf(lmap, 'textDoc', () => new Y.XmlFragment()), next.textDoc, schema);
    }
  }
  if (!prev || !sameJson(prev.clips, next.clips)) {
    if (next.clips === undefined) {
      if (lmap.has('clips')) lmap.delete('clips');
    } else {
      mergeClips(
        childOf(lmap, 'clips', () => new Y.Array<PenTimelineClip>()),
        prev?.clips,
        next.clips
      );
    }
  }
}

function writeSection(
  ydoc: Y.Doc,
  ymap: AnyMap,
  prev: PenSectionContent | undefined,
  next: PenSectionContent,
  schema: Schema
): void {
  writeFields(
    childOf(ymap, 'fields', () => new Y.Map()),
    prev as unknown as Record<string, unknown> | undefined,
    next as unknown as Record<string, unknown>,
    SECTION_SKIP
  );
  if (!prev || prev.doc !== next.doc) {
    writeFragment(ydoc, childOf(ymap, 'body', () => new Y.XmlFragment()), next.doc, schema);
  }

  const layersMap = childOf<AnyMap>(ymap, 'layers', () => new Y.Map());
  const order = childOf<Y.Array<string>>(ymap, 'layerOrder', () => new Y.Array<string>());
  const prevLayers = new Map((prev?.layers || []).map((l) => [l.id, l]));
  const nextLayers = next.layers || [];
  const nextIds = new Set(nextLayers.map((l) => l.id));

  for (const id of prevLayers.keys()) {
    if (!nextIds.has(id) && layersMap.has(id)) layersMap.delete(id);
  }
  if (!prev) {
    for (const id of Array.from(layersMap.keys())) {
      if (!nextIds.has(id)) layersMap.delete(id);
    }
  }
  for (const layer of nextLayers) {
    const prevLayer = prevLayers.get(layer.id);
    if (prevLayer === layer && layersMap.has(layer.id)) continue;
    const existing = layersMap.get(layer.id) as AnyMap | undefined;
    if (existing) {
      writeLayer(ydoc, existing, prevLayer, layer, schema);
    } else {
      const lmap = new Y.Map<any>();
      layersMap.set(layer.id, lmap);
      writeLayer(ydoc, lmap, undefined, layer, schema);
    }
  }

  const prevOrder = (prev?.layers || []).map((l) => l.id);
  const nextOrder = nextLayers.map((l) => l.id);
  if (!prev || !sameJson(prevOrder, nextOrder)) {
    if (order.length) order.delete(0, order.length);
    if (nextOrder.length) order.insert(0, nextOrder);
  }
}

function readLayer(lmap: AnyMap): PenPageLayer {
  const out: Record<string, unknown> = {};
  lmap.forEach((value, key) => {
    if (value instanceof Y.XmlFragment) out[key] = readFragment(value);
    else if (value instanceof Y.Array) {
      out[key] = (value.toArray() as PenTimelineClip[])
        .slice()
        .sort((a, b) => a.inSec - b.inSec || a.id.localeCompare(b.id));
    } else out[key] = clone(value);
  });
  return out as unknown as PenPageLayer;
}

export function readPenLiveSection(ymap: AnyMap, slug: string): PenSectionContent {
  const fields = (ymap.get('fields') as AnyMap | undefined)?.toJSON() || {};
  const body = ymap.get('body');
  const section: PenSectionContent = {
    ...(fields as Partial<PenSectionContent>),
    slug,
    doc: body instanceof Y.XmlFragment ? readFragment(body) : clone(EMPTY_DOC)
  };
  const layersMap = ymap.get('layers') as AnyMap | undefined;
  if (layersMap && layersMap.size > 0) {
    const order = ((ymap.get('layerOrder') as Y.Array<string> | undefined)?.toArray() || []).filter(
      (id, i, all) => all.indexOf(id) === i && layersMap.has(id)
    );
    const rest = Array.from(layersMap.keys()).filter((id) => !order.includes(id));
    const layers = [...order, ...rest].map((id) => readLayer(layersMap.get(id) as AnyMap));
    const ordered = order.length;
    section.layers = [
      ...layers.slice(0, ordered),
      ...layers.slice(ordered).sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))
    ];
  }
  return section;
}

export function readPenLiveState(ydoc: Y.Doc): PenLiveDocState {
  const meta = metaMap(ydoc);
  const sections: PenSectionContent[] = [];
  penLiveSectionsMap(ydoc).forEach((ymap, slug) => sections.push(readPenLiveSection(ymap, slug)));
  return {
    title: String(meta.get('title') ?? ''),
    toc: Array.isArray(meta.get('toc')) ? (meta.get('toc') as string[]) : sections.map((s) => s.slug),
    sections
  };
}

function sectionSlugOf(type: Y.AbstractType<any>, sections: Y.Map<AnyMap>): string | null {
  let t: Y.AbstractType<any> | null = type;
  while (t && t._item) {
    const parent = t._item.parent as Y.AbstractType<any>;
    if (parent === sections) return t._item.parentSub;
    t = parent;
  }
  return null;
}

/**
 * Two-way binding between the app's doc state and a Y.Doc.
 * `applyLocal` writes user changes; `onRemote` reports peer changes.
 */
export class PenLiveBridge {
  private known = new Map<string, PenSectionContent>();
  private knownTitle: string | undefined;
  private knownToc: string[] | undefined;

  constructor(
    readonly ydoc: Y.Doc,
    private readonly schema: Schema
  ) {}

  /** Record app state as already in sync (after a remote emit or initial load). */
  adopt(state: PenLiveDocState): void {
    this.known = new Map(state.sections.map((s) => [s.slug, s]));
    this.knownTitle = state.title;
    this.knownToc = state.toc;
  }

  adoptSection(section: PenSectionContent): void {
    this.known.set(section.slug, section);
  }

  forgetSection(slug: string): void {
    this.known.delete(slug);
  }

  applyLocal(state: PenLiveDocState): void {
    const { ydoc, schema } = this;
    ydoc.transact(() => {
      const meta = metaMap(ydoc);
      if (this.knownTitle !== state.title && meta.get('title') !== state.title) {
        meta.set('title', state.title);
      }
      if (!sameJson(this.knownToc, state.toc) && !sameJson(meta.get('toc'), state.toc)) {
        meta.set('toc', clone(state.toc));
      }
      const sections = penLiveSectionsMap(ydoc);
      const nextSlugs = new Set(state.sections.map((s) => s.slug));
      for (const slug of this.known.keys()) {
        if (!nextSlugs.has(slug) && sections.has(slug)) sections.delete(slug);
      }
      for (const section of state.sections) {
        const prev = this.known.get(section.slug);
        const existing = sections.get(section.slug);
        if (prev === section && existing) continue;
        if (existing) {
          writeSection(ydoc, existing, prev, section, schema);
        } else {
          const ymap = new Y.Map<any>();
          sections.set(section.slug, ymap);
          writeSection(ydoc, ymap, undefined, section, schema);
        }
      }
    }, PEN_LIVE_LOCAL);
    this.adopt(state);
  }

  /** Subscribe to peer changes. The bridge adopts emitted sections itself. */
  onRemote(cb: (change: PenLiveRemoteChange) => void): () => void {
    const handler = (tr: Y.Transaction) => {
      if (tr.origin !== PEN_LIVE_REMOTE) return;
      const sections = penLiveSectionsMap(this.ydoc);
      const meta = metaMap(this.ydoc);
      const slugs = new Set<string>();
      let metaChanged = false;
      for (const type of tr.changedParentTypes.keys()) {
        if (type === meta) {
          metaChanged = true;
          continue;
        }
        const slug = sectionSlugOf(type, sections);
        if (slug) slugs.add(slug);
      }
      for (const key of tr.changed.get(sections) || []) {
        if (key) slugs.add(key);
      }
      if (tr.changed.has(meta)) metaChanged = true;
      if (!slugs.size && !metaChanged) return;

      const change: PenLiveRemoteChange = { sections: new Map() };
      for (const slug of slugs) {
        const ymap = sections.get(slug);
        if (ymap) {
          const section = readPenLiveSection(ymap, slug);
          change.sections.set(slug, section);
          this.known.set(slug, section);
        } else {
          change.sections.set(slug, null);
          this.known.delete(slug);
        }
      }
      if (metaChanged) {
        const title = meta.get('title');
        const toc = meta.get('toc');
        if (typeof title === 'string') {
          change.title = title;
          this.knownTitle = title;
        }
        if (Array.isArray(toc)) {
          change.toc = toc as string[];
          this.knownToc = change.toc;
        }
      }
      cb(change);
    };
    this.ydoc.on('afterTransaction', handler);
    return () => this.ydoc.off('afterTransaction', handler);
  }
}

/**
 * Seed update for a doc that has no live state yet. Written by client id 0 so
 * two devices seeding the same content produce identical items (no duplicates).
 */
export function penLiveSeedUpdate(state: PenLiveDocState, schema: Schema): Uint8Array {
  const seed = new Y.Doc();
  seed.clientID = 0;
  new PenLiveBridge(seed, schema).applyLocal(state);
  return Y.encodeStateAsUpdate(seed);
}
