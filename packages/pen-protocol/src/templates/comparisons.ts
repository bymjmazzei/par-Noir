import type { PenTemplate } from '../templates.js';
import {
  FRAMES,
  artHtml,
  box,
  buttonLayer,
  countdownLayer,
  groupLayers,
  motion,
  pageArt,
  pageSeed,
  panelLayer,
  textLayer,
  type Box,
  type Font
} from '../curated/kit.js';
import type { PenPageLayer } from '../types.js';
import { chipLayer, postTemplate } from './shared.js';

/** Side-by-side options share y and height so they read as one row. */
function column(id: string, b: Box, fill: string, lines: string[], font: Font, extra: Partial<PenPageLayer> = {}): PenPageLayer {
  return panelLayer(id, b, fill, lines, font, { name: 'Column', ...extra });
}

function pricing(): PenTemplate {
  const f = FRAMES.portrait;
  const ink = '#0f172a';
  const plans = [
    { id: 'starter', lines: ['STARTER', '$0', 'per month', '', 'Up to 50 orders', 'Card payments', 'Email support'], fill: '#ffffff', color: ink },
    { id: 'shop', lines: ['SHOP', '$29', 'per month', '', 'Unlimited orders', 'Discount codes', 'Cart reminder emails'], fill: '#0f172a', color: '#f8fafc' },
    { id: 'studio', lines: ['STUDIO', '$79', 'per month', '', 'Everything in Shop', '5 staff seats', 'Priority support'], fill: '#ffffff', color: ink }
  ];
  return postTemplate({
    id: 'comparison.pricing.v1',
    classId: 'social.comparison',
    title: 'Pricing plans',
    description: 'Three plans side by side with Choose buttons and a full feature comparison.',
    aspect: 'portrait',
    featured: true,
    focus:
      'Write a headline about choosing a plan, then three plans with a name, monthly price, and three features each. Highlight the middle plan. Put the full feature table in the Compare all panel.',
    feedCaption: { title: 'Fernway pricing, simplified', body: 'Prices in USD. Switch or cancel any time.' },
    seed: pageSeed(
      f,
      [
        {
          slug: 'body',
          layers: [
            pageArt(
              'pr_art',
              artHtml('linear-gradient(180deg,#e0f2fe 0%,#f8fafc 40%)', '<div class="r" style="left:119px;top:144px;width:104px;height:6px;border-radius:3px;background:#0ea5e9"></div>'),
              f
            ),
            chipLayer('pr_kicker', box(16, 48, 120, 26, 2), 'FERNWAY PLANS', ink, '#f8fafc'),
            motion(textLayer('pr_title', box(16, 84, 310, 56, 3), 'Pick the plan that fits your shop', { family: 'serif', size: 24, color: ink, bold: true }), { in: 'rise' }),
            ...plans.map((p, i) =>
              motion(
                column(`pr_${p.id}`, box(16 + i * 106, 154, 98, 264, 4 + i), p.fill, p.lines, { size: 12, color: p.color, bold: i === 1 }, { strokeColor: '#cbd5e1', strokeWidth: 1 }),
                { in: 'rise', durationSec: 0.4 + i * 0.15 }
              )
            ),
            panelLayer(
              'pr_all',
              box(16, 154, 310, 264, 8),
              '#f8fafc',
              ['COMPARE ALL', 'Orders: 50 · unlimited · unlimited', 'Staff seats: 1 · 2 · 5', 'Discount codes: no · yes · yes', 'Cart reminders: no · yes · yes', 'Support: email · email · priority', 'Fees per sale: 2% · 1% · 0.5%'],
              { size: 12, color: ink },
              { name: 'Compare all', visible: false, strokeColor: '#cbd5e1', strokeWidth: 1 }
            ),
            ...plans.map((p, i) =>
              buttonLayer(`pr_choose_${p.id}`, box(16 + i * 106, 428, 98, 36, 9 + i), 'Choose', i === 1 ? { fill: '#0ea5e9', color: '#ffffff' } : { fill: ink, color: '#f8fafc' }, { behavior: 'cta.open', openUrl: `https://fernway.com/signup?plan=${p.id}` })
            ),
            buttonLayer('pr_compare', box(16, 474, 310, 40, 12), 'Compare all features', { fill: '#ffffff', color: ink }, { behavior: 'widget.reveal', revealLayerId: 'pr_all', revealMode: 'toggle' }, { stroke: '#cbd5e1' })
          ]
        }
      ],
      { backgroundColor: '#f8fafc', textColor: ink }
    )
  });
}

