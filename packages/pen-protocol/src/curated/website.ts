import type { SeedBundle } from '../starterSeeds.js';
import {
  artHtml,
  artLayer,
  box,
  buttonLayer,
  curatedCardSeed,
  inputLayer,
  panelLayer,
  textLayer,
  themes
} from './kit.js';

/** Wordmark and three page links. */
export function seedWebNav(): SeedBundle {
  const link = { fill: 'transparent', color: '#f5f5f4' };
  return curatedCardSeed([
    artLayer(
      'wn_art',
      artHtml('#0b0b0c', '<div class="r" style="left:0;bottom:0;width:360px;height:1px;background:#27272a"></div><div class="s" style="left:20px;top:46px;width:28px;height:28px;background:#facc15"></div>'),
      120
    ),
    textLayer('wn_brand', box(56, 44, 100, 32, 2), 'Northwind', { family: 'serif', size: 18, color: '#f5f5f4', bold: true }),
    buttonLayer('wn_home', box(156, 42, 60, 36, 3), 'Home', link, { behavior: 'page.go', goTo: 'page:0' }, { size: 12 }),
    buttonLayer('wn_about', box(218, 42, 60, 36, 4), 'About', link, { behavior: 'page.go', goTo: 'page:1' }, { size: 12 }),
    buttonLayer('wn_contact', box(280, 42, 66, 36, 5), 'Contact', { fill: '#facc15', color: '#0b0b0c' }, { behavior: 'page.go', goTo: 'page:2' }, { size: 12 })
  ]);
}

/** Headline, subhead, a primary CTA, and Learn more to the next page. */
export function seedWebHero(): SeedBundle {
  const t = themes.ink;
  return curatedCardSeed([
    artLayer(
      'wh_art',
      artHtml(
        'radial-gradient(circle at 80% 10%,#3f3f46 0%,#0b0b0c 60%)',
        '<div class="arc"></div>',
        '.arc{position:absolute;right:-190px;bottom:-200px;width:320px;height:320px;border-radius:50%;border:48px solid rgba(250,204,21,.18)}'
      )
    ),
    textLayer('wh_kicker', box(24, 40, 260, 20, 2), 'BUILT FOR SMALL TEAMS', { size: 11, color: t.accent, bold: true }),
    textLayer('wh_title', box(24, 70, 312, 126, 3), ['Ship work', 'you are proud of'], { family: 'serif', size: 38, color: t.ink, bold: true }),
    textLayer('wh_sub', box(24, 200, 290, 48, 4), 'Plans, docs, and feedback in one quiet place. No dashboards to babysit.', { size: 14, color: t.muted }),
    buttonLayer('wh_cta', box(24, 272, 150, 48, 5), 'Start free', t.primary, { behavior: 'cta.open', openUrl: 'https://parnoir.com/start' }, { size: 15 }),
    buttonLayer('wh_more', box(186, 272, 130, 48, 6), 'Learn more', t.ghost, { behavior: 'page.go', goTo: 'next' })
  ]);
}

/** Three feature tiles and a link to all features. */
export function seedWebFeatures(): SeedBundle {
  const t = themes.paper;
  const tile = (left: number, icon: string) =>
    `<div class="tl" style="left:${left}px"><i style="background:${icon}"></i></div>`;
  return curatedCardSeed([
    artLayer(
      'wf_art',
      artHtml(
        '#f6f1e7',
        tile(24, '#fde68a') + tile(132, '#bfdbfe') + tile(240, '#bbf7d0'),
        '.tl{position:absolute;top:96px;width:96px;height:176px;border-radius:12px;background:#fff;border:1px solid #e7e0d2;box-sizing:border-box}.tl i{position:absolute;left:10px;top:12px;width:28px;height:28px;border-radius:8px}'
      )
    ),
    textLayer('wf_kicker', box(24, 24, 200, 20, 2), 'WHY NORTHWIND', { size: 11, color: t.accent, bold: true }),
    textLayer('wf_title', box(24, 46, 312, 40, 2), 'Everything in one place', { family: 'serif', size: 24, color: t.ink, bold: true }),
    ...[
      ['Plans', 'Roadmaps that update themselves.'],
      ['Docs', 'Write once, link everywhere.'],
      ['Feedback', 'Comments right where work happens.']
    ].flatMap(([title, line], i) => [
      textLayer(`wf_t${i + 1}`, box(32 + i * 108, 146, 80, 20, 4), title, { size: 13, color: t.ink, bold: true }),
      textLayer(`wf_t${i + 1}_line`, box(32 + i * 108, 172, 80, 92, 4), line, { size: 11, color: t.muted })
    ]),
    buttonLayer('wf_all', box(24, 292, 170, 40, 5), 'See all features', t.primary, { behavior: 'cta.open', openUrl: 'https://parnoir.com/features' }, { size: 13 })
  ]);
}

