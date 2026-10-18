import type { SeedBundle } from '../starterSeeds.js';
import { artHtml, artLayer, bodyStyle, buttonLayer, countdownLayer, curatedCardSeed, kickerStyle, textLayer, titleStyle } from './kit.js';

export function seedPollQuick(): SeedBundle {
  const opt = { fill: 'rgba(255,255,255,0.16)', color: '#ffffff' };
  return curatedCardSeed([
    artLayer('w_poll_quick_v1_art', artHtml('linear-gradient(150deg,#0f766e 0%,#1e3a8a 60%,#312e81 100%)', '<div class="s" style="width:180px;height:180px;right:-50px;top:-40px;background:rgba(255,255,255,0.15)"></div><div class="s" style="width:90px;height:90px;left:-30px;bottom:-30px;background:rgba(255,255,255,0.1)"></div>'), 360),
    textLayer('w_poll_quick_v1_k', { x: 24, y: 12, w: 280, h: 28, z: 2 }, 'POLLS', kickerStyle),
    textLayer('w_poll_quick_v1_t', { x: 24, y: 44, w: 312, h: 56, z: 3 }, 'Quick poll', titleStyle),
    buttonLayer('w_poll_quick_v1_a', { x: 24, y: 280, w: 312, h: 36, z: 5 }, 'Option A', opt, { behavior: 'poll.vote', bindRowId: 'w_poll_quick_v1_a' }),
    buttonLayer('w_poll_quick_v1_b', { x: 24, y: 324, w: 312, h: 36, z: 6 }, 'Option B', opt, { behavior: 'poll.vote', bindRowId: 'w_poll_quick_v1_b' })
  ]);
}

export function seedPollThisorthat(): SeedBundle {
  const opt = { fill: 'rgba(255,255,255,0.16)', color: '#ffffff' };
  return curatedCardSeed([
    artLayer('w_poll_thisorthat_v1_art', artHtml('radial-gradient(circle at 30% 20%,#4c1d95 0%,#111827 70%)', '<div class="s" style="width:220px;height:220px;right:-50px;top:-40px;background:rgba(255,255,255,0.15)"></div><div class="s" style="width:90px;height:90px;left:-30px;bottom:-30px;background:rgba(255,255,255,0.1)"></div>'), 360),
    textLayer('w_poll_thisorthat_v1_k', { x: 24, y: 12, w: 280, h: 28, z: 2 }, 'POLLS', kickerStyle),
    textLayer('w_poll_thisorthat_v1_t', { x: 24, y: 44, w: 312, h: 56, z: 3 }, 'This or that', titleStyle),
    buttonLayer('w_poll_thisorthat_v1_a', { x: 24, y: 280, w: 312, h: 36, z: 5 }, 'Option A', opt, { behavior: 'poll.vote', bindRowId: 'w_poll_thisorthat_v1_a' }),
    buttonLayer('w_poll_thisorthat_v1_b', { x: 24, y: 324, w: 312, h: 36, z: 6 }, 'Option B', opt, { behavior: 'poll.vote', bindRowId: 'w_poll_thisorthat_v1_b' })
  ]);
}

export function seedPollRating(): SeedBundle {
  const opt = { fill: 'rgba(255,255,255,0.16)', color: '#ffffff' };
  return curatedCardSeed([
    artLayer('w_poll_rating_v1_art', artHtml('linear-gradient(135deg,#fef3c7 0%,#fde68a 45%,#f59e0b 100%)', '<div class="s" style="width:240px;height:240px;right:-50px;top:-40px;background:rgba(255,255,255,0.15)"></div><div class="s" style="width:90px;height:90px;left:-30px;bottom:-30px;background:rgba(255,255,255,0.1)"></div>'), 360),
    textLayer('w_poll_rating_v1_k', { x: 24, y: 12, w: 280, h: 28, z: 2 }, 'POLLS', kickerStyle),
    textLayer('w_poll_rating_v1_t', { x: 24, y: 44, w: 312, h: 56, z: 3 }, 'Rating scale', titleStyle),
    buttonLayer('w_poll_rating_v1_a', { x: 24, y: 280, w: 312, h: 36, z: 5 }, 'Option A', opt, { behavior: 'poll.vote', bindRowId: 'w_poll_rating_v1_a' }),
    buttonLayer('w_poll_rating_v1_b', { x: 24, y: 324, w: 312, h: 36, z: 6 }, 'Option B', opt, { behavior: 'poll.vote', bindRowId: 'w_poll_rating_v1_b' })
  ]);
}

