import type { PenTemplate, PenTemplateSection } from '../templates.js';
import type { PenPageLayer } from '../types.js';
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
  textLayer,
  type Look
} from '../curated/kit.js';
import { chipLayer, postTemplate } from './shared.js';

const f = FRAMES.portrait;

/** One section per page; only the cover is required. */
function pagesOf(pages: Array<[slug: string, title: string]>): PenTemplateSection[] {
  return pages.map(([slug, title]) => ({ slug, title, required: slug === 'cover' }));
}

function nextButton(id: string, look: Look, face = 'Next'): PenPageLayer {
  return buttonLayer(id, box(216, 476, 104, 40, 20), face, look, { behavior: 'page.go', goTo: 'next' });
}

function howTo(): PenTemplate {
  const ink = '#f0fdf4';
  const muted = 'rgba(240,253,244,0.72)';
  const go: Look = { fill: '#fb923c', color: '#14532d' };
  const toggle: Look = { fill: 'rgba(240,253,244,0.1)', color: ink };
  const step = (n: number, slug: string, title: string, body: string, tip: string, accent: string): { slug: string; layers: PenPageLayer[] } => ({
    slug,
    layers: [
      pageArt(
        `ht${n}_art`,
        artHtml(
          '#14532d',
          `<div class="n">${n}</div><div class="s" style="left:-60px;bottom:-60px;width:200px;height:200px;background:${accent};opacity:.22"></div>`,
          '.n{position:absolute;right:10px;top:-30px;font:700 260px/1 Georgia,serif;color:rgba(240,253,244,.08)}'
        ),
        f
      ),
      chipLayer(`ht${n}_kicker`, box(24, 56, 80, 26, 2), `STEP ${n}`, accent, '#14532d'),
      motion(textLayer(`ht${n}_title`, box(24, 100, 312, 80, 3), title, { family: 'serif', size: 30, color: ink, bold: true }), { in: 'rise' }),
      textLayer(`ht${n}_body`, box(24, 196, 312, 120, 4), body, { size: 15, color: muted }),
      panelLayer(`ht${n}_tip`, box(24, 336, 296, 84, 5), 'rgba(240,253,244,0.08)', tip, { size: 13, color: ink }, { name: 'Tip', strokeColor: 'rgba(240,253,244,0.2)', strokeWidth: 1 }),
      nextButton(`ht${n}_next`, go)
    ]
  });
  return postTemplate({
    id: 'collection.how_to.v1',
    classId: 'social.collection',
    title: 'How-to steps',
    description: 'A cover, three illustrated steps, and a checklist recap readers can tick off.',
    aspect: 'portrait',
    featured: true,
    focus:
      'Write a cover promise with the time it takes, then three steps with a short imperative title, two sentences of how and why, and one tip each. End with three checklist items that match the steps.',
    feedCaption: { title: 'Repot without the panic', body: '@greenroom.ana · three steps, ten minutes' },
    sections: pagesOf([
      ['cover', 'Cover'],
      ['step-1', 'Step 1'],
      ['step-2', 'Step 2'],
      ['step-3', 'Step 3'],
      ['recap', 'Recap']
    ]),
    seed: pageSeed(
      f,
      [
        {
          slug: 'cover',
          layers: [
            pageArt(
              'htc_art',
              artHtml(
                'linear-gradient(170deg,#14532d 0%,#166534 60%,#052e16 100%)',
                '<div class="r pot"></div><div class="r rim"></div><div class="leaf" style="left:150px;top:280px;transform:rotate(-30deg)"></div><div class="leaf" style="left:190px;top:270px;transform:rotate(25deg)"></div><div class="leaf" style="left:170px;top:250px"></div>',
                '.pot{left:120px;top:360px;width:120px;height:110px;border-radius:0 0 26px 26px;background:#ea580c}.rim{left:110px;top:346px;width:140px;height:22px;border-radius:6px;background:#fb923c}.leaf{position:absolute;width:34px;height:90px;border-radius:50% 50% 50% 50%/60% 60% 40% 40%;background:#4ade80;transform-origin:bottom center}'
              ),
              f
            ),
            chipLayer('htc_kicker', box(24, 56, 148, 26, 2), 'HOW TO · 3 STEPS', '#fb923c', '#14532d'),
            motion(textLayer('htc_title', box(24, 100, 312, 120, 3), 'Repot a houseplant without killing it', { family: 'serif', size: 34, color: ink, bold: true }), { in: 'drop' }),
            textLayer('htc_sub', box(24, 232, 312, 44, 4), 'Ten minutes, one bigger pot, and a little nerve.', { size: 15, color: muted }),
            buttonLayer('htc_start', box(24, 476, 160, 40, 5), 'Start', go, { behavior: 'page.go', goTo: 'next' })
          ]
        },
        step(1, 'step-1', 'Water the day before', 'Moist roots hold together and slide out in one piece. Dry soil crumbles and tears the fine roots.', 'Pick a pot only 2 to 5 cm wider than the old one.', '#fb923c'),
        {
          slug: 'step-2',
          layers: [
            pageArt('ht2_art', artHtml('#052e16', '<div class="r" style="left:0;right:0;top:330px;height:2px;background:#4ade80"></div>'), f),
            slotLayer(
              'ht2_photo',
              box(0, 0, 360, 330, 2),
              'Photo',
              artHtml(
                'linear-gradient(180deg,#fef3c7 0%,#fde68a 100%)',
                '<div class="r ball"></div><div class="s" style="left:70px;top:150px;width:70px;height:70px;background:#fcd9b6"></div><div class="s" style="left:220px;top:150px;width:70px;height:70px;background:#fcd9b6"></div><div class="leaf" style="left:160px;top:60px"></div><div class="leaf" style="left:190px;top:70px;transform:rotate(30deg)"></div>',
                '.ball{left:120px;top:160px;width:120px;height:130px;border-radius:40% 40% 46% 46%;background:repeating-linear-gradient(120deg,#78350f 0 6px,#a16207 6px 9px)}.leaf{position:absolute;width:30px;height:90px;border-radius:50%;background:#16a34a;transform-origin:bottom center}'
              )
            ),
            chipLayer('ht2_kicker', box(24, 349, 80, 26, 3), 'STEP 2', '#4ade80', '#052e16'),
            motion(textLayer('ht2_title', box(24, 384, 296, 34, 4), 'Tip it out, loosen the roots', { family: 'serif', size: 24, color: ink, bold: true }), { in: 'rise' }),
            textLayer('ht2_body', box(24, 422, 296, 44, 5), 'Turn the pot on its side and squeeze. Tease circling roots outward with your fingers.', { size: 14, color: muted }),
            nextButton('ht2_next', go)
          ]
        },
        step(3, 'step-3', 'Set it at the same depth', 'Add fresh mix under the root ball so the old soil line sits 2 cm below the rim. Fill the sides and press gently.', 'Water until it drains, then leave it out of direct sun for a week.', '#4ade80'),
        {
          slug: 'recap',
          layers: [
            pageArt(
              'htr_art',
              artHtml('linear-gradient(180deg,#052e16 0%,#14532d 100%)', '<div class="s" style="right:-50px;top:-50px;width:180px;height:180px;background:rgba(251,146,60,.25)"></div>'),
              f
            ),
            chipLayer('htr_kicker', box(24, 56, 100, 26, 2), 'CHECKLIST', '#fb923c', '#14532d'),
            motion(textLayer('htr_title', box(24, 100, 312, 80, 3), 'Before you put the pot down', { family: 'serif', size: 30, color: ink, bold: true }), { in: 'rise' }),
            buttonLayer('htr_t1', box(24, 204, 296, 50, 4), 'Watered the day before', toggle, { behavior: 'widget.toggle', bindRowId: 'htr_t1' }, { radius: 12, stroke: 'rgba(240,253,244,0.3)' }),
            buttonLayer('htr_t2', box(24, 264, 296, 50, 5), 'New pot 2 to 5 cm wider', toggle, { behavior: 'widget.toggle', bindRowId: 'htr_t2' }, { radius: 12, stroke: 'rgba(240,253,244,0.3)' }),
            buttonLayer('htr_t3', box(24, 324, 296, 50, 6), 'Soil line at the same depth', toggle, { behavior: 'widget.toggle', bindRowId: 'htr_t3' }, { radius: 12, stroke: 'rgba(240,253,244,0.3)' }),
            buttonLayer('htr_done', box(24, 410, 296, 48, 7), 'I repotted one', go, { behavior: 'widget.stamp', label: 'Repotted' }),
            buttonLayer('htr_first', box(24, 476, 160, 40, 8), 'Back to start', { fill: 'rgba(240,253,244,0.1)', color: ink }, { behavior: 'page.go', goTo: 'first' })
          ]
        }
      ],
      { backgroundColor: '#14532d' }
    )
  });
}

