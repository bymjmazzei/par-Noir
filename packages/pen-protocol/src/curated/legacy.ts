/** Hand-authored starters (richer than generated defaults). */
import type { SeedBundle } from '../starterSeeds.js';
import { artHtml, artLayer, buttonLayer, countdownLayer, curatedCardSeed, CURATED_SANS, CURATED_SERIF, textLayer } from './kit.js';

export function seedPollWriteInWidget(): SeedBundle {
  const option = { fill: 'rgba(255,255,255,0.16)', color: '#ffffff' };
  return curatedCardSeed([
    artLayer('pw_art', artHtml('linear-gradient(150deg,#0f766e 0%,#1e3a8a 60%,#312e81 100%)', '<div class="s" style="width:220px;height:220px;right:-60px;top:-70px;background:rgba(253,230,138,0.25)"></div>')),
    textLayer('pw_kicker', { x: 24, y: 12, w: 200, h: 32, z: 2 }, 'COMMUNITY POLL', { fontFamily: CURATED_SANS, fontSize: 11, color: '#fde68a', bold: true }),
    textLayer('pw_question', { x: 24, y: 42, w: 312, h: 56, z: 3 }, 'What should we build next?', { fontFamily: CURATED_SERIF, fontSize: 24, color: '#ffffff', bold: true }, { name: 'Question' }),
    countdownLayer('pw_time', { x: 22, y: 100, w: 90, h: 20, z: 4 }, '#fde68a', 2),
    buttonLayer('pw_opt_a', { x: 24, y: 130, w: 312, h: 36, z: 5 }, 'Live audio rooms', option, { behavior: 'poll.vote', bindRowId: 'pw_opt_a' }),
    buttonLayer('pw_opt_b', { x: 24, y: 174, w: 312, h: 36, z: 6 }, 'Shared notebooks', option, { behavior: 'poll.vote', bindRowId: 'pw_opt_b' }),
    buttonLayer('pw_opt_c', { x: 24, y: 218, w: 312, h: 36, z: 7 }, 'Offline mode', option, { behavior: 'poll.vote', bindRowId: 'pw_opt_c' }),
    { id: 'pw_writein_field', kind: 'text', widgetElement: 'input', name: 'Write-in', label: 'Something else…', x: 24, y: 268, w: 216, h: 36, zIndex: 8, positionLocked: false, backgroundColor: '#ffffff', textColor: '#141414', cornerRadius: 18 },
    buttonLayer('pw_writein', { x: 248, y: 268, w: 88, h: 36, z: 9 }, 'Vote', { fill: '#fde68a', color: '#1e1b4b' }, { behavior: 'poll.vote', bindRowId: 'pw_writein', writeIn: true, label: 'Other', name: 'Other' })
  ]);
}

export function seedQuizWidget(): SeedBundle {
  const answer = { fill: '#ffffff', color: '#7c2d12' };
  return curatedCardSeed([
    artLayer('qz_art', artHtml('linear-gradient(160deg,#f97316 0%,#db2777 70%,#9d174d 100%)', '<div class="s" style="width:180px;height:180px;right:-50px;bottom:-40px;background:rgba(255,255,255,0.18)"></div>')),
    textLayer('qz_kicker', { x: 24, y: 12, w: 200, h: 32, z: 2 }, 'QUICK QUIZ', { fontFamily: CURATED_SANS, fontSize: 11, color: '#ffedd5', bold: true }),
    textLayer('qz_question', { x: 24, y: 42, w: 260, h: 64, z: 3 }, 'Which planet has the most moons?', { fontFamily: CURATED_SERIF, fontSize: 24, color: '#ffffff', bold: true }, { name: 'Question' }),
    buttonLayer('qz_a', { x: 24, y: 120, w: 312, h: 36, z: 4 }, 'Jupiter', answer, { behavior: 'quiz.answer', bindRowId: 'qz_a' }),
    buttonLayer('qz_b', { x: 24, y: 164, w: 312, h: 36, z: 5 }, 'Saturn', answer, { behavior: 'quiz.answer', bindRowId: 'qz_b', correct: true }),
    buttonLayer('qz_c', { x: 24, y: 208, w: 312, h: 36, z: 6 }, 'Neptune', answer, { behavior: 'quiz.answer', bindRowId: 'qz_c' }),
    buttonLayer('qz_reveal', { x: 24, y: 260, w: 140, h: 32, z: 7 }, 'Show answer', { fill: 'rgba(0,0,0,0.25)', color: '#ffffff' }, { behavior: 'widget.reveal', revealLayerId: 'qz_answer' }),
    textLayer('qz_answer', { x: 24, y: 300, w: 312, h: 44, z: 8 }, 'Saturn. It has 146 confirmed moons.', { fontFamily: CURATED_SANS, fontSize: 14, color: '#ffffff', bold: true }, { visible: false })
  ]);
}

export function seedRsvpWidget(): SeedBundle {
  const pick = { fill: 'rgba(255,255,255,0.14)', color: '#ffffff' };
  return curatedCardSeed([
    artLayer('rv_art', artHtml('radial-gradient(circle at 30% 20%,#4c1d95 0%,#111827 70%)', '<div class="s" style="width:200px;height:200px;left:-80px;bottom:-90px;background:rgba(244,114,182,0.2)"></div>')),
    textLayer('rv_kicker', { x: 24, y: 16, w: 200, h: 32, z: 2 }, "YOU'RE INVITED", { fontFamily: CURATED_SANS, fontSize: 11, color: '#f9a8d4', bold: true }),
    textLayer('rv_title', { x: 24, y: 48, w: 312, h: 72, z: 3 }, 'Rooftop launch party', { fontFamily: CURATED_SERIF, fontSize: 30, color: '#ffffff', bold: true }, { name: 'Question' }),
    countdownLayer('rv_time', { x: 22, y: 192, w: 90, h: 28, z: 6 }, '#fde68a', 2),
    buttonLayer('rv_going', { x: 24, y: 280, w: 100, h: 40, z: 7 }, 'Going', { fill: '#f472b6', color: '#111827' }, { behavior: 'poll.vote', bindRowId: 'rv_going' }),
    buttonLayer('rv_maybe', { x: 130, y: 280, w: 100, h: 40, z: 8 }, 'Maybe', pick, { behavior: 'poll.vote', bindRowId: 'rv_maybe' }),
    buttonLayer('rv_no', { x: 236, y: 280, w: 100, h: 40, z: 9 }, "Can't go", pick, { behavior: 'poll.vote', bindRowId: 'rv_no' })
  ]);
}

export function seedLinkCardWidget(): SeedBundle {
  return curatedCardSeed([
    artLayer('lk_art', artHtml('linear-gradient(135deg,#fef3c7 0%,#fde68a 45%,#f59e0b 100%)', '<div class="s" style="width:260px;height:260px;right:-90px;top:-90px;background:rgba(255,255,255,0.45)"></div>')),
    textLayer('lk_kicker', { x: 24, y: 16, w: 200, h: 32, z: 2 }, 'NEW ON THE BLOG', { fontFamily: CURATED_SANS, fontSize: 11, color: '#92400e', bold: true }),
    textLayer('lk_title', { x: 24, y: 120, w: 312, h: 88, z: 3 }, 'How we built a calmer feed', { fontFamily: CURATED_SERIF, fontSize: 30, color: '#111827', bold: true }),
    buttonLayer('lk_open', { x: 24, y: 288, w: 160, h: 44, z: 5 }, 'Read the story', { fill: '#111827', color: '#ffffff' }, { behavior: 'cta.open', openUrl: 'https://parnoir.com' })
  ]);
}
