import type { PenTemplate } from '../templates.js';
import {
  FRAMES,
  artHtml,
  box,
  buttonLayer,
  countdownLayer,
  embedWidget,
  motion,
  pageArt,
  pageSeed,
  panelLayer,
  slotLayer,
  textLayer
} from '../curated/kit.js';
import { seedCreatorProduct } from '../curated/creator.js';
import { chipLayer, postTemplate, scrimLayer } from './shared.js';

const BOTTOM_SCRIM = 'linear-gradient(180deg,rgba(0,0,0,0) 0%,rgba(0,0,0,0.85) 100%)';

function productDrop(): PenTemplate {
  const f = FRAMES.portrait;
  return postTemplate({
    id: 'post.product_drop.v1',
    classId: 'social.post',
    title: 'Product drop',
    description: 'A hero photo, a drop countdown, and a product card with Buy now.',
    aspect: 'portrait',
    featured: true,
    focus:
      'Write the batch line for the photo, then the product name, a one-sentence description with material and size, the price, and shipping time. Point Buy now at the real shop page.',
    seed: pageSeed(f, [
      {
        slug: 'body',
        layers: [
          pageArt('pd_art', artHtml('#efe6d6', '<div class="r" style="left:0;right:0;top:276px;height:4px;background:#d6c7a8"></div>'), f),
          slotLayer(
            'pd_photo',
            box(0, 0, 360, 280, 2),
            'Photo',
            artHtml(
              'linear-gradient(160deg,#fde68a 0%,#f59e0b 55%,#b45309 100%)',
              '<div class="s" style="left:90px;top:214px;width:180px;height:30px;background:rgba(67,20,7,.35)"></div><div class="r body"></div><div class="r rim"></div><div class="r handle"></div><div class="s" style="left:286px;top:40px;width:46px;height:46px;background:rgba(255,255,255,.35)"></div>',
              '.body{left:130px;top:96px;width:100px;height:130px;border-radius:10px 10px 26px 26px;background:#fff7ed;box-shadow:inset -18px 0 0 rgba(180,83,9,.18)}.rim{left:130px;top:96px;width:100px;height:16px;border-radius:10px 10px 0 0;background:#92400e}.handle{left:222px;top:124px;width:36px;height:56px;border:12px solid #fff7ed;border-left:none;border-radius:0 30px 30px 0;box-sizing:border-box}'
            )
          ),
          chipLayer('pd_drop', box(16, 16, 96, 26, 3), 'DROPS IN', '#1c1917', '#f6f1e7'),
          countdownLayer('pd_cd', box(118, 15, 110, 28, 4), '#1c1917', 3, 'rgba(246,241,231,0.92)'),
          motion(textLayer('pd_batch', box(16, 240, 220, 24, 5), 'BATCH 04 · 60 MADE', { size: 11, color: '#ffffff', bold: true }), { in: 'fade' }),
          ...embedWidget('pd_card', 'widget.creator_product.v1', 'Product', seedCreatorProduct, { x: 0, y: 280, z: 10 })
        ]
      }
    ])
  });
}