function topFive(): PenTemplate {
  const ink = '#1c1917';
  const muted = '#57534e';
  const books = [
    { rank: 5, title: 'Shape Up', author: 'Ryan Singer', why: 'Six-week cycles made our roadmap honest.', cover: '#0ea5e9' },
    { rank: 4, title: 'The Mom Test', author: 'Rob Fitzpatrick', why: 'Stopped me asking customers to tell me what I wanted to hear.', cover: '#f43f5e' },
    { rank: 3, title: 'Working in Public', author: 'Nadia Eghbal', why: 'How open source really gets maintained, and by whom.', cover: '#a3e635' },
    { rank: 2, title: 'Deep Work', author: 'Cal Newport', why: 'Mornings are for the hard thing now. Email waits.', cover: '#1e293b' },
    { rank: 1, title: 'The Design of Everyday Things', author: 'Don Norman', why: 'Every badly labelled door I meet is this book talking.', cover: '#f59e0b' }
  ];
  const rankPage = (b: (typeof books)[number]): { slug: string; layers: PenPageLayer[] } => ({
    slug: `rank-${b.rank}`,
    layers: [
      pageArt(
        `tf${b.rank}_art`,
        artHtml('#f5f0e6', `<div class="n">${b.rank}</div>`, `.n{position:absolute;left:-10px;bottom:-60px;font:700 300px/1 Georgia,serif;color:${b.cover};opacity:.14}`),
        f
      ),
      chipLayer(`tf${b.rank}_rank`, box(24, 48, 64, 26, 2), `#${b.rank}`, ink, '#f5f0e6'),
      motion(
        slotLayer(
          `tf${b.rank}_photo`,
          box(100, 88, 160, 222, 3),
          'Photo',
          artHtml(
            b.cover,
            `<div class="r" style="left:0;top:0;bottom:0;width:14px;background:rgba(0,0,0,.2)"></div><div class="t">${b.title}</div><div class="a">${b.author}</div>`,
            '.t{position:absolute;left:26px;right:14px;top:30px;font:700 19px/1.15 Georgia,serif;color:#fff}.a{position:absolute;left:26px;bottom:20px;font:600 10px Montserrat,Helvetica,sans-serif;color:rgba(255,255,255,.85);letter-spacing:.08em;text-transform:uppercase}'
          )
        ),
        { in: 'zoom' }
      ),
      textLayer(`tf${b.rank}_title`, box(24, 324, 296, 60, 4), b.title, { family: 'serif', size: 24, color: ink, bold: true }, { name: 'Book' }),
      textLayer(`tf${b.rank}_author`, box(24, 388, 296, 20, 5), b.author, { size: 13, color: muted }),
      textLayer(`tf${b.rank}_why`, box(24, 414, 296, 54, 6), b.why, { size: 14, color: ink, italic: true }),
      nextButton(`tf${b.rank}_next`, { fill: ink, color: '#f5f0e6' })
    ]
  });
  return postTemplate({
    id: 'collection.top_five.v1',
    classId: 'social.collection',
    title: 'Top five countdown',
    description: 'A ranked countdown from five to one, ending with a reader pick.',
    aspect: 'portrait',
    featured: true,
    focus:
      'Write a cover headline for the ranking, then five entries from #5 to #1 with the name, the creator, and one sentence on why it earned the spot. Close by asking readers for theirs.',
    feedCaption: { title: 'Five books, ranked', body: 'Swipe from #5 to the one that changed how I work.' },
    sections: pagesOf([
      ['cover', 'Cover'],
      ...books.map((b): [string, string] => [`rank-${b.rank}`, `#${b.rank}`]),
      ['your-pick', 'Your pick']
    ]),
    seed: pageSeed(
      f,
      [
        {
          slug: 'cover',
          layers: [
            pageArt(
              'tfc_art',
              artHtml(
                '#f5f0e6',
                books.map((b, i) => `<div class="r" style="left:${40 + i * 58}px;top:${300 - i * 12}px;width:46px;height:${160 + i * 12}px;border-radius:3px;background:${b.cover}"></div>`).join('') + '<div class="r" style="left:24px;right:24px;top:460px;height:10px;background:#a8a29e"></div>'
              ),
              f
            ),
            chipLayer('tfc_kicker', box(24, 48, 140, 26, 2), 'MY TOP FIVE', ink, '#f5f0e6'),
            motion(textLayer('tfc_title', box(24, 92, 312, 120, 3), 'Five books that changed how I work', { family: 'serif', size: 34, color: ink, bold: true }), { in: 'rise' }),
            textLayer('tfc_sub', box(24, 216, 312, 40, 4), 'Counting down from five. Number one surprised me too.', { size: 14, color: muted }),
            nextButton('tfc_next', { fill: ink, color: '#f5f0e6' }, 'See #5')
          ]
        },
        ...books.map(rankPage),
        {
          slug: 'your-pick',
          layers: [
            pageArt('tfp_art', artHtml(ink, '<div class="s" style="left:220px;top:-40px;width:200px;height:200px;background:rgba(245,158,11,.25)"></div>'), f),
            chipLayer('tfp_kicker', box(24, 56, 100, 26, 2), 'YOUR TURN', '#f59e0b', ink),
            motion(textLayer('tfp_title', box(24, 100, 312, 120, 3), 'Which book changed how you work?', { family: 'serif', size: 32, color: '#f5f0e6', bold: true }), { in: 'rise' }),
            textLayer('tfp_sub', box(24, 228, 312, 44, 4), 'I read every reply and the best ones make next month’s list.', { size: 14, color: 'rgba(245,240,230,0.72)' }),
            inputLayer('tfp_field', box(24, 296, 296, 48, 5), 'Title and author…', { fill: '#f5f0e6', color: ink }, { name: 'Book' }),
            buttonLayer('tfp_send', box(24, 356, 296, 48, 6), 'Send my pick', { fill: '#f59e0b', color: ink }, { behavior: 'widget.submit', label: 'Reader pick' })
          ]
        }
      ],
      { backgroundColor: '#f5f0e6', textColor: ink }
    )
  });
}

