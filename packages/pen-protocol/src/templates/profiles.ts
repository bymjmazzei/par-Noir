import type { PenTemplate } from '../templates.js';
import {
  FRAMES,
  artHtml,
  box,
  buttonLayer,
  inputLayer,
  motion,
  pageArt,
  pageSeed,
  panelLayer,
  slotLayer,
  textLayer
} from '../curated/kit.js';
import { chipLayer, postTemplate } from './shared.js';

/** A drawn head-and-shoulders portrait for avatar slots. */
function portraitArt(bg: string, skin: string, hair: string, shirt: string, extra = ''): string {
  return artHtml(
    bg,
    `<div class="s" style="left:22%;top:72%;width:56%;height:60%;background:${shirt}"></div><div class="s" style="left:30%;top:22%;width:40%;height:44%;background:${skin}"></div><div class="r" style="left:27%;top:14%;width:46%;height:22%;border-radius:50% 50% 20% 20%;background:${hair}"></div>${extra}`
  );
}

function creatorIntro(): PenTemplate {
  const f = FRAMES.portrait;
  const ink = '#3b0764';
  const muted = '#7e22ce';
  const stat = (id: string, x: number, value: string, label: string, z: number) =>
    panelLayer(id, box(x, 262, 92, 60, z), '#ffffff', [value, label], { size: 13, color: ink, bold: true, align: 'center' }, { name: 'Stat' });
  return postTemplate({
    id: 'profile.creator_intro.v1',
    classId: 'social.profile',
    title: 'Creator intro',
    description: 'Introduce yourself: portrait, three stats, a short bio, Follow, and your links.',
    aspect: 'portrait',
    featured: true,
    focus:
      'Write the creator name, a role line with what they make, three stats with real numbers, a two-sentence bio in first person, and two link buttons for where people can buy or hire.',
    feedCaption: { title: 'Hi, I am Theo', body: '@theo.draws · picture books and editorial' },
    seed: pageSeed(
      f,
      [
        {
          slug: 'body',
          layers: [
            pageArt(
              'ci_art',
              artHtml(
                '#fdf2f8',
                '<div class="s" style="left:-60px;top:-40px;width:220px;height:220px;background:#fbcfe8"></div><div class="s" style="left:240px;top:60px;width:160px;height:160px;background:#ddd6fe"></div><svg width="360" height="640" style="position:absolute;inset:0"><path d="M20 620 q 40 -30 80 0 t 80 0 t 80 0 t 80 0" fill="none" stroke="#a855f7" stroke-width="2"/></svg>'
              ),
              f
            ),
            motion(
              slotLayer('ci_avatar', box(120, 56, 120, 120, 2), 'Avatar', portraitArt('#c4b5fd', '#fcd9b6', '#3b0764', '#a855f7'), { cornerRadius: 60 }),
              { in: 'zoom' }
            ),
            textLayer('ci_name', box(24, 186, 312, 40, 3), 'Theo Marsh', { family: 'serif', size: 30, color: ink, bold: true, align: 'center' }, { name: 'Name' }),
            textLayer('ci_role', box(24, 230, 312, 20, 4), 'Illustrator · picture books and editorial', { size: 13, color: muted, align: 'center' }),
            stat('ci_s1', 30, '48', 'books', 5),
            stat('ci_s2', 132, '1.2k', 'prints sold', 6),
            stat('ci_s3', 234, '9 yrs', 'drawing', 7),
            textLayer('ci_bio', box(30, 334, 296, 56, 8), 'I draw small animals with big feelings. Right now I am illustrating my fifth picture book.', { size: 13, color: ink, align: 'center' }),
            buttonLayer('ci_follow', box(30, 400, 296, 44, 9), 'Follow', { fill: '#7e22ce', color: '#ffffff' }, { behavior: 'widget.stamp', label: 'Following' }),
            buttonLayer('ci_shop', box(30, 456, 142, 40, 10), 'Print shop', { fill: '#ffffff', color: ink }, { behavior: 'cta.open', openUrl: 'https://parnoir.com/theo/shop' }, { stroke: '#e9d5ff' }),
            buttonLayer('ci_hire', box(184, 456, 142, 40, 11), 'Commissions', { fill: '#ffffff', color: ink }, { behavior: 'cta.open', openUrl: 'https://parnoir.com/theo/commissions' }, { stroke: '#e9d5ff' })
          ]
        }
      ],
      { backgroundColor: '#fdf2f8', textColor: ink }
    )
  });
}

