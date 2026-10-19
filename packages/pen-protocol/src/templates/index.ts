import type { PenTemplate } from '../templates.js';
import { collectionTemplates } from './collections.js';
import { comparisonTemplates } from './comparisons.js';
import { noteTemplates } from './notes.js';
import { postTemplates } from './posts.js';
import { profileTemplates } from './profiles.js';

/** Platform social post templates, five per form, in rail order. */
export function platformPostTemplates(): PenTemplate[] {
  return [...noteTemplates(), ...postTemplates(), ...collectionTemplates(), ...profileTemplates(), ...comparisonTemplates()];
}

export { frameOf } from './shared.js';