function tripRecap(): PenTemplate {
  const ink = '#fff7ed';
  const muted = 'rgba(255,247,237,0.72)';
  const days = [
    { n: 1, place: 'Fushimi Inari at 6am', note: 'Beat the crowds by two hours. The upper gates were empty and the light was gold.', spent: 'Spent ¥1,800', sky: '#fb7185', ground: '#dc2626' },
    { n: 2, place: 'Arashiyama by bike', note: 'Bamboo grove first, then the river path to Okochi Sanso for matcha.', spent: 'Spent ¥4,200', sky: '#86efac', ground: '#15803d' },
    { n: 3, place: 'Nishiki Market lunch crawl', note: 'Tamagoyaki, soy milk donuts, and pickles I still think about.', spent: 'Spent ¥3,600', sky: '#fde68a', ground: '#b45309' }
  ];
  const dayPage = (d: (typeof days)[number]): { slug: string; layers: PenPageLayer[] } => ({
    slug: `day-${d.n}`,
    layers: [
      pageArt(`tr${d.n}_art`, artHtml('#1c1917', `<div class="r" style="left:0;top:320px;width:${d.n * 120}px;height:4px;background:${d.sky}"></div>`), f),
      slotLayer(
        `tr${d.n}_photo`,
        box(0, 0, 360, 320, 2),
        'Photo',
        artHtml(
          `linear-gradient(180deg,${d.sky} 0%,#fff7ed 100%)`,
          `<div class="s" style="left:240px;top:60px;width:60px;height:60px;background:#fff7ed"></div><div class="r" style="left:0;right:0;top:260px;height:120px;background:${d.ground}"></div><div class="r" style="left:${60 + d.n * 30}px;top:150px;width:16px;height:120px;background:${d.ground}"></div><div class="r" style="left:${130 + d.n * 30}px;top:150px;width:16px;height:120px;background:${d.ground}"></div><div class="r" style="left:${44 + d.n * 30}px;top:140px;width:118px;height:16px;background:${d.ground}"></div>`
        )
      ),
      motion(chipLayer(`tr${d.n}_day`, box(24, 341, 70, 26, 3), `DAY ${d.n}`, d.sky, '#1c1917'), { in: 'pop' }),
      textLayer(`tr${d.n}_place`, box(24, 376, 296, 32, 4), d.place, { family: 'serif', size: 22, color: ink, bold: true }),
      textLayer(`tr${d.n}_note`, box(24, 412, 296, 54, 5), d.note, { size: 13, color: muted }),
      textLayer(`tr${d.n}_spent`, box(24, 486, 180, 20, 6), d.spent, { size: 12, color: d.sky, bold: true }),
      nextButton(`tr${d.n}_next`, { fill: ink, color: '#1c1917' })
    ]
  });
  return postTemplate({
    id: 'collection.trip_recap.v1',
    classId: 'social.collection',
    title: 'Trip recap',
    description: 'A route-map cover, one photo page per day, and a highlights page.',
    aspect: 'portrait',
    featured: true,
    focus:
      'Write the trip as a cover headline with the number of days, then one page per day with the main place, two sentences of what made it good, and what you spent. Finish with best food, best stay, and one tip.',
    feedCaption: { title: 'Kyoto in three days', body: 'Routes, spends, and the snacks worth queuing for.' },
    sections: pagesOf([['cover', 'Cover'], ...days.map((d): [string, string] => [`day-${d.n}`, `Day ${d.n}`]), ['highlights', 'Highlights']]),
    seed: pageSeed(
      f,
      [
        {
          slug: 'cover',
          layers: [
            pageArt(
              'trc_art',
              artHtml(
                '#fef3c7',
                '<svg width="360" height="640" style="position:absolute;inset:0"><path d="M48 252 C 110 210, 30 150, 130 130 S 260 170, 250 100 S 270 40, 312 52" fill="none" stroke="#dc2626" stroke-width="4" stroke-dasharray="10 8"/><circle cx="48" cy="252" r="10" fill="#dc2626"/><circle cx="130" cy="130" r="10" fill="#15803d"/><circle cx="312" cy="52" r="10" fill="#b45309"/></svg><div class="r" style="left:0;right:0;top:0;bottom:0;background:repeating-linear-gradient(0deg,transparent 0 47px,rgba(180,83,9,.12) 47px 48px),repeating-linear-gradient(90deg,transparent 0 47px,rgba(180,83,9,.12) 47px 48px)"></div>'
              ),
              f
            ),
            chipLayer('trc_kicker', box(24, 280, 150, 26, 2), 'JAPAN · OCTOBER', '#1c1917', '#fef3c7'),
            motion(textLayer('trc_title', box(24, 316, 220, 96, 3), 'Three days in Kyoto', { family: 'serif', size: 36, color: '#1c1917', bold: true }), { in: 'rise' }),
            textLayer('trc_sub', box(24, 418, 220, 46, 4), 'Early starts, one rented bike, too many snacks.', { size: 14, color: '#78350f' }),
            nextButton('trc_next', { fill: '#1c1917', color: '#fef3c7' }, 'Day 1')
          ]
        },
        ...days.map(dayPage),
        {
          slug: 'highlights',
          layers: [
            pageArt('trh_art', artHtml('linear-gradient(180deg,#1c1917 0%,#431407 100%)', '<div class="s" style="left:-80px;top:420px;width:240px;height:240px;background:rgba(251,113,133,.2)"></div>'), f),
            chipLayer('trh_kicker', box(24, 48, 110, 26, 2), 'HIGHLIGHTS', '#fb7185', '#1c1917'),
            motion(textLayer('trh_title', box(24, 88, 312, 44, 3), 'If you only do three things', { family: 'serif', size: 26, color: ink, bold: true }), { in: 'rise' }),
            panelLayer('trh_food', box(24, 146, 296, 76, 4), 'rgba(255,247,237,0.08)', ['BEST FOOD', 'Soy milk donuts at Nishiki, still warm.'], { size: 14, color: ink }, { name: 'Best food' }),
            panelLayer('trh_stay', box(24, 230, 296, 76, 5), 'rgba(255,247,237,0.08)', ['BEST STAY', 'A six-room machiya near Gion. Book early.'], { size: 14, color: ink }, { name: 'Best stay' }),
            panelLayer('trh_tip', box(24, 314, 296, 76, 6), 'rgba(255,247,237,0.08)', ['TIP', 'Buy an ICOCA card at the airport. Buses take it.'], { size: 14, color: ink }, { name: 'Tip' }),
            buttonLayer('trh_map', box(24, 404, 296, 44, 7), 'Open my Kyoto map', { fill: '#fb7185', color: '#1c1917' }, { behavior: 'cta.open', openUrl: 'https://maps.google.com/?q=Kyoto' }),
            buttonLayer('trh_want', box(24, 458, 296, 44, 8), 'I want to go', { fill: 'rgba(255,247,237,0.12)', color: ink }, { behavior: 'widget.stamp', label: 'Wants to go' })
          ]
        }
      ],
      { backgroundColor: '#1c1917' }
    )
  });
}

