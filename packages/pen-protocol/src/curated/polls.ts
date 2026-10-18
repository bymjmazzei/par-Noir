import type { SeedBundle } from '../starterSeeds.js';
import {
  artHtml,
  artLayer,
  box,
  buttonLayer,
  countdownLayer,
  curatedCardSeed,
  inputLayer,
  textLayer,
  themes
} from './kit.js';

/** Question, three time slots, and a one-day countdown. */
export function seedPollQuick(): SeedBundle {
  const t = themes.night;
  const slot = { fill: 'rgba(129,140,248,0.14)', color: t.ink };
  return curatedCardSeed([
    artLayer(
      'pq_art',
      artHtml(
        'linear-gradient(170deg,#0f172a 0%,#1e1b4b 100%)',
        '<div class="grid"></div><div class="s" style="width:120px;height:120px;right:-30px;top:-30px;background:rgba(129,140,248,0.35)"></div>',
        '.grid{position:absolute;right:16px;top:20px;width:120px;height:84px;background-image:linear-gradient(rgba(226,232,240,0.12) 1px,transparent 1px),linear-gradient(90deg,rgba(226,232,240,0.12) 1px,transparent 1px);background-size:17px 17px}'
      )
    ),
    textLayer('pq_kicker', box(24, 20, 200, 20, 2), 'WEEKLY LIVE', { size: 11, color: t.accent, bold: true }),
    textLayer('pq_question', box(24, 44, 250, 68, 3), 'Best time for the weekly live?', { family: 'serif', size: 25, color: t.ink, bold: true }, { name: 'Question' }),
    textLayer('pq_closes', box(24, 120, 80, 24, 4), 'Closes in', { size: 12, color: t.muted }),
    countdownLayer('pq_time', box(96, 120, 116, 24, 5), t.ink, 1, 'rgba(129,140,248,0.25)'),
    buttonLayer('pq_mon', box(24, 160, 312, 40, 6), 'Monday · 6 pm', slot, { behavior: 'poll.vote', bindRowId: 'pq_mon' }, { radius: 10, stroke: 'rgba(129,140,248,0.5)' }),
    buttonLayer('pq_wed', box(24, 208, 312, 40, 7), 'Wednesday · noon', slot, { behavior: 'poll.vote', bindRowId: 'pq_wed' }, { radius: 10, stroke: 'rgba(129,140,248,0.5)' }),
    buttonLayer('pq_sat', box(24, 256, 312, 40, 8), 'Saturday · 10 am', slot, { behavior: 'poll.vote', bindRowId: 'pq_sat' }, { radius: 10, stroke: 'rgba(129,140,248,0.5)' }),
    textLayer('pq_note', box(24, 312, 312, 24, 9), 'One vote per person.', { size: 11, color: t.muted })
  ]);
}

/** Question, three options, a typed Other answer, and a countdown on a drawn card. */
export function seedPollWriteInWidget(): SeedBundle {
  const option = { fill: 'rgba(255,255,255,0.16)', color: '#ffffff' };
  return curatedCardSeed([
    artLayer(
      'pw_art',
      artHtml(
        'linear-gradient(150deg,#0f766e 0%,#1e3a8a 60%,#312e81 100%)',
        '<div class="s" style="width:220px;height:220px;right:-60px;top:-70px;background:rgba(253,230,138,0.25)"></div><div class="s" style="width:140px;height:140px;left:-40px;bottom:-50px;background:rgba(255,255,255,0.12)"></div>'
      )
    ),
    textLayer('pw_kicker', box(24, 12, 200, 32, 2), 'COMMUNITY POLL', { size: 11, color: '#fde68a', bold: true }),
    textLayer('pw_question', box(24, 42, 312, 56, 3), 'What should we build next?', { family: 'serif', size: 24, color: '#ffffff', bold: true }, { name: 'Question' }),
    countdownLayer('pw_time', box(22, 100, 90, 20, 4), '#fde68a', 2),
    buttonLayer('pw_opt_a', box(24, 130, 312, 36, 5), 'Live audio rooms', option, { behavior: 'poll.vote', bindRowId: 'pw_opt_a' }),
    buttonLayer('pw_opt_b', box(24, 174, 312, 36, 6), 'Shared notebooks', option, { behavior: 'poll.vote', bindRowId: 'pw_opt_b' }),
    buttonLayer('pw_opt_c', box(24, 218, 312, 36, 7), 'Offline mode', option, { behavior: 'poll.vote', bindRowId: 'pw_opt_c' }),
    inputLayer('pw_writein_field', box(24, 268, 216, 36, 8), 'Something else…', { fill: '#ffffff', color: '#141414' }, { name: 'Write-in', cornerRadius: 18 }),
    buttonLayer('pw_writein', box(248, 268, 88, 36, 9), 'Vote', { fill: '#fde68a', color: '#1e1b4b' }, { behavior: 'poll.vote', bindRowId: 'pw_writein', writeIn: true, label: 'Other', name: 'Other' }),
    textLayer('pw_note', box(24, 314, 312, 32, 10), 'Only the creator sees write-in answers.', { size: 11, color: 'rgba(255,255,255,0.7)' })
  ]);
}

