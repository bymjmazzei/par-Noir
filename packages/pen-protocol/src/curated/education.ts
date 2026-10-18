import type { SeedBundle } from '../starterSeeds.js';
import { artHtml, artLayer, bodyStyle, buttonLayer, curatedCardSeed, kickerStyle, textLayer, titleStyle } from './kit.js';

export function seedEduFlashcard(): SeedBundle {
  const opt = { fill: 'rgba(255,255,255,0.16)', color: '#ffffff' };
  return curatedCardSeed([
    artLayer('w_edu_flashcard_v1_art', artHtml('linear-gradient(165deg,#1c1917 0%,#44403c 40%,#78716c 100%)', '<div class="s" style="width:220px;height:220px;right:-50px;top:-40px;background:rgba(255,255,255,0.15)"></div><div class="s" style="width:90px;height:90px;left:-30px;bottom:-30px;background:rgba(255,255,255,0.1)"></div>'), 360),
    textLayer('w_edu_flashcard_v1_k', { x: 24, y: 12, w: 280, h: 28, z: 2 }, 'EDUCATION', kickerStyle),
    textLayer('w_edu_flashcard_v1_t', { x: 24, y: 44, w: 312, h: 56, z: 3 }, 'Flashcard', titleStyle),
    buttonLayer('w_edu_flashcard_v1_tg', { x: 24, y: 280, w: 160, h: 36, z: 5 }, 'Flip', opt, { behavior: 'widget.reveal', revealLayerId: 'w_edu_flashcard_v1_back', revealMode: 'toggle' }),
    textLayer('w_edu_flashcard_v1_back', { x: 24, y: 324, w: 312, h: 48, z: 6 }, 'Back side text.', bodyStyle, { visible: false })
  ]);
}

export function seedEduDeck(): SeedBundle {
  const opt = { fill: 'rgba(255,255,255,0.16)', color: '#ffffff' };
  return curatedCardSeed([
    artLayer('w_edu_deck_v1_art', artHtml('linear-gradient(155deg,#be123c 0%,#9f1239 50%,#4c0519 100%)', '<div class="s" style="width:240px;height:240px;right:-50px;top:-40px;background:rgba(255,255,255,0.15)"></div><div class="s" style="width:90px;height:90px;left:-30px;bottom:-30px;background:rgba(255,255,255,0.1)"></div>'), 360),
    textLayer('w_edu_deck_v1_k', { x: 24, y: 12, w: 280, h: 28, z: 2 }, 'EDUCATION', kickerStyle),
    textLayer('w_edu_deck_v1_t', { x: 24, y: 44, w: 312, h: 56, z: 3 }, 'Flashcard deck', titleStyle),
    textLayer('w_edu_deck_v1_f0', { x: 24, y: 240, w: 312, h: 36, z: 4 }, 'Step 1', bodyStyle, { stepFrame: 0 }),
    textLayer('w_edu_deck_v1_f1', { x: 24, y: 240, w: 312, h: 36, z: 4 }, 'Step 2', bodyStyle, { stepFrame: 1 }),
    buttonLayer('w_edu_deck_v1_next', { x: 24, y: 280, w: 120, h: 36, z: 5 }, 'Next', opt, { behavior: 'widget.step', stepDir: 'next' })
  ]);
}

export function seedEduChecklist(): SeedBundle {
  const opt = { fill: 'rgba(255,255,255,0.16)', color: '#ffffff' };
  return curatedCardSeed([
    artLayer('w_edu_checklist_v1_art', artHtml('linear-gradient(150deg,#0f766e 0%,#1e3a8a 60%,#312e81 100%)', '<div class="s" style="width:260px;height:260px;right:-50px;top:-40px;background:rgba(255,255,255,0.15)"></div><div class="s" style="width:90px;height:90px;left:-30px;bottom:-30px;background:rgba(255,255,255,0.1)"></div>'), 360),
    textLayer('w_edu_checklist_v1_k', { x: 24, y: 12, w: 280, h: 28, z: 2 }, 'EDUCATION', kickerStyle),
    textLayer('w_edu_checklist_v1_t', { x: 24, y: 44, w: 312, h: 56, z: 3 }, 'Lesson checklist', titleStyle),
    buttonLayer('w_edu_checklist_v1_t1', { x: 24, y: 280, w: 312, h: 36, z: 5 }, 'Task one', opt, { behavior: 'widget.toggle', bindRowId: 'w_edu_checklist_v1_t1' })
  ]);
}

export function seedEduCheck(): SeedBundle {
  const opt = { fill: 'rgba(255,255,255,0.16)', color: '#ffffff' };
  return curatedCardSeed([
    artLayer('w_edu_check_v1_art', artHtml('linear-gradient(160deg,#f97316 0%,#db2777 70%,#9d174d 100%)', '<div class="s" style="width:180px;height:180px;right:-50px;top:-40px;background:rgba(255,255,255,0.15)"></div><div class="s" style="width:90px;height:90px;left:-30px;bottom:-30px;background:rgba(255,255,255,0.1)"></div>'), 360),
    textLayer('w_edu_check_v1_k', { x: 24, y: 12, w: 280, h: 28, z: 2 }, 'EDUCATION', kickerStyle),
    textLayer('w_edu_check_v1_t', { x: 24, y: 44, w: 312, h: 56, z: 3 }, 'Knowledge check', titleStyle),
    buttonLayer('w_edu_check_v1_ans', { x: 24, y: 280, w: 312, h: 36, z: 5 }, 'Answer', opt, { behavior: 'quiz.answer', correct: true }),
    { id: 'w_edu_check_v1_score', kind: 'text' as const, widgetElement: 'score' as const, name: 'Score', x: 24, y: 324, w: 120, h: 32, zIndex: 6, positionLocked: false, backgroundColor: 'transparent', textColor: '#fff' }
  ]);
}

export function seedEduVocab(): SeedBundle {
  const opt = { fill: 'rgba(255,255,255,0.16)', color: '#ffffff' };
  return curatedCardSeed([
    artLayer('w_edu_vocab_v1_art', artHtml('radial-gradient(circle at 30% 20%,#4c1d95 0%,#111827 70%)', '<div class="s" style="width:200px;height:200px;right:-50px;top:-40px;background:rgba(255,255,255,0.15)"></div><div class="s" style="width:90px;height:90px;left:-30px;bottom:-30px;background:rgba(255,255,255,0.1)"></div>'), 360),
    textLayer('w_edu_vocab_v1_k', { x: 24, y: 12, w: 280, h: 28, z: 2 }, 'EDUCATION', kickerStyle),
    textLayer('w_edu_vocab_v1_t', { x: 24, y: 44, w: 312, h: 56, z: 3 }, 'Vocabulary card', titleStyle),
    buttonLayer('w_edu_vocab_v1_rv', { x: 24, y: 280, w: 140, h: 36, z: 5 }, 'Show', opt, { behavior: 'widget.reveal', revealLayerId: 'w_edu_vocab_v1_body', revealMode: 'show' }),
    textLayer('w_edu_vocab_v1_body', { x: 24, y: 324, w: 312, h: 48, z: 6 }, 'More detail lives here.', bodyStyle, { visible: false })
  ]);
}
