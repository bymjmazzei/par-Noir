import type { SeedBundle } from '../starterSeeds.js';
import { artHtml, artLayer, bodyStyle, buttonLayer, curatedCardSeed, kickerStyle, textLayer, titleStyle } from './kit.js';

export function seedSocialQuote(): SeedBundle {
  return curatedCardSeed([
    artLayer('w_social_quote_v1_art', artHtml('linear-gradient(165deg,#1c1917 0%,#44403c 40%,#78716c 100%)', '<div class="s" style="width:240px;height:240px;right:-50px;top:-40px;background:rgba(255,255,255,0.15)"></div><div class="s" style="width:90px;height:90px;left:-30px;bottom:-30px;background:rgba(255,255,255,0.1)"></div>'), 360),
    textLayer('w_social_quote_v1_k', { x: 24, y: 12, w: 280, h: 28, z: 2 }, 'SOCIAL', kickerStyle),
    textLayer('w_social_quote_v1_t', { x: 24, y: 44, w: 312, h: 56, z: 3 }, 'Quote card', titleStyle),
    { id: 'w_social_quote_v1_in', kind: 'text' as const, widgetElement: 'input' as const, name: 'Field', label: 'Your reply…', x: 24, y: 280, w: 312, h: 36, zIndex: 5, positionLocked: false, backgroundColor: '#fff', textColor: '#111', cornerRadius: 8 },
    buttonLayer('w_social_quote_v1_send', { x: 24, y: 324, w: 120, h: 36, z: 6 }, 'Send', { fill: '#0f766e', color: '#fff' }, { behavior: 'widget.submit' })
  ]);
}

export function seedSocialAnnounce(): SeedBundle {
  return curatedCardSeed([
    artLayer('w_social_announce_v1_art', artHtml('linear-gradient(155deg,#be123c 0%,#9f1239 50%,#4c0519 100%)', '<div class="s" style="width:260px;height:260px;right:-50px;top:-40px;background:rgba(255,255,255,0.15)"></div><div class="s" style="width:90px;height:90px;left:-30px;bottom:-30px;background:rgba(255,255,255,0.1)"></div>'), 360),
    textLayer('w_social_announce_v1_k', { x: 24, y: 12, w: 280, h: 28, z: 2 }, 'SOCIAL', kickerStyle),
    textLayer('w_social_announce_v1_t', { x: 24, y: 44, w: 312, h: 56, z: 3 }, 'Announcement', titleStyle),
    buttonLayer('w_social_announce_v1_go', { x: 24, y: 280, w: 200, h: 40, z: 5 }, 'Open', { fill: '#111827', color: '#fff' }, { behavior: 'cta.open', openUrl: 'https://parnoir.com' })
  ]);
}

export function seedSocialBeforeafter(): SeedBundle {
  const opt = { fill: 'rgba(255,255,255,0.16)', color: '#ffffff' };
  return curatedCardSeed([
    artLayer('w_social_beforeafter_v1_art', artHtml('linear-gradient(150deg,#0f766e 0%,#1e3a8a 60%,#312e81 100%)', '<div class="s" style="width:180px;height:180px;right:-50px;top:-40px;background:rgba(255,255,255,0.15)"></div><div class="s" style="width:90px;height:90px;left:-30px;bottom:-30px;background:rgba(255,255,255,0.1)"></div>'), 360),
    textLayer('w_social_beforeafter_v1_k', { x: 24, y: 12, w: 280, h: 28, z: 2 }, 'SOCIAL', kickerStyle),
    textLayer('w_social_beforeafter_v1_t', { x: 24, y: 44, w: 312, h: 56, z: 3 }, 'Before / after', titleStyle),
    buttonLayer('w_social_beforeafter_v1_rv', { x: 24, y: 280, w: 140, h: 36, z: 5 }, 'Show', opt, { behavior: 'widget.reveal', revealLayerId: 'w_social_beforeafter_v1_body', revealMode: 'tab' }),
    textLayer('w_social_beforeafter_v1_body', { x: 24, y: 324, w: 312, h: 48, z: 6 }, 'More detail lives here.', bodyStyle, { visible: false })
  ]);
}