function teamSpotlight(): PenTemplate {
  const f = FRAMES.square;
  const ink = '#f1f5f9';
  return postTemplate({
    id: 'profile.team_spotlight.v1',
    classId: 'social.profile',
    title: 'Team spotlight',
    description: 'Meet a teammate: portrait, role, a quote in their words, and a fun fact behind a tap.',
    aspect: 'square',
    featured: true,
    focus:
      'Write the teammate name, role with start year and city, one sentence quote in their own voice about how they work, and a playful fun fact. Set Say hi to their work email.',
    feedCaption: { title: 'Meet Priya, our support lead', body: 'Fernway · we are hiring, too' },
    seed: pageSeed(
      f,
      [
        {
          slug: 'body',
          layers: [
            pageArt(
              'ts_art',
              artHtml('#1e293b', '<div class="r" style="left:-40px;top:250px;width:480px;height:60px;transform:rotate(-12deg);background:rgba(56,189,248,.14)"></div><div class="r" style="left:-40px;top:300px;width:480px;height:20px;transform:rotate(-12deg);background:rgba(250,204,21,.2)"></div>'),
              f
            ),
            chipLayer('ts_kicker', box(24, 20, 130, 26, 2), 'MEET THE TEAM', '#38bdf8', '#0f172a'),
            motion(slotLayer('ts_avatar', box(24, 58, 96, 96, 3), 'Avatar', portraitArt('#38bdf8', '#c08457', '#0f172a', '#facc15'), { cornerRadius: 48 }), { in: 'pop' }),
            textLayer('ts_name', box(136, 62, 200, 32, 4), 'Priya Natarajan', { family: 'serif', size: 22, color: ink, bold: true }, { name: 'Name' }),
            textLayer('ts_role', box(136, 98, 200, 40, 5), 'Support lead · joined 2023 · Bengaluru', { size: 12, color: 'rgba(241,245,249,0.7)' }),
            panelLayer('ts_quote', box(24, 168, 296, 88, 6), 'rgba(241,245,249,0.08)', '“The best support answer is the one that makes the next question unnecessary.”', { family: 'serif', size: 15, color: ink, italic: true }, { name: 'Quote' }),
            panelLayer('ts_fact', box(24, 168, 296, 88, 7), '#facc15', ['FUN FACT', 'Priya has run a marathon on every continent except Antarctica. It is booked for 2027.'], { size: 13, color: '#0f172a' }, { name: 'Fun fact', visible: false }),
            buttonLayer('ts_fact_btn', box(24, 270, 142, 40, 8), 'Fun fact', { fill: 'rgba(241,245,249,0.12)', color: ink }, { behavior: 'widget.reveal', revealLayerId: 'ts_fact', revealMode: 'toggle' }),
            buttonLayer('ts_hi', box(178, 270, 142, 40, 9), 'Say hi', { fill: '#38bdf8', color: '#0f172a' }, { behavior: 'cta.open', openUrl: 'mailto:priya@fernway.com' })
          ]
        }
      ],
      { backgroundColor: '#1e293b' }
    )
  });
}

