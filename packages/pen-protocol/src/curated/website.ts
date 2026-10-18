import type { SeedBundle } from '../starterSeeds.js';
import { artHtml, artLayer, bodyStyle, buttonLayer, curatedCardSeed, kickerStyle, textLayer, titleStyle } from './kit.js';

export function seedWebNav(): SeedBundle {
  const opt = { fill: 'rgba(255,255,255,0.16)', color: '#ffffff' };
  return curatedCardSeed([
    artLayer('w_web_nav_v1_art', artHtml('linear-gradient(150deg,#0f766e 0%,#1e3a8a 60%,#312e81 100%)', '<div class="s" style="width:240px;height:240px;right:-50px;top:-40px;background:rgba(255,255,255,0.15)"></div><div class="s" style="width:90px;height:90px;left:-30px;bottom:-30px;background:rgba(255,255,255,0.1)"></div>'), 360),
    textLayer('w_web_nav_v1_k', { x: 24, y: 12, w: 280, h: 28, z: 2 }, 'WEBSITE', kickerStyle),
    textLayer('w_web_nav_v1_t', { x: 24, y: 44, w: 312, h: 56, z: 3 }, 'Nav bar', titleStyle),
    buttonLayer('w_web_nav_v1_h', { x: 24, y: 280, w: 90, h: 32, z: 5 }, 'Home', opt, { behavior: 'page.go', goTo: 'page:0' }),
    buttonLayer('w_web_nav_v1_a', { x: 120, y: 280, w: 90, h: 32, z: 6 }, 'About', opt, { behavior: 'page.go', goTo: 'page:1' }),
    buttonLayer('w_web_nav_v1_c', { x: 216, y: 280, w: 90, h: 32, z: 7 }, 'Contact', opt, { behavior: 'page.go', goTo: 'page:2' })
  ]);
}

export function seedWebHero(): SeedBundle {
  return curatedCardSeed([
    artLayer('w_web_hero_v1_art', artHtml('linear-gradient(160deg,#f97316 0%,#db2777 70%,#9d174d 100%)', '<div class="s" style="width:260px;height:260px;right:-50px;top:-40px;background:rgba(255,255,255,0.15)"></div><div class="s" style="width:90px;height:90px;left:-30px;bottom:-30px;background:rgba(255,255,255,0.1)"></div>'), 360),
    textLayer('w_web_hero_v1_k', { x: 24, y: 12, w: 280, h: 28, z: 2 }, 'WEBSITE', kickerStyle),
    textLayer('w_web_hero_v1_t', { x: 24, y: 44, w: 312, h: 56, z: 3 }, 'Hero', titleStyle),
    buttonLayer('w_web_hero_v1_go', { x: 24, y: 280, w: 200, h: 40, z: 5 }, 'Open', { fill: '#111827', color: '#fff' }, { behavior: 'cta.open', openUrl: 'https://parnoir.com' })
  ]);
}

export function seedWebFeatures(): SeedBundle {
  const opt = { fill: 'rgba(255,255,255,0.16)', color: '#ffffff' };
  return curatedCardSeed([
    artLayer('w_web_features_v1_art', artHtml('radial-gradient(circle at 30% 20%,#4c1d95 0%,#111827 70%)', '<div class="s" style="width:180px;height:180px;right:-50px;top:-40px;background:rgba(255,255,255,0.15)"></div><div class="s" style="width:90px;height:90px;left:-30px;bottom:-30px;background:rgba(255,255,255,0.1)"></div>'), 360),
    textLayer('w_web_features_v1_k', { x: 24, y: 12, w: 280, h: 28, z: 2 }, 'WEBSITE', kickerStyle),
    textLayer('w_web_features_v1_t', { x: 24, y: 44, w: 312, h: 56, z: 3 }, 'Feature grid', titleStyle),
    buttonLayer('w_web_features_v1_r1', { x: 24, y: 280, w: 312, h: 36, z: 5 }, 'Idea A', opt, { behavior: 'widget.rank', bindRowId: 'w_web_features_v1_r1' })
  ]);
}

