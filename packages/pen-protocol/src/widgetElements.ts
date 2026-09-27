/**
 * Widget elements compose inside one group and render as HTML.
 * An SVG is the box. Text, repeating answer buttons, a time element,
 * and an HTML snippet sit in that box and the box scales with the form.
 */

import { docToPlainText } from './richDoc.js';
import { upsertLayer } from './layers.js';
import { pollIsClosed, type PollCounts } from './pollSheet.js';
import { socialPresentation, type SeedBundle } from './starterSeeds.js';
import type { PenPageLayer, PenSectionContent, PenTipTapNode, PenWidgetElement } from './types.js';

export const WIDGET_TEMPLATE_ID = 'widget.v1';

export const DEFAULT_WIDGET_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 360" preserveAspectRatio="none"><rect width="320" height="360" rx="28" fill="#101418"/></svg>`;

function elementId(): string {
  return `el_${Math.random().toString(36).slice(2, 10)}`;
}

function plainDoc(text: string): PenTipTapNode {
  return {
    type: 'doc',
    content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }]
  };
}

export function sanitizeWidgetMarkup(source: string): string {
  return source
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '');
}

export function widgetElementLayers(
  section: PenSectionContent,
  groupId?: string | null
): PenPageLayer[] {
  const layers = section.layers || [];
  if (groupId) return layers.filter((layer) => layer.parentGroupId === groupId && layer.widgetElement);
  return layers.filter((layer) => layer.widgetElement && !layer.parentGroupId);
}

export type WidgetHost = {
  groupId: string | null;
  rect: { x: number; y: number; w: number; h: number };
};

export function widgetHosts(section: PenSectionContent): WidgetHost[] {
  const layers = section.layers || [];
  const groups = layers.filter((layer) => layer.kind === 'group' && layer.widgetTemplateId);
  if (groups.length) {
    return groups.map((group) => ({
      groupId: group.id,
      rect: { x: group.x, y: group.y, w: group.w, h: group.h }
    }));
  }
  const loose = layers.filter((layer) => layer.widgetElement);
  if (!loose.length) return [];
  const x = Math.min(...loose.map((layer) => layer.x));
  const y = Math.min(...loose.map((layer) => layer.y));
  const r = Math.max(...loose.map((layer) => layer.x + layer.w));
  const b = Math.max(...loose.map((layer) => layer.y + layer.h));
  return [{ groupId: null, rect: { x, y, w: Math.max(48, r - x), h: Math.max(48, b - y) } }];
}

export function widgetCountsOn(
  section: PenSectionContent,
  groupId?: string | null
): PollCounts | null {
  if (groupId) {
    const group = (section.layers || []).find((layer) => layer.id === groupId);
    return group?.widgetCounts || null;
  }
  const host = widgetElementLayers(section, null).find((layer) => layer.widgetCounts);
  return host?.widgetCounts || null;
}

