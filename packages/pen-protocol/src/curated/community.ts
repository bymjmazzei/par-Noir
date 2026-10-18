import type { SeedBundle } from '../starterSeeds.js';
import { artHtml, artLayer, box, buttonLayer, countdownLayer, curatedCardSeed, inputLayer, textLayer, themes } from './kit.js';

/** Four feature ideas to rank. */
export function seedCommunityFeatures(): SeedBundle {
  const t = themes.night;
  const row = { fill: 'rgba(255,255,255,0.06)', color: t.ink };
  const idea = (id: string, i: number, face: string) =>
    buttonLayer(id, box(24, 116 + i * 52, 312, 44, 4 + i), face, row, { behavior: 'widget.rank', bindRowId: id }, { radius: 10, stroke: 'rgba(129,140,248,0.35)' });
  return curatedCardSeed([
    artLayer(
      'fbd_art',
      artHtml(
        '#0f172a',
        '<div class="r" style="left:0;top:0;width:360px;height:96px;background:linear-gradient(90deg,#312e81,#0f172a)"></div><div class="r" style="right:24px;top:30px;width:40px;height:40px;border-radius:10px;border:2px dashed rgba(129,140,248,.6)"></div>'
      )
    ),
    textLayer('fbd_kicker', box(24, 22, 200, 20, 2), 'COMMUNITY ROADMAP', { size: 11, color: t.accent, bold: true }),
    textLayer('fbd_title', box(24, 44, 260, 44, 3), 'What should we ship next?', { family: 'serif', size: 22, color: t.ink, bold: true }),
    idea('fbd_dark', 0, 'Dark mode everywhere'),
    idea('fbd_export', 1, 'Export to PDF'),
    idea('fbd_collab', 2, 'Live co-editing'),
    idea('fbd_api', 3, 'Public API'),
    textLayer('fbd_note', box(24, 326, 312, 20, 8), 'Tap in order, most wanted first.', { size: 11, color: t.muted })
  ]);
}

/** Leave a note and sign the book. */
export function seedCommunityGuestbook(): SeedBundle {
  const t = themes.paper;
  return curatedCardSeed([
    artLayer(
      'gb_art',
      artHtml(
        '#f6f1e7',
        '<div class="page"></div>',
        '.page{position:absolute;left:24px;top:96px;width:312px;height:120px;border-radius:6px;background:#fffdf8;background-image:repeating-linear-gradient(#fffdf8 0 23px,#e7dcc4 23px 24px);border:1px solid #e7dcc4}'
      )
    ),
    textLayer('gb_kicker', box(24, 22, 200, 20, 2), 'OPEN STUDIO · SPRING 2026', { size: 11, color: t.accent, bold: true }),
    textLayer('gb_title', box(24, 44, 312, 40, 3), 'You were here', { family: 'serif', size: 26, color: t.ink, bold: true, italic: true }),
    inputLayer('gb_note', box(36, 108, 288, 96, 4), 'Leave a line for the next visitor…', { fill: 'transparent', color: t.ink }, { name: 'Note' }),
    buttonLayer('gb_sign', box(24, 236, 160, 44, 5), 'Sign the book', t.primary, { behavior: 'widget.submit', label: 'Guestbook entry' }),
    textLayer('gb_hint', box(24, 292, 312, 40, 6), 'Signing saves your note with the date you stopped by.', { size: 11, color: t.muted })
  ]);
}