/** A customer quote with avatar, stars, and the full story link. */
export function seedWebTestimonial(): SeedBundle {
  const t = themes.slate;
  return curatedCardSeed([
    artLayer(
      'wt_art',
      artHtml(
        '#ffffff',
        '<div class="stars"><i></i><i></i><i></i><i></i><i></i></div><div class="av"></div>',
        '.stars{position:absolute;left:24px;top:28px;display:flex;gap:4px}.stars i{display:block;width:16px;height:16px;background:#f59e0b;clip-path:polygon(50% 0,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)}.av{position:absolute;left:24px;top:236px;width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,#0369a1,#7dd3fc)}'
      )
    ),
    textLayer('wt_quote', box(24, 60, 312, 160, 2), '"We cut our weekly status meeting entirely. Everyone just reads the board now."', { family: 'serif', size: 21, color: t.ink, italic: true }),
    textLayer('wt_who', box(84, 238, 252, 44, 3), ['Priya Natarajan', 'Head of Ops, Fernway'], { size: 12, color: t.ink, bold: true }),
    buttonLayer('wt_story', box(24, 300, 150, 40, 4), 'Read story', t.primary, { behavior: 'cta.open', openUrl: 'https://parnoir.com/customers/fernway' }, { size: 13 })
  ]);
}

/** Three plan columns, each with its own Choose button. */
export function seedWebPricing(): SeedBundle {
  const t = themes.night;
  const col = (id: string, x: number, name: string, price: string, perks: string[]) => [
    textLayer(`${id}_name`, box(x + 10, 96, 76, 18, 3), name, { size: 10, color: t.accent, bold: true }),
    textLayer(`${id}_price`, box(x + 10, 118, 76, 30, 3), price, { family: 'serif', size: 19, color: '#ffffff', bold: true }),
    textLayer(`${id}_perks`, box(x + 10, 170, 76, 100, 3), perks, { size: 11, color: t.muted })
  ];
  const column = (left: number, hot: boolean) =>
    `<div class="col" style="left:${left}px;background:${hot ? '#312e81' : '#1e293b'};border-color:${hot ? '#818cf8' : '#334155'}"></div>`;
  return curatedCardSeed([
    artLayer(
      'wp_art',
      artHtml(
        '#0f172a',
        column(24, false) + column(132, true) + column(240, false) + '<div class="r" style="left:132px;top:72px;width:96px;height:12px;border-radius:6px 6px 0 0;background:#818cf8"></div><div class="r" style="left:34px;right:34px;top:158px;height:1px;background:rgba(226,232,240,.12)"></div>',
        '.col{position:absolute;top:84px;width:96px;height:200px;border-radius:12px;border:1px solid;box-sizing:border-box}'
      )
    ),
    textLayer('wp_title', box(24, 24, 312, 40, 2), 'Simple pricing', { family: 'serif', size: 24, color: t.ink, bold: true }),
    ...col('wp_free', 24, 'FREE', '$0', ['1 project', 'Community help']),
    ...col('wp_pro', 132, 'PRO', '$12/mo', ['Unlimited projects', 'Priority help']),
    ...col('wp_team', 240, 'TEAM', '$29/mo', ['Up to 20 people', 'Admin tools']),
    buttonLayer('wp_free_go', box(24, 296, 96, 36, 4), 'Choose', t.ghost, { behavior: 'cta.open', openUrl: 'https://parnoir.com/pricing?plan=free' }, { size: 12, radius: 10 }),
    buttonLayer('wp_pro_go', box(132, 296, 96, 36, 5), 'Choose', t.primary, { behavior: 'cta.open', openUrl: 'https://parnoir.com/pricing?plan=pro' }, { size: 12, radius: 10 }),
    buttonLayer('wp_team_go', box(240, 296, 96, 36, 6), 'Choose', t.ghost, { behavior: 'cta.open', openUrl: 'https://parnoir.com/pricing?plan=team' }, { size: 12, radius: 10 })
  ]);
}