export function seedPollHottake(): SeedBundle {
  const opt = { fill: 'rgba(255,255,255,0.16)', color: '#ffffff' };
  return curatedCardSeed([
    artLayer('w_poll_hottake_v1_art', artHtml('linear-gradient(145deg,#0ea5e9 0%,#6366f1 55%,#312e81 100%)', '<div class="s" style="width:260px;height:260px;right:-50px;top:-40px;background:rgba(255,255,255,0.15)"></div><div class="s" style="width:90px;height:90px;left:-30px;bottom:-30px;background:rgba(255,255,255,0.1)"></div>'), 360),
    textLayer('w_poll_hottake_v1_k', { x: 24, y: 12, w: 280, h: 28, z: 2 }, 'POLLS', kickerStyle),
    textLayer('w_poll_hottake_v1_t', { x: 24, y: 44, w: 312, h: 56, z: 3 }, 'Hot take meter', titleStyle),
    buttonLayer('w_poll_hottake_v1_a', { x: 24, y: 280, w: 312, h: 36, z: 5 }, 'Option A', opt, { behavior: 'poll.vote', bindRowId: 'w_poll_hottake_v1_a' }),
    buttonLayer('w_poll_hottake_v1_b', { x: 24, y: 324, w: 312, h: 36, z: 6 }, 'Option B', opt, { behavior: 'poll.vote', bindRowId: 'w_poll_hottake_v1_b' })
  ]);
}

export function seedPollHidden(): SeedBundle {
  const opt = { fill: 'rgba(255,255,255,0.16)', color: '#ffffff' };
  return curatedCardSeed([
    artLayer('w_poll_hidden_v1_art', artHtml('linear-gradient(120deg,#14532d 0%,#166534 50%,#052e16 100%)', '<div class="s" style="width:180px;height:180px;right:-50px;top:-40px;background:rgba(255,255,255,0.15)"></div><div class="s" style="width:90px;height:90px;left:-30px;bottom:-30px;background:rgba(255,255,255,0.1)"></div>'), 360),
    textLayer('w_poll_hidden_v1_k', { x: 24, y: 12, w: 280, h: 28, z: 2 }, 'POLLS', kickerStyle),
    textLayer('w_poll_hidden_v1_t', { x: 24, y: 44, w: 312, h: 56, z: 3 }, 'Hidden result poll', titleStyle),
    buttonLayer('w_poll_hidden_v1_rv', { x: 24, y: 280, w: 140, h: 36, z: 5 }, 'Show', opt, { behavior: 'widget.reveal', revealLayerId: 'w_poll_hidden_v1_body', revealMode: 'show' }),
    textLayer('w_poll_hidden_v1_body', { x: 24, y: 324, w: 312, h: 48, z: 6 }, 'More detail lives here.', bodyStyle, { visible: false })
  ]);
}

export function seedPollRank(): SeedBundle {
  const opt = { fill: 'rgba(255,255,255,0.16)', color: '#ffffff' };
  return curatedCardSeed([
    artLayer('w_poll_rank_v1_art', artHtml('linear-gradient(165deg,#1c1917 0%,#44403c 40%,#78716c 100%)', '<div class="s" style="width:200px;height:200px;right:-50px;top:-40px;background:rgba(255,255,255,0.15)"></div><div class="s" style="width:90px;height:90px;left:-30px;bottom:-30px;background:rgba(255,255,255,0.1)"></div>'), 360),
    textLayer('w_poll_rank_v1_k', { x: 24, y: 12, w: 280, h: 28, z: 2 }, 'POLLS', kickerStyle),
    textLayer('w_poll_rank_v1_t', { x: 24, y: 44, w: 312, h: 56, z: 3 }, 'Rank favorites', titleStyle),
    buttonLayer('w_poll_rank_v1_r1', { x: 24, y: 280, w: 312, h: 36, z: 5 }, 'Idea A', opt, { behavior: 'widget.rank', bindRowId: 'w_poll_rank_v1_r1' })
  ]);
}

export function seedPollBudget(): SeedBundle {
  const opt = { fill: 'rgba(255,255,255,0.16)', color: '#ffffff' };
  return curatedCardSeed([
    artLayer('w_poll_budget_v1_art', artHtml('linear-gradient(155deg,#be123c 0%,#9f1239 50%,#4c0519 100%)', '<div class="s" style="width:220px;height:220px;right:-50px;top:-40px;background:rgba(255,255,255,0.15)"></div><div class="s" style="width:90px;height:90px;left:-30px;bottom:-30px;background:rgba(255,255,255,0.1)"></div>'), 360),
    textLayer('w_poll_budget_v1_k', { x: 24, y: 12, w: 280, h: 28, z: 2 }, 'POLLS', kickerStyle),
    textLayer('w_poll_budget_v1_t', { x: 24, y: 44, w: 312, h: 56, z: 3 }, 'Budget split', titleStyle),
    buttonLayer('w_poll_budget_v1_al', { x: 24, y: 280, w: 312, h: 36, z: 5 }, 'Bucket A', opt, { behavior: 'widget.allocate', bindRowId: 'w_poll_budget_v1_al' })
  ]);
}
