import type { SeedBundle } from '../starterSeeds.js';
import { artHtml, artLayer, buttonLayer, countdownLayer, curatedCardSeed, kickerStyle, textLayer, titleStyle } from './kit.js';

export function seedUtilCountdown(): SeedBundle {
  return curatedCardSeed([
    artLayer('w_util_countdown_v1_art', artHtml('linear-gradient(135deg,#fef3c7 0%,#fde68a 45%,#f59e0b 100%)', '<div class="s" style="width:220px;height:220px;right:-50px;top:-40px;background:rgba(255,255,255,0.15)"></div><div class="s" style="width:90px;height:90px;left:-30px;bottom:-30px;background:rgba(255,255,255,0.1)"></div>'), 360),
    textLayer('w_util_countdown_v1_k', { x: 24, y: 12, w: 280, h: 28, z: 2 }, 'UTILITIES', kickerStyle),
    textLayer('w_util_countdown_v1_t', { x: 24, y: 44, w: 312, h: 56, z: 3 }, 'Countdown', titleStyle),
    buttonLayer('w_util_countdown_v1_go', { x: 24, y: 280, w: 200, h: 40, z: 5 }, 'Open', { fill: '#111827', color: '#fff' }, { behavior: 'cta.open', openUrl: 'https://parnoir.com' })
,
    countdownLayer('w_util_countdown_v1_cd', { x: 24, y: 220, w: 120, h: 24, z: 4 }, '#fde68a', 3)
  ]);
}

export function seedUtilClock(): SeedBundle {
  return curatedCardSeed([
    artLayer('w_util_clock_v1_art', artHtml('linear-gradient(145deg,#0ea5e9 0%,#6366f1 55%,#312e81 100%)', '<div class="s" style="width:240px;height:240px;right:-50px;top:-40px;background:rgba(255,255,255,0.15)"></div><div class="s" style="width:90px;height:90px;left:-30px;bottom:-30px;background:rgba(255,255,255,0.1)"></div>'), 360),
    textLayer('w_util_clock_v1_k', { x: 24, y: 12, w: 280, h: 28, z: 2 }, 'UTILITIES', kickerStyle),
    textLayer('w_util_clock_v1_t', { x: 24, y: 44, w: 312, h: 56, z: 3 }, 'Clock', titleStyle),
    buttonLayer('w_util_clock_v1_go', { x: 24, y: 280, w: 200, h: 40, z: 5 }, 'Open', { fill: '#111827', color: '#fff' }, { behavior: 'cta.open', openUrl: 'https://parnoir.com' })
  ]);
}

export function seedUtilBanner(): SeedBundle {
  return curatedCardSeed([
    artLayer('w_util_banner_v1_art', artHtml('linear-gradient(120deg,#14532d 0%,#166534 50%,#052e16 100%)', '<div class="s" style="width:260px;height:260px;right:-50px;top:-40px;background:rgba(255,255,255,0.15)"></div><div class="s" style="width:90px;height:90px;left:-30px;bottom:-30px;background:rgba(255,255,255,0.1)"></div>'), 120),
    textLayer('w_util_banner_v1_k', { x: 24, y: 12, w: 280, h: 28, z: 2 }, 'UTILITIES', kickerStyle),
    textLayer('w_util_banner_v1_t', { x: 24, y: 44, w: 312, h: 56, z: 3 }, 'Announcement banner', titleStyle),
    buttonLayer('w_util_banner_v1_go', { x: 24, y: 72, w: 200, h: 40, z: 5 }, 'Open', { fill: '#111827', color: '#fff' }, { behavior: 'cta.open', openUrl: 'https://parnoir.com' })
  ]);
}

export function seedUtilChecklist(): SeedBundle {
  const opt = { fill: 'rgba(255,255,255,0.16)', color: '#ffffff' };
  return curatedCardSeed([
    artLayer('w_util_checklist_v1_art', artHtml('linear-gradient(165deg,#1c1917 0%,#44403c 40%,#78716c 100%)', '<div class="s" style="width:180px;height:180px;right:-50px;top:-40px;background:rgba(255,255,255,0.15)"></div><div class="s" style="width:90px;height:90px;left:-30px;bottom:-30px;background:rgba(255,255,255,0.1)"></div>'), 360),
    textLayer('w_util_checklist_v1_k', { x: 24, y: 12, w: 280, h: 28, z: 2 }, 'UTILITIES', kickerStyle),
    textLayer('w_util_checklist_v1_t', { x: 24, y: 44, w: 312, h: 56, z: 3 }, 'Checklist', titleStyle),
    buttonLayer('w_util_checklist_v1_t1', { x: 24, y: 280, w: 312, h: 36, z: 5 }, 'Task one', opt, { behavior: 'widget.toggle', bindRowId: 'w_util_checklist_v1_t1' })
  ]);
}

export function seedUtilTally(): SeedBundle {
  return curatedCardSeed([
    artLayer('w_util_tally_v1_art', artHtml('linear-gradient(155deg,#be123c 0%,#9f1239 50%,#4c0519 100%)', '<div class="s" style="width:200px;height:200px;right:-50px;top:-40px;background:rgba(255,255,255,0.15)"></div><div class="s" style="width:90px;height:90px;left:-30px;bottom:-30px;background:rgba(255,255,255,0.1)"></div>'), 360),
    textLayer('w_util_tally_v1_k', { x: 24, y: 12, w: 280, h: 28, z: 2 }, 'UTILITIES', kickerStyle),
    textLayer('w_util_tally_v1_t', { x: 24, y: 44, w: 312, h: 56, z: 3 }, 'Tally counter', titleStyle),
    buttonLayer('w_util_tally_v1_st', { x: 24, y: 280, w: 160, h: 40, z: 5 }, 'Check in', { fill: '#34d399', color: '#111' }, { behavior: 'widget.stamp' })
  ]);
}