/** Three people, their roles, and Join us. */
export function seedWebTeam(): SeedBundle {
  const t = themes.paper;
  const person = (id: string, x: number, name: string, role: string) =>
    textLayer(id, box(x, 184, 104, 48, 3), [name, role], { size: 12, color: t.ink, bold: true, align: 'center' });
  return curatedCardSeed([
    artLayer(
      'wtm_art',
      artHtml(
        '#f6f1e7',
        '<div class="av" style="left:44px;background:linear-gradient(135deg,#f59e0b,#b45309)"></div><div class="av" style="left:148px;background:linear-gradient(135deg,#60a5fa,#1d4ed8)"></div><div class="av" style="left:252px;background:linear-gradient(135deg,#4ade80,#15803d)"></div>',
        '.av{position:absolute;top:96px;width:64px;height:64px;border-radius:50%;border:3px solid #fff;box-shadow:0 4px 10px rgba(0,0,0,.12)}'
      )
    ),
    textLayer('wtm_kicker', box(24, 24, 200, 20, 2), 'THE TEAM', { size: 11, color: t.accent, bold: true }),
    textLayer('wtm_title', box(24, 46, 312, 40, 2), 'Small team, big care', { family: 'serif', size: 24, color: t.ink, bold: true }),
    person('wtm_a', 24, 'Jonah Lee', 'Founder'),
    person('wtm_b', 128, 'Sofia Marin', 'Design'),
    person('wtm_c', 232, 'Kwame Asante', 'Engineering'),
    buttonLayer('wtm_join', box(24, 280, 140, 44, 4), 'Join us', t.primary, { behavior: 'cta.open', openUrl: 'https://parnoir.com/careers' }),
    textLayer('wtm_hiring', box(176, 288, 160, 28, 5), "We're hiring a writer.", { size: 12, color: t.muted })
  ]);
}

/** Three slides with Prev and Next. */
export function seedWebGallery(): SeedBundle {
  const t = themes.ink;
  const slide = (id: string, frame: number, fill: string, caption: string[]) =>
    panelLayer(id, box(24, 60, 312, 210, 3), fill, caption, { size: 16, color: '#ffffff', bold: true, align: 'center' }, { stepFrame: frame, name: `Slide ${frame + 1}`, cornerRadius: 14 });
  return curatedCardSeed([
    artLayer('wg_art', artHtml('#0b0b0c', '<div class="r" style="left:24px;top:60px;width:312px;height:210px;border-radius:14px;background:#18181b"></div>')),
    textLayer('wg_kicker', box(24, 24, 260, 20, 2), 'RECENT WORK', { size: 11, color: t.accent, bold: true }),
    slide('wg_s1', 0, '#c2410c', ['', '', 'Harbor Coffee', 'Packaging, 2026']),
    slide('wg_s2', 1, '#1d4ed8', ['', '', 'Tidewater Books', 'Shop signage, 2025']),
    slide('wg_s3', 2, '#15803d', ['', '', 'Field Day Fest', 'Identity, 2025']),
    buttonLayer('wg_prev', box(24, 290, 100, 40, 4), 'Prev', t.ghost, { behavior: 'widget.step', stepDir: 'prev' }),
    buttonLayer('wg_next', box(236, 290, 100, 40, 5), 'Next', t.primary, { behavior: 'widget.step', stepDir: 'next' })
  ]);
}

/** A contact strip: details on the left, a short form on the right. */
export function seedWebContact(): SeedBundle {
  const t = themes.slate;
  return curatedCardSeed([
    artLayer('wc_art', artHtml('#e2e8f0', '<div class="r" style="left:0;top:0;width:360px;height:6px;background:#0369a1"></div>')),
    textLayer('wc_title', box(24, 26, 312, 36, 2), "Let's talk", { family: 'serif', size: 26, color: t.ink, bold: true }),
    textLayer('wc_info', box(24, 66, 312, 44, 3), ['hello@northwind.studio', '14 Dock Road, Bristol'], { size: 12, color: t.muted, bold: true }),
    inputLayer('wc_name', box(24, 122, 150, 40, 4), 'Name', t.field, { name: 'Name' }),
    inputLayer('wc_email', box(186, 122, 150, 40, 5), 'Email', t.field, { name: 'Email' }),
    inputLayer('wc_msg', box(24, 172, 312, 88, 6), 'Tell us about your project…', t.field, { name: 'Message' }),
    buttonLayer('wc_send', box(24, 276, 140, 44, 7), 'Send', t.primary, { behavior: 'widget.submit', label: 'Website contact' }),
    buttonLayer('wc_mail', box(176, 276, 160, 44, 8), 'Email us', t.ghost, { behavior: 'cta.open', openUrl: 'mailto:hello@northwind.studio' })
  ]);
}