function thisOrThat(): PenTemplate {
  const f = FRAMES.square;
  return postTemplate({
    id: 'comparison.this_or_that.v1',
    classId: 'social.comparison',
    title: 'This or that',
    description: 'Two options head to head, a vote on each side, and a closing countdown.',
    aspect: 'square',
    featured: true,
    focus:
      'Write the question as a short either-or, then one bold label and one sentence of the best case for each side. Vote buttons should name the team, not just repeat the option.',
    feedCaption: { title: 'Settle it: morning or evening?', body: 'Pick a team. Results show after you vote.' },
    seed: pageSeed(f, [
      {
        slug: 'body',
        layers: [
          pageArt(
            'tt_art',
            artHtml(
              '#0f172a',
              '<div class="r" style="left:0;top:0;width:171px;bottom:0;background:linear-gradient(180deg,#fdba74 0%,#f97316 100%)"></div><div class="r" style="left:171px;top:0;right:0;bottom:0;background:linear-gradient(180deg,#312e81 0%,#0f172a 100%)"></div><div class="s" style="left:132px;top:106px;width:28px;height:28px;background:#fef3c7"></div><div class="s" style="left:310px;top:106px;width:24px;height:24px;background:#e0e7ff;box-shadow:-7px 4px 0 0 #312e81 inset"></div>'
            ),
            f
          ),
          chipLayer('tt_kicker', box(16, 16, 110, 24, 2), 'SETTLE THIS', '#0f172a', '#fef3c7'),
          ...groupLayers('tt_poll', 'Poll', [
            textLayer('tt_question', box(16, 48, 328, 36, 3), 'Morning or evening workout?', { family: 'serif', size: 22, color: '#ffffff', bold: true, align: 'center' }, { name: 'Question' }),
            motion(
              column('tt_morning', box(16, 96, 150, 150, 4), 'rgba(255,255,255,0.22)', ['MORNING', 'Done before the day can cancel it. Empty gym at 6am.'], { size: 13, color: '#431407', bold: true }),
              { in: 'slideRight' }
            ),
            motion(
              column('tt_evening', box(176, 96, 150, 150, 5), 'rgba(255,255,255,0.1)', ['EVENING', 'Stronger lifts, no alarm, and a better playlist.'], { size: 13, color: '#e0e7ff', bold: true }),
              { in: 'slideLeft' }
            ),
            buttonLayer('tt_vote_morning', box(16, 258, 150, 44, 6), 'Team morning', { fill: '#431407', color: '#fed7aa' }, { behavior: 'poll.vote', bindRowId: 'tt_vote_morning' }),
            buttonLayer('tt_vote_evening', box(176, 258, 150, 44, 7), 'Team evening', { fill: '#e0e7ff', color: '#1e1b4b' }, { behavior: 'poll.vote', bindRowId: 'tt_vote_evening' }),
            countdownLayer('tt_time', box(16, 316, 90, 26, 8), '#fef3c7', 2, 'rgba(15,23,42,0.6)'),
            textLayer('tt_results', box(118, 318, 208, 22, 9), 'Results show after you vote', { size: 11, color: 'rgba(255,255,255,0.8)' })
          ]),
          chipLayer('tt_vs', box(151, 200, 40, 40, 20), 'VS', '#fef3c7', '#0f172a')
        ]
      }
    ])
  });
}

