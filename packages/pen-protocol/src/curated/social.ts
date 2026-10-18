import type { SeedBundle } from '../starterSeeds.js';
import { artHtml, artLayer, box, buttonLayer, curatedCardSeed, panelLayer, textLayer, themes } from './kit.js';

/** A large serif pull quote with its source. */
export function seedSocialQuote(): SeedBundle {
  const t = themes.paper;
  return curatedCardSeed([
    artLayer(
      'qc_art',
      artHtml(
        '#1c1917',
        '<div class="mark">&ldquo;</div><div class="r" style="left:24px;top:262px;width:48px;height:3px;background:#f59e0b"></div>',
        '.mark{position:absolute;left:14px;top:-34px;font:700 180px Georgia,serif;color:#44403c;line-height:1}'
      )
    ),
    textLayer('qc_quote', box(24, 64, 312, 184, 2), 'Simplicity is not the absence of clutter. It is the presence of a clear idea.', { family: 'serif', size: 25, color: '#fafaf9', italic: true }),
    textLayer('qc_who', box(24, 276, 220, 40, 3), ['Lena Ortiz', 'Designer, Field Notes'], { size: 12, color: '#d6d3d1', bold: true }),
    buttonLayer('qc_src', box(256, 280, 80, 32, 4), 'Source', { fill: '#f59e0b', color: t.ink }, { behavior: 'cta.open', openUrl: 'https://parnoir.com/quotes' }, { size: 12 })
  ]);
}

/** A big headline, body copy, and Details. */
export function seedSocialAnnounce(): SeedBundle {
  return curatedCardSeed([
    artLayer(
      'an_art',
      artHtml(
        '#facc15',
        '<div class="r" style="left:-40px;top:250px;width:460px;height:40px;background:#0b0b0c;transform:rotate(-6deg)"></div><div class="r" style="left:-40px;top:300px;width:460px;height:14px;background:#0b0b0c;transform:rotate(-6deg);opacity:.25"></div>'
      )
    ),
    textLayer('an_kicker', box(24, 24, 200, 20, 2), 'BIG NEWS', { size: 12, color: '#0b0b0c', bold: true }),
    textLayer('an_title', box(24, 48, 312, 110, 3), ["We're moving", 'to Pen'], { family: 'serif', size: 40, color: '#0b0b0c', bold: true }),
    textLayer('an_body', box(24, 160, 312, 60, 4), 'Same writing, new home. Your subscription carries over and nothing changes on your end.', { size: 13, color: '#1c1917' }),
    panelLayer(
      'an_changes',
      box(24, 160, 312, 128, 6),
      '#0b0b0c',
      ['What changes for you', 'Nothing to do. Old links redirect, comments come with us, and the price stays the same.'],
      { size: 13, color: '#facc15', bold: true },
      { visible: false, name: 'What changes' }
    ),
    buttonLayer('an_more', box(24, 302, 120, 40, 5), 'Details', { fill: '#0b0b0c', color: '#facc15' }, { behavior: 'cta.open', openUrl: 'https://parnoir.com/news/pen' }),
    buttonLayer('an_what', box(156, 302, 160, 40, 7), 'What changes?', { fill: 'rgba(11,11,12,0.12)', color: '#0b0b0c' }, { behavior: 'widget.reveal', revealLayerId: 'an_changes', revealMode: 'toggle' }, { size: 13 })
  ]);
}