/** Split art with a VS badge and two tall picks. */
export function seedPollThisorthat(): SeedBundle {
  return curatedCardSeed([
    artLayer(
      'tt_art',
      artHtml(
        '#0c4a6e',
        '<div class="r" style="left:0;top:0;width:180px;height:360px;background:linear-gradient(180deg,#0369a1,#0c4a6e)"></div>' +
          '<div class="r" style="left:180px;top:0;width:180px;height:360px;background:linear-gradient(180deg,#fbbf24,#f97316)"></div>' +
          '<div class="tri" style="left:14px;top:120px;border-width:0 70px 110px 70px"></div><div class="tri" style="left:76px;top:150px;border-width:0 52px 80px 52px;border-color:transparent transparent #e0f2fe transparent"></div>' +
          '<div class="s" style="left:248px;top:112px;width:64px;height:64px;background:#fff7ed"></div>' +
          '<div class="r" style="left:180px;top:200px;width:180px;height:36px;background:repeating-linear-gradient(90deg,#38bdf8 0 18px,#7dd3fc 18px 36px);opacity:.85"></div>' +
          '<div class="vs">VS</div>',
        '.tri{position:absolute;width:0;height:0;border-style:solid;border-color:transparent transparent #bae6fd transparent}.vs{position:absolute;left:154px;top:150px;width:52px;height:52px;border-radius:50%;background:#0b0b0c;color:#fff;font:800 16px Montserrat,Helvetica,sans-serif;display:flex;align-items:center;justify-content:center;border:3px solid #fff}'
      )
    ),
    textLayer('tt_kicker', box(0, 20, 360, 20, 2), 'TRAVEL POLL', { size: 11, color: '#ffffff', bold: true, align: 'center' }),
    textLayer('tt_question', box(0, 42, 360, 40, 3), 'Weekend escape?', { family: 'serif', size: 28, color: '#ffffff', bold: true, align: 'center' }, { name: 'Question' }),
    buttonLayer('tt_mountains', box(24, 256, 140, 52, 4), 'Mountains', { fill: '#ffffff', color: '#0c4a6e' }, { behavior: 'poll.vote', bindRowId: 'tt_mountains' }, { size: 16, radius: 14 }),
    buttonLayer('tt_beach', box(196, 256, 140, 52, 5), 'Beach', { fill: '#ffffff', color: '#9a3412' }, { behavior: 'poll.vote', bindRowId: 'tt_beach' }, { size: 16, radius: 14 }),
    textLayer('tt_note', box(0, 322, 360, 20, 6), 'Pick a side', { size: 12, color: '#ffffff', bold: true, align: 'center' })
  ]);
}

/** Five round score buttons with end labels. */
export function seedPollRating(): SeedBundle {
  const t = themes.paper;
  const dot = { fill: '#ffffff', color: t.ink };
  const ids = ['rt_1', 'rt_2', 'rt_3', 'rt_4', 'rt_5'];
  return curatedCardSeed([
    artLayer(
      'rt_art',
      artHtml(
        '#f6f1e7',
        '<div class="bar" style="left:196px;height:16px"></div><div class="bar" style="left:226px;height:28px"></div><div class="bar" style="left:256px;height:40px"></div><div class="bar" style="left:286px;height:52px"></div><div class="bar" style="left:316px;height:64px;background:#b45309"></div>' +
          '<div class="r" style="left:24px;right:24px;top:236px;height:2px;background:#e7e0d2"></div>',
        '.bar{position:absolute;bottom:24px;width:20px;border-radius:4px 4px 0 0;background:#d6c7a8}'
      )
    ),
    textLayer('rt_kicker', box(24, 24, 200, 20, 2), 'EPISODE 42', { size: 11, color: t.accent, bold: true }),
    textLayer('rt_question', box(24, 48, 312, 64, 3), "How was today's episode?", { family: 'serif', size: 26, color: t.ink, bold: true }, { name: 'Question' }),
    textLayer('rt_sub', box(24, 116, 312, 22, 4), 'Rate it from 1 to 5.', { size: 13, color: t.muted }),
    ...ids.map((id, i) =>
      buttonLayer(id, box(24 + i * 65, 168, 52, 52, 5 + i), String(i + 1), i === 4 ? t.primary : dot, { behavior: 'poll.vote', bindRowId: id }, { size: 18, stroke: '#d6c7a8' })
    ),
    textLayer('rt_low', box(24, 246, 100, 20, 10), 'Meh', { size: 12, color: t.muted, bold: true }),
    textLayer('rt_high', box(236, 246, 100, 20, 11), 'Loved it', { size: 12, color: t.muted, bold: true, align: 'right' })
  ]);
}