/** A row of links and the copyright line. */
export function seedWebFooter(): SeedBundle {
  const link = { fill: 'transparent', color: '#a1a1aa' };
  return curatedCardSeed([
    artLayer('wft_art', artHtml('#18181b', '<div class="r" style="left:20px;right:20px;top:72px;height:1px;background:#3f3f46"></div>'), 120),
    buttonLayer('wft_privacy', box(12, 22, 76, 36, 2), 'Privacy', link, { behavior: 'cta.open', openUrl: 'https://parnoir.com/privacy' }, { size: 11 }),
    buttonLayer('wft_terms', box(92, 22, 70, 36, 3), 'Terms', link, { behavior: 'cta.open', openUrl: 'https://parnoir.com/terms' }, { size: 11 }),
    buttonLayer('wft_press', box(166, 22, 70, 36, 4), 'Press', link, { behavior: 'cta.open', openUrl: 'https://parnoir.com/press' }, { size: 11 }),
    buttonLayer('wft_jobs', box(240, 22, 104, 36, 5), 'Careers', link, { behavior: 'cta.open', openUrl: 'https://parnoir.com/careers' }, { size: 11 }),
    textLayer('wft_copy', box(20, 82, 320, 24, 6), '© 2026 Northwind Studio. Made with care in Bristol.', { size: 10, color: '#71717a' })
  ]);
}

/** Three numbers across a banner. */
export function seedWebStats(): SeedBundle {
  const stat = (id: string, x: number, num: string, label: string) => [
    textLayer(id, box(x, 20, 104, 34, 2), num, { family: 'serif', size: 26, color: '#ffffff', bold: true, align: 'center' }),
    textLayer(`${id}_label`, box(x, 60, 104, 20, 2), label, { size: 11, color: '#e0f2fe', bold: true, align: 'center' })
  ];
  return curatedCardSeed([
    artLayer(
      'ws2_art',
      artHtml(
        'linear-gradient(90deg,#0c4a6e,#0369a1)',
        '<div class="r" style="left:119px;top:30px;width:1px;height:60px;background:rgba(224,242,254,.3)"></div><div class="r" style="left:240px;top:30px;width:1px;height:60px;background:rgba(224,242,254,.3)"></div>'
      ),
      120
    ),
    ...stat('wss_a', 8, '12k', 'teams'),
    ...stat('wss_b', 128, '98%', 'stay a year'),
    ...stat('wss_c', 248, '4.9', 'average rating'),
    textLayer('wss_source', box(16, 94, 240, 18, 2), 'Source: 2026 customer survey', { size: 9, color: 'rgba(224,242,254,0.7)' }),
    buttonLayer('wss_more', box(276, 92, 72, 22, 3), 'Our data', { fill: 'rgba(224,242,254,0.18)', color: '#e0f2fe' }, { behavior: 'cta.open', openUrl: 'https://parnoir.com/data' }, { size: 10 })
  ]);
}

/** Five partner wordmarks and a Partners link. */
export function seedWebLogos(): SeedBundle {
  const mark = (id: string, x: number, name: string, family: 'sans' | 'serif' | 'mono') =>
    textLayer(id, box(x, 54, 64, 24, 2), name, { family, size: 12, color: '#57534e', bold: true, align: 'center' });
  return curatedCardSeed([
    artLayer('wl2_art', artHtml('#fafaf9', '<div class="r" style="left:0;top:0;width:360px;height:1px;background:#e7e5e4"></div><div class="r" style="left:0;bottom:0;width:360px;height:1px;background:#e7e5e4"></div>'), 120),
    textLayer('wlg_kicker', box(16, 18, 200, 20, 2), 'TRUSTED BY', { size: 10, color: '#a8a29e', bold: true }),
    buttonLayer('wlg_more', box(266, 14, 80, 28, 3), 'Partners', { fill: '#1c1917', color: '#fafaf9' }, { behavior: 'cta.open', openUrl: 'https://parnoir.com/partners' }, { size: 11 }),
    mark('wlg_1', 8, 'Fernway', 'serif'),
    mark('wlg_2', 78, 'ORBIT', 'sans'),
    mark('wlg_3', 148, 'tidal', 'mono'),
    mark('wlg_4', 218, 'Harbor', 'serif'),
    mark('wlg_5', 288, 'KILN', 'sans')
  ]);
}

