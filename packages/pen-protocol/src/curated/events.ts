import type { SeedBundle } from '../starterSeeds.js';
import {
  artHtml,
  artLayer,
  box,
  buttonLayer,
  countdownLayer,
  curatedCardSeed,
  eventStartIn,
  panelLayer,
  textLayer,
  themes
} from './kit.js';

/** Invitation art, event details, a countdown, and Going / Maybe / Can't go. */
export function seedRsvpWidget(): SeedBundle {
  const pick = { fill: 'rgba(255,255,255,0.14)', color: '#ffffff' };
  return curatedCardSeed([
    artLayer(
      'rv_art',
      artHtml(
        'radial-gradient(circle at 30% 20%,#4c1d95 0%,#111827 70%)',
        '<div class="s" style="width:10px;height:10px;left:300px;top:40px;background:#f472b6"></div><div class="s" style="width:6px;height:6px;left:260px;top:90px;background:#fde68a"></div><div class="s" style="width:14px;height:14px;left:320px;top:130px;background:#34d399"></div><div class="s" style="width:8px;height:8px;left:230px;top:30px;background:#60a5fa"></div><div class="s" style="width:200px;height:200px;left:-80px;bottom:-90px;background:rgba(244,114,182,0.2)"></div>'
      )
    ),
    textLayer('rv_kicker', box(24, 16, 200, 32, 2), "YOU'RE INVITED", { size: 11, color: '#f9a8d4', bold: true }),
    textLayer('rv_title', box(24, 48, 312, 72, 3), 'Rooftop launch party', { family: 'serif', size: 30, color: '#ffffff', bold: true }, { name: 'Question' }),
    textLayer('rv_details', box(24, 116, 312, 40, 4), 'Friday · 7pm · Pier 17', { size: 15, color: 'rgba(255,255,255,0.85)' }),
    textLayer('rv_starts', box(24, 162, 120, 32, 5), 'Starts in', { size: 12, color: 'rgba(255,255,255,0.7)' }),
    countdownLayer('rv_time', box(22, 192, 90, 28, 6), '#fde68a', 2),
    buttonLayer('rv_going', box(24, 280, 100, 40, 7), 'Going', { fill: '#f472b6', color: '#111827' }, { behavior: 'poll.vote', bindRowId: 'rv_going' }),
    buttonLayer('rv_maybe', box(130, 280, 100, 40, 8), 'Maybe', pick, { behavior: 'poll.vote', bindRowId: 'rv_maybe' }),
    buttonLayer('rv_no', box(236, 280, 100, 40, 9), "Can't go", pick, { behavior: 'poll.vote', bindRowId: 'rv_no' })
  ]);
}

/** A launch headline, the countdown, and Remind me. */
export function seedEventLaunch(): SeedBundle {
  const t = themes.ink;
  return curatedCardSeed([
    artLayer(
      'lc_art',
      artHtml(
        'radial-gradient(circle at 50% 120%,#7c2d12 0%,#0b0b0c 60%)',
        '<div class="rocket"></div><div class="s" style="left:40px;top:40px;width:3px;height:3px;background:#fff"></div><div class="s" style="left:300px;top:70px;width:2px;height:2px;background:#fff"></div><div class="s" style="left:220px;top:30px;width:3px;height:3px;background:#fde68a"></div><div class="s" style="left:90px;top:110px;width:2px;height:2px;background:#fff"></div>',
        '.rocket{position:absolute;left:162px;top:210px;width:36px;height:150px;border-radius:18px 18px 4px 4px;background:linear-gradient(180deg,#f5f5f4,#a8a29e);box-shadow:0 40px 60px 20px rgba(249,115,22,.35)}'
      )
    ),
    textLayer('lc_kicker', box(0, 34, 360, 20, 2), 'LAUNCHING SOON', { size: 11, color: t.accent, bold: true, align: 'center' }),
    textLayer('lc_title', box(24, 58, 312, 76, 3), 'Pen 2.0 goes live', { family: 'serif', size: 34, color: t.ink, bold: true, align: 'center' }),
    countdownLayer('lc_time', box(110, 142, 140, 32, 4), t.bg, 5, t.accent),
    buttonLayer('lc_remind', box(24, 296, 312, 44, 5), 'Remind me', { fill: '#ffffff', color: '#0b0b0c' }, { behavior: 'cta.calendar', eventTitle: 'Pen 2.0 launch', eventStart: eventStartIn(5, 17), eventDurationMin: 30, eventLocation: 'parnoir.com' }, { size: 15 })
  ]);
}

