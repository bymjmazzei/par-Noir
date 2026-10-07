import type { PageWidgetPreset, PenTextLook } from '@par-noir/pen-protocol';

/** Text looks exposed in Layers + add menu (Label omitted from UI). */
export const LAYERS_TEXT_LOOK_PRESETS: { look: PenTextLook; label: string }[] = [
  { look: 'title', label: 'Title' },
  { look: 'caption', label: 'Caption' },
  { look: 'quote', label: 'Quote' }
];

export const LAYERS_WIDGET_ELEMENTS: { element: 'input' | 'button' | 'time' | 'html'; label: string }[] = [
  { element: 'input', label: 'Text input' },
  { element: 'button', label: 'Button' },
  { element: 'time', label: 'Time' },
  { element: 'html', label: 'HTML snippet' }
];

export const LAYERS_PAGE_WIDGET_PRESETS: { preset: PageWidgetPreset; label: string }[] = [
  { preset: 'poll', label: 'Poll' },
  { preset: 'countdown', label: 'Countdown' },
  { preset: 'link', label: 'Link' }
];

export type LayersAddAccordionSection = 'text' | 'media' | 'widgets';

export const LAYERS_ADD_TOP_ROWS = ['Text', 'Media', 'Widgets', 'Stickers', 'New group'] as const;