function hiring(): PenTemplate {
  const f = FRAMES.portrait;
  const ink = '#eef2ff';
  const muted = 'rgba(238,242,255,0.7)';
  const perks = ['4-day weeks every August', '€2k yearly learning budget', 'Ship to 30k shops from week two'];
  return postTemplate({
    id: 'profile.hiring.v1',
    classId: 'social.profile',
    title: 'We are hiring',
    description: 'A company card with the open role, salary, perks, role details, and Apply.',
    aspect: 'portrait',
    featured: true,
    focus:
      'Write the company name and what it does, the role title, location, salary range, and contract type, three perks, and three lines about the role. Link Apply to the job posting.',
    feedCaption: { title: 'Fernway is hiring a designer', body: 'Applications close 30 November.' },
    seed: pageSeed(
      f,
      [
        {
          slug: 'body',
          layers: [
            pageArt(
              'hr_art',
              artHtml(
                '#1e1b4b',
                '<div class="r" style="inset:0;background:linear-gradient(90deg,rgba(255,255,255,.04) 1px,transparent 1px) 0 0/40px 40px,linear-gradient(180deg,rgba(255,255,255,.04) 1px,transparent 1px) 0 0/40px 40px"></div><div class="p" style="left:290px;top:150px">+</div><div class="p" style="left:250px;top:560px">+</div>',
                '.p{position:absolute;font:300 60px/1 Montserrat,Helvetica,sans-serif;color:rgba(165,180,252,.4)}'
              ),
              f
            ),
            slotLayer(
              'hr_logo',
              box(24, 48, 72, 72, 2),
              'Avatar',
              artHtml('#4ade80', '<div class="r" style="left:34px;top:12px;width:4px;height:50px;background:#14532d"></div>' + [0, 1, 2, 3].map((i) => `<div class="r" style="left:${i % 2 ? 38 : 16}px;top:${16 + i * 10}px;width:18px;height:8px;border-radius:50%;background:#14532d"></div>`).join('')),
              { cornerRadius: 16 }
            ),
            textLayer('hr_name', box(108, 56, 228, 28, 3), 'Fernway', { size: 20, color: ink, bold: true }, { name: 'Name' }),
            textLayer('hr_what', box(108, 88, 228, 20, 4), 'Checkout for independent shops', { size: 12, color: muted }),
            chipLayer('hr_chip', box(24, 136, 124, 26, 5), 'NOW HIRING', '#a5b4fc', '#1e1b4b'),
            motion(textLayer('hr_role', box(24, 172, 312, 72, 6), 'Senior Product Designer', { family: 'serif', size: 30, color: ink, bold: true }), { in: 'rise' }),
            textLayer('hr_meta', box(24, 250, 312, 20, 7), 'Remote, Europe · €75k to €90k · full time', { size: 13, color: '#a5b4fc', bold: true }),
            ...perks.map((perk, i) =>
              panelLayer(`hr_perk${i + 1}`, box(24, 282 + i * 44, 296, 38, 8 + i), 'rgba(238,242,255,0.08)', perk, { size: 13, color: ink }, { name: 'Perk' })
            ),
            panelLayer(
              'hr_details',
              box(24, 282, 296, 126, 12),
              '#312e81',
              ['The role', 'Own checkout and onboarding end to end.', 'Work with three engineers and a PM.', 'Portfolio required, no take-home task.'],
              { size: 13, color: ink },
              { name: 'The role', visible: false }
            ),
            buttonLayer('hr_more', box(24, 420, 296, 40, 13), 'About the role', { fill: 'rgba(238,242,255,0.12)', color: ink }, { behavior: 'widget.reveal', revealLayerId: 'hr_details', revealMode: 'toggle' }),
            buttonLayer('hr_apply', box(24, 470, 296, 44, 14), 'Apply', { fill: '#a5b4fc', color: '#1e1b4b' }, { behavior: 'cta.open', openUrl: 'https://fernway.com/jobs/senior-product-designer' })
          ]
        }
      ],
      { backgroundColor: '#1e1b4b' }
    )
  });
}