export function formatCountdown(closesAt: string, now = Date.now()): string {
  if (pollIsClosed(closesAt, now)) return '00:00:00';
  const remain = Math.max(0, Date.parse(closesAt) - now);
  const total = Math.floor(remain / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return `${hours}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
}

function baseElement(
  element: PenWidgetElement,
  partial: Partial<PenPageLayer> & Pick<PenPageLayer, 'id'>
): PenPageLayer {
  return {
    kind: element === 'button' ? 'interactive' : 'text',
    x: 28,
    y: 28,
    w: 256,
    h: element === 'svg' ? 320 : 40,
    zIndex: 1,
    positionLocked: false,
    widgetElement: element,
    ...partial
  };
}

export function seedWidget(): SeedBundle {
  const layers: PenPageLayer[] = [
    baseElement('svg', {
      id: 'layer_svg',
      name: 'Box',
      x: 16,
      y: 16,
      w: 288,
      h: 328,
      zIndex: 0,
      svgSrc: DEFAULT_WIDGET_SVG
    }),
    baseElement('text', {
      id: 'layer_question',
      name: 'Question',
      x: 28,
      y: 36,
      w: 256,
      h: 48,
      zIndex: 1,
      textDoc: plainDoc('')
    }),
    baseElement('button', {
      id: 'layer_answer',
      name: 'Yes',
      x: 28,
      y: 100,
      w: 256,
      h: 44,
      zIndex: 2,
      behavior: 'poll.vote',
      bindRowId: 'opt_yes',
      label: 'Yes'
    })
  ];
  return {
    seedPageLayout: 'flow',
    seedPagePresentation: socialPresentation({
      backgroundColor: 'transparent',
      backgroundGradient: undefined,
      backgroundImage: undefined,
      fontSize: 16,
      textAlign: 'left',
      textColor: '#141414',
      padding: 0,
      dropShadowBlur: 0,
      dropShadowOffsetX: 0,
      dropShadowOffsetY: 0
    }),
    seedSections: [{ slug: 'card', doc: plainDoc(''), layers }]
  };
}

function stretchBox(section: PenSectionContent, groupId: string | null, dy: number): PenSectionContent {
  let next = section;
  const svg = widgetElementLayers(next, groupId).find((layer) => layer.widgetElement === 'svg');
  if (svg) next = upsertLayer(next, { ...svg, h: svg.h + dy });
  if (groupId) {
    const group = (next.layers || []).find((layer) => layer.id === groupId);
    if (group) next = upsertLayer(next, { ...group, h: group.h + dy });
  }
  return next;
}

export function addWidgetElement(
  section: PenSectionContent,
  groupId: string | null,
  element: PenWidgetElement
): PenSectionContent {
  const peers = widgetElementLayers(section, groupId);
  if (element === 'svg' && peers.some((layer) => layer.widgetElement === 'svg')) return section;
  if (element === 'time' && peers.some((layer) => layer.widgetElement === 'time')) return section;
  const last = peers[peers.length - 1];
  const id = elementId();
  let layer = baseElement(element, {
    id,
    name: element === 'button' ? 'Answer' : element,
    parentGroupId: groupId || undefined,
    y: last ? last.y + last.h + 8 : 28,
    zIndex: (last?.zIndex ?? 0) + 1
  });
  if (element === 'svg') layer = { ...layer, name: 'Box', svgSrc: DEFAULT_WIDGET_SVG, h: 120 };
  if (element === 'text') layer = { ...layer, name: 'Question', textDoc: plainDoc('') };
  if (element === 'button') {
    layer = {
      ...layer,
      name: 'Answer',
      label: 'Answer',
      behavior: 'poll.vote',
      bindRowId: `opt_${id.slice(3)}`
    };
  }
  if (element === 'time') layer = { ...layer, name: 'Expiry', closesAt: null };
  if (element === 'html') layer = { ...layer, name: 'Snippet', htmlSource: '' };
  const next = upsertLayer(section, layer);
  return element === 'svg' ? next : stretchBox(next, groupId, layer.h + 8);
}

export function duplicateAnswerButton(
  section: PenSectionContent,
  buttonId: string
): PenSectionContent {
  const button = (section.layers || []).find((layer) => layer.id === buttonId && layer.widgetElement === 'button');
  if (!button) return section;
  const id = elementId();
  const clone: PenPageLayer = {
    ...button,
    id,
    bindRowId: `opt_${id.slice(3)}`,
    label: 'New option',
    name: 'New option',
    y: button.y + button.h + 8,
    zIndex: button.zIndex + 1
  };
  return stretchBox(upsertLayer(section, clone), button.parentGroupId || null, button.h + 8);
}

export function setWidgetText(
  section: PenSectionContent,
  layerId: string,
  text: string
): PenSectionContent {
  const layer = (section.layers || []).find((item) => item.id === layerId);
  if (!layer) return section;
  if (layer.widgetElement === 'button') {
    return upsertLayer(section, { ...layer, label: text, name: text });
  }
  return upsertLayer(section, { ...layer, textDoc: plainDoc(text), name: layer.name || 'Question' });
}

export function setWidgetSvg(
  section: PenSectionContent,
  groupId: string | null,
  svg: string
): PenSectionContent {
  const clean = sanitizeWidgetMarkup(svg);
  const existing = widgetElementLayers(section, groupId).find((layer) => layer.widgetElement === 'svg');
  if (!existing) {
    const added = addWidgetElement(section, groupId, 'svg');
    const created = widgetElementLayers(added, groupId).find((layer) => layer.widgetElement === 'svg');
    if (!created) return added;
    return upsertLayer(added, { ...created, svgSrc: clean });
  }
  return upsertLayer(section, { ...existing, svgSrc: clean });
}

export function setWidgetHtml(
  section: PenSectionContent,
  layerId: string,
  html: string
): PenSectionContent {
  const layer = (section.layers || []).find((item) => item.id === layerId);
  if (!layer) return section;
  return upsertLayer(section, { ...layer, htmlSource: html });
}

export function setWidgetClosesAt(
  section: PenSectionContent,
  layerId: string,
  closesAt: string | null
): PenSectionContent {
  const layer = (section.layers || []).find((item) => item.id === layerId);
  if (!layer) return section;
  return upsertLayer(section, { ...layer, closesAt });
}

export function widgetQuestionText(layer: PenPageLayer): string {
  return docToPlainText(layer.textDoc || { type: 'doc', content: [] }).trim();
}
