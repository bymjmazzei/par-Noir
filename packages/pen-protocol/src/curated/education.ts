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

/** A term; Flip toggles the definition card. */
export function seedEduFlashcard(): SeedBundle {
  const t = themes.paper;
  return curatedCardSeed([
    artLayer(
      'fc_art',
      artHtml(
        '#e7e0d2',
        '<div class="card back"></div><div class="card"></div>',
        '.card{position:absolute;left:28px;top:40px;width:304px;height:216px;border-radius:16px;background:#fffdf8;box-shadow:0 8px 20px rgba(28,25,23,.12)}.card.back{transform:rotate(-4deg) translate(-6px,6px);background:#d6cbb6;box-shadow:none}.card::after{content:"";position:absolute;left:20px;right:20px;top:52px;height:1px;background:#f0b4b4}'
      )
    ),
    textLayer('fc_kicker', box(48, 56, 200, 20, 2), 'BIOLOGY · CARD 12', { size: 11, color: t.accent, bold: true }),
    textLayer('fc_term', box(48, 108, 264, 100, 3), 'Photosynthesis', { family: 'serif', size: 30, color: t.ink, bold: true, align: 'center' }),
    panelLayer(
      'fc_def',
      box(28, 40, 304, 216, 6),
      '#1c1917',
      ['', 'How plants turn sunlight, water, and carbon dioxide into sugar and oxygen.'],
      { family: 'serif', size: 18, color: '#f6f1e7', align: 'center' },
      { visible: false, name: 'Definition', cornerRadius: 16 }
    ),
    buttonLayer('fc_flip', box(110, 284, 140, 48, 7), 'Flip card', t.primary, { behavior: 'widget.reveal', revealLayerId: 'fc_def', revealMode: 'toggle' })
  ]);
}

/** Three cards on frames, each with its own answer toggle. */
export function seedEduDeck(): SeedBundle {
  const t = themes.rose;
  const cards = [
    ['¿Dónde está la biblioteca?', 'Where is the library?'],
    ['Tengo hambre.', 'I am hungry.'],
    ['¿Cuánto cuesta?', 'How much does it cost?']
  ];
  const layers = cards.flatMap(([front, back], frame) => [
    textLayer(`dk_front_${frame}`, box(40, 96, 280, 96, 3), front, { family: 'serif', size: 24, color: t.ink, bold: true, align: 'center' }, { stepFrame: frame }),
    panelLayer(`dk_back_${frame}`, box(40, 196, 280, 52, 4), '#ffe4e6', back, { size: 15, color: t.muted, bold: true, align: 'center' }, { stepFrame: frame, visible: false, name: 'Answer' }),
    buttonLayer(`dk_show_${frame}`, box(120, 254, 120, 32, 5), 'Show answer', t.ghost, { behavior: 'widget.reveal', revealLayerId: `dk_back_${frame}`, revealMode: 'toggle', stepFrame: frame }, { size: 12, stroke: '#fecdd3' })
  ]);
  return curatedCardSeed([
    artLayer(
      'dk_art',
      artHtml(
        '#fff1f2',
        '<div class="r" style="left:32px;top:30px;width:296px;height:268px;border-radius:18px;background:#ffe4e6;transform:rotate(3deg)"></div><div class="r" style="left:24px;top:24px;width:312px;height:276px;border-radius:18px;background:#ffffff;box-shadow:0 6px 18px rgba(76,5,25,.1)"></div>'
      )
    ),
    textLayer('dk_kicker', box(40, 44, 260, 20, 2), 'SPANISH · TRAVEL PHRASES', { size: 11, color: t.accent, bold: true }),
    ...layers,
    buttonLayer('dk_prev', box(24, 312, 100, 36, 8), 'Prev', t.ghost, { behavior: 'widget.step', stepDir: 'prev' }, { stroke: '#fecdd3' }),
    buttonLayer('dk_next', box(236, 312, 100, 36, 9), 'Next card', t.primary, { behavior: 'widget.step', stepDir: 'next' }, { size: 13 })
  ]);
}