function services(): PenTemplate {
  const f = FRAMES.portrait;
  const ink = '#fafaf9';
  const muted = 'rgba(250,250,249,0.68)';
  const rows = [
    ['Portrait session · €180', '1 hour, 20 edited photos'],
    ['Elopement · €950', '4 hours, two locations, 150 photos'],
    ['Full wedding · €2,400', '10 hours, second shooter, printed album']
  ];
  return postTemplate({
    id: 'profile.services.v1',
    classId: 'social.profile',
    title: 'Services menu',
    description: 'A freelancer card with three priced services, booking, and a quick inquiry form.',
    aspect: 'portrait',
    focus:
      'Write the freelancer name, craft and city, and three services each with a price and one line of what is included. Put the reply-time promise in the feed caption. Link booking to their calendar page.',
    feedCaption: { title: 'Now booking 2027 weddings', body: 'Lena Ortiz replies within a day.' },
    seed: pageSeed(
      f,
      [
        {
          slug: 'body',
          layers: [
            pageArt(
              'sv_art',
              artHtml('#292524', '<div class="r" style="right:0;top:0;bottom:0;width:18px;background:repeating-linear-gradient(180deg,#1c1917 0 10px,#fbbf24 10px 16px,#1c1917 16px 26px)"></div>'),
              f
            ),
            slotLayer(
              'sv_avatar',
              box(24, 40, 80, 80, 2),
              'Avatar',
              portraitArt('#fbbf24', '#e0ac69', '#451a03', '#1c1917', '<div class="r" style="left:36%;top:52%;width:28%;height:16%;border-radius:4px;background:#1c1917"></div>'),
              { cornerRadius: 40 }
            ),
            textLayer('sv_name', box(120, 48, 216, 32, 3), 'Lena Ortiz', { family: 'serif', size: 26, color: ink, bold: true }, { name: 'Name' }),
            textLayer('sv_role', box(120, 84, 216, 36, 4), 'Wedding and portrait photographer · Porto', { size: 12, color: muted }),
            textLayer('sv_kicker', box(24, 140, 200, 20, 5), 'SERVICES', { size: 11, color: '#fbbf24', bold: true }),
            ...rows.map(([title, detail], i) => {
              const row = panelLayer(`sv_row${i + 1}`, box(24, 168 + i * 76, 296, 64, 6 + i), 'rgba(250,250,249,0.06)', [title!, detail!], { size: 13, color: ink }, { name: 'Service', strokeColor: 'rgba(251,191,36,0.3)', strokeWidth: 1 });
              return i === 0 ? motion(row, { in: 'rise' }) : row;
            }),
            buttonLayer('sv_book', box(24, 400, 296, 44, 9), 'Check dates and book', { fill: '#fbbf24', color: '#1c1917' }, { behavior: 'cta.open', openUrl: 'https://parnoir.com/lena/book' }),
            inputLayer('sv_field', box(24, 460, 200, 44, 10), 'Your date and email…', { fill: '#fafaf9', color: '#1c1917' }, { name: 'Inquiry' }),
            buttonLayer('sv_send', box(232, 460, 88, 44, 11), 'Ask', { fill: 'rgba(250,250,249,0.14)', color: ink }, { behavior: 'widget.submit', label: 'Quick inquiry' })
          ]
        }
      ],
      { backgroundColor: '#292524' }
    )
  });
}

