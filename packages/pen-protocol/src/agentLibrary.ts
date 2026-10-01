/**
 * Agent library HTML compiles into the page and layers the editor already edits.
 * A named object does not stay a snippet. Leftover markup stays one html layer.
 */

import { plainDoc, sanitizeWidgetMarkup } from './widgetElements.js';
import type {
  PenDocManifest,
  PenInteractiveBehavior,
  PenMediaMask,
  PenPageLayer,
  PenPageLayerKind,
  PenPageLayout,
  PenPageOrientation,
  PenPagePresentation,
  PenPageSizeId,
  PenPageView,
  PenWidgetElement
} from './types.js';

const BEHAVIORS: PenInteractiveBehavior[] = [
  'poll.vote',
  'cta.open',
  'widget.submit',
  'widget.toggle',
  'widget.stamp',
  'widget.rank',
  'widget.allocate',
  'widget.reveal'
];

const PAGE_SIZES: PenPageSizeId[] = [
  'flow',
  'letter',
  'legal',
  'a4',
  'ratio-9-16',
  'ratio-1-1',
  'ratio-4-5',
  'ratio-3-2',
  'ratio-4-3',
  'custom'
];

const MASKS: PenMediaMask[] = ['none', 'circle', 'rounded', 'rect', 'split', 'filmstrip', 'text'];

const NUMBER_FIELDS = new Set([
  'x',
  'y',
  'w',
  'h',
  'zIndex',
  'rotate',
  'opacity',
  'cornerRadius',
  'blur',
  'strokeWidth',
  'shadowBlur',
  'shadowOffsetX',
  'shadowOffsetY',
  'blendAmount',
  'mediaScale',
  'mediaX',
  'mediaY',
  'mediaRotate',
  'mediaMaskSize',
  'mediaMaskAngle',
  'mediaMaskFeather',
  'playbackRate',
  'mediaGain',
  'inSec',
  'outSec',
  'sourceInSec',
  'durationSec',
  'allocateTotal'
]);

const BOOL_FIELDS = new Set([
  'visible',
  'positionLocked',
  'correct',
  'mediaMirror',
  'mediaMuted',
  'mediaReversed'
]);

const JSON_FIELDS = new Set(['mediaFilter', 'mediaCrop', 'motion', 'clips', 'audioTracks', 'transitionIn']);

const ATTR_FIELD: Record<string, string> = {
  z: 'zIndex',
  'bind-row': 'bindRowId',
  'open-url': 'openUrl',
  'submit-to': 'submitTo',
  reveal: 'revealLayerId',
  'allocate-total': 'allocateTotal',
  fill: 'backgroundColor',
  color: 'textColor',
  locked: 'positionLocked',
  'time-face': 'timeFace',
  'closes-at': 'closesAt',
  'clock-time': 'clockTime',
  ref: 'refDocId',
  mask: 'mediaMask',
  'playback-rate': 'playbackRate',
  parent: 'parentGroupId'
};

export type CompiledAgentPage = Partial<
  Pick<
    PenDocManifest,
    | 'pageSize'
    | 'pageOrientation'
    | 'galleryAspect'
    | 'pageLayout'
    | 'pageView'
    | 'pagePresentation'
  >
>;

export type CompiledAgentLibrary = {
  page: CompiledAgentPage;
  layers: PenPageLayer[];
};

type RawEl = { tag: string; attrs: Record<string, string>; inner: string };

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([a-zA-Z][\w-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw))) {
    attrs[match[1]!.toLowerCase()] = match[2] ?? match[3] ?? '';
  }
  return attrs;
}

