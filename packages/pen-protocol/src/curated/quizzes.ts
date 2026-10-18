import type { SeedBundle } from '../starterSeeds.js';
import {
  artHtml,
  artLayer,
  box,
  buttonLayer,
  curatedCardSeed,
  panelLayer,
  scoreLayer,
  textLayer,
  themes
} from './kit.js';

/** Question, three answers with one correct, and a Reveal for the explanation. */
export function seedQuizWidget(): SeedBundle {
  const answer = { fill: '#ffffff', color: '#7c2d12' };
  return curatedCardSeed([
    artLayer(
      'qz_art',
      artHtml(
        'linear-gradient(160deg,#f97316 0%,#db2777 70%,#9d174d 100%)',
        '<div class="s" style="width:180px;height:180px;right:-50px;bottom:-40px;background:rgba(255,255,255,0.18)"></div><div class="s" style="width:60px;height:60px;left:280px;top:24px;background:rgba(255,255,255,0.3)"></div>'
      )
    ),
    textLayer('qz_kicker', box(24, 12, 200, 32, 2), 'QUICK QUIZ', { size: 11, color: '#ffedd5', bold: true }),
    textLayer('qz_question', box(24, 42, 250, 64, 3), 'Which planet has the most moons?', { family: 'serif', size: 24, color: '#ffffff', bold: true }, { name: 'Question' }),
    buttonLayer('qz_a', box(24, 120, 312, 36, 4), 'Jupiter', answer, { behavior: 'quiz.answer', bindRowId: 'qz_a' }),
    buttonLayer('qz_b', box(24, 164, 312, 36, 5), 'Saturn', answer, { behavior: 'quiz.answer', bindRowId: 'qz_b', correct: true }),
    buttonLayer('qz_c', box(24, 208, 312, 36, 6), 'Neptune', answer, { behavior: 'quiz.answer', bindRowId: 'qz_c' }),
    buttonLayer('qz_reveal', box(24, 260, 140, 32, 7), 'Show answer', { fill: 'rgba(0,0,0,0.25)', color: '#ffffff' }, { behavior: 'widget.reveal', revealLayerId: 'qz_answer', revealMode: 'show' }),
    textLayer('qz_answer', box(24, 300, 312, 44, 8), 'Saturn. It has 146 confirmed moons.', { size: 14, color: '#ffffff', bold: true }, { visible: false })
  ]);
}

/** One statement, True or False, and the explanation on reveal. */
export function seedQuizTruefalse(): SeedBundle {
  const t = themes.citrus;
  return curatedCardSeed([
    artLayer(
      'tf_art',
      artHtml(
        '#fef9c3',
        '<div class="s" style="width:96px;height:96px;right:28px;top:26px;background:#bef264"></div><div class="s" style="width:52px;height:52px;right:96px;top:84px;background:#65a30d;opacity:.6"></div><div class="s" style="width:28px;height:28px;right:60px;top:118px;background:#1a2e05;opacity:.25"></div>'
      )
    ),
    textLayer('tf_kicker', box(24, 24, 200, 20, 2), 'OCEAN FACTS', { size: 11, color: t.accent, bold: true }),
    textLayer('tf_statement', box(24, 50, 220, 100, 3), 'An octopus has three hearts.', { family: 'serif', size: 28, color: t.ink, bold: true }, { name: 'Question' }),
    buttonLayer('tf_true', box(24, 176, 150, 52, 4), 'True', t.primary, { behavior: 'quiz.answer', bindRowId: 'tf_true', correct: true }, { size: 17, radius: 14 }),
    buttonLayer('tf_false', box(186, 176, 150, 52, 5), 'False', t.ghost, { behavior: 'quiz.answer', bindRowId: 'tf_false' }, { size: 17, radius: 14, stroke: '#a3e635' }),
    buttonLayer('tf_why', box(24, 244, 120, 30, 6), 'Why?', { fill: 'transparent', color: t.ink }, { behavior: 'widget.reveal', revealLayerId: 'tf_explain', revealMode: 'toggle' }, { size: 13, stroke: t.ink }),
    textLayer('tf_explain', box(24, 284, 312, 56, 7), 'True. Two hearts pump blood to the gills and one pumps it to the rest of the body.', { size: 13, color: t.ink }, { visible: false })
  ]);
}