/** A full-width call to action. */
export function seedWebCta(): SeedBundle {
  return curatedCardSeed([
    artLayer(
      'wca_art',
      artHtml('linear-gradient(110deg,#facc15 0%,#f97316 100%)', '<div class="s" style="width:160px;height:160px;right:-40px;top:-60px;background:rgba(255,255,255,0.25)"></div>'),
      120
    ),
    textLayer('wca_title', box(20, 24, 200, 72, 2), ['Ready when you are.', 'Free for 30 days.'], { family: 'serif', size: 17, color: '#1c1917', bold: true }),
    buttonLayer('wca_go', box(228, 36, 116, 48, 3), 'Get started', { fill: '#1c1917', color: '#ffffff' }, { behavior: 'cta.open', openUrl: 'https://parnoir.com/start' }, { size: 13 })
  ]);
}

/** Three questions; one answer open at a time. */
export function seedWebFaq(): SeedBundle {
  const t = themes.paper;
  const q = { fill: '#ffffff', color: t.ink };
  const answer = (id: string, text: string, open = false) =>
    panelLayer(id, box(24, 244, 312, 96, 10), '#1c1917', text, { size: 13, color: '#f6f1e7' }, { visible: open, name: 'Answer' });
  return curatedCardSeed([
    artLayer('wfq_art', artHtml('#f6f1e7', '<div class="r" style="left:24px;top:232px;width:312px;height:1px;background:#e7e0d2"></div>')),
    textLayer('wfq_title', box(24, 22, 312, 40, 2), 'Questions, answered', { family: 'serif', size: 24, color: t.ink, bold: true }),
    buttonLayer('wfq_1', box(24, 76, 312, 42, 3), 'Can I cancel any time?', q, { behavior: 'widget.reveal', revealLayerId: 'wfq_1_a', revealMode: 'tab' }, { radius: 10, stroke: '#e7e0d2' }),
    buttonLayer('wfq_2', box(24, 126, 312, 42, 4), 'Who owns my data?', q, { behavior: 'widget.reveal', revealLayerId: 'wfq_2_a', revealMode: 'tab' }, { radius: 10, stroke: '#e7e0d2' }),
    buttonLayer('wfq_3', box(24, 176, 312, 42, 5), 'Do you offer discounts?', q, { behavior: 'widget.reveal', revealLayerId: 'wfq_3_a', revealMode: 'tab' }, { radius: 10, stroke: '#e7e0d2' }),
    answer('wfq_1_a', 'Yes. Cancel from settings in two taps and keep access until the end of the month.', true),
    answer('wfq_2_a', 'You do. Export everything at any time, and we never sell or share it.'),
    answer('wfq_3_a', 'Students, nonprofits, and teams under five people get 50% off.')
  ]);
}

/** Three tabs, each with its own panel. */
export function seedWebTabs(): SeedBundle {
  const t = themes.night;
  const panel = (id: string, lines: string[], open = false) =>
    panelLayer(id, box(24, 132, 312, 200, 10), '#1e293b', lines, { size: 14, color: t.ink }, { visible: open, name: 'Tab panel' });
  return curatedCardSeed([
    artLayer('wtb_art', artHtml('#0f172a', '<div class="r" style="left:24px;top:124px;width:312px;height:2px;background:#334155"></div>')),
    textLayer('wtb_title', box(24, 22, 312, 40, 2), 'How it works', { family: 'serif', size: 24, color: t.ink, bold: true }),
    buttonLayer('wtb_1', box(24, 76, 96, 40, 3), 'Plan', t.ghost, { behavior: 'widget.reveal', revealLayerId: 'wtb_1_p', revealMode: 'tab' }, { radius: 10 }),
    buttonLayer('wtb_2', box(132, 76, 96, 40, 4), 'Write', t.ghost, { behavior: 'widget.reveal', revealLayerId: 'wtb_2_p', revealMode: 'tab' }, { radius: 10 }),
    buttonLayer('wtb_3', box(240, 76, 96, 40, 5), 'Share', t.ghost, { behavior: 'widget.reveal', revealLayerId: 'wtb_3_p', revealMode: 'tab' }, { radius: 10 }),
    panel('wtb_1_p', ['1. Plan', 'Sketch the week on one board. Drag cards between days, and everyone sees the change at once.'], true),
    panel('wtb_2_p', ['2. Write', 'Open any card into a doc. Headings, checklists, and embeds, without leaving the board.']),
    panel('wtb_3_p', ['3. Share', 'Publish a page with one link. Readers comment inline and you reply in place.'])
  ]);
}
