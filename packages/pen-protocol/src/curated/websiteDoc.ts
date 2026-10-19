import type { SeedBundle } from '../starterSeeds.js';
import { socialPresentation } from '../starterSeeds.js';
import { plainDoc } from '../widgetElements.js';
import { curatedCardSeed, stackSections } from './kit.js';
import { seedWebContact, seedWebFaq, seedWebFeatures, seedWebHero, seedWebNav, seedWebTeam } from './website.js';

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