/** A drawn silhouette; guess what it is. */
export function seedQuizImage(): SeedBundle {
  const t = themes.night;
  const pick = { fill: 'rgba(255,255,255,0.08)', color: t.ink };
  return curatedCardSeed([
    artLayer(
      'gi_art',
      artHtml(
        'radial-gradient(circle at 70% 30%,#312e81 0%,#0f172a 70%)',
        '<div class="tower"><div class="leg l"></div><div class="leg r"></div><div class="deck" style="top:60px"></div><div class="deck" style="top:104px;width:92px;left:-16px"></div><div class="spire"></div></div><div class="s" style="left:250px;top:30px;width:6px;height:6px;background:#fde68a"></div><div class="s" style="left:322px;top:60px;width:4px;height:4px;background:#fde68a"></div>',
        '.tower{position:absolute;left:258px;top:40px;width:60px;height:150px;filter:blur(1.5px)}.leg{position:absolute;bottom:0;width:10px;height:140px;background:#a5b4fc}.leg.l{left:8px;transform:skewX(10deg)}.leg.r{right:8px;transform:skewX(-10deg)}.deck{position:absolute;left:-4px;width:68px;height:6px;background:#a5b4fc}.spire{position:absolute;left:27px;top:-10px;width:6px;height:40px;background:#a5b4fc}'
      )
    ),
    textLayer('gi_kicker', box(24, 24, 200, 20, 2), 'TRAVEL TRIVIA', { size: 11, color: t.accent, bold: true }),
    textLayer('gi_question', box(24, 48, 210, 96, 3), 'Which landmark is hiding in the haze?', { family: 'serif', size: 24, color: t.ink, bold: true }, { name: 'Question' }),
    buttonLayer('gi_a', box(24, 200, 100, 40, 4), 'Big Ben', pick, { behavior: 'quiz.answer', bindRowId: 'gi_a' }, { radius: 10, stroke: 'rgba(165,180,252,0.4)' }),
    buttonLayer('gi_b', box(130, 200, 100, 40, 5), 'Eiffel Tower', pick, { behavior: 'quiz.answer', bindRowId: 'gi_b', correct: true }, { radius: 10, size: 12, stroke: 'rgba(165,180,252,0.4)' }),
    buttonLayer('gi_c', box(236, 200, 100, 40, 6), 'CN Tower', pick, { behavior: 'quiz.answer', bindRowId: 'gi_c' }, { radius: 10, size: 12, stroke: 'rgba(165,180,252,0.4)' }),
    buttonLayer('gi_hint', box(24, 256, 110, 30, 7), 'Show it', t.primary, { behavior: 'widget.reveal', revealLayerId: 'gi_answer', revealMode: 'show' }, { size: 13 }),
    textLayer('gi_answer', box(24, 294, 312, 44, 8), 'The Eiffel Tower, Paris. Finished in 1889.', { size: 14, color: t.ink, bold: true }, { visible: false })
  ]);
}