export function seedWebTestimonial(): SeedBundle {
  return curatedCardSeed([
    artLayer('w_web_testimonial_v1_art', artHtml('linear-gradient(135deg,#fef3c7 0%,#fde68a 45%,#f59e0b 100%)', '<div class="s" style="width:200px;height:200px;right:-50px;top:-40px;background:rgba(255,255,255,0.15)"></div><div class="s" style="width:90px;height:90px;left:-30px;bottom:-30px;background:rgba(255,255,255,0.1)"></div>'), 360),
    textLayer('w_web_testimonial_v1_k', { x: 24, y: 12, w: 280, h: 28, z: 2 }, 'WEBSITE', kickerStyle),
    textLayer('w_web_testimonial_v1_t', { x: 24, y: 44, w: 312, h: 56, z: 3 }, 'Testimonial', titleStyle),
    buttonLayer('w_web_testimonial_v1_go', { x: 24, y: 280, w: 200, h: 40, z: 5 }, 'Open', { fill: '#111827', color: '#fff' }, { behavior: 'cta.open', openUrl: 'https://parnoir.com' })
  ]);
}

export function seedWebPricing(): SeedBundle {
  return curatedCardSeed([
    artLayer('w_web_pricing_v1_art', artHtml('linear-gradient(145deg,#0ea5e9 0%,#6366f1 55%,#312e81 100%)', '<div class="s" style="width:220px;height:220px;right:-50px;top:-40px;background:rgba(255,255,255,0.15)"></div><div class="s" style="width:90px;height:90px;left:-30px;bottom:-30px;background:rgba(255,255,255,0.1)"></div>'), 360),
    textLayer('w_web_pricing_v1_k', { x: 24, y: 12, w: 280, h: 28, z: 2 }, 'WEBSITE', kickerStyle),
    textLayer('w_web_pricing_v1_t', { x: 24, y: 44, w: 312, h: 56, z: 3 }, 'Pricing tiers', titleStyle),
    buttonLayer('w_web_pricing_v1_go', { x: 24, y: 280, w: 200, h: 40, z: 5 }, 'Open', { fill: '#111827', color: '#fff' }, { behavior: 'cta.open', openUrl: 'https://parnoir.com' })
  ]);
}

export function seedWebTeam(): SeedBundle {
  return curatedCardSeed([
    artLayer('w_web_team_v1_art', artHtml('linear-gradient(120deg,#14532d 0%,#166534 50%,#052e16 100%)', '<div class="s" style="width:240px;height:240px;right:-50px;top:-40px;background:rgba(255,255,255,0.15)"></div><div class="s" style="width:90px;height:90px;left:-30px;bottom:-30px;background:rgba(255,255,255,0.1)"></div>'), 360),
    textLayer('w_web_team_v1_k', { x: 24, y: 12, w: 280, h: 28, z: 2 }, 'WEBSITE', kickerStyle),
    textLayer('w_web_team_v1_t', { x: 24, y: 44, w: 312, h: 56, z: 3 }, 'Team', titleStyle),
    buttonLayer('w_web_team_v1_go', { x: 24, y: 280, w: 200, h: 40, z: 5 }, 'Open', { fill: '#111827', color: '#fff' }, { behavior: 'cta.open', openUrl: 'https://parnoir.com' })
  ]);
}

export function seedWebGallery(): SeedBundle {
  const opt = { fill: 'rgba(255,255,255,0.16)', color: '#ffffff' };
  return curatedCardSeed([
    artLayer('w_web_gallery_v1_art', artHtml('linear-gradient(165deg,#1c1917 0%,#44403c 40%,#78716c 100%)', '<div class="s" style="width:260px;height:260px;right:-50px;top:-40px;background:rgba(255,255,255,0.15)"></div><div class="s" style="width:90px;height:90px;left:-30px;bottom:-30px;background:rgba(255,255,255,0.1)"></div>'), 360),
    textLayer('w_web_gallery_v1_k', { x: 24, y: 12, w: 280, h: 28, z: 2 }, 'WEBSITE', kickerStyle),
    textLayer('w_web_gallery_v1_t', { x: 24, y: 44, w: 312, h: 56, z: 3 }, 'Gallery carousel', titleStyle),
    textLayer('w_web_gallery_v1_f0', { x: 24, y: 240, w: 312, h: 36, z: 4 }, 'Step 1', bodyStyle, { stepFrame: 0 }),
    textLayer('w_web_gallery_v1_f1', { x: 24, y: 240, w: 312, h: 36, z: 4 }, 'Step 2', bodyStyle, { stepFrame: 1 }),
    buttonLayer('w_web_gallery_v1_next', { x: 24, y: 280, w: 120, h: 36, z: 5 }, 'Next', opt, { behavior: 'widget.step', stepDir: 'next' })
  ]);
}

