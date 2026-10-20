import type { PenTextLook, PenWidgetElement } from '@par-noir/pen-protocol';

/** Text looks exposed in Layers + add menu (Label omitted from UI). */
export const LAYERS_TEXT_LOOK_PRESETS: { look: PenTextLook; label: string }[] = [
  { look: 'title', label: 'Title' },
  { look: 'caption', label: 'Caption' },
  { look: 'quote', label: 'Quote' }
];

/** Single widget building blocks listed under Widgets after "All widgets". */
export const LAYERS_WIDGET_ELEMENTS: { element: PenWidgetElement; label: string }[] = [
  { element: 'input', label: 'Text input' },
  { element: 'button', label: 'Button' },
  { element: 'time', label: 'Time' },
  { element: 'html', label: 'HTML snippet' }
];

export type LayersAddAccordionSection = 'image' | 'video' | 'audio' | 'widgets';

export const LAYERS_ADD_TOP_ROWS = [
  'Text',
  'Image',
  'Video',
  'Audio',
  'Widgets',
  'Stickers',
  'New group'
] as const;