/** Four lesson tasks to tick off. */
export function seedEduChecklist(): SeedBundle {
  const t = themes.forest;
  const task = { fill: 'rgba(255,255,255,0.06)', color: t.ink };
  const tasks = ['Watch the 8-minute intro', 'Read chapter 3', 'Try the practice set', 'Post one question'];
  return curatedCardSeed([
    artLayer(
      'lc_art',
      artHtml(
        '#052e16',
        '<div class="r" style="left:24px;top:92px;width:4px;height:236px;border-radius:2px;background:rgba(134,239,172,.25)"></div><div class="s" style="width:200px;height:200px;right:-90px;top:-90px;background:rgba(134,239,172,.12)"></div>'
      )
    ),
    textLayer('lc_kicker', box(24, 22, 240, 20, 2), 'WEEK 3 · CELL BIOLOGY', { size: 11, color: t.accent, bold: true }),
    textLayer('lc_title', box(24, 46, 312, 36, 3), 'Before Friday', { family: 'serif', size: 24, color: t.ink, bold: true }),
    ...tasks.map((face, i) =>
      buttonLayer(`lc_${i + 1}`, box(40, 96 + i * 58, 296, 46, 4 + i), face, task, { behavior: 'widget.toggle', bindRowId: `lc_${i + 1}` }, { size: 13, radius: 12, stroke: 'rgba(134,239,172,0.35)' })
    )
  ]);
}

/** One question, three answers, and a running score. */
export function seedEduCheck(): SeedBundle {
  const t = themes.citrus;
  const answer = { fill: '#ffffff', color: t.ink };
  return curatedCardSeed([
    artLayer(
      'kc_art',
      artHtml(
        '#fef9c3',
        '<div class="r" style="left:0;top:0;width:360px;height:96px;background:#ecfccb"></div><div class="s" style="width:56px;height:56px;right:24px;top:20px;background:#bef264"></div>'
      )
    ),
    textLayer('kc_kicker', box(24, 18, 200, 20, 2), 'QUICK CHECK · CHEMISTRY', { size: 11, color: t.accent, bold: true }),
    scoreLayer('kc_score', box(280, 32, 56, 32, 3), t.ink),
    textLayer('kc_q', box(24, 108, 312, 64, 4), 'What is the chemical symbol for gold?', { family: 'serif', size: 20, color: t.ink, bold: true }),
    buttonLayer('kc_a', box(24, 184, 312, 42, 5), 'Ag', answer, { behavior: 'quiz.answer', bindRowId: 'kc_a' }, { radius: 12, stroke: '#d9f99d' }),
    buttonLayer('kc_b', box(24, 236, 312, 42, 6), 'Au', answer, { behavior: 'quiz.answer', bindRowId: 'kc_b', correct: true }, { radius: 12, stroke: '#d9f99d' }),
    buttonLayer('kc_c', box(24, 288, 312, 42, 7), 'Gd', answer, { behavior: 'quiz.answer', bindRowId: 'kc_c' }, { radius: 12, stroke: '#d9f99d' })
  ]);
}

/** A word with its pronunciation; Reveal shows the meaning and an example. */
export function seedEduVocab(): SeedBundle {
  const t = themes.night;
  return curatedCardSeed([
    artLayer(
      'vc_art',
      artHtml(
        'linear-gradient(160deg,#1e1b4b 0%,#0f172a 70%)',
        '<div class="q">“</div><div class="hint">Guess what it means, then reveal it</div>',
        '.q{position:absolute;right:20px;top:-30px;font:700 200px/1 Georgia,serif;color:rgba(129,140,248,.14)}.hint{position:absolute;left:24px;top:160px;width:312px;height:112px;box-sizing:border-box;border:2px dashed rgba(129,140,248,.35);border-radius:12px;display:flex;align-items:center;justify-content:center;font:600 12px Montserrat,Helvetica,sans-serif;color:rgba(226,232,240,.6)}'
      )
    ),
    textLayer('vc_kicker', box(24, 24, 200, 20, 2), 'WORD OF THE DAY', { size: 11, color: t.accent, bold: true }),
    textLayer('vc_word', box(24, 54, 312, 52, 3), 'Sonder', { family: 'serif', size: 40, color: t.ink, bold: true }),
    textLayer('vc_say', box(24, 110, 312, 40, 4), ['/ˈsɒn.dər/ · noun'], { family: 'mono', size: 13, color: t.muted }),
    panelLayer(
      'vc_meaning',
      box(24, 160, 312, 112, 5),
      '#1e293b',
      ['The sudden sense that every passer-by lives a life as full as your own.', '', '"Stuck in traffic, she felt a wave of sonder."'],
      { size: 13, color: t.ink },
      { visible: false, name: 'Meaning' }
    ),
    buttonLayer('vc_reveal', box(24, 292, 160, 44, 6), 'Reveal meaning', t.primary, { behavior: 'widget.reveal', revealLayerId: 'vc_meaning', revealMode: 'toggle' }, { size: 13 })
  ]);
}