function caseStudy(): PenTemplate {
  const ink = '#0f172a';
  const muted = '#475569';
  const accent = '#0369a1';
  const kicker = (id: string, text: string): PenPageLayer => chipLayer(id, box(24, 48, 130, 26, 2), text, accent, '#ffffff');
  return postTemplate({
    id: 'collection.case_study.v1',
    classId: 'social.collection',
    title: 'Case study',
    description: 'Problem, solution, and results across four pages, with a link to the write-up.',
    aspect: 'portrait',
    focus:
      'Write the headline result with a real number, your role and team, the problem in three short facts, the solution in one or two sentences, and two result metrics with a client quote.',
    feedCaption: { title: 'Checkout drop-off, down 38%', body: 'A six-week redesign for Fernway, page by page.' },
    sections: pagesOf([
      ['cover', 'Cover'],
      ['problem', 'Problem'],
      ['solution', 'Solution'],
      ['results', 'Results']
    ]),
    seed: pageSeed(
      f,
      [
        {
          slug: 'cover',
          layers: [
            pageArt(
              'cs_art',
              artHtml(
                '#f8fafc',
                '<div class="r" style="left:24px;top:310px;width:292px;height:150px;background:linear-gradient(180deg,rgba(3,105,161,.12),transparent)"></div><svg width="360" height="640" style="position:absolute;inset:0"><polyline points="24,330 82,350 140,378 198,408 256,436 316,458" fill="none" stroke="#0369a1" stroke-width="4"/><circle cx="316" cy="458" r="7" fill="#0369a1"/></svg>'
              ),
              f
            ),
            kicker('cs_kicker', 'CLIENT WORK'),
            motion(textLayer('cs_title', box(24, 92, 312, 150, 3), 'How Fernway cut checkout drop-off by 38%', { family: 'serif', size: 32, color: ink, bold: true }), { in: 'rise' }),
            textLayer('cs_sub', box(24, 252, 312, 44, 4), 'A six-week redesign of a four-step checkout.', { size: 14, color: muted }),
            panelLayer('cs_role', box(24, 476, 180, 40, 5), '#e2e8f0', 'Lead designer · team of 4', { size: 12, color: ink, align: 'center' }, { name: 'Role' }),
            nextButton('cs_next', { fill: ink, color: '#ffffff' })
          ]
        },
        {
          slug: 'problem',
          layers: [
            pageArt('csp_art', artHtml('#fff7ed', '<div class="r" style="left:0;top:0;width:8px;bottom:0;background:#ea580c"></div>'), f),
            chipLayer('csp_kicker', box(24, 48, 130, 26, 2), '01 · PROBLEM', '#ea580c', '#ffffff'),
            motion(textLayer('csp_title', box(24, 92, 312, 80, 3), 'Four steps, three surprises', { family: 'serif', size: 30, color: ink, bold: true }), { in: 'rise' }),
            textLayer(
              'csp_body',
              box(24, 186, 296, 150, 4),
              ['Shipping costs only appeared on step three.', 'Account creation was forced before payment.', 'Half of mobile shoppers left before paying.'],
              { size: 15, color: muted }
            ),
            panelLayer('csp_metric', box(24, 352, 296, 112, 5), '#ffedd5', ['52%', 'of mobile shoppers left before the payment step'], { family: 'serif', size: 20, color: '#9a3412', bold: true }, { name: 'Metric' }),
            nextButton('csp_next', { fill: ink, color: '#ffffff' })
          ]
        },
        {
          slug: 'solution',
          layers: [
            pageArt('css_art', artHtml('linear-gradient(180deg,#e0f2fe 0%,#f8fafc 100%)', ''), f),
            slotLayer(
              'css_photo',
              box(80, 44, 200, 296, 2),
              'Photo',
              artHtml(
                '#0f172a',
                '<div class="r scr"></div><div class="r" style="left:28px;top:44px;width:110px;height:12px;border-radius:6px;background:#cbd5e1"></div><div class="r" style="left:28px;top:76px;width:144px;height:38px;border-radius:8px;background:#e2e8f0"></div><div class="r" style="left:28px;top:122px;width:144px;height:38px;border-radius:8px;background:#e2e8f0"></div><div class="r" style="left:28px;top:186px;width:144px;height:40px;border-radius:10px;background:#0f172a"></div><div class="r" style="left:28px;top:236px;width:144px;height:40px;border-radius:10px;background:#0369a1"></div>',
                '.scr{left:10px;top:10px;right:10px;bottom:10px;border-radius:24px;background:#f8fafc}'
              ),
              { cornerRadius: 30 }
            ),
            chipLayer('css_kicker', box(24, 357, 130, 26, 3), '02 · SOLUTION', accent, '#ffffff'),
            motion(textLayer('css_title', box(24, 392, 296, 32, 4), 'One page, prices up front', { family: 'serif', size: 22, color: ink, bold: true }), { in: 'rise' }),
            textLayer('css_body', box(24, 428, 296, 40, 5), 'Guest checkout by default, shipping estimated from the postcode, Apple Pay above the fold.', { size: 13, color: muted }),
            nextButton('css_next', { fill: ink, color: '#ffffff' })
          ]
        },
        {
          slug: 'results',
          layers: [
            pageArt('csr_art', artHtml('#0f172a', '<div class="s" style="right:-70px;top:-70px;width:220px;height:220px;background:rgba(56,189,248,.18)"></div>'), f),
            chipLayer('csr_kicker', box(24, 48, 130, 26, 2), '03 · RESULTS', '#38bdf8', ink),
            motion(
              panelLayer('csr_m1', box(24, 96, 150, 130, 3), 'rgba(56,189,248,0.14)', ['−38%', 'checkout drop-off'], { family: 'serif', size: 22, color: '#e0f2fe', bold: true }, { name: 'Metric' }),
              { in: 'rise' }
            ),
            motion(
              panelLayer('csr_m2', box(186, 96, 150, 130, 4), 'rgba(56,189,248,0.14)', ['+21%', 'mobile revenue'], { family: 'serif', size: 22, color: '#e0f2fe', bold: true }, { name: 'Metric' }),
              { in: 'rise', durationSec: 0.7 }
            ),
            panelLayer(
              'csr_quote',
              box(24, 244, 296, 140, 5),
              '#f8fafc',
              ['“Support tickets about surprise fees went to almost zero.”', 'Ana Ruiz, head of operations'],
              { family: 'serif', size: 17, color: ink, italic: true },
              { name: 'Quote' }
            ),
            buttonLayer('csr_read', box(24, 400, 296, 44, 6), 'Read the full case study', { fill: '#38bdf8', color: ink }, { behavior: 'cta.open', openUrl: 'https://parnoir.com/work/fernway-checkout' })
          ]
        }
      ],
      { backgroundColor: '#f8fafc', textColor: ink }
    )
  });
}