export function seedWebContact(): SeedBundle {
  return curatedCardSeed([
    artLayer('w_web_contact_v1_art', artHtml('linear-gradient(155deg,#be123c 0%,#9f1239 50%,#4c0519 100%)', '<div class="s" style="width:180px;height:180px;right:-50px;top:-40px;background:rgba(255,255,255,0.15)"></div><div class="s" style="width:90px;height:90px;left:-30px;bottom:-30px;background:rgba(255,255,255,0.1)"></div>'), 360),
    textLayer('w_web_contact_v1_k', { x: 24, y: 12, w: 280, h: 28, z: 2 }, 'WEBSITE', kickerStyle),
    textLayer('w_web_contact_v1_t', { x: 24, y: 44, w: 312, h: 56, z: 3 }, 'Contact section', titleStyle),
    { id: 'w_web_contact_v1_in', kind: 'text' as const, widgetElement: 'input' as const, name: 'Field', label: 'Your reply…', x: 24, y: 280, w: 312, h: 36, zIndex: 5, positionLocked: false, backgroundColor: '#fff', textColor: '#111', cornerRadius: 8 },
    buttonLayer('w_web_contact_v1_send', { x: 24, y: 324, w: 120, h: 36, z: 6 }, 'Send', { fill: '#0f766e', color: '#fff' }, { behavior: 'widget.submit' })
  ]);
}

export function seedWebFooter(): SeedBundle {
  return curatedCardSeed([
    artLayer('w_web_footer_v1_art', artHtml('linear-gradient(150deg,#0f766e 0%,#1e3a8a 60%,#312e81 100%)', '<div class="s" style="width:200px;height:200px;right:-50px;top:-40px;background:rgba(255,255,255,0.15)"></div><div class="s" style="width:90px;height:90px;left:-30px;bottom:-30px;background:rgba(255,255,255,0.1)"></div>'), 360),
    textLayer('w_web_footer_v1_k', { x: 24, y: 12, w: 280, h: 28, z: 2 }, 'WEBSITE', kickerStyle),
    textLayer('w_web_footer_v1_t', { x: 24, y: 44, w: 312, h: 56, z: 3 }, 'Footer', titleStyle),
    buttonLayer('w_web_footer_v1_go', { x: 24, y: 280, w: 200, h: 40, z: 5 }, 'Open', { fill: '#111827', color: '#fff' }, { behavior: 'cta.open', openUrl: 'https://parnoir.com' })
  ]);
}

export function seedWebStats(): SeedBundle {
  return curatedCardSeed([
    artLayer('w_web_stats_v1_art', artHtml('linear-gradient(160deg,#f97316 0%,#db2777 70%,#9d174d 100%)', '<div class="s" style="width:220px;height:220px;right:-50px;top:-40px;background:rgba(255,255,255,0.15)"></div><div class="s" style="width:90px;height:90px;left:-30px;bottom:-30px;background:rgba(255,255,255,0.1)"></div>'), 120),
    textLayer('w_web_stats_v1_k', { x: 24, y: 12, w: 280, h: 28, z: 2 }, 'WEBSITE', kickerStyle),
    textLayer('w_web_stats_v1_t', { x: 24, y: 44, w: 312, h: 56, z: 3 }, 'Stats strip', titleStyle),
    buttonLayer('w_web_stats_v1_go', { x: 24, y: 72, w: 200, h: 40, z: 5 }, 'Open', { fill: '#111827', color: '#fff' }, { behavior: 'cta.open', openUrl: 'https://parnoir.com' })
  ]);
}

export function seedWebLogos(): SeedBundle {
  return curatedCardSeed([
    artLayer('w_web_logos_v1_art', artHtml('radial-gradient(circle at 30% 20%,#4c1d95 0%,#111827 70%)', '<div class="s" style="width:240px;height:240px;right:-50px;top:-40px;background:rgba(255,255,255,0.15)"></div><div class="s" style="width:90px;height:90px;left:-30px;bottom:-30px;background:rgba(255,255,255,0.1)"></div>'), 120),
    textLayer('w_web_logos_v1_k', { x: 24, y: 12, w: 280, h: 28, z: 2 }, 'WEBSITE', kickerStyle),
    textLayer('w_web_logos_v1_t', { x: 24, y: 44, w: 312, h: 56, z: 3 }, 'Logo wall', titleStyle),
    buttonLayer('w_web_logos_v1_go', { x: 24, y: 72, w: 200, h: 40, z: 5 }, 'Open', { fill: '#111827', color: '#fff' }, { behavior: 'cta.open', openUrl: 'https://parnoir.com' })
  ]);
}

