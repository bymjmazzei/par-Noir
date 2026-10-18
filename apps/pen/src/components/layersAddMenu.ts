import type { PenTextLook } from '@par-noir/pen-protocol';

/** Text looks exposed in Layers + add menu (Label omitted from UI). */
export const LAYERS_TEXT_LOOK_PRESETS: { look: PenTextLook; label: string }[] = [
  { look: 'title', label: 'Title' },
  { look: 'caption', label: 'Caption' },
  { look: 'quote', label: 'Quote' }
];

export type LayersAddAccordionSection = 'image' | 'video' | 'audio';

export const LAYERS_ADD_TOP_ROWS = [
  'Text',
  'Image',
  'Video',
  'Audio',
  'Widgets',
  'Stickers',
  'New group'
] as const;