function parseTop(source: string): { elements: RawEl[]; leftover: string } {
  const elements: RawEl[] = [];
  let leftover = '';
  let i = 0;
  const text = String(source || '');
  while (i < text.length) {
    const start = text.indexOf('<pen-', i);
    if (start < 0) {
      leftover += text.slice(i);
      break;
    }
    leftover += text.slice(i, start);
    const nameEnd = text.indexOf('>', start);
    if (nameEnd < 0) {
      leftover += text.slice(start);
      break;
    }
    const open = text.slice(start + 1, nameEnd);
    const selfClose = /\/\s*$/.test(open);
    const head = selfClose ? open.replace(/\/\s*$/, '') : open;
    const space = head.search(/\s/);
    const tag = (space < 0 ? head : head.slice(0, space)).toLowerCase();
    const attrs = parseAttrs(space < 0 ? '' : head.slice(space));
    if (selfClose) {
      elements.push({ tag, attrs, inner: '' });
      i = nameEnd + 1;
      continue;
    }
    const close = `</${tag}>`;
    let depth = 1;
    let cursor = nameEnd + 1;
    let innerEnd = -1;
    while (cursor < text.length && depth > 0) {
      const nextOpen = text.indexOf(`<${tag}`, cursor);
      const nextClose = text.indexOf(close, cursor);
      if (nextClose < 0) break;
      if (nextOpen >= 0 && nextOpen < nextClose) {
        depth += 1;
        cursor = nextOpen + tag.length + 1;
        continue;
      }
      depth -= 1;
      if (depth === 0) innerEnd = nextClose;
      cursor = nextClose + close.length;
    }
    if (innerEnd < 0) {
      elements.push({ tag, attrs, inner: text.slice(nameEnd + 1) });
      break;
    }
    elements.push({ tag, attrs, inner: text.slice(nameEnd + 1, innerEnd) });
    i = innerEnd + close.length;
  }
  return { elements, leftover };
}