/** A wide LIVE banner with a Watch button. */
export function seedEventLive(): SeedBundle {
  return curatedCardSeed([
    artLayer(
      'lv_art',
      artHtml(
        'linear-gradient(90deg,#18181b 0%,#3f0d12 100%)',
        '<div class="r" style="left:20px;top:18px;width:64px;height:24px;border-radius:12px;background:#dc2626"></div><div class="eq"><i style="height:20px"></i><i style="height:34px"></i><i style="height:14px"></i><i style="height:28px"></i><i style="height:40px"></i></div>',
        '.eq{position:absolute;left:206px;top:40px;display:flex;gap:4px;align-items:flex-end;height:40px}.eq i{display:block;width:5px;border-radius:2px;background:rgba(248,113,113,.55)}'
      ),
      120
    ),
    textLayer('lv_pill', box(20, 14, 64, 20, 2), 'LIVE', { size: 11, color: '#ffffff', bold: true, align: 'center' }),
    textLayer('lv_title', box(20, 52, 190, 52, 3), 'Studio Q&A with the team', { family: 'serif', size: 18, color: '#ffffff', bold: true }),
    buttonLayer('lv_watch', box(256, 38, 84, 44, 4), 'Watch', { fill: '#ffffff', color: '#18181b' }, { behavior: 'cta.open', openUrl: 'https://parnoir.com/live' }, { size: 14 })
  ]);
}

/** Venue art and a Check in stamp. */
export function seedEventCheckin(): SeedBundle {
  const t = themes.forest;
  return curatedCardSeed([
    artLayer(
      'ci_art',
      artHtml(
        'linear-gradient(180deg,#052e16 0%,#14532d 100%)',
        '<div class="bld" style="left:196px;width:44px;height:120px"></div><div class="bld" style="left:244px;width:56px;height:160px"></div><div class="bld" style="left:304px;width:40px;height:96px"></div><div class="win"></div>',
        '.bld{position:absolute;bottom:0;background:#166534;border-radius:4px 4px 0 0}.win{position:absolute;left:254px;bottom:20px;width:36px;height:120px;background-image:linear-gradient(#bbf7d0 6px,transparent 6px);background-size:12px 18px;opacity:.45}'
      )
    ),
    textLayer('ci_kicker', box(24, 24, 200, 20, 2), 'TONIGHT · DOORS 7 PM', { size: 11, color: t.accent, bold: true }),
    textLayer('ci_title', box(24, 48, 180, 96, 3), 'Makers meetup at The Foundry', { family: 'serif', size: 24, color: t.ink, bold: true }),
    textLayer('ci_addr', box(24, 148, 180, 40, 4), ['21 Mill Street', 'Second floor'], { size: 12, color: t.muted }),
    buttonLayer('ci_stamp', box(24, 216, 160, 52, 5), 'Check in', t.primary, { behavior: 'widget.stamp', label: 'Check in' }, { size: 16, radius: 14 }),
    textLayer('ci_note', box(24, 280, 170, 40, 6), 'Tap when you arrive. Show the stamp at the door.', { size: 11, color: t.muted })
  ]);
}