/** A riddle with its answer behind a toggle. */
export function seedQuizRiddle(): SeedBundle {
  const t = themes.paper;
  return curatedCardSeed([
    artLayer(
      'rd_art',
      artHtml(
        '#f6f1e7',
        '<div class="q">?</div><div class="r" style="left:24px;right:24px;top:236px;height:1px;background:#d6c7a8"></div>',
        '.q{position:absolute;right:20px;top:-30px;font:700 220px Georgia,serif;color:#eadfca;line-height:1}'
      )
    ),
    textLayer('rd_kicker', box(24, 24, 200, 20, 2), 'MONDAY RIDDLE', { size: 11, color: t.accent, bold: true }),
    textLayer('rd_riddle', box(24, 52, 300, 120, 3), ['What has keys', "but can't open a single lock?"], { family: 'serif', size: 22, color: t.ink, italic: true }, { name: 'Question' }),
    buttonLayer('rd_reveal', box(24, 184, 160, 40, 4), 'Reveal answer', t.primary, { behavior: 'widget.reveal', revealLayerId: 'rd_answer', revealMode: 'toggle' }),
    textLayer('rd_answer', box(24, 252, 312, 60, 5), 'A piano.', { family: 'serif', size: 34, color: t.accent, bold: true }, { visible: false }),
    textLayer('rd_footer', box(24, 324, 312, 20, 6), 'New riddle every morning', { size: 11, color: t.muted })
  ]);
}

/** Three vote cards with a line describing each type. */
export function seedQuizPersonality(): SeedBundle {
  const t = themes.rose;
  const card = { fill: '#ffffff', color: t.ink };
  return curatedCardSeed([
    artLayer(
      'pp_art',
      artHtml(
        'linear-gradient(170deg,#fff1f2 0%,#ffe4e6 100%)',
        '<div class="s" style="width:160px;height:160px;right:-50px;top:-60px;background:#fecdd3"></div><div class="s" style="width:70px;height:70px;right:70px;top:40px;background:#fda4af;opacity:.6"></div>'
      )
    ),
    textLayer('pp_kicker', box(24, 16, 200, 20, 2), 'WHICH ONE ARE YOU?', { size: 11, color: t.accent, bold: true }),
    textLayer('pp_question', box(24, 38, 250, 62, 3), 'Pick your perfect Sunday', { family: 'serif', size: 24, color: t.ink, bold: true }, { name: 'Question' }),
    buttonLayer('pp_a', box(24, 104, 312, 56, 4), 'Slow brunch and a long book', card, { behavior: 'poll.vote', bindRowId: 'pp_a' }, { radius: 14, stroke: '#fecdd3' }),
    textLayer('pp_a_note', box(24, 164, 312, 18, 5), 'The Unhurried', { size: 11, color: t.muted, bold: true }),
    buttonLayer('pp_b', box(24, 188, 312, 56, 6), 'A trail run before sunrise', card, { behavior: 'poll.vote', bindRowId: 'pp_b' }, { radius: 14, stroke: '#fecdd3' }),
    textLayer('pp_b_note', box(24, 248, 312, 18, 7), 'The Early Bird', { size: 11, color: t.muted, bold: true }),
    buttonLayer('pp_c', box(24, 272, 312, 56, 8), 'Friends, a grill, and loud music', card, { behavior: 'poll.vote', bindRowId: 'pp_c' }, { radius: 14, stroke: '#fecdd3' }),
    textLayer('pp_c_note', box(24, 332, 312, 18, 9), 'The Host', { size: 11, color: t.muted, bold: true })
  ]);
}