function recipeCards(): PenTemplate {
  const ink = '#292524';
  const muted = '#78716c';
  const paper = '#fffbeb';
  const go: Look = { fill: '#b45309', color: paper };
  const tick: Look = { fill: '#ffffff', color: ink };
  const ingredients = ['500 g bread flour', '400 g warm water', '10 g salt', '4 g instant yeast', '60 ml olive oil', 'Flaky salt and rosemary'];
  const method = [
    'Stir everything but the oil into a shaggy dough. Cover and chill overnight.',
    'Oil a tin, tip the dough in, and let it rise for 2 hours.',
    'Dimple hard with oily fingers. Top with salt and rosemary.',
    'Bake at 230°C for 22 to 25 minutes, until deep gold.'
  ];
  const focaccia = (crumb: boolean): string =>
    artHtml(
      crumb ? 'linear-gradient(180deg,#78350f 0%,#451a03 100%)' : 'linear-gradient(160deg,#fef3c7 0%,#fde68a 100%)',
      crumb
        ? '<div class="r slab"></div><div class="r crust"></div>'
        : '<div class="r tray"></div><div class="r bread"></div>' +
            [60, 120, 180, 240].map((x) => `<div class="leaf" style="left:${x + 20}px;top:${120 + (x % 120)}px"></div>`).join(''),
      crumb
        ? '.slab{left:30px;top:120px;width:300px;height:180px;border-radius:14px;background:radial-gradient(circle,#78350f22 0 6px,transparent 7px) 0 0/28px 24px,radial-gradient(circle,#78350f33 0 4px,transparent 5px) 14px 12px/28px 24px,#fde68a}.crust{left:30px;top:110px;width:300px;height:22px;border-radius:14px 14px 4px 4px;background:#b45309}'
        : '.tray{left:20px;top:56px;width:320px;height:250px;border-radius:12px;background:#44403c}.bread{left:34px;top:70px;width:292px;height:222px;border-radius:10px;background:radial-gradient(circle,#b45309 0 5px,transparent 6px) 0 0/36px 32px,#f59e0b}.leaf{position:absolute;width:8px;height:30px;border-radius:50%;background:#166534;transform:rotate(35deg)}'
    );
  return postTemplate({
    id: 'collection.recipe_cards.v1',
    classId: 'social.collection',
    title: 'Recipe cards',
    description: 'A cover photo, an ingredient checklist, the method, and the finished bake.',
    aspect: 'portrait',
    focus:
      'Write the dish name, the total time and servings, up to six ingredients with amounts, four method steps of one sentence each, and a one-line description of the finished result.',
    feedCaption: { title: 'Sunday focaccia, no kneading', body: 'Ingredients, method, and the finished bake, one card each.' },
    sections: pagesOf([
      ['cover', 'Cover'],
      ['ingredients', 'Ingredients'],
      ['method', 'Method'],
      ['finished', 'Finished']
    ]),
    seed: pageSeed(
      f,
      [
        {
          slug: 'cover',
          layers: [
            pageArt('rc_art', artHtml(paper, '<div class="r" style="left:0;right:0;top:320px;height:6px;background:repeating-linear-gradient(90deg,#b45309 0 12px,transparent 12px 20px)"></div>'), f),
            slotLayer('rc_photo', box(0, 0, 360, 320, 2), 'Photo', focaccia(false)),
            chipLayer('rc_kicker', box(24, 345, 130, 26, 3), 'WEEKEND BAKE', ink, paper),
            motion(textLayer('rc_title', box(24, 380, 296, 40, 4), 'Sunday focaccia', { family: 'serif', size: 30, color: ink, bold: true }), { in: 'rise' }),
            textLayer('rc_sub', box(24, 424, 296, 40, 5), 'Mix Saturday night, bake Sunday morning. No kneading.', { size: 13, color: muted }),
            chipLayer('rc_time', box(24, 481, 80, 26, 6), '18 HR', '#fde68a', ink),
            chipLayer('rc_serves', box(112, 481, 96, 26, 7), 'SERVES 8', '#fde68a', ink),
            nextButton('rc_next', go)
          ]
        },
        {
          slug: 'ingredients',
          layers: [
            pageArt('rci_art', artHtml(paper, '<div class="r" style="left:0;right:0;top:0;height:16px;background:repeating-linear-gradient(90deg,#b45309 0 20px,#fde68a 20px 40px)"></div>'), f),
            motion(textLayer('rci_title', box(24, 48, 312, 44, 2), 'Ingredients', { family: 'serif', size: 30, color: ink, bold: true }), { in: 'rise' }),
            textLayer('rci_sub', box(24, 94, 312, 20, 3), 'Tap each one as it goes in the bowl.', { size: 13, color: muted }),
            ...ingredients.map((item, i) =>
              buttonLayer(`rci_${i + 1}`, box(24, 128 + i * 56, 296, 46, 4 + i), item, tick, { behavior: 'widget.toggle', bindRowId: `rci_${i + 1}` }, { radius: 12, stroke: '#e7e5e4' })
            ),
            nextButton('rci_next', go)
          ]
        },
        {
          slug: 'method',
          layers: [
            pageArt('rcm_art', artHtml('#fef3c7', '<div class="s" style="right:-60px;bottom:-60px;width:220px;height:220px;background:rgba(180,83,9,.12)"></div>'), f),
            motion(textLayer('rcm_title', box(24, 48, 312, 44, 2), 'Method', { family: 'serif', size: 30, color: ink, bold: true }), { in: 'rise' }),
            ...method.flatMap((stepText, i) => [
              textLayer(`rcm_n${i + 1}`, box(24, 108 + i * 90, 32, 32, 3 + i * 2), String(i + 1), { family: 'serif', size: 24, color: '#b45309', bold: true }),
              textLayer(`rcm_s${i + 1}`, box(64, 108 + i * 90, 256, 76, 4 + i * 2), stepText, { size: 14, color: ink })
            ]),
            nextButton('rcm_next', go)
          ]
        },
        {
          slug: 'finished',
          layers: [
            pageArt('rcf_art', artHtml(ink, ''), f),
            slotLayer('rcf_photo', box(0, 0, 360, 330, 2), 'Photo', focaccia(true)),
            motion(textLayer('rcf_title', box(24, 346, 296, 34, 3), 'Crisp base, open crumb', { family: 'serif', size: 24, color: paper, bold: true }), { in: 'rise' }),
            textLayer('rcf_sub', box(24, 384, 296, 40, 4), 'Best within six hours. Reheat slices in a dry pan.', { size: 13, color: 'rgba(255,251,235,0.72)' }),
            buttonLayer('rcf_made', box(24, 440, 142, 42, 5), 'I made it', { fill: '#f59e0b', color: ink }, { behavior: 'widget.stamp', label: 'Made it' }),
            buttonLayer('rcf_print', box(178, 440, 142, 42, 6), 'Print the card', { fill: 'rgba(255,251,235,0.12)', color: paper }, { behavior: 'cta.open', openUrl: 'https://parnoir.com/recipes/sunday-focaccia' })
          ]
        }
      ],
      { backgroundColor: paper, textColor: ink }
    )
  });
}

export function collectionTemplates(): PenTemplate[] {
  return [howTo(), topFive(), tripRecap(), caseStudy(), recipeCards()];
}