/** Date block, title, place, and Add to calendar. */
export function seedEventSavedate(): SeedBundle {
  const t = themes.rose;
  return curatedCardSeed([
    artLayer(
      'sd_art',
      artHtml(
        '#fff1f2',
        '<div class="cal"><div class="top">JUN</div><div class="day">12</div></div><div class="s" style="width:220px;height:220px;right:-90px;bottom:-110px;background:#fecdd3"></div>',
        '.cal{position:absolute;left:24px;top:24px;width:96px;height:108px;border-radius:14px;background:#fff;box-shadow:0 6px 18px rgba(159,18,57,.15);overflow:hidden;text-align:center;font-family:Montserrat,Helvetica,sans-serif}.cal .top{background:#e11d48;color:#fff;font-weight:800;font-size:14px;letter-spacing:3px;padding:6px 0}.cal .day{font-size:52px;font-weight:800;color:#4c0519;line-height:72px}'
      )
    ),
    textLayer('sd_kicker', box(140, 30, 196, 20, 2), 'JUNE 2027 · PORTLAND', { size: 11, color: t.accent, bold: true }),
    textLayer('sd_title', box(140, 54, 196, 80, 3), 'Maya and Theo are getting married', { family: 'serif', size: 21, color: t.ink, bold: true }),
    textLayer('sd_place', box(24, 156, 312, 44, 4), ['Saturday, 4 pm', 'Glasshouse Gardens, Portland'], { size: 13, color: t.muted }),
    buttonLayer('sd_cal', box(24, 224, 200, 44, 5), 'Add to calendar', t.primary, { behavior: 'cta.calendar', eventTitle: 'Maya and Theo wedding', eventLocation: 'Glasshouse Gardens, Portland', eventStart: new Date(2027, 5, 12, 16).toISOString(), eventDurationMin: 300 }),
    textLayer('sd_note', box(24, 284, 220, 40, 6), 'Formal invitation to follow.', { family: 'serif', size: 13, color: t.ink, italic: true })
  ]);
}

/** Three time slots; each opens its own details, one at a time. */
export function seedEventAgenda(): SeedBundle {
  const t = themes.slate;
  const row = { fill: '#ffffff', color: t.ink };
  const detail = (id: string, lines: string[]) =>
    panelLayer(id, box(24, 254, 312, 84, 10), '#0f172a', lines, { size: 13, color: '#e2e8f0' }, { visible: false, name: 'Details' });
  return curatedCardSeed([
    artLayer(
      'ag_art',
      artHtml(
        '#e2e8f0',
        '<div class="r" style="left:24px;top:94px;width:2px;height:144px;background:#94a3b8"></div><div class="hint">Tap a session for the room and details</div>',
        '.hint{position:absolute;left:24px;top:254px;width:312px;height:84px;box-sizing:border-box;border:2px dashed #cbd5e1;border-radius:12px;display:flex;align-items:center;justify-content:center;font:600 12px Montserrat,Helvetica,sans-serif;color:#64748b}'
      )
    ),
    textLayer('ag_kicker', box(24, 22, 200, 20, 2), 'CONFERENCE DAY', { size: 11, color: t.accent, bold: true }),
    textLayer('ag_title', box(24, 44, 312, 40, 3), 'Saturday agenda', { family: 'serif', size: 26, color: t.ink, bold: true }),
    buttonLayer('ag_1', box(36, 96, 300, 40, 4), '9:00  Keynote', row, { behavior: 'widget.reveal', revealLayerId: 'ag_1_d', revealMode: 'tab' }, { radius: 10, stroke: '#cbd5e1' }),
    buttonLayer('ag_2', box(36, 144, 300, 40, 5), '11:30  Hands-on workshops', row, { behavior: 'widget.reveal', revealLayerId: 'ag_2_d', revealMode: 'tab' }, { radius: 10, stroke: '#cbd5e1' }),
    buttonLayer('ag_3', box(36, 192, 300, 40, 6), '15:00  Closing panel', row, { behavior: 'widget.reveal', revealLayerId: 'ag_3_d', revealMode: 'tab' }, { radius: 10, stroke: '#cbd5e1' }),
    detail('ag_1_d', ['Main hall', 'Why calm software wins, with the founding team.']),
    detail('ag_2_d', ['Rooms A to D', 'Pick one: widgets, publishing, design systems, or audio.']),
    detail('ag_3_d', ['Main hall', 'Five creators on building an audience without an algorithm.'])
  ]);
}
