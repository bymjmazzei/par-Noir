import type { SeedBundle } from '../starterSeeds.js';
import { artHtml, artLayer, box, buttonLayer, countdownLayer, curatedCardSeed, textLayer, themes } from './kit.js';

/** Drawn card with a headline and an Open button. */
export function seedLinkCardWidget(): SeedBundle {
  return curatedCardSeed([
    artLayer(
      'lk_art',
      artHtml(
        'linear-gradient(135deg,#fef3c7 0%,#fde68a 45%,#f59e0b 100%)',
        '<div class="s" style="width:260px;height:260px;right:-90px;top:-90px;background:rgba(255,255,255,0.45)"></div><div class="r" style="left:32px;top:108px;width:64px;height:6px;background:#111827"></div>'
      )
    ),
    textLayer('lk_kicker', box(24, 16, 200, 32, 2), 'NEW ON THE BLOG', { size: 11, color: '#92400e', bold: true }),
    textLayer('lk_title', box(24, 120, 312, 88, 3), 'How we built a calmer feed', { family: 'serif', size: 30, color: '#111827', bold: true }),
    textLayer('lk_sub', box(24, 208, 312, 64, 4), 'Six choices that put people before engagement.', { size: 14, color: '#3f3f46' }),
    buttonLayer('lk_open', box(24, 288, 160, 44, 5), 'Read the story', { fill: '#111827', color: '#ffffff' }, { behavior: 'cta.open', openUrl: 'https://parnoir.com' })
  ]);
}

/** Avatar, name, and four stacked links. */
export function seedLinkBio(): SeedBundle {
  const t = themes.paper;
  const link = { fill: '#ffffff', color: t.ink };
  const row = (id: string, i: number, face: string, url: string) =>
    buttonLayer(id, box(24, 140 + i * 50, 312, 42, 4 + i), face, link, { behavior: 'cta.open', openUrl: url }, { radius: 12, stroke: '#e7e0d2' });
  return curatedCardSeed([
    artLayer(
      'lb_art',
      artHtml(
        '#f6f1e7',
        '<div class="av"></div>',
        '.av{position:absolute;left:150px;top:18px;width:60px;height:60px;border-radius:50%;background:radial-gradient(circle at 50% 38%,#fcd34d 0 13px,transparent 14px),radial-gradient(circle at 50% 100%,#fcd34d 0 26px,transparent 27px),#b45309;border:3px solid #fff;box-shadow:0 4px 12px rgba(0,0,0,.12)}'
      )
    ),
    textLayer('lb_name', box(0, 84, 360, 26, 2), 'Ana Ruiz', { family: 'serif', size: 20, color: t.ink, bold: true, align: 'center' }),
    textLayer('lb_bio', box(0, 108, 360, 22, 3), 'Ceramics, slow travel, and notes from the studio', { size: 11, color: t.muted, align: 'center' }),
    row('lb_shop', 0, 'Shop the spring glazes', 'https://parnoir.com/shop'),
    row('lb_news', 1, 'Studio newsletter', 'https://parnoir.com/news'),
    row('lb_class', 2, 'Book a wheel class', 'https://parnoir.com/classes'),
    row('lb_video', 3, 'Watch the kiln opening', 'https://parnoir.com/video')
  ]);
}

/** An excerpt, more text on tap, and the full article link. */
export function seedLinkTeaser(): SeedBundle {
  const t = themes.slate;
  return curatedCardSeed([
    artLayer(
      'rmt_art',
      artHtml('#ffffff', '<div class="r" style="left:0;top:0;width:8px;height:360px;background:#0369a1"></div>')
    ),
    textLayer('rmt_kicker', box(28, 22, 260, 20, 2), 'ESSAY · 6 MIN READ', { size: 11, color: t.accent, bold: true }),
    textLayer('rmt_title', box(28, 46, 304, 64, 3), 'The case for boring technology', { family: 'serif', size: 24, color: t.ink, bold: true }),
    textLayer('rmt_excerpt', box(28, 116, 304, 60, 4), 'The tools that last are rarely the ones that trend. They are the ones you forget are there.', { family: 'serif', size: 14, color: '#334155' }),
    buttonLayer('rmt_more', box(28, 184, 120, 32, 5), 'Read more', { fill: '#e0f2fe', color: '#0369a1' }, { behavior: 'widget.reveal', revealLayerId: 'rmt_rest', revealMode: 'toggle' }, { size: 13 }),
    textLayer('rmt_rest', box(28, 224, 304, 72, 6), 'Every new dependency is a promise to keep. Choose the ones with a long history, a small surface, and people who still answer email.', { family: 'serif', size: 13, color: '#334155' }, { visible: false }),
    buttonLayer('rmt_full', box(28, 304, 160, 40, 7), 'Full article', t.primary, { behavior: 'cta.open', openUrl: 'https://parnoir.com/essays/boring' })
  ]);
}