function recipeReel(): PenTemplate {
  const f = FRAMES.portrait;
  const muted = 'rgba(255,255,255,0.78)';
  return postTemplate({
    id: 'post.recipe_reel.v1',
    classId: 'social.post',
    title: 'Recipe reel',
    description: 'A full-frame cooking clip with time, servings, ingredients, and Full recipe.',
    aspect: 'portrait',
    featured: true,
    focus:
      'Write the dish name, one line that sells how easy it is, the cook time and servings, and up to six ingredients separated by dots. Link Full recipe to the written method.',
    seed: pageSeed(f, [
      {
        slug: 'body',
        layers: [
          pageArt('rr_art', artHtml('#1c1917', ''), f),
          slotLayer(
            'rr_clip',
            box(0, 0, 360, 640, 2),
            'Clip',
            artHtml(
              'radial-gradient(circle at 50% 38%,#78350f 0%,#292524 70%)',
              '<div class="s pan"></div><div class="s food"></div><div class="s" style="left:150px;top:170px;width:34px;height:34px;background:#fde047;border:4px solid #facc15"></div><div class="s" style="left:196px;top:220px;width:28px;height:28px;background:#fde047;border:4px solid #facc15"></div><div class="r" style="left:300px;top:200px;width:70px;height:14px;border-radius:7px;background:#44403c"></div><div class="r bar"></div>',
              '.pan{left:60px;top:110px;width:240px;height:240px;background:#1c1917;box-shadow:0 0 0 10px #292524}.food{left:78px;top:128px;width:204px;height:204px;background:radial-gradient(circle,#fef3c7 0 2px,transparent 3px) 0 0/12px 12px,#fde68a}.bar{left:0;top:636px;width:140px;height:4px;background:#fef08a}'
            )
          ),
          scrimLayer('rr_scrim', box(0, 380, 360, 260, 3), BOTTOM_SCRIM),
          chipLayer('rr_time', box(16, 20, 92, 26, 4), '15 MIN', '#fef08a', '#1c1917'),
          chipLayer('rr_serves', box(114, 20, 92, 26, 5), 'SERVES 2', 'rgba(255,255,255,0.18)', '#ffffff'),
          motion(textLayer('rr_title', box(20, 430, 320, 44, 6), 'Lemon garlic orzo', { family: 'serif', size: 30, color: '#ffffff', bold: true }), { in: 'rise' }),
          textLayer('rr_line', box(20, 478, 320, 40, 7), 'One pan, no draining, done before pasta water would boil.', { size: 13, color: muted }),
          panelLayer('rr_ingredients', box(20, 526, 320, 40, 8), 'rgba(255,255,255,0.12)', 'Orzo · lemon · garlic · parmesan · peas · butter', { size: 12, color: '#ffffff', align: 'center' }, { name: 'Ingredients' }),
          buttonLayer('rr_full', box(20, 580, 200, 40, 9), 'Full recipe', { fill: '#fef08a', color: '#1c1917' }, { behavior: 'cta.open', openUrl: 'https://parnoir.com/recipes/lemon-garlic-orzo' }),
          buttonLayer('rr_save', box(232, 580, 108, 40, 10), 'Save', { fill: 'rgba(255,255,255,0.16)', color: '#ffffff' }, { behavior: 'widget.stamp', label: 'Saved' })
        ]
      }
    ])
  });
}

function eventRecap(): PenTemplate {
  const f = FRAMES.landscape;
  return postTemplate({
    id: 'post.event_recap.v1',
    classId: 'social.post',
    title: 'Event recap',
    description: 'The best photo from the night, the date, the numbers, and See all photos.',
    aspect: 'landscape',
    featured: true,
    focus:
      'Write the event name with its edition, the date in the date badge, and one sentence with two or three real numbers from the day. Link See all photos to the full album.',
    seed: pageSeed(f, [
      {
        slug: 'body',
        layers: [
          pageArt('er_art', artHtml('#0f0a1e', '<div class="s" style="left:560px;top:-60px;width:160px;height:160px;background:rgba(244,114,182,.18)"></div>'), f),
          slotLayer(
            'er_photo',
            box(0, 0, 400, 360, 2),
            'Photo',
            artHtml(
              'linear-gradient(180deg,#1e1b4b 0%,#312e81 60%,#0f0a1e 100%)',
              '<div class="lights"></div><div class="r stall" style="left:20px"></div><div class="r stall" style="left:150px;background:repeating-linear-gradient(90deg,#34d399 0 16px,#ecfdf5 16px 32px)"></div><div class="r stall" style="left:280px;background:repeating-linear-gradient(90deg,#fbbf24 0 16px,#fffbeb 16px 32px)"></div><div class="r" style="left:0;right:0;bottom:0;height:90px;background:#0f0a1e"></div>',
              '.lights{position:absolute;left:-20px;top:30px;width:440px;height:80px;border-bottom:2px solid rgba(255,255,255,.25);border-radius:0 0 50% 50%;background:radial-gradient(circle,#fde68a 0 3px,transparent 4px) 0 100%/28px 20px repeat-x}.stall{top:190px;width:110px;height:80px;border-radius:6px 6px 0 0;background:repeating-linear-gradient(90deg,#f472b6 0 16px,#fdf2f8 16px 32px)}'
            )
          ),
          motion(
            panelLayer('er_date', box(424, 28, 72, 72, 3), '#f472b6', ['SAT', '14 JUN'], { size: 13, color: '#0f0a1e', bold: true, align: 'center' }, { name: 'Date', cornerRadius: 14 }),
            { in: 'pop' }
          ),
          textLayer('er_kicker', box(424, 116, 192, 20, 4), 'RECAP', { size: 11, color: '#f9a8d4', bold: true }),
          motion(textLayer('er_title', box(424, 138, 192, 72, 5), 'Night Market, year three', { family: 'serif', size: 24, color: '#ffffff', bold: true }), { in: 'slideLeft' }),
          textLayer('er_stats', box(424, 214, 192, 60, 6), '2,400 visitors, 61 stalls, and one very long dumpling queue.', { size: 12, color: 'rgba(255,255,255,0.72)' }),
          buttonLayer('er_all', box(424, 290, 192, 40, 7), 'See all photos', { fill: '#f472b6', color: '#0f0a1e' }, { behavior: 'cta.open', openUrl: 'https://parnoir.com/nightmarket/2026' })
        ]
      }
    ])
  });
}

