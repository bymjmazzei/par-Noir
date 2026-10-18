import type { SeedBundle } from '../starterSeeds.js';
import { artHtml, artLayer, bodyStyle, buttonLayer, curatedCardSeed, kickerStyle, textLayer, titleStyle } from './kit.js';

export function seedQuizTruefalse(): SeedBundle {
  const opt = { fill: 'rgba(255,255,255,0.16)', color: '#ffffff' };
  return curatedCardSeed([
    artLayer('w_quiz_truefalse_v1_art', artHtml('linear-gradient(160deg,#f97316 0%,#db2777 70%,#9d174d 100%)', '<div class="s" style="width:260px;height:260px;right:-50px;top:-40px;background:rgba(255,255,255,0.15)"></div><div class="s" style="width:90px;height:90px;left:-30px;bottom:-30px;background:rgba(255,255,255,0.1)"></div>'), 360),
    textLayer('w_quiz_truefalse_v1_k', { x: 24, y: 12, w: 280, h: 28, z: 2 }, 'QUIZZES', kickerStyle),
    textLayer('w_quiz_truefalse_v1_t', { x: 24, y: 44, w: 312, h: 56, z: 3 }, 'True or false', titleStyle),
    buttonLayer('w_quiz_truefalse_v1_a', { x: 24, y: 280, w: 312, h: 36, z: 5 }, 'Option A', opt, { behavior: 'poll.vote', bindRowId: 'w_quiz_truefalse_v1_a' }),
    buttonLayer('w_quiz_truefalse_v1_b', { x: 24, y: 324, w: 312, h: 36, z: 6 }, 'Option B', opt, { behavior: 'poll.vote', bindRowId: 'w_quiz_truefalse_v1_b' })
  ]);
}

export function seedQuizImage(): SeedBundle {
  const opt = { fill: 'rgba(255,255,255,0.16)', color: '#ffffff' };
  return curatedCardSeed([
    artLayer('w_quiz_image_v1_art', artHtml('radial-gradient(circle at 30% 20%,#4c1d95 0%,#111827 70%)', '<div class="s" style="width:180px;height:180px;right:-50px;top:-40px;background:rgba(255,255,255,0.15)"></div><div class="s" style="width:90px;height:90px;left:-30px;bottom:-30px;background:rgba(255,255,255,0.1)"></div>'), 360),
    textLayer('w_quiz_image_v1_k', { x: 24, y: 12, w: 280, h: 28, z: 2 }, 'QUIZZES', kickerStyle),
    textLayer('w_quiz_image_v1_t', { x: 24, y: 44, w: 312, h: 56, z: 3 }, 'Guess the image', titleStyle),
    buttonLayer('w_quiz_image_v1_rv', { x: 24, y: 280, w: 140, h: 36, z: 5 }, 'Show', opt, { behavior: 'widget.reveal', revealLayerId: 'w_quiz_image_v1_body', revealMode: 'show' }),
    textLayer('w_quiz_image_v1_body', { x: 24, y: 324, w: 312, h: 48, z: 6 }, 'More detail lives here.', bodyStyle, { visible: false })
  ]);
}

export function seedQuizRiddle(): SeedBundle {
  const opt = { fill: 'rgba(255,255,255,0.16)', color: '#ffffff' };
  return curatedCardSeed([
    artLayer('w_quiz_riddle_v1_art', artHtml('linear-gradient(135deg,#fef3c7 0%,#fde68a 45%,#f59e0b 100%)', '<div class="s" style="width:200px;height:200px;right:-50px;top:-40px;background:rgba(255,255,255,0.15)"></div><div class="s" style="width:90px;height:90px;left:-30px;bottom:-30px;background:rgba(255,255,255,0.1)"></div>'), 360),
    textLayer('w_quiz_riddle_v1_k', { x: 24, y: 12, w: 280, h: 28, z: 2 }, 'QUIZZES', kickerStyle),
    textLayer('w_quiz_riddle_v1_t', { x: 24, y: 44, w: 312, h: 56, z: 3 }, 'Riddle of the day', titleStyle),
    buttonLayer('w_quiz_riddle_v1_rv', { x: 24, y: 280, w: 140, h: 36, z: 5 }, 'Show', opt, { behavior: 'widget.reveal', revealLayerId: 'w_quiz_riddle_v1_body', revealMode: 'show' }),
    textLayer('w_quiz_riddle_v1_body', { x: 24, y: 324, w: 312, h: 48, z: 6 }, 'More detail lives here.', bodyStyle, { visible: false })
  ]);
}

