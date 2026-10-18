import type { SeedBundle } from '../starterSeeds.js';
import { artHtml, artLayer, box, buttonLayer, curatedCardSeed, textLayer, themes } from './kit.js';

/** Drawn product, name, price, and Buy. */
export function seedCreatorProduct(): SeedBundle {
  const t = themes.paper;
  return curatedCardSeed([
    artLayer(
      'pc_art',
      artHtml(
        '#f6f1e7',
        '<div class="plinth"></div><div class="mug"><div class="glaze"></div></div><div class="handle"></div>',
        '.plinth{position:absolute;left:190px;top:200px;width:150px;height:20px;border-radius:50%;background:#e7dcc4}.mug{position:absolute;left:220px;top:90px;width:90px;height:118px;border-radius:8px 8px 20px 20px;background:#d97706;overflow:hidden}.glaze{position:absolute;left:0;top:0;width:100%;height:36px;background:#fef3c7;border-radius:0 0 40% 40%}.handle{position:absolute;left:302px;top:118px;width:30px;height:48px;border:10px solid #d97706;border-left:none;border-radius:0 24px 24px 0}'
      )
    ),
    textLayer('pc_kicker', box(24, 28, 160, 20, 2), 'HANDMADE', { size: 11, color: t.accent, bold: true }),
    textLayer('pc_name', box(24, 52, 170, 72, 3), 'Amber mug', { family: 'serif', size: 24, color: t.ink, bold: true }),
    textLayer('pc_desc', box(24, 128, 170, 60, 4), 'Stoneware, 12 oz, glazed by hand. Every one is a little different.', { size: 12, color: t.muted }),
    textLayer('pc_price', box(24, 248, 120, 40, 5), '$38', { family: 'serif', size: 30, color: t.ink, bold: true }),
    buttonLayer('pc_buy', box(156, 248, 180, 44, 6), 'Buy now', t.primary, { behavior: 'cta.open', openUrl: 'https://parnoir.com/shop/amber-mug' }),
    textLayer('pc_ship', box(24, 306, 312, 20, 7), 'Ships in 3 to 5 days', { size: 11, color: t.muted })
  ]);
}

/** A jar and three tip amounts. */
export function seedCreatorTipjar(): SeedBundle {
  const t = themes.forest;
  const amt = { fill: 'rgba(134,239,172,0.16)', color: t.ink };
  return curatedCardSeed([
    artLayer(
      'tj_art',
      artHtml(
        'linear-gradient(170deg,#052e16 0%,#14532d 100%)',
        '<div class="lid"></div><div class="jar"><div class="coin" style="left:16px;bottom:10px"></div><div class="coin" style="left:40px;bottom:16px"></div><div class="coin" style="left:28px;bottom:30px"></div></div>',
        '.jar{position:absolute;left:246px;top:44px;width:86px;height:110px;border-radius:14px 14px 22px 22px;border:3px solid rgba(236,253,245,.7);overflow:hidden}.lid{position:absolute;left:256px;top:34px;width:72px;height:14px;border-radius:4px;background:#86efac}.coin{position:absolute;width:24px;height:24px;border-radius:50%;background:#facc15;border:2px solid #ca8a04}'
      )
    ),
    textLayer('tj_kicker', box(24, 28, 200, 20, 2), 'THE SLOW HOUR PODCAST', { size: 11, color: t.accent, bold: true }),
    textLayer('tj_title', box(24, 52, 210, 72, 3), 'Enjoying the show? Buy me a coffee.', { family: 'serif', size: 21, color: t.ink, bold: true }),
    textLayer('tj_sub', box(24, 132, 200, 44, 4), 'Every tip goes straight to the next episode.', { size: 12, color: t.muted }),
    buttonLayer('tj_3', box(24, 210, 96, 52, 5), '$3', amt, { behavior: 'cta.open', openUrl: 'https://parnoir.com/tip?amount=3' }, { size: 18, radius: 14, stroke: 'rgba(134,239,172,0.5)' }),
    buttonLayer('tj_5', box(132, 210, 96, 52, 6), '$5', t.primary, { behavior: 'cta.open', openUrl: 'https://parnoir.com/tip?amount=5' }, { size: 18, radius: 14 }),
    buttonLayer('tj_10', box(240, 210, 96, 52, 7), '$10', amt, { behavior: 'cta.open', openUrl: 'https://parnoir.com/tip?amount=10' }, { size: 18, radius: 14, stroke: 'rgba(134,239,172,0.5)' }),
    textLayer('tj_note', box(24, 280, 312, 20, 8), 'Opens a secure checkout.', { size: 11, color: t.muted })
  ]);
}

/** Art tiles, project title, role, and the case study link. */
export function seedCreatorPortfolio(): SeedBundle {
  const t = themes.ink;
  return curatedCardSeed([
    artLayer(
      'pf_art',
      artHtml(
        '#0b0b0c',
        '<div class="g"><i style="background:#f97316"></i><i style="background:#f5f5f4"></i><i style="background:#facc15;grid-row:span 2"></i><i style="background:#3f3f46;grid-column:span 2"></i></div>',
        '.g{position:absolute;left:24px;top:24px;width:312px;height:164px;display:grid;grid-template-columns:1fr 1fr 1fr;grid-template-rows:1fr 1fr;gap:8px}.g i{display:block;border-radius:8px}'
      )
    ),
    textLayer('pf_kicker', box(24, 204, 200, 20, 2), 'CASE STUDY · 2026', { size: 11, color: t.accent, bold: true }),
    textLayer('pf_title', box(24, 226, 312, 36, 3), 'Rebranding Harbor Coffee', { family: 'serif', size: 22, color: t.ink, bold: true }),
    textLayer('pf_role', box(24, 262, 312, 22, 4), 'Identity, packaging, and signage', { size: 12, color: t.muted }),
    buttonLayer('pf_view', box(24, 300, 180, 40, 5), 'View case study', t.primary, { behavior: 'cta.open', openUrl: 'https://parnoir.com/work/harbor' }),
    buttonLayer('pf_hire', box(216, 300, 120, 40, 6), 'Hire me', t.ghost, { behavior: 'widget.submit', label: 'Project inquiry' })
  ]);
}
