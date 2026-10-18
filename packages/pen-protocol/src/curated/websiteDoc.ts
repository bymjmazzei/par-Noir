import type { SeedBundle } from '../starterSeeds.js';
import type { PenPageLayer } from '../types.js';
import { socialPresentation } from '../starterSeeds.js';
import { plainDoc } from '../widgetElements.js';
import { curatedCardSeed } from './kit.js';
import { seedWebContact, seedWebFaq, seedWebFeatures, seedWebHero, seedWebNav, seedWebTeam } from './website.js';

/** Stacks section seeds top to bottom, prefixing ids so each page stays unique. */
function stackSections(page: string, sections: Array<() => SeedBundle>): PenPageLayer[] {
  const out: PenPageLayer[] = [];
  let top = 0;
  sections.forEach((seed, index) => {
    const layers = seed().seedSections[0]?.layers ?? [];
    const reId = (id: string) => `${page}_${index}_${id}`;
    let height = 0;
    for (const layer of layers) {
      if (layer.widgetElement === 'html') height = Math.max(height, layer.h);
      out.push({
        ...layer,
        id: reId(layer.id),
        y: layer.y + top,
        ...(layer.revealLayerId ? { revealLayerId: reId(layer.revealLayerId) } : {}),
        ...(layer.bindRowId ? { bindRowId: reId(layer.bindRowId) } : {})
      });
    }
    top += height;
  });
  return out;
}

/** Home / About / Contact site with the nav bar on each page (vertical swipe). */
export function seedWebsiteDoc(): SeedBundle {
  const base = curatedCardSeed([]);
  const presentation = socialPresentation({
    backgroundColor: '#0b0b0c',
    textAlign: 'left',
    fontSize: 28,
    textColor: '#f5f5f4',
    padding: 0,
    dropShadowBlur: 0
  });
  return {
    seedPageLayout: base.seedPageLayout,
    seedPagePresentation: presentation,
    seedSections: [
      { slug: 'home', doc: plainDoc(''), layers: stackSections('home', [seedWebNav, seedWebHero, seedWebFeatures, seedWebFaq]) },
      { slug: 'about', doc: plainDoc(''), layers: stackSections('about', [seedWebNav, seedWebTeam]) },
      { slug: 'contact', doc: plainDoc(''), layers: stackSections('contact', [seedWebNav, seedWebContact]) }
    ]
  };
}