function beforeAfter(): PenTemplate {
  const f = FRAMES.square;
  return postTemplate({
    id: 'post.before_after.v1',
    classId: 'social.post',
    title: 'Before and after',
    description: 'Two photos of the same space behind Before and After tabs.',
    aspect: 'square',
    focus:
      'Name the project in the kicker, write a short title about the effort, and one line with cost or time. Attach the after photo to Photo after and the original to Photo before.',
    seed: pageSeed(f, [
      {
        slug: 'body',
        layers: [
          pageArt('bf_art', artHtml('#1c1917', '<div class="r" style="left:0;right:0;top:260px;height:2px;background:#fde68a"></div>'), f),
          slotLayer(
            'bf_after',
            box(0, 0, 360, 260, 2),
            'Photo after',
            artHtml(
              'linear-gradient(180deg,#fefce8 0%,#fef3c7 100%)',
              '<div class="r" style="left:30px;top:60px;width:130px;height:8px;background:#b45309"></div><div class="r" style="left:30px;top:120px;width:130px;height:8px;background:#b45309"></div><div class="s" style="left:50px;top:30px;width:28px;height:28px;background:#4d7c0f"></div><div class="r" style="left:100px;top:90px;width:22px;height:30px;border-radius:4px;background:#e0f2fe"></div><div class="r" style="left:0;right:0;top:180px;height:80px;background:#d6b98c"></div><div class="r" style="left:210px;top:40px;width:120px;height:110px;border-radius:6px;background:#bae6fd;border:6px solid #fff"></div>'
            )
          ),
          slotLayer(
            'bf_before',
            box(0, 0, 360, 260, 3),
            'Photo before',
            artHtml(
              'linear-gradient(180deg,#44403c 0%,#292524 100%)',
              '<div class="r" style="left:20px;top:30px;width:150px;height:120px;background:#57534e;border:2px solid #1c1917"></div><div class="r" style="left:190px;top:30px;width:150px;height:120px;background:#57534e;border:2px solid #1c1917"></div><div class="s" style="left:170px;top:4px;width:20px;height:20px;background:#fef9c3;opacity:.5"></div><div class="r" style="left:0;right:0;top:180px;height:80px;background:#3f3f46"></div>'
            ),
            { visible: false }
          ),
          chipLayer('bf_kicker', box(16, 16, 120, 26, 4), 'KITCHEN REDO', '#1c1917', '#fde68a'),
          motion(textLayer('bf_title', box(16, 272, 216, 28, 5), 'Six weekends later', { family: 'serif', size: 20, color: '#fafaf9', bold: true }), { in: 'rise' }),
          textLayer('bf_cost', box(248, 272, 96, 72, 6), '$2,100, two sanders, zero regrets.', { size: 11, color: 'rgba(250,250,249,0.7)' }),
          buttonLayer('bf_b', box(16, 310, 104, 36, 7), 'Before', { fill: 'rgba(255,255,255,0.12)', color: '#fafaf9' }, { behavior: 'widget.reveal', revealLayerId: 'bf_before', revealMode: 'tab' }),
          buttonLayer('bf_a', box(128, 310, 104, 36, 8), 'After', { fill: '#fde68a', color: '#1c1917' }, { behavior: 'widget.reveal', revealLayerId: 'bf_after', revealMode: 'tab' })
        ]
      }
    ])
  });
}