export function seedSocialTip(): SeedBundle {
  const opt = { fill: 'rgba(255,255,255,0.16)', color: '#ffffff' };
  return curatedCardSeed([
    artLayer('w_social_tip_v1_art', artHtml('linear-gradient(160deg,#f97316 0%,#db2777 70%,#9d174d 100%)', '<div class="s" style="width:200px;height:200px;right:-50px;top:-40px;background:rgba(255,255,255,0.15)"></div><div class="s" style="width:90px;height:90px;left:-30px;bottom:-30px;background:rgba(255,255,255,0.1)"></div>'), 360),
    textLayer('w_social_tip_v1_k', { x: 24, y: 12, w: 280, h: 28, z: 2 }, 'SOCIAL', kickerStyle),
    textLayer('w_social_tip_v1_t', { x: 24, y: 44, w: 312, h: 56, z: 3 }, 'Tip of the day', titleStyle),
    buttonLayer('w_social_tip_v1_rv', { x: 24, y: 280, w: 140, h: 36, z: 5 }, 'Show', opt, { behavior: 'widget.reveal', revealLayerId: 'w_social_tip_v1_body', revealMode: 'show' }),
    textLayer('w_social_tip_v1_body', { x: 24, y: 324, w: 312, h: 48, z: 6 }, 'More detail lives here.', bodyStyle, { visible: false })
  ]);
}

export function seedSocialStat(): SeedBundle {
  return curatedCardSeed([
    artLayer('w_social_stat_v1_art', artHtml('radial-gradient(circle at 30% 20%,#4c1d95 0%,#111827 70%)', '<div class="s" style="width:220px;height:220px;right:-50px;top:-40px;background:rgba(255,255,255,0.15)"></div><div class="s" style="width:90px;height:90px;left:-30px;bottom:-30px;background:rgba(255,255,255,0.1)"></div>'), 360),
    textLayer('w_social_stat_v1_k', { x: 24, y: 12, w: 280, h: 28, z: 2 }, 'SOCIAL', kickerStyle),
    textLayer('w_social_stat_v1_t', { x: 24, y: 44, w: 312, h: 56, z: 3 }, 'Stat highlight', titleStyle),
    buttonLayer('w_social_stat_v1_go', { x: 24, y: 280, w: 200, h: 40, z: 5 }, 'Open', { fill: '#111827', color: '#fff' }, { behavior: 'cta.open', openUrl: 'https://parnoir.com' })
  ]);
}

export function seedSocialBts(): SeedBundle {
  const opt = { fill: 'rgba(255,255,255,0.16)', color: '#ffffff' };
  return curatedCardSeed([
    artLayer('w_social_bts_v1_art', artHtml('linear-gradient(135deg,#fef3c7 0%,#fde68a 45%,#f59e0b 100%)', '<div class="s" style="width:240px;height:240px;right:-50px;top:-40px;background:rgba(255,255,255,0.15)"></div><div class="s" style="width:90px;height:90px;left:-30px;bottom:-30px;background:rgba(255,255,255,0.1)"></div>'), 360),
    textLayer('w_social_bts_v1_k', { x: 24, y: 12, w: 280, h: 28, z: 2 }, 'SOCIAL', kickerStyle),
    textLayer('w_social_bts_v1_t', { x: 24, y: 44, w: 312, h: 56, z: 3 }, 'Behind the scenes', titleStyle),
    buttonLayer('w_social_bts_v1_rv', { x: 24, y: 280, w: 140, h: 36, z: 5 }, 'Show', opt, { behavior: 'widget.reveal', revealLayerId: 'w_social_bts_v1_body', revealMode: 'show' }),
    textLayer('w_social_bts_v1_body', { x: 24, y: 324, w: 312, h: 48, z: 6 }, 'More detail lives here.', bodyStyle, { visible: false })
  ]);
}

export function seedSocialMilestone(): SeedBundle {
  return curatedCardSeed([
    artLayer('w_social_milestone_v1_art', artHtml('linear-gradient(145deg,#0ea5e9 0%,#6366f1 55%,#312e81 100%)', '<div class="s" style="width:260px;height:260px;right:-50px;top:-40px;background:rgba(255,255,255,0.15)"></div><div class="s" style="width:90px;height:90px;left:-30px;bottom:-30px;background:rgba(255,255,255,0.1)"></div>'), 360),
    textLayer('w_social_milestone_v1_k', { x: 24, y: 12, w: 280, h: 28, z: 2 }, 'SOCIAL', kickerStyle),
    textLayer('w_social_milestone_v1_t', { x: 24, y: 44, w: 312, h: 56, z: 3 }, 'Milestone', titleStyle),
    buttonLayer('w_social_milestone_v1_st', { x: 24, y: 280, w: 160, h: 40, z: 5 }, 'Check in', { fill: '#34d399', color: '#111' }, { behavior: 'widget.stamp' })
  ]);
}