function specs(): PenTemplate {
  const f = FRAMES.portrait;
  const ink = '#18181b';
  const muted = '#52525b';
  const font: Font = { size: 13, color: ink };
  return postTemplate({
    id: 'comparison.specs.v1',
    classId: 'social.comparison',
    title: 'Spec sheet',
    description: 'Two products with matching spec rows, a verdict, and a link to the full review.',
    aspect: 'portrait',
    focus:
      'Write the matchup as a question, one line on how you tested, then the same four specs for each product in the same order with the price last. End with a one-sentence verdict that says who each one is for.',
    feedCaption: { title: 'Two e-readers, two weeks', body: 'Same three books on both. Full review linked.' },
    seed: pageSeed(
      f,
      [
        {
          slug: 'body',
          layers: [
            pageArt(
              'sp_art',
              artHtml(
                '#f4f4f5',
                '<div class="r dev" style="left:88px"><i></i></div><div class="r dev" style="left:184px;width:68px;height:90px;top:156px"><i></i></div>',
                '.dev{top:152px;width:72px;height:96px;border-radius:10px;background:#27272a}.dev i{position:absolute;left:7px;top:7px;right:7px;bottom:15px;border-radius:4px;background:repeating-linear-gradient(180deg,#e4e4e7 0 6px,#fafafa 6px 12px)}'
              ),
              f
            ),
            chipLayer('sp_kicker', box(16, 48, 130, 26, 2), 'E-READER TEST', ink, '#f4f4f5'),
            motion(textLayer('sp_title', box(16, 84, 310, 36, 3), 'Lumen 7 or Paper Pro?', { family: 'serif', size: 26, color: ink, bold: true }), { in: 'rise' }),
            textLayer('sp_sub', box(16, 122, 310, 20, 4), 'Two weeks, both devices, the same three books.', { size: 12, color: muted }),
            motion(
              column('sp_lumen', box(16, 256, 150, 168, 5), '#ffffff', ['LUMEN 7', '7 in, 300 ppi', '6 weeks battery', 'Waterproof', '$149'], font, { strokeColor: '#d4d4d8', strokeWidth: 1 }),
              { in: 'slideRight' }
            ),
            motion(
              column('sp_paper', box(176, 256, 150, 168, 6), '#ffffff', ['PAPER PRO', '6.8 in, 300 ppi', '10 weeks battery', 'Splash resistant', '$199'], font, { strokeColor: '#d4d4d8', strokeWidth: 1 }),
              { in: 'slideLeft' }
            ),
            panelLayer('sp_verdict', box(16, 432, 310, 48, 7), '#fde047', 'Verdict: Lumen 7 for reading in the bath, Paper Pro for long trips.', { size: 12, color: ink, bold: true }, { name: 'Verdict' }),
            buttonLayer('sp_review', box(16, 486, 310, 36, 8), 'Read the full review', { fill: ink, color: '#fafafa' }, { behavior: 'cta.open', openUrl: 'https://parnoir.com/reviews/lumen-7-vs-paper-pro' })
          ]
        }
      ],
      { backgroundColor: '#f4f4f5', textColor: ink }
    )
  });
}

function results(): PenTemplate {
  const f = FRAMES.landscape;
  const ink = '#ecfeff';
  const metric: Font = { family: 'serif', size: 18, color: ink, bold: true };
  return postTemplate({
    id: 'comparison.results.v1',
    classId: 'social.comparison',
    title: 'Before and after results',
    description: 'Two metric columns, before and after a change, with how you did it behind a tap.',
    aspect: 'landscape',
    featured: true,
    focus:
      'Write a headline about what changed and the period measured, then the same two metrics before and after with units. Put three short lines on how you did it in the reveal panel and link the write-up.',
    feedCaption: { title: 'Our storefront, four times faster', body: '@fernway.eng · 30 days after the rebuild' },
    seed: pageSeed(
      f,
      [
        {
          slug: 'body',
          layers: [
            pageArt(
              'rs_art',
              artHtml(
                '#083344',
                '<svg width="640" height="360" style="position:absolute;inset:0"><polyline points="0,330 120,300 240,320 360,250 480,200 640,150" fill="none" stroke="rgba(34,211,238,.25)" stroke-width="3"/></svg>'
              ),
              f
            ),
            chipLayer('rs_kicker', box(32, 30, 160, 24, 2), 'SITE SPEED · 30 DAYS', '#22d3ee', '#083344'),
            motion(textLayer('rs_title', box(32, 62, 576, 36, 3), 'We rebuilt our storefront. Here is what changed.', { family: 'serif', size: 24, color: ink, bold: true }), { in: 'rise' }),
            column('rs_before', box(32, 112, 280, 124, 4), 'rgba(236,254,255,0.06)', ['BEFORE', '4.2 s mobile load time', '61% bounce rate'], metric, { strokeColor: 'rgba(236,254,255,0.2)', strokeWidth: 1 }),
            motion(
              column('rs_after', box(328, 112, 280, 124, 5), 'rgba(34,211,238,0.16)', ['AFTER', '1.1 s mobile load time', '23% bounce rate'], metric, { strokeColor: '#22d3ee', strokeWidth: 1 }),
              { in: 'pop' }
            ),
            panelLayer(
              'rs_how',
              box(32, 112, 576, 124, 6),
              '#0e7490',
              ['How we did it', 'Images moved to AVIF with lazy loading.', 'Dropped two tracking scripts.', 'Server-rendered the product grid.'],
              { size: 14, color: ink },
              { name: 'How we did it', visible: false }
            ),
            buttonLayer('rs_how_btn', box(32, 248, 200, 40, 7), 'How we did it', { fill: 'rgba(236,254,255,0.12)', color: ink }, { behavior: 'widget.reveal', revealLayerId: 'rs_how', revealMode: 'toggle' }),
            buttonLayer('rs_read', box(244, 248, 200, 40, 8), 'Read the write-up', { fill: '#22d3ee', color: '#083344' }, { behavior: 'cta.open', openUrl: 'https://parnoir.com/fernway/storefront-speed' })
          ]
        }
      ],
      { backgroundColor: '#083344' }
    )
  });
}

