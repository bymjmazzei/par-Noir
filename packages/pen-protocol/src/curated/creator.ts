import type { SeedBundle } from '../starterSeeds.js';
import { artHtml, artLayer, bodyStyle, buttonLayer, curatedCardSeed, kickerStyle, textLayer, titleStyle } from './kit.js';

export function seedCreatorProduct(): SeedBundle {
  return curatedCardSeed([
    artLayer('w_creator_product_v1_art', artHtml('linear-gradient(120deg,#14532d 0%,#166534 50%,#052e16 100%)', '<div class="s" style="width:180px;height:180px;right:-50px;top:-40px;background:rgba(255,255,255,0.15)"></div><div class="s" style="width:90px;height:90px;left:-30px;bottom:-30px;background:rgba(255,255,255,0.1)"></div>'), 360),
    textLayer('w_creator_product_v1_k', { x: 24, y: 12, w: 280, h: 28, z: 2 }, 'CREATOR', kickerStyle),
    textLayer('w_creator_product_v1_t', { x: 24, y: 44, w: 312, h: 56, z: 3 }, 'Product card', titleStyle),
    buttonLayer('w_creator_product_v1_go', { x: 24, y: 280, w: 200, h: 40, z: 5 }, 'Open', { fill: '#111827', color: '#fff' }, { behavior: 'cta.open', openUrl: 'https://parnoir.com' })
  ]);
}

export function seedCreatorTipjar(): SeedBundle {
  const opt = { fill: 'rgba(255,255,255,0.16)', color: '#ffffff' };
  return curatedCardSeed([
    artLayer('w_creator_tipjar_v1_art', artHtml('linear-gradient(165deg,#1c1917 0%,#44403c 40%,#78716c 100%)', '<div class="s" style="width:200px;height:200px;right:-50px;top:-40px;background:rgba(255,255,255,0.15)"></div><div class="s" style="width:90px;height:90px;left:-30px;bottom:-30px;background:rgba(255,255,255,0.1)"></div>'), 360),
    textLayer('w_creator_tipjar_v1_k', { x: 24, y: 12, w: 280, h: 28, z: 2 }, 'CREATOR', kickerStyle),
    textLayer('w_creator_tipjar_v1_t', { x: 24, y: 44, w: 312, h: 56, z: 3 }, 'Tip jar', titleStyle),
    buttonLayer('w_creator_tipjar_v1_rv', { x: 24, y: 280, w: 140, h: 36, z: 5 }, 'Show', opt, { behavior: 'widget.reveal', revealLayerId: 'w_creator_tipjar_v1_body', revealMode: 'show' }),
    textLayer('w_creator_tipjar_v1_body', { x: 24, y: 324, w: 312, h: 48, z: 6 }, 'More detail lives here.', bodyStyle, { visible: false })
  ]);
}

export function seedCreatorPortfolio(): SeedBundle {
  return curatedCardSeed([
    artLayer('w_creator_portfolio_v1_art', artHtml('linear-gradient(155deg,#be123c 0%,#9f1239 50%,#4c0519 100%)', '<div class="s" style="width:220px;height:220px;right:-50px;top:-40px;background:rgba(255,255,255,0.15)"></div><div class="s" style="width:90px;height:90px;left:-30px;bottom:-30px;background:rgba(255,255,255,0.1)"></div>'), 360),
    textLayer('w_creator_portfolio_v1_k', { x: 24, y: 12, w: 280, h: 28, z: 2 }, 'CREATOR', kickerStyle),
    textLayer('w_creator_portfolio_v1_t', { x: 24, y: 44, w: 312, h: 56, z: 3 }, 'Portfolio piece', titleStyle),
    buttonLayer('w_creator_portfolio_v1_go', { x: 24, y: 280, w: 200, h: 40, z: 5 }, 'Open', { fill: '#111827', color: '#fff' }, { behavior: 'cta.open', openUrl: 'https://parnoir.com' })
  ]);
}