/** Three questions on frames, a running score, and Send my score at the end. */
export function seedQuizMulti(): SeedBundle {
  const t = themes.ink;
  const ans = { fill: 'rgba(255,255,255,0.08)', color: t.ink };
  const q = (id: string, frame: number, text: string) =>
    textLayer(id, box(24, 56, 312, 64, 3), text, { family: 'serif', size: 22, color: t.ink, bold: true }, { stepFrame: frame });
  const a = (id: string, frame: number, row: number, face: string, correct = false) =>
    buttonLayer(id, box(24, 132 + row * 46, 312, 38, 10 + frame * 3 + row), face, ans, { behavior: 'quiz.answer', bindRowId: id, stepFrame: frame, ...(correct ? { correct: true } : {}) }, { radius: 10, stroke: 'rgba(250,204,21,0.3)' });
  return curatedCardSeed([
    artLayer(
      'mq_art',
      artHtml(
        '#0b0b0c',
        '<div class="r" style="left:0;top:0;width:360px;height:4px;background:linear-gradient(90deg,#facc15,#f97316)"></div><div class="s" style="width:200px;height:200px;right:-120px;bottom:-120px;border:28px solid rgba(250,204,21,0.12)"></div>'
      )
    ),
    textLayer('mq_kicker', box(24, 24, 160, 20, 2), 'SCIENCE QUIZ', { size: 11, color: t.accent, bold: true }),
    scoreLayer('mq_score', box(236, 20, 100, 26, 4), t.bg, t.accent),
    q('mq_q1', 0, 'What gas do plants take in?'),
    a('mq_q1_a', 0, 0, 'Oxygen'),
    a('mq_q1_b', 0, 1, 'Carbon dioxide', true),
    a('mq_q1_c', 0, 2, 'Nitrogen'),
    q('mq_q2', 1, 'How many bones are in an adult human?'),
    a('mq_q2_a', 1, 0, '206', true),
    a('mq_q2_b', 1, 1, '186'),
    a('mq_q2_c', 1, 2, '312'),
    q('mq_q3', 2, 'Which is the hottest planet?'),
    a('mq_q3_a', 2, 0, 'Mercury'),
    a('mq_q3_b', 2, 1, 'Venus', true),
    a('mq_q3_c', 2, 2, 'Mars'),
    textLayer('mq_done', box(24, 56, 312, 90, 3), ['That is the quiz.', 'Send your score to the host.'], { family: 'serif', size: 22, color: t.ink, bold: true }, { stepFrame: 3 }),
    buttonLayer('mq_send', box(24, 170, 200, 44, 20), 'Send my score', t.primary, { behavior: 'widget.submit', label: 'Science quiz score', stepFrame: 3 }),
    buttonLayer('mq_back', box(24, 300, 100, 36, 30), 'Back', t.ghost, { behavior: 'widget.step', stepDir: 'prev' }),
    buttonLayer('mq_next', box(236, 300, 100, 36, 31), 'Next', t.primary, { behavior: 'widget.step', stepDir: 'next' })
  ]);
}

/** Ticket art; tap to uncover the code. */
export function seedQuizUncover(): SeedBundle {
  return curatedCardSeed([
    artLayer(
      'tu_art',
      artHtml(
        'linear-gradient(150deg,#4c1d95 0%,#7c3aed 100%)',
        '<div class="ticket"><div class="notch" style="left:-14px"></div><div class="notch" style="right:-14px"></div><div class="perf"></div></div>',
        '.ticket{position:absolute;left:24px;top:120px;width:312px;height:132px;border-radius:14px;background:#faf5ff}.notch{position:absolute;top:52px;width:28px;height:28px;border-radius:50%;background:#6d28d9}.perf{position:absolute;left:20px;right:20px;top:66px;border-top:2px dashed #ddd6fe}'
      )
    ),
    textLayer('tu_kicker', box(24, 24, 200, 20, 2), 'MYSTERY REWARD', { size: 11, color: '#ddd6fe', bold: true }),
    textLayer('tu_title', box(24, 48, 312, 60, 3), 'Tap the ticket to uncover your code', { family: 'serif', size: 22, color: '#ffffff', bold: true }),
    panelLayer('tu_cover', box(44, 136, 272, 44, 4), '#c4b5fd', 'Scratch here', { size: 15, color: '#4c1d95', bold: true, align: 'center' }, { name: 'Cover', cornerRadius: 10 }),
    textLayer('tu_code', box(44, 192, 272, 48, 5), 'CALM20', { family: 'mono', size: 30, color: '#4c1d95', bold: true, align: 'center' }, { visible: false, name: 'Code' }),
    buttonLayer('tu_tap', box(24, 276, 312, 44, 6), 'Uncover', { fill: '#facc15', color: '#2e1065' }, { behavior: 'widget.reveal', revealLayerId: 'tu_code', revealMode: 'toggle' }, { size: 15 }),
    textLayer('tu_fine', box(24, 330, 312, 20, 7), '20% off your first order. Ends Sunday.', { size: 11, color: 'rgba(255,255,255,0.75)' })
  ]);
}
