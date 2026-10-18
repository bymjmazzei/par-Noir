import type { SeedBundle } from '../starterSeeds.js';
import {
  artHtml,
  artLayer,
  box,
  buttonLayer,
  clockLayer,
  countdownLayer,
  curatedCardSeed,
  eventStartIn,
  textLayer,
  themes
} from './kit.js';

/** A large countdown under the event name, with a reminder. */
export function seedUtilCountdown(): SeedBundle {
  const t = themes.sunset;
  return curatedCardSeed([
    artLayer(
      'cd_art',
      artHtml(
        'linear-gradient(180deg,#9a3412 0%,#7c2d12 55%,#431407 100%)',
        '<div class="s" style="width:280px;height:280px;left:40px;top:150px;background:radial-gradient(circle,#fdba74 0%,#f97316 45%,rgba(249,115,22,0) 70%)"></div><div class="r" style="left:0;top:262px;width:360px;height:98px;background:#431407"></div>'
      )
    ),
    textLayer('cd_kicker', box(24, 28, 240, 20, 2), 'SUMMER SOLSTICE PARTY', { size: 11, color: t.accent, bold: true }),
    textLayer('cd_title', box(24, 52, 312, 64, 3), ['Sunset on the roof', 'starts in'], { family: 'serif', size: 22, color: t.ink, bold: true }),
    countdownLayer('cd_time', box(48, 136, 264, 72, 4), t.ink, 21, 'rgba(67,20,7,0.55)'),
    buttonLayer('cd_remind', box(24, 286, 180, 44, 5), 'Add to calendar', t.primary, {
      behavior: 'cta.calendar',
      eventTitle: 'Sunset on the roof',
      eventStart: eventStartIn(21, 19),
      eventLocation: 'Rooftop, 210 Marsh St',
      eventDurationMin: 180
    }, { size: 13 })
  ]);
}

/** Two cities side by side. */
export function seedUtilClock(): SeedBundle {
  const t = themes.slate;
  return curatedCardSeed([
    artLayer(
      'ck_art',
      artHtml(
        '#e2e8f0',
        '<div class="dial" style="left:24px;background:#ffffff"></div><div class="dial" style="left:192px;background:#0f172a"></div>',
        '.dial{position:absolute;top:96px;width:144px;height:144px;border-radius:50%;box-shadow:0 6px 16px rgba(15,23,42,.12)}'
      )
    ),
    textLayer('ck_kicker', box(24, 24, 240, 20, 2), 'TEAM HOURS', { size: 11, color: t.accent, bold: true }),
    textLayer('ck_title', box(24, 46, 312, 36, 3), 'When we are online', { family: 'serif', size: 22, color: t.ink, bold: true }),
    clockLayer('ck_ny', box(40, 152, 112, 32, 4), t.ink, '09:00'),
    clockLayer('ck_tk', box(208, 152, 112, 32, 5), '#ffffff', '22:00'),
    textLayer('ck_ny_label', box(24, 252, 144, 44, 6), ['New York', 'Mon–Fri'], { size: 13, color: t.ink, bold: true, align: 'center' }),
    textLayer('ck_tk_label', box(192, 252, 144, 44, 7), ['Tokyo', 'Mon–Fri'], { size: 13, color: t.ink, bold: true, align: 'center' }),
    buttonLayer('ck_book', box(90, 304, 180, 40, 8), 'Book a call', t.primary, { behavior: 'cta.open', openUrl: 'https://parnoir.com/book' }, { size: 13 })
  ]);
}

/** One-line notice across a banner. */
export function seedUtilBanner(): SeedBundle {
  return curatedCardSeed([
    artLayer(
      'ub_art',
      artHtml(
        'repeating-linear-gradient(135deg,#fde047 0 18px,#facc15 18px 36px)',
        '<div class="r" style="left:12px;top:12px;width:336px;height:96px;border-radius:12px;background:#1c1917"></div>'
      ),
      120
    ),
    textLayer('ub_msg', box(28, 28, 196, 64, 2), ['Heads up: shipping pauses', 'Dec 24 – Jan 2.'], { size: 13, color: '#fde047', bold: true }),
    buttonLayer('ub_more', box(232, 38, 104, 44, 3), 'Learn more', { fill: '#fde047', color: '#1c1917' }, { behavior: 'cta.open', openUrl: 'https://parnoir.com/shipping' }, { size: 12 })
  ]);
}

/** Five items to tick off before a trip. */
export function seedUtilChecklist(): SeedBundle {
  const t = themes.paper;
  const item = { fill: '#ffffff', color: t.ink };
  const items = ['Passport', 'Chargers', 'Meds', 'House keys', 'Snacks'];
  return curatedCardSeed([
    artLayer(
      'uc_art',
      artHtml(
        '#f6f1e7',
        '<div class="tag"></div>',
        '.tag{position:absolute;right:24px;top:20px;width:52px;height:64px;border-radius:8px 8px 8px 8px;background:#b45309;clip-path:polygon(0 18%,50% 0,100% 18%,100% 100%,0 100%)}.tag::after{content:"";position:absolute;left:21px;top:12px;width:10px;height:10px;border-radius:50%;background:#f6f1e7}'
      )
    ),
    textLayer('uc_kicker', box(24, 22, 200, 20, 2), 'BEFORE YOU GO', { size: 11, color: t.accent, bold: true }),
    textLayer('uc_title', box(24, 44, 240, 36, 3), 'Packing list', { family: 'serif', size: 24, color: t.ink, bold: true }),
    ...items.map((face, i) =>
      buttonLayer(`uc_${i + 1}`, box(24, 96 + i * 50, 312, 40, 4 + i), face, item, { behavior: 'widget.toggle', bindRowId: `uc_${i + 1}` }, { size: 13, radius: 10, stroke: '#e7e0d2' })
    )
  ]);
}

/** A big +1 that stamps a count. */
export function seedUtilTally(): SeedBundle {
  const t = themes.ink;
  return curatedCardSeed([
    artLayer(
      'ut_art',
      artHtml(
        '#0b0b0c',
        '<div class="ring"></div>',
        '.ring{position:absolute;left:90px;top:100px;width:180px;height:180px;border-radius:50%;border:2px dashed rgba(250,204,21,.4);box-sizing:border-box}'
      )
    ),
    textLayer('ut_kicker', box(24, 24, 260, 20, 2), 'GLASSES OF WATER TODAY', { size: 11, color: t.accent, bold: true }),
    textLayer('ut_hint', box(24, 48, 312, 32, 3), 'Tap to count', { family: 'serif', size: 20, color: t.ink, bold: true }),
    buttonLayer('ut_plus', box(110, 120, 140, 140, 4), '+1', t.primary, { behavior: 'widget.stamp', label: 'Glass of water' }, { size: 44 }),
    textLayer('ut_goal', box(24, 300, 312, 28, 5), 'Goal: 8 by bedtime', { size: 13, color: t.muted, align: 'center' })
  ]);
}
