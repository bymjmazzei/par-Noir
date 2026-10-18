import type { PenTemplate } from '../templates.js';
import type { SeedBundle } from '../starterSeeds.js';

export function proseStarter(input: { title: string; focus: string }): string {
  return `Create a ${input.title} widget. ${input.focus}`;
}

export function withSeedBundle(base: Omit<PenTemplate, 'seedSections' | 'seedPagePresentation' | 'seedPageLayout'>, seed: SeedBundle): PenTemplate {
  return { ...base, seedSections: seed.seedSections, seedPagePresentation: seed.seedPagePresentation, seedPageLayout: seed.seedPageLayout };
}