function artist(): PenTemplate {
  const f = FRAMES.landscape;
  const ink = '#faf5ff';
  const muted = 'rgba(250,245,255,0.7)';
  return postTemplate({
    id: 'profile.artist.v1',
    classId: 'social.profile',
    title: 'Artist page',
    description: 'A musician card with portrait, the new single, Listen, Follow, and tour dates.',
    aspect: 'landscape',
    focus:
      'Write the artist name, genre and home cities, the new release title with a one-line hook, and up to four tour dates with city. Link Listen to the release page.',
    feedCaption: { title: 'Slow Water is out now', body: '@juneokafor · 2.1M monthly listeners' },
    seed: pageSeed(
      f,
      [
        {
          slug: 'body',
          layers: [
            pageArt(
              'ar_art',
              artHtml(
                'linear-gradient(120deg,#2e1065 0%,#581c87 70%,#86198f 100%)',
                '<svg width="640" height="360" style="position:absolute;inset:0"><path d="M440 200 q 20 -60 40 0 t 40 0 t 40 0 t 40 0 t 40 0" fill="none" stroke="rgba(244,114,182,.35)" stroke-width="3"/><path d="M440 230 q 20 -30 40 0 t 40 0 t 40 0 t 40 0 t 40 0" fill="none" stroke="rgba(250,245,255,.2)" stroke-width="2"/></svg>'
              ),
              f
            ),
            motion(slotLayer('ar_avatar', box(32, 32, 88, 88, 2), 'Avatar', portraitArt('#f472b6', '#8d5524', '#1e1b4b', '#faf5ff'), { cornerRadius: 44 }), { in: 'zoom' }),
            textLayer('ar_name', box(136, 40, 280, 36, 3), 'June Okafor', { family: 'serif', size: 28, color: ink, bold: true }, { name: 'Name' }),
            textLayer('ar_role', box(136, 80, 280, 20, 4), 'Singer-songwriter · Lagos and London', { size: 12, color: muted }),
            slotLayer(
              'ar_track',
              box(32, 140, 160, 160, 5),
              'Track',
              artHtml(
                'linear-gradient(180deg,#fb923c 0%,#db2777 100%)',
                '<div class="s" style="left:50px;top:40px;width:60px;height:60px;background:#fef3c7"></div><div class="r" style="left:0;right:0;top:110px;height:4px;background:#2e1065"></div><div class="r" style="left:0;right:0;top:124px;height:4px;background:#2e1065"></div><div class="r" style="left:0;right:0;top:138px;height:4px;background:#2e1065"></div>'
              ),
              { cornerRadius: 10 }
            ),
            textLayer('ar_kicker', box(208, 140, 200, 20, 6), 'NEW SINGLE', { size: 11, color: '#f9a8d4', bold: true }),
            motion(textLayer('ar_single', box(208, 162, 220, 36, 7), 'Slow Water', { family: 'serif', size: 24, color: ink, bold: true }), { in: 'slideLeft' }),
            textLayer('ar_hook', box(208, 200, 220, 36, 8), 'Out now everywhere you listen.', { size: 12, color: muted }),
            buttonLayer('ar_listen', box(208, 244, 120, 40, 9), 'Listen', { fill: '#f472b6', color: '#2e1065' }, { behavior: 'cta.open', openUrl: 'https://parnoir.com/juneokafor/slow-water' }),
            buttonLayer('ar_follow', box(340, 244, 100, 40, 10), 'Follow', { fill: 'rgba(250,245,255,0.14)', color: ink }, { behavior: 'widget.stamp', label: 'Following' }),
            panelLayer(
              'ar_tour',
              box(460, 32, 148, 200, 11),
              'rgba(46,16,101,0.9)',
              ['ON TOUR', '12 Mar · Lagos', '19 Mar · Accra', '2 Apr · London', '9 Apr · Paris'],
              { size: 13, color: ink },
              { name: 'Tour dates', visible: false }
            ),
            buttonLayer('ar_tour_btn', box(460, 244, 148, 40, 12), 'Tour dates', { fill: 'rgba(250,245,255,0.14)', color: ink }, { behavior: 'widget.reveal', revealLayerId: 'ar_tour', revealMode: 'toggle' })
          ]
        }
      ],
      { backgroundColor: '#2e1065' }
    )
  });
}

export function profileTemplates(): PenTemplate[] {
  return [creatorIntro(), teamSpotlight(), hiring(), services(), artist()];
}