export function seedQuizPersonality(): SeedBundle {
  const opt = { fill: 'rgba(255,255,255,0.16)', color: '#ffffff' };
  return curatedCardSeed([
    artLayer('w_quiz_personality_v1_art', artHtml('linear-gradient(145deg,#0ea5e9 0%,#6366f1 55%,#312e81 100%)', '<div class="s" style="width:220px;height:220px;right:-50px;top:-40px;background:rgba(255,255,255,0.15)"></div><div class="s" style="width:90px;height:90px;left:-30px;bottom:-30px;background:rgba(255,255,255,0.1)"></div>'), 360),
    textLayer('w_quiz_personality_v1_k', { x: 24, y: 12, w: 280, h: 28, z: 2 }, 'QUIZZES', kickerStyle),
    textLayer('w_quiz_personality_v1_t', { x: 24, y: 44, w: 312, h: 56, z: 3 }, 'Personality pick', titleStyle),
    buttonLayer('w_quiz_personality_v1_a', { x: 24, y: 280, w: 312, h: 36, z: 5 }, 'Option A', opt, { behavior: 'poll.vote', bindRowId: 'w_quiz_personality_v1_a' }),
    buttonLayer('w_quiz_personality_v1_b', { x: 24, y: 324, w: 312, h: 36, z: 6 }, 'Option B', opt, { behavior: 'poll.vote', bindRowId: 'w_quiz_personality_v1_b' })
  ]);
}

export function seedQuizMulti(): SeedBundle {
  const opt = { fill: 'rgba(255,255,255,0.16)', color: '#ffffff' };
  return curatedCardSeed([
    artLayer('w_quiz_multi_v1_art', artHtml('linear-gradient(120deg,#14532d 0%,#166534 50%,#052e16 100%)', '<div class="s" style="width:240px;height:240px;right:-50px;top:-40px;background:rgba(255,255,255,0.15)"></div><div class="s" style="width:90px;height:90px;left:-30px;bottom:-30px;background:rgba(255,255,255,0.1)"></div>'), 360),
    textLayer('w_quiz_multi_v1_k', { x: 24, y: 12, w: 280, h: 28, z: 2 }, 'QUIZZES', kickerStyle),
    textLayer('w_quiz_multi_v1_t', { x: 24, y: 44, w: 312, h: 56, z: 3 }, 'Multi-question quiz', titleStyle),
    buttonLayer('w_quiz_multi_v1_ans', { x: 24, y: 280, w: 312, h: 36, z: 5 }, 'Answer', opt, { behavior: 'quiz.answer', correct: true }),
    { id: 'w_quiz_multi_v1_score', kind: 'text' as const, widgetElement: 'score' as const, name: 'Score', x: 24, y: 324, w: 120, h: 32, zIndex: 6, positionLocked: false, backgroundColor: 'transparent', textColor: '#fff' }
  ]);
}

export function seedQuizUncover(): SeedBundle {
  const opt = { fill: 'rgba(255,255,255,0.16)', color: '#ffffff' };
  return curatedCardSeed([
    artLayer('w_quiz_uncover_v1_art', artHtml('linear-gradient(165deg,#1c1917 0%,#44403c 40%,#78716c 100%)', '<div class="s" style="width:260px;height:260px;right:-50px;top:-40px;background:rgba(255,255,255,0.15)"></div><div class="s" style="width:90px;height:90px;left:-30px;bottom:-30px;background:rgba(255,255,255,0.1)"></div>'), 360),
    textLayer('w_quiz_uncover_v1_k', { x: 24, y: 12, w: 280, h: 28, z: 2 }, 'QUIZZES', kickerStyle),
    textLayer('w_quiz_uncover_v1_t', { x: 24, y: 44, w: 312, h: 56, z: 3 }, 'Tap to uncover', titleStyle),
    buttonLayer('w_quiz_uncover_v1_tg', { x: 24, y: 280, w: 160, h: 36, z: 5 }, 'Flip', opt, { behavior: 'widget.reveal', revealLayerId: 'w_quiz_uncover_v1_back', revealMode: 'toggle' }),
    textLayer('w_quiz_uncover_v1_back', { x: 24, y: 324, w: 312, h: 48, z: 6 }, 'Back side text.', bodyStyle, { visible: false })
  ]);
}