/** A spicy statement over a meter, Agree or Disagree. */
export function seedPollHottake(): SeedBundle {
  return curatedCardSeed([
    artLayer(
      'ht_art',
      artHtml(
        'linear-gradient(160deg,#450a0a 0%,#7f1d1d 100%)',
        '<div class="meter"></div><div class="needle"></div><div class="lab" style="left:24px">COLD</div><div class="lab" style="right:24px;text-align:right">SPICY</div>',
        '.meter{position:absolute;left:24px;right:24px;top:180px;height:14px;border-radius:7px;background:linear-gradient(90deg,#38bdf8,#facc15 50%,#ef4444)}.needle{position:absolute;left:250px;top:170px;width:6px;height:34px;border-radius:3px;background:#fff;box-shadow:0 0 0 3px rgba(0,0,0,.25)}.lab{position:absolute;top:206px;width:80px;font:700 10px Montserrat,Helvetica,sans-serif;letter-spacing:2px;color:rgba(255,255,255,.6)}'
      )
    ),
    textLayer('ht_kicker', box(24, 22, 200, 20, 2), 'HOT TAKE', { size: 11, color: '#fca5a5', bold: true }),
    textLayer('ht_question', box(24, 46, 312, 110, 3), 'Pineapple belongs on pizza.', { family: 'serif', size: 32, color: '#ffffff', bold: true }, { name: 'Question' }),
    buttonLayer('ht_agree', box(24, 248, 150, 48, 4), 'Agree', { fill: '#22c55e', color: '#052e16' }, { behavior: 'poll.vote', bindRowId: 'ht_agree' }, { size: 16 }),
    buttonLayer('ht_disagree', box(186, 248, 150, 48, 5), 'Disagree', { fill: '#ffffff', color: '#7f1d1d' }, { behavior: 'poll.vote', bindRowId: 'ht_disagree' }, { size: 16 }),
    textLayer('ht_note', box(24, 312, 312, 24, 6), 'See where everyone landed after you vote.', { size: 11, color: 'rgba(255,255,255,0.7)' })
  ]);
}

/** Guess first; results stay hidden until the countdown ends. */
export function seedPollHidden(): SeedBundle {
  const t = themes.ink;
  const pick = { fill: 'rgba(250,204,21,0.1)', color: t.ink };
  return curatedCardSeed([
    artLayer(
      'hr_art',
      artHtml(
        '#0b0b0c',
        '<div class="dots"></div><div class="pin" style="left:262px;top:40px"></div><div class="pin" style="left:300px;top:76px"></div><div class="pin" style="left:236px;top:92px"></div>',
        '.dots{position:absolute;left:200px;top:20px;width:150px;height:110px;background-image:radial-gradient(rgba(245,245,244,.22) 1.5px,transparent 1.6px);background-size:10px 10px}.pin{position:absolute;width:12px;height:12px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#facc15}'
      )
    ),
    textLayer('hr_kicker', box(24, 22, 170, 20, 2), 'GUESS AND REVEAL', { size: 11, color: t.accent, bold: true }),
    textLayer('hr_question', box(24, 46, 200, 64, 3), 'Guess the launch city', { family: 'serif', size: 26, color: t.ink, bold: true }, { name: 'Question' }),
    buttonLayer('hr_lisbon', box(24, 128, 312, 40, 4), 'Lisbon', pick, { behavior: 'poll.vote', bindRowId: 'hr_lisbon' }, { radius: 10, stroke: 'rgba(250,204,21,0.4)' }),
    buttonLayer('hr_seoul', box(24, 176, 312, 40, 5), 'Seoul', pick, { behavior: 'poll.vote', bindRowId: 'hr_seoul' }, { radius: 10, stroke: 'rgba(250,204,21,0.4)' }),
    buttonLayer('hr_mexico', box(24, 224, 312, 40, 6), 'Mexico City', pick, { behavior: 'poll.vote', bindRowId: 'hr_mexico' }, { radius: 10, stroke: 'rgba(250,204,21,0.4)' }),
    textLayer('hr_note', box(24, 280, 200, 40, 7), 'Results show when the poll closes.', { size: 12, color: t.muted }),
    countdownLayer('hr_time', box(224, 284, 112, 28, 8), t.bg, 3, t.accent)
  ]);
}