export function seedWebCta(): SeedBundle {
  return curatedCardSeed([
    artLayer('w_web_cta_v1_art', artHtml('linear-gradient(135deg,#fef3c7 0%,#fde68a 45%,#f59e0b 100%)', '<div class="s" style="width:260px;height:260px;right:-50px;top:-40px;background:rgba(255,255,255,0.15)"></div><div class="s" style="width:90px;height:90px;left:-30px;bottom:-30px;background:rgba(255,255,255,0.1)"></div>'), 120),
    textLayer('w_web_cta_v1_k', { x: 24, y: 12, w: 280, h: 28, z: 2 }, 'WEBSITE', kickerStyle),
    textLayer('w_web_cta_v1_t', { x: 24, y: 44, w: 312, h: 56, z: 3 }, 'CTA band', titleStyle),
    buttonLayer('w_web_cta_v1_go', { x: 24, y: 72, w: 200, h: 40, z: 5 }, 'Open', { fill: '#111827', color: '#fff' }, { behavior: 'cta.open', openUrl: 'https://parnoir.com' })
  ]);
}

export function seedWebFaq(): SeedBundle {
  const opt = { fill: 'rgba(255,255,255,0.16)', color: '#ffffff' };
  return curatedCardSeed([
    artLayer('w_web_faq_v1_art', artHtml('linear-gradient(145deg,#0ea5e9 0%,#6366f1 55%,#312e81 100%)', '<div class="s" style="width:180px;height:180px;right:-50px;top:-40px;background:rgba(255,255,255,0.15)"></div><div class="s" style="width:90px;height:90px;left:-30px;bottom:-30px;background:rgba(255,255,255,0.1)"></div>'), 360),
    textLayer('w_web_faq_v1_k', { x: 24, y: 12, w: 280, h: 28, z: 2 }, 'WEBSITE', kickerStyle),
    textLayer('w_web_faq_v1_t', { x: 24, y: 44, w: 312, h: 56, z: 3 }, 'FAQ accordion', titleStyle),
    buttonLayer('w_web_faq_v1_rv', { x: 24, y: 280, w: 140, h: 36, z: 5 }, 'Show', opt, { behavior: 'widget.reveal', revealLayerId: 'w_web_faq_v1_body', revealMode: 'tab' }),
    textLayer('w_web_faq_v1_body', { x: 24, y: 324, w: 312, h: 48, z: 6 }, 'More detail lives here.', bodyStyle, { visible: false })
  ]);
}

export function seedWebTabs(): SeedBundle {
  const opt = { fill: 'rgba(255,255,255,0.16)', color: '#ffffff' };
  return curatedCardSeed([
    artLayer('w_web_tabs_v1_art', artHtml('linear-gradient(120deg,#14532d 0%,#166534 50%,#052e16 100%)', '<div class="s" style="width:200px;height:200px;right:-50px;top:-40px;background:rgba(255,255,255,0.15)"></div><div class="s" style="width:90px;height:90px;left:-30px;bottom:-30px;background:rgba(255,255,255,0.1)"></div>'), 360),
    textLayer('w_web_tabs_v1_k', { x: 24, y: 12, w: 280, h: 28, z: 2 }, 'WEBSITE', kickerStyle),
    textLayer('w_web_tabs_v1_t', { x: 24, y: 44, w: 312, h: 56, z: 3 }, 'Tabs section', titleStyle),
    buttonLayer('w_web_tabs_v1_rv', { x: 24, y: 280, w: 140, h: 36, z: 5 }, 'Show', opt, { behavior: 'widget.reveal', revealLayerId: 'w_web_tabs_v1_body', revealMode: 'tab' }),
    textLayer('w_web_tabs_v1_body', { x: 24, y: 324, w: 312, h: 48, z: 6 }, 'More detail lives here.', bodyStyle, { visible: false })
  ]);
}