function fieldName(attr: string): string {
  if (ATTR_FIELD[attr]) return ATTR_FIELD[attr]!;
  return attr.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

function applyAttrs(layer: PenPageLayer, attrs: Record<string, string>): void {
  const bag = layer as unknown as Record<string, unknown>;
  for (const [rawKey, rawVal] of Object.entries(attrs)) {
    if (rawKey === 'src' || rawKey === 'id') continue;
    const key = fieldName(rawKey);
    if (key === 'behavior') {
      if (BEHAVIORS.includes(rawVal as PenInteractiveBehavior)) {
        layer.behavior = rawVal as PenInteractiveBehavior;
      }
      continue;
    }
    if (key === 'mediaMask') {
      if (MASKS.includes(rawVal as PenMediaMask)) layer.mediaMask = rawVal as PenMediaMask;
      continue;
    }
    if (NUMBER_FIELDS.has(key)) {
      const n = Number(rawVal);
      if (Number.isFinite(n)) bag[key] = n;
      continue;
    }
    if (BOOL_FIELDS.has(key)) {
      bag[key] = rawVal === 'true' || rawVal === '1';
      continue;
    }
    if (JSON_FIELDS.has(key)) {
      try {
        bag[key] = JSON.parse(rawVal);
      } catch {
        /* skip invalid json */
      }
      continue;
    }
    if (rawVal) bag[key] = rawVal;
  }
}

let seq = 0;
function nextId(attrs: Record<string, string>): string {
  const given = (attrs.id || '').trim();
  if (given) return given;
  seq += 1;
  return `el_${seq}`;
}

function base(attrs: Record<string, string>, kind: PenPageLayerKind): PenPageLayer {
  return {
    id: nextId(attrs),
    kind,
    x: 24,
    y: 24,
    w: 160,
    h: 80,
    zIndex: 1
  };
}

function layerFrom(el: RawEl): PenPageLayer | null {
  const tag = el.tag;
  let layer: PenPageLayer | null = null;
  let widget: PenWidgetElement | undefined;
  if (tag === 'pen-image') {
    layer = base(el.attrs, 'image');
    layer.w = 160;
    layer.h = 120;
    if (el.attrs.src) layer.imageSrc = el.attrs.src;
  } else if (tag === 'pen-video') {
    layer = base(el.attrs, 'video');
    layer.w = 360;
    layer.h = 640;
    if (el.attrs.src) layer.videoSrc = el.attrs.src;
  } else if (tag === 'pen-text') {
    layer = base(el.attrs, 'text');
    widget = 'text';
    layer.h = 40;
    layer.textDoc = plainDoc(el.inner.trim());
  } else if (tag === 'pen-button') {
    layer = base(el.attrs, 'interactive');
    widget = 'button';
    layer.w = 120;
    layer.h = 40;
    const label = el.inner.trim() || el.attrs.label || 'Button';
    layer.label = label;
    layer.textDoc = plainDoc(label);
  } else if (tag === 'pen-input') {
    layer = base(el.attrs, 'text');
    widget = 'input';
    layer.h = 36;
    layer.label = el.attrs.label || el.inner.trim();
  } else if (tag === 'pen-time') {
    layer = base(el.attrs, 'text');
    widget = 'time';
    layer.h = 32;
  } else if (tag === 'pen-svg') {
    layer = base(el.attrs, 'text');
    widget = 'svg';
    layer.svgSrc = sanitizeWidgetMarkup(el.inner.trim());
  } else if (tag === 'pen-html') {
    layer = base(el.attrs, 'text');
    widget = 'html';
    layer.htmlSource = el.inner;
  } else if (tag === 'pen-embed') {
    layer = base(el.attrs, 'embed');
  } else if (tag === 'pen-group') {
    layer = base(el.attrs, 'group');
  } else if (tag === 'pen-guide') {
    layer = base(el.attrs, 'guide');
  }
  if (!layer) return null;
  if (widget) layer.widgetElement = widget;
  applyAttrs(layer, el.attrs);
  if (layer.behavior === 'poll.vote' && !layer.bindRowId) layer.bindRowId = layer.id;
  return layer;
}

function pageFrom(attrs: Record<string, string>): CompiledAgentPage {
  const page: CompiledAgentPage = {};
  const size = attrs['page-size'];
  if (size && PAGE_SIZES.includes(size as PenPageSizeId)) page.pageSize = size as PenPageSizeId;
  const orientation = attrs.orientation;
  if (orientation === 'portrait' || orientation === 'landscape') {
    page.pageOrientation = orientation as PenPageOrientation;
  }
  const aspect = attrs['gallery-aspect'];
  if (aspect === '9/16' || aspect === '16/9' || aspect === '1/1') page.galleryAspect = aspect;
  const layout = attrs['page-layout'];
  if (layout === 'flow' || layout === 'letter' || layout === 'a4') {
    page.pageLayout = layout as PenPageLayout;
  }
  const view = attrs['page-view'];
  if (view === 'vertical' || view === 'horizontal' || view === 'screen') {
    page.pageView = view as PenPageView;
  }
  const presentation: Partial<PenPagePresentation> = {};
  if (attrs['font-family']) presentation.fontFamily = attrs['font-family'];
  if (attrs['font-size'] && Number.isFinite(Number(attrs['font-size']))) {
    presentation.fontSize = Number(attrs['font-size']);
  }
  if (attrs['text-color']) presentation.textColor = attrs['text-color'];
  if (
    attrs['text-align'] === 'left' ||
    attrs['text-align'] === 'center' ||
    attrs['text-align'] === 'right' ||
    attrs['text-align'] === 'justify'
  ) {
    presentation.textAlign = attrs['text-align'];
  }
  if (attrs.padding && Number.isFinite(Number(attrs.padding))) {
    presentation.padding = Number(attrs.padding);
  }
  if (attrs.background) presentation.backgroundColor = attrs.background;
  if (attrs['background-image']) presentation.backgroundImage = attrs['background-image'];
  if (attrs['background-video']) presentation.backgroundVideo = attrs['background-video'];
  if (Object.keys(presentation).length) {
    page.pagePresentation = presentation as PenPagePresentation;
  }
  return page;
}

/** Compile library HTML into page fields and native layers. */
export function compileAgentLibraryHtml(source: string): CompiledAgentLibrary {
  seq = 0;
  const top = parseTop(source);
  let page: CompiledAgentPage = {};
  let body = top.elements;
  let leftover = top.leftover;
  const pageEl = body.find((el) => el.tag === 'pen-page');
  if (pageEl) {
    page = pageFrom(pageEl.attrs);
    const inner = parseTop(pageEl.inner);
    body = inner.elements;
    leftover += inner.leftover;
  }
  const layers: PenPageLayer[] = [];
  for (const el of body) {
    if (el.tag === 'pen-page') continue;
    const layer = layerFrom(el);
    if (layer) layers.push(layer);
  }
  const extra = leftover.trim();
  if (extra && /<\w/.test(extra)) {
    layers.push({
      id: nextId({}),
      kind: 'text',
      widgetElement: 'html',
      name: 'Snippet',
      x: 24,
      y: 24,
      w: 200,
      h: 80,
      zIndex: 1,
      htmlSource: extra
    });
  }
  return { page, layers };
}

/** True when library HTML produced at least one layer. */
export function agentHtmlHasLayers(source: string | undefined): boolean {
  if (!source || !source.trim()) return false;
  return compileAgentLibraryHtml(source).layers.length > 0;
}