/** Three numbered rows; tap in order of preference. */
export function seedPollRank(): SeedBundle {
  const t = themes.slate;
  const row = { fill: '#ffffff', color: t.ink };
  return curatedCardSeed([
    artLayer(
      'rk_art',
      artHtml(
        '#e2e8f0',
        '<div class="pod" style="left:250px;height:30px;background:#94a3b8"></div><div class="pod" style="left:280px;height:46px;background:#0369a1"></div><div class="pod" style="left:310px;height:22px;background:#cbd5e1"></div>',
        '.pod{position:absolute;bottom:0;width:30px}'
      )
    ),
    textLayer('rk_kicker', box(24, 22, 200, 20, 2), 'YOUR TOP THREE', { size: 11, color: t.accent, bold: true }),
    textLayer('rk_question', box(24, 46, 312, 64, 3), 'Rank our next three episodes', { family: 'serif', size: 25, color: t.ink, bold: true }, { name: 'Question' }),
    textLayer('rk_sub', box(24, 110, 312, 22, 4), 'Tap your favorite first, then the rest in order.', { size: 12, color: t.muted }),
    buttonLayer('rk_a', box(24, 144, 312, 44, 5), 'The night shift diaries', row, { behavior: 'widget.rank', bindRowId: 'rk_a' }, { radius: 12, stroke: '#cbd5e1' }),
    buttonLayer('rk_b', box(24, 196, 312, 44, 6), 'Inside a seed vault', row, { behavior: 'widget.rank', bindRowId: 'rk_b' }, { radius: 12, stroke: '#cbd5e1' }),
    buttonLayer('rk_c', box(24, 248, 312, 44, 7), 'Cooking with no recipe', row, { behavior: 'widget.rank', bindRowId: 'rk_c' }, { radius: 12, stroke: '#cbd5e1' })
  ]);
}

/** Three buckets that share 100 points. */
export function seedPollBudget(): SeedBundle {
  const t = themes.forest;
  const bucket = { fill: 'rgba(134,239,172,0.14)', color: t.ink };
  return curatedCardSeed([
    artLayer(
      'bs_art',
      artHtml(
        'linear-gradient(165deg,#052e16 0%,#14532d 100%)',
        '<div class="r" style="left:24px;top:314px;width:140px;height:14px;border-radius:7px 0 0 7px;background:#86efac"></div><div class="r" style="left:164px;top:314px;width:100px;height:14px;background:#4ade80"></div><div class="r" style="left:264px;top:314px;width:72px;height:14px;border-radius:0 7px 7px 0;background:#16a34a"></div>'
      )
    ),
    textLayer('bs_kicker', box(24, 22, 200, 20, 2), 'ROADMAP VOTE', { size: 11, color: t.accent, bold: true }),
    textLayer('bs_question', box(24, 46, 312, 64, 3), 'Where should our next month go?', { family: 'serif', size: 25, color: t.ink, bold: true }, { name: 'Question' }),
    textLayer('bs_sub', box(24, 110, 312, 22, 4), 'Share 100 points across the three.', { size: 12, color: t.muted }),
    buttonLayer('bs_speed', box(24, 144, 312, 44, 5), 'A faster app', bucket, { behavior: 'widget.allocate', bindRowId: 'bs_speed', allocateTotal: 100 }, { radius: 12 }),
    buttonLayer('bs_features', box(24, 196, 312, 44, 6), 'New features', bucket, { behavior: 'widget.allocate', bindRowId: 'bs_features', allocateTotal: 100 }, { radius: 12 }),
    buttonLayer('bs_docs', box(24, 248, 312, 44, 7), 'Better guides', bucket, { behavior: 'widget.allocate', bindRowId: 'bs_docs', allocateTotal: 100 }, { radius: 12 }),
    textLayer('bs_total', box(24, 292, 312, 20, 8), 'Total: 100 points', { size: 11, color: t.muted, bold: true })
  ]);
}
