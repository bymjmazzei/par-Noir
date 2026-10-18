import type { SeedBundle } from '../starterSeeds.js';
import { artHtml, artLayer, bodyStyle, buttonLayer, countdownLayer, curatedCardSeed, kickerStyle, textLayer, titleStyle } from './kit.js';

export function seedCommunityFeatures(): SeedBundle {
  const opt = { fill: 'rgba(255,255,255,0.16)', color: '#ffffff' };
  return curatedCardSeed([
    artLayer('w_community_features_v1_art', artHtml('linear-gradient(160deg,#f97316 0%,#db2777 70%,#9d174d 100%)', '<div class="s" style="width:240px;height:240px;right:-50px;top:-40px;background:rgba(255,255,255,0.15)"></div><div class="s" style="width:90px;height:90px;left:-30px;bottom:-30px;background:rgba(255,255,255,0.1)"></div>'), 360),
    textLayer('w_community_features_v1_k', { x: 24, y: 12, w: 280, h: 28, z: 2 }, 'COMMUNITY', kickerStyle),
    textLayer('w_community_features_v1_t', { x: 24, y: 44, w: 312, h: 56, z: 3 }, 'Feature board', titleStyle),
    buttonLayer('w_community_features_v1_r1', { x: 24, y: 280, w: 312, h: 36, z: 5 }, 'Idea A', opt, { behavior: 'widget.rank', bindRowId: 'w_community_features_v1_r1' })
  ]);
}

export function seedCommunityGuestbook(): SeedBundle {
  const opt = { fill: 'rgba(255,255,255,0.16)', color: '#ffffff' };
  return curatedCardSeed([
    artLayer('w_community_guestbook_v1_art', artHtml('radial-gradient(circle at 30% 20%,#4c1d95 0%,#111827 70%)', '<div class="s" style="width:260px;height:260px;right:-50px;top:-40px;background:rgba(255,255,255,0.15)"></div><div class="s" style="width:90px;height:90px;left:-30px;bottom:-30px;background:rgba(255,255,255,0.1)"></div>'), 360),
    textLayer('w_community_guestbook_v1_k', { x: 24, y: 12, w: 280, h: 28, z: 2 }, 'COMMUNITY', kickerStyle),
    textLayer('w_community_guestbook_v1_t', { x: 24, y: 44, w: 312, h: 56, z: 3 }, 'Guestbook', titleStyle),
    buttonLayer('w_community_guestbook_v1_st', { x: 24, y: 280, w: 160, h: 40, z: 5 }, 'Check in', { fill: '#34d399', color: '#111' }, { behavior: 'widget.stamp' })
  ]);
}

export function seedCommunityChallenge(): SeedBundle {
  const opt = { fill: 'rgba(255,255,255,0.16)', color: '#ffffff' };
  return curatedCardSeed([
    artLayer('w_community_challenge_v1_art', artHtml('linear-gradient(135deg,#fef3c7 0%,#fde68a 45%,#f59e0b 100%)', '<div class="s" style="width:180px;height:180px;right:-50px;top:-40px;background:rgba(255,255,255,0.15)"></div><div class="s" style="width:90px;height:90px;left:-30px;bottom:-30px;background:rgba(255,255,255,0.1)"></div>'), 360),
    textLayer('w_community_challenge_v1_k', { x: 24, y: 12, w: 280, h: 28, z: 2 }, 'COMMUNITY', kickerStyle),
    textLayer('w_community_challenge_v1_t', { x: 24, y: 44, w: 312, h: 56, z: 3 }, 'Challenge tracker', titleStyle),
    buttonLayer('w_community_challenge_v1_t1', { x: 24, y: 280, w: 312, h: 36, z: 5 }, 'Task one', opt, { behavior: 'widget.toggle', bindRowId: 'w_community_challenge_v1_t1' })
  ]);
}

export function seedCommunityReactions(): SeedBundle {
  const opt = { fill: 'rgba(255,255,255,0.16)', color: '#ffffff' };
  return curatedCardSeed([
    artLayer('w_community_reactions_v1_art', artHtml('linear-gradient(145deg,#0ea5e9 0%,#6366f1 55%,#312e81 100%)', '<div class="s" style="width:200px;height:200px;right:-50px;top:-40px;background:rgba(255,255,255,0.15)"></div><div class="s" style="width:90px;height:90px;left:-30px;bottom:-30px;background:rgba(255,255,255,0.1)"></div>'), 360),
    textLayer('w_community_reactions_v1_k', { x: 24, y: 12, w: 280, h: 28, z: 2 }, 'COMMUNITY', kickerStyle),
    textLayer('w_community_reactions_v1_t', { x: 24, y: 44, w: 312, h: 56, z: 3 }, 'Reaction bar', titleStyle),
    buttonLayer('w_community_reactions_v1_a', { x: 24, y: 280, w: 312, h: 36, z: 5 }, 'Option A', opt, { behavior: 'poll.vote', bindRowId: 'w_community_reactions_v1_a' }),
    buttonLayer('w_community_reactions_v1_b', { x: 24, y: 324, w: 312, h: 36, z: 6 }, 'Option B', opt, { behavior: 'poll.vote', bindRowId: 'w_community_reactions_v1_b' })
  ]);
}

export function seedCommunityAma(): SeedBundle {
  const opt = { fill: 'rgba(255,255,255,0.16)', color: '#ffffff' };
  return curatedCardSeed([
    artLayer('w_community_ama_v1_art', artHtml('linear-gradient(120deg,#14532d 0%,#166534 50%,#052e16 100%)', '<div class="s" style="width:220px;height:220px;right:-50px;top:-40px;background:rgba(255,255,255,0.15)"></div><div class="s" style="width:90px;height:90px;left:-30px;bottom:-30px;background:rgba(255,255,255,0.1)"></div>'), 360),
    textLayer('w_community_ama_v1_k', { x: 24, y: 12, w: 280, h: 28, z: 2 }, 'COMMUNITY', kickerStyle),
    textLayer('w_community_ama_v1_t', { x: 24, y: 44, w: 312, h: 56, z: 3 }, 'AMA box', titleStyle),
    { id: 'w_community_ama_v1_in', kind: 'text', widgetElement: 'input', name: 'Field', label: 'Your reply…', x: 24, y: 280, w: 312, h: 36, zIndex: 5, positionLocked: false, backgroundColor: '#fff', textColor: '#111', cornerRadius: 8 },
    buttonLayer('w_community_ama_v1_send', { x: 24, y: 324, w: 120, h: 36, z: 6 }, 'Send', { fill: '#0f766e', color: '#fff' }, { behavior: 'widget.submit' })
  ]);
}