/** A drawn phone and two store badges. */
export function seedLinkAppbadge(): SeedBundle {
  const badge = { fill: '#000000', color: '#ffffff' };
  return curatedCardSeed([
    artLayer(
      'ab_art',
      artHtml(
        'linear-gradient(160deg,#ecfeff 0%,#cffafe 100%)',
        '<div class="phone"><div class="screen"><div class="tile" style="top:16px"></div><div class="tile" style="top:52px;width:60%"></div><div class="tile" style="top:88px"></div><div class="dot"></div></div></div>',
        '.phone{position:absolute;left:220px;top:40px;width:110px;height:220px;border-radius:22px;background:#0f172a;padding:8px;box-sizing:border-box;transform:rotate(6deg);box-shadow:0 20px 40px rgba(14,116,144,.3)}.screen{position:relative;width:100%;height:100%;border-radius:15px;background:linear-gradient(180deg,#22d3ee,#0e7490)}.tile{position:absolute;left:10px;width:74px;height:24px;border-radius:6px;background:rgba(255,255,255,.35)}.dot{position:absolute;left:36px;bottom:12px;width:22px;height:22px;border-radius:50%;background:#fff}'
      )
    ),
    textLayer('ab_kicker', box(24, 34, 180, 20, 2), 'NOW ON MOBILE', { size: 11, color: '#0e7490', bold: true }),
    textLayer('ab_title', box(24, 58, 186, 96, 3), 'Take your notes anywhere', { family: 'serif', size: 26, color: '#083344', bold: true }),
    textLayer('ab_sub', box(24, 160, 186, 44, 4), 'Offline, synced, and private by default.', { size: 13, color: '#155e75' }),
    buttonLayer('ab_ios', box(24, 232, 150, 44, 5), 'App Store', badge, { behavior: 'cta.open', openUrl: 'https://apps.apple.com' }, { radius: 10 }),
    buttonLayer('ab_android', box(24, 284, 150, 44, 6), 'Google Play', badge, { behavior: 'cta.open', openUrl: 'https://play.google.com' }, { radius: 10 })
  ]);
}

/** Full-height story with a chevron and the link at the bottom. */
export function seedLinkSwipeup(): SeedBundle {
  return curatedCardSeed([
    artLayer(
      'su_art',
      artHtml(
        'linear-gradient(180deg,#1e1b4b 0%,#7c3aed 55%,#f472b6 100%)',
        '<div class="s" style="width:300px;height:300px;left:-80px;top:120px;background:rgba(255,255,255,0.08)"></div><div class="s" style="width:180px;height:180px;right:-60px;top:40px;background:rgba(253,230,138,0.2)"></div><div class="chev" style="top:470px"></div><div class="chev" style="top:486px;opacity:.6"></div>',
        '.chev{position:absolute;left:166px;width:28px;height:28px;border-left:4px solid #fff;border-top:4px solid #fff;transform:rotate(45deg)}'
      ),
      640
    ),
    textLayer('su_kicker', box(24, 48, 312, 20, 2), 'LIMITED DROP', { size: 12, color: '#fde68a', bold: true }),
    textLayer('su_title', box(24, 76, 312, 180, 3), ['The midnight', 'collection', 'is here'], { family: 'serif', size: 44, color: '#ffffff', bold: true }),
    textLayer('su_sub', box(24, 270, 280, 60, 4), 'Twelve pieces, hand-dyed in small batches. When they are gone, they are gone.', { size: 15, color: 'rgba(255,255,255,0.85)' }),
    textLayer('su_ends', box(24, 360, 312, 20, 5), 'DROP CLOSES IN', { size: 11, color: '#fde68a', bold: true, align: 'center' }),
    countdownLayer('su_timer', box(80, 386, 200, 44, 6), '#ffffff', 3, 'rgba(30,27,75,0.45)'),
    buttonLayer('su_go', box(60, 540, 240, 52, 7), 'Swipe up to shop', { fill: '#ffffff', color: '#4c1d95' }, { behavior: 'cta.open', openUrl: 'https://parnoir.com/midnight' }, { size: 16 })
  ]);
}

/** Chat bubbles and a button that opens a conversation. */
export function seedLinkMessage(): SeedBundle {
  const t = themes.night;
  return curatedCardSeed([
    artLayer(
      'mm_art',
      artHtml(
        '#0f172a',
        '<div class="b in" style="top:110px;width:150px">Do you take custom orders?</div><div class="b out" style="top:160px;width:120px">Always. Tell me more.</div>',
        '.b{position:absolute;padding:10px 12px;border-radius:16px;font:500 12px Montserrat,Helvetica,sans-serif;line-height:1.3}.in{left:24px;background:#1e293b;color:#e2e8f0;border-bottom-left-radius:4px}.out{right:24px;background:#818cf8;color:#0f172a;border-bottom-right-radius:4px}'
      )
    ),
    textLayer('mm_kicker', box(24, 24, 200, 20, 2), 'DIRECT LINE', { size: 11, color: t.accent, bold: true }),
    textLayer('mm_title', box(24, 48, 312, 40, 3), 'Questions? Message me.', { family: 'serif', size: 24, color: t.ink, bold: true }),
    textLayer('mm_sub', box(24, 228, 312, 40, 4), 'I reply within a day, usually sooner.', { size: 13, color: t.muted }),
    buttonLayer('mm_send', box(24, 280, 200, 48, 5), 'Send a message', t.primary, { behavior: 'widget.submit', label: 'Message from your widget' }, { size: 15 })
  ]);
}
