/** Widget Art layer (`widgetElement: 'html'`) — structured fill or HTML snippet. */

import { patchLayerStyle } from './layers.js';
import type { PenPageLayer, PenSectionContent } from './types.js';

export type WidgetArtFillMode = 'html' | 'color' | 'gradient' | 'image' | 'video';

export function isWidgetArtLayer(layer: PenPageLayer): boolean {
  return layer.widgetElement === 'html';
}

/** Which fill mode is active; structured fields win over `htmlSource`. */
export function widgetArtFillMode(layer: PenPageLayer): WidgetArtFillMode {
  if (!isWidgetArtLayer(layer)) throw new Error('not_widget_art_layer');
  if (layer.backgroundVideo?.trim()) return 'video';
  if (layer.backgroundImage?.trim()) return 'image';
  if (layer.backgroundGradient?.trim()) return 'gradient';
  if (layer.backgroundColor && layer.backgroundColor !== 'transparent') return 'color';
  if ((layer.htmlSource || '').trim()) return 'html';
  return 'color';
}

export function widgetArtUsesHtmlSnippet(layer: PenPageLayer): boolean {
  return isWidgetArtLayer(layer) && widgetArtFillMode(layer) === 'html';
}

const CLEAR_ART_FILL = {
  backgroundColor: undefined,
  backgroundImage: undefined,
  backgroundVideo: undefined,
  backgroundGradient: undefined,
  htmlSource: undefined
} as const;

/** Switch Art to a fill kind; clears competing fields. */
export function switchWidgetArtFillMode(
  section: PenSectionContent,
  layerId: string,
  mode: WidgetArtFillMode
): PenSectionContent {
  const layer = (section.layers || []).find((item) => item.id === layerId);
  if (!layer || !isWidgetArtLayer(layer)) throw new Error('not_widget_art_layer');
  switch (mode) {
    case 'html':
      return patchLayerStyle(section, layerId, {
        ...CLEAR_ART_FILL,
        backgroundColor: 'transparent',
        htmlSource: layer.htmlSource || '<style>html,body{margin:0;height:100%}</style>'
      });
    case 'color':
      return patchLayerStyle(section, layerId, {
        ...CLEAR_ART_FILL,
        backgroundColor: '#f5f5f5'
      });
    case 'gradient':
      return patchLayerStyle(section, layerId, {
        ...CLEAR_ART_FILL,
        backgroundGradient: 'linear-gradient(135deg, #111111 0%, #666666 100%)'
      });
    case 'image':
    case 'video':
      return patchLayerStyle(section, layerId, { ...CLEAR_ART_FILL });
    default:
      return section;
  }
}

export function applyWidgetArtMedia(
  section: PenSectionContent,
  layerId: string,
  media: { kind: 'image'; src: string } | { kind: 'video'; src: string }
): PenSectionContent {
  const layer = (section.layers || []).find((item) => item.id === layerId);
  if (!layer || !isWidgetArtLayer(layer)) throw new Error('not_widget_art_layer');
  const cleared = {
    htmlSource: undefined,
    backgroundGradient: undefined,
    backgroundColor: undefined
  };
  if (media.kind === 'image') {
    return patchLayerStyle(section, layerId, {
      ...cleared,
      backgroundImage: media.src,
      backgroundVideo: undefined
    });
  }
  return patchLayerStyle(section, layerId, {
    ...cleared,
    backgroundVideo: media.src,
    backgroundImage: undefined
  });
}