function prosCons(): PenTemplate {
  const f = FRAMES.portrait;
  const ink = '#1c1917';
  return postTemplate({
    id: 'comparison.pros_cons.v1',
    classId: 'social.comparison',
    title: 'Pros and cons',
    description: 'A buying question with pros and cons columns, a verdict, and a checklist link.',
    aspect: 'portrait',
    focus:
      'Write the decision as a question with the year or context, three pros and three cons of one short line each, and a verdict that names the condition under which the answer is yes.',
    feedCaption: { title: 'Used EVs in 2026: worth it?', body: 'Check the battery before you buy.' },
    seed: pageSeed(
      f,
      [
        {
          slug: 'body',
          layers: [
            pageArt(
              'pc_art',
              artHtml(
                '#fafaf9',
                '<div class="r car"></div><div class="s" style="left:112px;top:192px;width:30px;height:30px;background:#1c1917"></div><div class="s" style="left:196px;top:192px;width:30px;height:30px;background:#1c1917"></div><div class="r" style="left:232px;top:164px;width:10px;height:20px;border-radius:2px;background:#22c55e"></div>',
                '.car{left:94px;top:156px;width:150px;height:50px;border-radius:26px 32px 12px 12px;background:#0ea5e9}'
              ),
              f
            ),
            chipLayer('pc_kicker', box(16, 48, 130, 26, 2), 'BUYER’S GUIDE', ink, '#fafaf9'),
            motion(textLayer('pc_title', box(16, 86, 310, 58, 3), 'Should you buy a used EV in 2026?', { family: 'serif', size: 22, color: ink, bold: true }), { in: 'rise' }),
            column('pc_pros', box(16, 236, 150, 164, 4), '#dcfce7', ['PROS', 'Prices fell 30% since 2024', 'Cheap to charge at home', 'Few moving parts to fix'], { size: 13, color: '#14532d' }),
            column('pc_cons', box(176, 236, 150, 164, 5), '#fee2e2', ['CONS', 'Battery health varies a lot', 'Fast charging adds up', 'Older models: shorter range'], { size: 13, color: '#7f1d1d' }),
            motion(
              panelLayer('pc_verdict', box(16, 410, 310, 56, 6), ink, 'Verdict: yes, if you can charge at home and the battery reads above 85%.', { size: 13, color: '#fafaf9', bold: true }, { name: 'Verdict' }),
              { in: 'fade' }
            ),
            buttonLayer('pc_helpful', box(16, 476, 146, 40, 7), 'Helpful', { fill: '#22c55e', color: '#052e16' }, { behavior: 'widget.stamp', label: 'Found it helpful' }),
            buttonLayer('pc_check', box(172, 476, 154, 40, 8), 'Battery checklist', { fill: '#ffffff', color: ink }, { behavior: 'cta.open', openUrl: 'https://parnoir.com/guides/used-ev-battery-check' }, { stroke: '#d6d3d1' })
          ]
        }
      ],
      { backgroundColor: '#fafaf9', textColor: ink }
    )
  });
}

export function comparisonTemplates(): PenTemplate[] {
  return [pricing(), thisOrThat(), specs(), results(), prosCons()];
}