/** Before and After panels behind two tabs. */
export function seedSocialBeforeafter(): SeedBundle {
  const t = themes.slate;
  return curatedCardSeed([
    artLayer(
      'ba_art',
      artHtml(
        '#0f172a',
        '<div class="pane"><b style="background:#57534e"></b><b style="background:#e0f2fe"></b><span>Tap Before or After</span></div>',
        '.pane{position:absolute;left:24px;top:96px;width:312px;height:196px;border-radius:14px;border:1px dashed #334155;box-sizing:border-box;overflow:hidden}.pane b{position:absolute;top:0;bottom:0;width:50%}.pane b:first-child{left:0;opacity:.35}.pane b:nth-child(2){right:0;opacity:.18}.pane span{position:absolute;left:0;right:0;top:86px;text-align:center;font:600 13px Montserrat,Helvetica,sans-serif;color:#e2e8f0}'
      )
    ),
    textLayer('ba_kicker', box(24, 20, 200, 20, 2), 'KITCHEN REDO', { size: 11, color: '#38bdf8', bold: true }),
    textLayer('ba_title', box(24, 42, 312, 40, 3), 'Six weekends later', { family: 'serif', size: 24, color: '#f1f5f9', bold: true }),
    panelLayer('ba_before', box(24, 96, 312, 196, 4), '#57534e', ['BEFORE', 'Dark cabinets, one light, no counter space.'], { size: 14, color: '#f5f5f4', bold: true, align: 'center' }, { visible: false, name: 'Before', cornerRadius: 14 }),
    panelLayer('ba_after', box(24, 96, 312, 196, 5), '#e0f2fe', ['AFTER', 'Open shelves, warm oak, and room to cook.'], { size: 14, color: '#0c4a6e', bold: true, align: 'center' }, { visible: false, name: 'After', cornerRadius: 14 }),
    buttonLayer('ba_b', box(24, 306, 150, 40, 6), 'Before', t.ghost, { behavior: 'widget.reveal', revealLayerId: 'ba_before', revealMode: 'tab' }),
    buttonLayer('ba_a', box(186, 306, 150, 40, 7), 'After', { fill: '#38bdf8', color: '#0f172a' }, { behavior: 'widget.reveal', revealLayerId: 'ba_after', revealMode: 'tab' })
  ]);
}

/** Tip number and the tip behind a tap. */
export function seedSocialTip(): SeedBundle {
  const t = themes.citrus;
  return curatedCardSeed([
    artLayer(
      'td_art',
      artHtml(
        'linear-gradient(160deg,#ecfccb 0%,#fef9c3 100%)',
        '<div class="bulb"></div>',
        '.bulb{position:absolute;right:40px;top:40px;width:64px;height:64px;border-radius:50%;background:#facc15;box-shadow:0 0 0 14px rgba(250,204,21,.25)}.bulb:after{content:"";position:absolute;left:20px;top:62px;width:24px;height:16px;border-radius:0 0 4px 4px;background:#57534e}'
      )
    ),
    textLayer('td_kicker', box(24, 28, 200, 20, 2), 'KITCHEN NOTES · NO. 18', { size: 11, color: t.accent, bold: true }),
    textLayer('td_num', box(24, 60, 200, 66, 3), 'Tip #12', { family: 'serif', size: 48, color: t.ink, bold: true }),
    textLayer('td_topic', box(24, 132, 220, 24, 4), 'Writing headlines', { size: 14, color: t.muted, bold: true }),
    buttonLayer('td_show', box(24, 176, 140, 40, 5), 'Show the tip', t.primary, { behavior: 'widget.reveal', revealLayerId: 'td_tip', revealMode: 'show' }),
    panelLayer('td_tip', box(24, 232, 312, 100, 6), '#ffffff', 'Write the headline last. Once the piece is done, you finally know what it is about.', { family: 'serif', size: 16, color: t.ink }, { visible: false, name: 'Tip' })
  ]);
}

/** One huge number and its context. */
export function seedSocialStat(): SeedBundle {
  const t = themes.night;
  return curatedCardSeed([
    artLayer(
      'st_art',
      artHtml(
        '#0f172a',
        '<svg style="position:absolute;left:0;bottom:0" width="360" height="140" viewBox="0 0 360 140"><polyline points="0,130 60,112 120,118 180,80 240,70 300,34 360,12" fill="none" stroke="#818cf8" stroke-width="4"/><polygon points="0,130 60,112 120,118 180,80 240,70 300,34 360,12 360,140 0,140" fill="rgba(129,140,248,0.18)"/></svg>'
      )
    ),
    textLayer('st_kicker', box(24, 24, 260, 20, 2), 'READERS THIS YEAR', { size: 11, color: t.accent, bold: true }),
    textLayer('st_num', box(24, 62, 312, 72, 3), '3.2M', { family: 'serif', size: 76, color: '#ffffff', bold: true }),
    textLayer('st_label', box(24, 142, 260, 40, 4), 'Up 41% from last year, with zero paid promotion.', { size: 14, color: t.muted }),
    buttonLayer('st_report', box(24, 198, 140, 36, 5), 'See report', t.primary, { behavior: 'cta.open', openUrl: 'https://parnoir.com/report' }, { size: 13 }),
    buttonLayer('st_how', box(176, 198, 160, 36, 6), 'How we counted', t.ghost, { behavior: 'widget.reveal', revealLayerId: 'st_method', revealMode: 'toggle' }, { size: 12 }),
    panelLayer(
      'st_method',
      box(24, 248, 312, 88, 7),
      '#1e293b',
      'Unique signed-in readers who finished at least one post, Jan 1 to Dec 31. Bots and repeat visits removed.',
      { size: 12, color: t.ink },
      { visible: false, name: 'Method' }
    )
  ]);
}