function btsClip(): PenTemplate {
  const f = FRAMES.portrait;
  return postTemplate({
    id: 'post.bts_clip.v1',
    classId: 'social.post',
    title: 'Behind the scenes',
    description: 'A full-frame set clip with an ON SET tag and the story behind a tap.',
    aspect: 'portrait',
    focus:
      'Write a title about one moment from the shoot, one line with the project and day, and two short lines on what went wrong that appear behind the reveal button.',
    seed: pageSeed(f, [
      {
        slug: 'body',
        layers: [
          pageArt('bt_art', artHtml('#0a0a0a', ''), f),
          slotLayer(
            'bt_clip',
            box(0, 0, 360, 640, 2),
            'Clip',
            artHtml(
              'linear-gradient(180deg,#18181b 0%,#27272a 100%)',
              '<div class="cone"></div><div class="r box"></div><div class="r" style="left:96px;top:150px;width:4px;height:330px;background:#52525b"></div><div class="r" style="left:240px;top:380px;width:80px;height:10px;background:#a16207"></div><div class="r" style="left:248px;top:390px;width:8px;height:70px;background:#a16207"></div><div class="r" style="left:304px;top:390px;width:8px;height:70px;background:#a16207"></div>',
              '.box{left:60px;top:110px;width:80px;height:60px;border-radius:4px;background:#fafafa;box-shadow:0 0 40px rgba(255,255,255,.5)}.cone{position:absolute;left:100px;top:160px;width:0;height:0;border-left:40px solid transparent;border-right:220px solid transparent;border-top:340px solid rgba(254,240,138,.12)}'
            )
          ),
          scrimLayer('bt_scrim', box(0, 400, 360, 240, 3), BOTTOM_SCRIM),
          chipLayer('bt_onset', box(16, 20, 84, 26, 4), 'ON SET', '#fafafa', '#0a0a0a'),
          motion(chipLayer('bt_rec', box(268, 20, 76, 26, 5), '● REC', '#dc2626', '#ffffff'), { in: 'fade' }),
          panelLayer(
            'bt_wrong',
            box(20, 300, 320, 120, 6),
            'rgba(10,10,10,0.85)',
            ['What went wrong', 'Takes 1 to 4: the steam would not show on camera.', 'Takes 5 to 8: a bus parked in the window.'],
            { size: 13, color: '#fafafa' },
            { name: 'What went wrong', visible: false }
          ),
          motion(textLayer('bt_title', box(20, 440, 320, 72, 7), 'The shot that took nine takes', { family: 'serif', size: 28, color: '#ffffff', bold: true }), { in: 'rise' }),
          textLayer('bt_line', box(20, 516, 320, 40, 8), 'Day 12 of the Harbor Coffee spot. Take nine made the final cut.', { size: 13, color: 'rgba(255,255,255,0.75)' }),
          buttonLayer('bt_reveal', box(20, 576, 200, 40, 9), 'What went wrong?', { fill: '#fafafa', color: '#0a0a0a' }, { behavior: 'widget.reveal', revealLayerId: 'bt_wrong', revealMode: 'toggle' }),
          buttonLayer('bt_follow', box(232, 576, 108, 40, 10), 'Follow', { fill: 'rgba(255,255,255,0.16)', color: '#ffffff' }, { behavior: 'widget.stamp', label: 'Following' })
        ]
      }
    ])
  });
}

export function postTemplates(): PenTemplate[] {
  return [productDrop(), recipeReel(), eventRecap(), beforeAfter(), btsClip()];
}
