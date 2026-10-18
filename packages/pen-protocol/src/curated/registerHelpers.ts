import type { PenTemplate } from '../templates.js';
import type { SeedBundle } from '../starterSeeds.js';

export function proseStarter(input: { title: string; focus: string }): string {
  return [
    `You are authoring a Pen document with template {{template_id}} ("${input.title}").`,
    input.focus,
    'Sections for this template: {{section_list}}.',
    'Emit ONLY a PenAgentBuild JSON object: { "templateId", "title", "sections": [{ "slug", "plainText" }] }.',
    'Use only the section slugs listed. Do not invent folder paths, file layouts, or parallel formats.',
    'Never include secrets, pn name, passcodes, tokens, or raw account identifiers.',
    'User request:',
    '{{user_input}}'
  ].join('\n');
}

export function withSeedBundle(base: Omit<PenTemplate, 'seedSections' | 'seedPagePresentation' | 'seedPageLayout'>, seed: SeedBundle): PenTemplate {
  return { ...base, seedSections: seed.seedSections, seedPagePresentation: seed.seedPagePresentation, seedPageLayout: seed.seedPageLayout };
}