/** Film-strip frames with the story behind a tap. */
export function seedSocialBts(): SeedBundle {
  return curatedCardSeed([
    artLayer(
      'bts_art',
      artHtml(
        '#111111',
        '<div class="strip"><div class="f" style="background:linear-gradient(135deg,#78350f,#f59e0b)"></div><div class="f" style="background:linear-gradient(135deg,#1e3a8a,#60a5fa)"></div><div class="f" style="background:linear-gradient(135deg,#14532d,#4ade80)"></div></div>',
        '.strip{position:absolute;left:0;top:70px;width:360px;height:136px;background:#000;display:flex;gap:10px;padding:18px 14px;box-sizing:border-box;background-image:repeating-linear-gradient(90deg,#fff 0 8px,transparent 8px 20px),repeating-linear-gradient(90deg,#fff 0 8px,transparent 8px 20px);background-size:100% 6px,100% 6px;background-position:0 4px,0 126px;background-repeat:repeat-x}.f{flex:1;border-radius:4px}'
      )
    ),
    textLayer('bts_kicker', box(24, 22, 200, 20, 2), 'ON SET · SHORT FILM', { size: 11, color: '#f59e0b', bold: true }),
    textLayer('bts_title', box(24, 220, 312, 36, 3), 'Day three on set', { family: 'serif', size: 24, color: '#ffffff', bold: true }),
    buttonLayer('bts_more', box(24, 262, 150, 36, 4), 'What happened', { fill: '#f59e0b', color: '#111111' }, { behavior: 'widget.reveal', revealLayerId: 'bts_cap', revealMode: 'toggle' }, { size: 13 }),
    textLayer('bts_cap', box(24, 304, 312, 44, 5), 'Rain wiped out the morning, so we shot the whole finale under one tarp.', { size: 12, color: '#d4d4d4' }, { visible: false })
  ]);
}

/** Confetti art, the milestone, and a Celebrate stamp. */
export function seedSocialMilestone(): SeedBundle {
  const t = themes.rose;
  const bits = [
    [40, 30, '#f43f5e', 12],
    [90, 70, '#facc15', 8],
    [300, 40, '#22c55e', 10],
    [260, 90, '#3b82f6', 8],
    [320, 120, '#f97316', 12],
    [60, 120, '#a855f7', 8],
    [200, 24, '#14b8a6', 6]
  ] as const;
  const confetti = bits
    .map(([x, y, c, s], i) => `<div class="r" style="left:${x}px;top:${y}px;width:${s}px;height:${s * 2}px;background:${c};transform:rotate(${i * 37}deg);border-radius:2px"></div>`)
    .join('');
  return curatedCardSeed([
    artLayer('mlt_art', artHtml('linear-gradient(180deg,#fff1f2 0%,#ffe4e6 100%)', confetti)),
    textLayer('mlt_kicker', box(0, 140, 360, 20, 2), 'THANK YOU', { size: 11, color: t.accent, bold: true, align: 'center' }),
    textLayer('mlt_num', box(0, 162, 360, 56, 3), '10,000 readers', { family: 'serif', size: 36, color: t.ink, bold: true, align: 'center' }),
    textLayer('mlt_thanks', box(40, 218, 280, 40, 4), 'Thank you for every share, reply, and late-night read.', { size: 13, color: t.muted, align: 'center' }),
    buttonLayer('mlt_cheer', box(100, 282, 160, 44, 5), 'Celebrate', t.primary, { behavior: 'widget.stamp', label: 'Celebrated' }, { size: 15 })
  ]);
}
