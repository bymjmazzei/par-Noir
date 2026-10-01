/**
 * Viewer overlay HTML built from action layers.
 * Inert image and video stay out of this fragment — they are the iframe background.
 */

import { partitionLayersForCompose } from './actionPartition.js';
import { docToPlainText } from './richDoc.js';
import type { PenPageLayer, PenSectionContent } from './types.js';
import { sanitizeWidgetMarkup, timeLayerCaption } from './widgetElements.js';

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function boxStyle(layer: PenPageLayer): string {
  const parts = [
    'position:absolute',
    'box-sizing:border-box',
    `left:${Math.round(layer.x)}px`,
    `top:${Math.round(layer.y)}px`,
    `width:${Math.round(layer.w)}px`,
    `height:${Math.round(layer.h)}px`,
    `z-index:${layer.zIndex}`
  ];
  if (layer.backgroundColor) parts.push(`background:${esc(layer.backgroundColor)}`);
  if (layer.textColor) parts.push(`color:${esc(layer.textColor)}`);
  if (layer.opacity != null) parts.push(`opacity:${Math.max(0, Math.min(100, layer.opacity)) / 100}`);
  if (layer.rotate) parts.push(`transform:rotate(${layer.rotate}deg)`);
  if (layer.cornerRadius != null) parts.push(`border-radius:${Math.round(layer.cornerRadius)}px`);
  return parts.join(';');
}

function buttonLabel(layer: PenPageLayer): string {
  const face = layer.textDoc ? docToPlainText(layer.textDoc).trim() : '';
  return face || layer.label || 'Button';
}

function layerHtml(layer: PenPageLayer): string {
  const style = boxStyle(layer);
  const id = esc(layer.id);
  if (layer.widgetElement === 'html') {
    const src = esc(sanitizeWidgetMarkup(layer.htmlSource || ''));
    return `<iframe sandbox="" data-pen-layer="${id}" title="${esc(layer.name || 'Snippet')}" style="${style};border:0;background:#fff" srcdoc="${src}"></iframe>`;
  }
  if (layer.widgetElement === 'input') {
    const label = esc(layer.label || '');
    return `<input data-pen-layer="${id}" data-pen-input="1" placeholder="${label}" style="${style}" />`;
  }
  if (layer.widgetElement === 'time') {
    return `<div data-pen-layer="${id}" data-pen-time="1" style="${style};display:flex;align-items:center;justify-content:center">${esc(timeLayerCaption(layer))}</div>`;
  }
  if (layer.kind === 'interactive' && layer.behavior) {
    const behavior = esc(layer.behavior);
    const row = layer.bindRowId ? ` data-pen-bind-row="${esc(layer.bindRowId)}"` : '';
    return `<button type="button" data-pen-layer="${id}" data-pen-behavior="${behavior}"${row} style="${style}">${esc(buttonLabel(layer))}</button>`;
  }
  if (layer.kind === 'interactive') {
    return `<button type="button" data-pen-layer="${id}" style="${style}">${esc(buttonLabel(layer))}</button>`;
  }
  return '';
}

/** Overlay fragment for one or more sections. Omits inert media. */
export function buildActionStageHtml(
  sections: PenSectionContent[] | null | undefined
): string {
  const parts: string[] = [];
  for (const section of sections || []) {
    for (const layer of partitionLayersForCompose(section.layers).action) {
      const html = layerHtml(layer);
      if (html) parts.push(html);
    }
  }
  return parts.join('');
}

export type ActionStageMediaKind = 'image' | 'video';

/** Full iframe document: flattened media behind the action overlay. */
export function buildActionStageDocument(input: {
  mediaSrc?: string;
  mediaKind?: ActionStageMediaKind;
  overlayHtml?: string;
}): string {
  const src = (input.mediaSrc || '').trim();
  const media = !src
    ? ''
    : input.mediaKind === 'video'
      ? `<video class="bg" src="${esc(src)}" autoplay muted playsinline loop></video>`
      : `<img class="bg" src="${esc(src)}" alt="" />`;
  const overlay = input.overlayHtml || '';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%;background:#000}.stage{position:relative;width:100%;height:100%;overflow:hidden}.bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.overlay{position:absolute;inset:0}</style></head><body><div class="stage">${media}<div class="overlay">${overlay}</div></div><script>document.addEventListener('click',function(e){var t=e.target&&e.target.closest?e.target.closest('[data-pen-behavior]'):null;if(!t||!parent)return;parent.postMessage({type:'pen-action',layerId:t.getAttribute('data-pen-layer')||'',behavior:t.getAttribute('data-pen-behavior')||'',bindRowId:t.getAttribute('data-pen-bind-row')||''},'*');});</script></body></html>`;
}

export type PenActionMessage = {
  type: 'pen-action';
  layerId: string;
  behavior: string;
  bindRowId: string;
};

export function readPenActionMessage(data: unknown): PenActionMessage | null {
  if (!data || typeof data !== 'object') return null;
  const msg = data as Partial<PenActionMessage>;
  if (msg.type !== 'pen-action') return null;
  if (typeof msg.layerId !== 'string' || typeof msg.behavior !== 'string') return null;
  return {
    type: 'pen-action',
    layerId: msg.layerId,
    behavior: msg.behavior,
    bindRowId: typeof msg.bindRowId === 'string' ? msg.bindRowId : ''
  };
}