/** Seven day toggles for a weekly habit. */
export function seedCommunityChallenge(): SeedBundle {
  const t = themes.forest;
  const day = { fill: 'rgba(134,239,172,0.12)', color: t.ink };
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return curatedCardSeed([
    artLayer(
      'ch_art',
      artHtml(
        'linear-gradient(170deg,#052e16 0%,#166534 100%)',
        '<div class="flag"></div>',
        '.flag{position:absolute;right:30px;top:24px;width:4px;height:72px;background:#86efac}.flag:after{content:"";position:absolute;left:4px;top:0;width:44px;height:28px;background:#86efac;clip-path:polygon(0 0,100% 50%,0 100%)}'
      )
    ),
    textLayer('ch_kicker', box(24, 22, 200, 20, 2), '7-DAY CHALLENGE', { size: 11, color: t.accent, bold: true }),
    textLayer('ch_title', box(24, 44, 250, 64, 3), 'Ten minutes outside, every day', { family: 'serif', size: 22, color: t.ink, bold: true }),
    ...days.slice(0, 4).map((d, i) =>
      buttonLayer(`ch_${d.toLowerCase()}`, box(24 + i * 81, 136, 69, 56, 4 + i), d, day, { behavior: 'widget.toggle', bindRowId: `ch_${d.toLowerCase()}` }, { radius: 12, stroke: 'rgba(134,239,172,0.4)' })
    ),
    ...days.slice(4).map((d, i) =>
      buttonLayer(`ch_${d.toLowerCase()}`, box(64 + i * 81, 204, 69, 56, 8 + i), d, day, { behavior: 'widget.toggle', bindRowId: `ch_${d.toLowerCase()}` }, { radius: 12, stroke: 'rgba(134,239,172,0.4)' })
    ),
    textLayer('ch_note', box(24, 284, 312, 40, 12), 'Tap a day when you have done it. Tap again to undo.', { size: 12, color: t.muted })
  ]);
}

/** Five word reactions. */
export function seedCommunityReactions(): SeedBundle {
  const t = themes.rose;
  const words = ['Love', 'Fun', 'Wow', 'Hmm', 'Sad'];
  const fills = ['#e11d48', '#f97316', '#eab308', '#64748b', '#3b82f6'];
  return curatedCardSeed([
    artLayer(
      'rb_art',
      artHtml(
        '#fff1f2',
        '<div class="s" style="width:34px;height:34px;left:250px;top:30px;background:#fda4af"></div><div class="s" style="width:22px;height:22px;left:292px;top:22px;background:#fdba74"></div><div class="s" style="width:16px;height:16px;left:300px;top:62px;background:#fde047"></div>'
      )
    ),
    textLayer('rb_kicker', box(24, 28, 200, 20, 2), 'HOW DID THIS LAND?', { size: 11, color: t.accent, bold: true }),
    textLayer('rb_title', box(24, 52, 312, 72, 3), 'React to the new chapter', { family: 'serif', size: 26, color: t.ink, bold: true }, { name: 'Question' }),
    ...words.map((w, i) =>
      buttonLayer(`rb_${w.toLowerCase()}`, box(24 + i * 63, 168, 57, 57, 4 + i), w, { fill: fills[i]!, color: '#ffffff' }, { behavior: 'poll.vote', bindRowId: `rb_${w.toLowerCase()}` }, { size: 12 })
    ),
    textLayer('rb_note', box(24, 250, 312, 40, 9), 'Counts appear once you react.', { size: 12, color: t.muted })
  ]);
}

/** Ask me anything: a question field and Ask. */
export function seedCommunityAma(): SeedBundle {
  const t = themes.sunset;
  return curatedCardSeed([
    artLayer(
      'ama_art',
      artHtml(
        'linear-gradient(160deg,#9a3412 0%,#7c2d12 100%)',
        '<div class="mic"></div>',
        '.mic{position:absolute;right:36px;top:26px;width:34px;height:54px;border-radius:17px;background:#fdba74}.mic:after{content:"";position:absolute;left:15px;top:58px;width:4px;height:22px;background:#fdba74}'
      )
    ),
    textLayer('ama_kicker', box(24, 24, 200, 20, 2), 'ASK ME ANYTHING', { size: 11, color: t.accent, bold: true }),
    textLayer('ama_title', box(24, 48, 240, 72, 3), "I've run a bakery for ten years. Ask away.", { family: 'serif', size: 20, color: t.ink, bold: true }),
    inputLayer('ama_q', box(24, 136, 312, 96, 4), 'Your question…', t.field, { name: 'Question' }),
    buttonLayer('ama_ask', box(24, 246, 120, 44, 5), 'Ask', t.primary, { behavior: 'widget.submit', label: 'AMA question' }, { size: 15 }),
    textLayer('ama_when', box(156, 244, 180, 18, 6), 'ANSWERS GO LIVE IN', { size: 10, color: t.accent, bold: true }),
    countdownLayer('ama_live', box(156, 264, 180, 28, 7), t.ink, 4, 'rgba(67,20,7,0.45)')
  ]);
}
