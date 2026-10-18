import type { SeedBundle } from '../starterSeeds.js';
import { artHtml, artLayer, bodyStyle, buttonLayer, countdownLayer, curatedCardSeed, kickerStyle, textLayer, titleStyle } from './kit.js';

export function seedEventLaunch(): SeedBundle {
  const opt = { fill: 'rgba(255,255,255,0.16)', color: '#ffffff' };
  return curatedCardSeed([
    artLayer('w_event_launch_v1_art', artHtml('linear-gradient(150deg,#0f766e 0%,#1e3a8a 60%,#312e81 100%)', '<div class="s" style="width:200px;height:200px;right:-50px;top:-40px;background:rgba(255,255,255,0.15)"></div><div class="s" style="width:90px;height:90px;left:-30px;bottom:-30px;background:rgba(255,255,255,0.1)"></div>'), 360),
    textLayer('w_event_launch_v1_k', { x: 24, y: 12, w: 280, h: 28, z: 2 }, 'EVENTS', kickerStyle),
    textLayer('w_event_launch_v1_t', { x: 24, y: 44, w: 312, h: 56, z: 3 }, 'Launch countdown', titleStyle),
    buttonLayer('w_event_launch_v1_go', { x: 24, y: 280, w: 200, h: 40, z: 5 }, 'Open', { fill: '#111827', color: '#fff' }, { behavior: 'cta.open', openUrl: 'https://parnoir.com' })
,
    countdownLayer('w_event_launch_v1_cd', { x: 24, y: 220, w: 120, h: 24, z: 4 }, '#fde68a', 3)
  ]);
}

export function seedEventLive(): SeedBundle {
  const opt = { fill: 'rgba(255,255,255,0.16)', color: '#ffffff' };
  return curatedCardSeed([
    artLayer('w_event_live_v1_art', artHtml('linear-gradient(160deg,#f97316 0%,#db2777 70%,#9d174d 100%)', '<div class="s" style="width:220px;height:220px;right:-50px;top:-40px;background:rgba(255,255,255,0.15)"></div><div class="s" style="width:90px;height:90px;left:-30px;bottom:-30px;background:rgba(255,255,255,0.1)"></div>'), 120),
    textLayer('w_event_live_v1_k', { x: 24, y: 12, w: 280, h: 28, z: 2 }, 'EVENTS', kickerStyle),
    textLayer('w_event_live_v1_t', { x: 24, y: 44, w: 312, h: 56, z: 3 }, 'Live now banner', titleStyle),
    buttonLayer('w_event_live_v1_go', { x: 24, y: 72, w: 200, h: 40, z: 5 }, 'Open', { fill: '#111827', color: '#fff' }, { behavior: 'cta.open', openUrl: 'https://parnoir.com' })
  ]);
}

export function seedEventCheckin(): SeedBundle {
  const opt = { fill: 'rgba(255,255,255,0.16)', color: '#ffffff' };
  return curatedCardSeed([
    artLayer('w_event_checkin_v1_art', artHtml('radial-gradient(circle at 30% 20%,#4c1d95 0%,#111827 70%)', '<div class="s" style="width:240px;height:240px;right:-50px;top:-40px;background:rgba(255,255,255,0.15)"></div><div class="s" style="width:90px;height:90px;left:-30px;bottom:-30px;background:rgba(255,255,255,0.1)"></div>'), 360),
    textLayer('w_event_checkin_v1_k', { x: 24, y: 12, w: 280, h: 28, z: 2 }, 'EVENTS', kickerStyle),
    textLayer('w_event_checkin_v1_t', { x: 24, y: 44, w: 312, h: 56, z: 3 }, 'Event check-in', titleStyle),
    buttonLayer('w_event_checkin_v1_st', { x: 24, y: 280, w: 160, h: 40, z: 5 }, 'Check in', { fill: '#34d399', color: '#111' }, { behavior: 'widget.stamp' })
  ]);
}

export function seedEventSavedate(): SeedBundle {
  const opt = { fill: 'rgba(255,255,255,0.16)', color: '#ffffff' };
  return curatedCardSeed([
    artLayer('w_event_savedate_v1_art', artHtml('linear-gradient(135deg,#fef3c7 0%,#fde68a 45%,#f59e0b 100%)', '<div class="s" style="width:260px;height:260px;right:-50px;top:-40px;background:rgba(255,255,255,0.15)"></div><div class="s" style="width:90px;height:90px;left:-30px;bottom:-30px;background:rgba(255,255,255,0.1)"></div>'), 360),
    textLayer('w_event_savedate_v1_k', { x: 24, y: 12, w: 280, h: 28, z: 2 }, 'EVENTS', kickerStyle),
    textLayer('w_event_savedate_v1_t', { x: 24, y: 44, w: 312, h: 56, z: 3 }, 'Save the date', titleStyle),
    buttonLayer('w_event_savedate_v1_cal', { x: 24, y: 280, w: 200, h: 40, z: 5 }, 'Add to calendar', { fill: '#fde68a', color: '#111' }, { behavior: 'cta.calendar', eventTitle: 'widget.event_savedate.v1', eventDurationMin: 60 })
  ]);
}

export function seedEventAgenda(): SeedBundle {
  const opt = { fill: 'rgba(255,255,255,0.16)', color: '#ffffff' };
  return curatedCardSeed([
    artLayer('w_event_agenda_v1_art', artHtml('linear-gradient(145deg,#0ea5e9 0%,#6366f1 55%,#312e81 100%)', '<div class="s" style="width:180px;height:180px;right:-50px;top:-40px;background:rgba(255,255,255,0.15)"></div><div class="s" style="width:90px;height:90px;left:-30px;bottom:-30px;background:rgba(255,255,255,0.1)"></div>'), 360),
    textLayer('w_event_agenda_v1_k', { x: 24, y: 12, w: 280, h: 28, z: 2 }, 'EVENTS', kickerStyle),
    textLayer('w_event_agenda_v1_t', { x: 24, y: 44, w: 312, h: 56, z: 3 }, 'Agenda card', titleStyle),
    buttonLayer('w_event_agenda_v1_go', { x: 24, y: 280, w: 200, h: 40, z: 5 }, 'Open', { fill: '#111827', color: '#fff' }, { behavior: 'cta.open', openUrl: 'https://parnoir.com' })
  ]);
}
