import type { SeedBundle } from '../starterSeeds.js';
import { artHtml, artLayer, box, buttonLayer, curatedCardSeed, inputLayer, textLayer, themes } from './kit.js';

/** Email field, Subscribe, and a privacy line. */
export function seedFormNewsletter(): SeedBundle {
  const t = themes.paper;
  return curatedCardSeed([
    artLayer(
      'nl_art',
      artHtml(
        '#f6f1e7',
        '<div class="env"><div class="flap"></div></div>',
        '.env{position:absolute;right:28px;top:28px;width:96px;height:64px;border-radius:6px;background:#fff;border:2px solid #1c1917;overflow:hidden}.flap{position:absolute;left:-2px;top:-36px;width:96px;height:64px;border:2px solid #1c1917;transform:rotate(45deg) skew(-8deg,-8deg);transform-origin:0 100%;background:#f6f1e7}'
      )
    ),
    textLayer('nl_kicker', box(24, 28, 180, 20, 2), 'EVERY OTHER SUNDAY', { size: 11, color: t.accent, bold: true }),
    textLayer('nl_title', box(24, 52, 210, 72, 3), 'The Slow Letter', { family: 'serif', size: 30, color: t.ink, bold: true }),
    textLayer('nl_sub', box(24, 130, 312, 44, 4), 'One essay, three links, and nothing you need to reply to.', { size: 13, color: t.muted }),
    inputLayer('nl_email', box(24, 196, 312, 44, 5), 'you@example.com', t.field, { name: 'Email', strokeColor: '#d6c7a8', strokeWidth: 1 }),
    buttonLayer('nl_sub_btn', box(24, 250, 312, 44, 6), 'Subscribe', t.primary, { behavior: 'widget.submit', label: 'Newsletter signup' }, { radius: 10 }),
    textLayer('nl_privacy', box(24, 306, 312, 32, 7), 'Unsubscribe any time. Your address is never shared.', { size: 11, color: t.muted })
  ]);
}

/** Name, email, message, Send. */
export function seedFormContact(): SeedBundle {
  const t = themes.night;
  return curatedCardSeed([
    artLayer(
      'ct_art',
      artHtml('linear-gradient(160deg,#0f172a 0%,#172554 100%)', '<div class="r" style="left:24px;top:68px;width:40px;height:3px;background:#818cf8"></div>')
    ),
    textLayer('ct_title', box(24, 20, 312, 40, 2), 'Get in touch', { family: 'serif', size: 26, color: t.ink, bold: true }),
    inputLayer('ct_name', box(24, 88, 150, 40, 3), 'Your name', t.field, { name: 'Name' }),
    inputLayer('ct_email', box(186, 88, 150, 40, 4), 'Email', t.field, { name: 'Email' }),
    inputLayer('ct_msg', box(24, 138, 312, 120, 5), 'How can we help?', t.field, { name: 'Message' }),
    buttonLayer('ct_send', box(24, 272, 140, 44, 6), 'Send', t.primary, { behavior: 'widget.submit', label: 'Contact form' }, { size: 15 }),
    textLayer('ct_note', box(176, 278, 160, 36, 7), 'We answer within two working days.', { size: 11, color: t.muted })
  ]);
}

/** A large feedback field and Send. */
export function seedFormFeedback(): SeedBundle {
  const t = themes.citrus;
  return curatedCardSeed([
    artLayer(
      'fb_art',
      artHtml(
        '#fef9c3',
        '<div class="bub"></div>',
        '.bub{position:absolute;right:28px;top:24px;width:70px;height:52px;border-radius:14px;background:#bef264}.bub:after{content:"";position:absolute;left:14px;bottom:-12px;border:8px solid transparent;border-top-color:#bef264;border-left-color:#bef264}'
      )
    ),
    textLayer('fb_kicker', box(24, 28, 200, 20, 2), 'TWO MINUTES', { size: 11, color: t.accent, bold: true }),
    textLayer('fb_title', box(24, 52, 230, 64, 3), 'What would make this better?', { family: 'serif', size: 24, color: t.ink, bold: true }),
    inputLayer('fb_text', box(24, 128, 312, 136, 4), 'Be as blunt as you like…', t.field, { name: 'Feedback', strokeColor: '#d9f99d', strokeWidth: 1 }),
    buttonLayer('fb_send', box(24, 280, 160, 44, 5), 'Send feedback', t.primary, { behavior: 'widget.submit', label: 'Feedback' }),
    textLayer('fb_anon', box(196, 286, 140, 32, 6), 'Read by the whole team.', { size: 11, color: t.muted })
  ]);
}

/** Join the waitlist with an email. */
export function seedFormWaitlist(): SeedBundle {
  const t = themes.ink;
  return curatedCardSeed([
    artLayer(
      'wl_art',
      artHtml(
        'radial-gradient(circle at 50% 0%,#422006 0%,#0b0b0c 65%)',
        '<div class="ring" style="width:140px;height:140px;left:110px;top:-60px"></div><div class="ring" style="width:220px;height:220px;left:70px;top:-100px;opacity:.5"></div>',
        '.ring{position:absolute;border-radius:50%;border:1px solid rgba(250,204,21,.4)}'
      )
    ),
    textLayer('wl_kicker', box(0, 96, 360, 20, 2), 'PRIVATE BETA', { size: 11, color: t.accent, bold: true, align: 'center' }),
    textLayer('wl_title', box(24, 120, 312, 44, 3), 'Be first in line', { family: 'serif', size: 30, color: t.ink, bold: true, align: 'center' }),
    textLayer('wl_sub', box(24, 166, 312, 24, 4), 'We let in fifty people a week.', { size: 13, color: t.muted, align: 'center' }),
    inputLayer('wl_email', box(24, 214, 312, 44, 5), 'Email address', t.field, { name: 'Email', strokeColor: 'rgba(250,204,21,0.3)', strokeWidth: 1 }),
    buttonLayer('wl_join', box(24, 268, 312, 44, 6), 'Join waitlist', t.primary, { behavior: 'widget.submit', label: 'Waitlist' }, { size: 15, radius: 10 })
  ]);
}

/** Project details for a quote. */
export function seedFormQuote(): SeedBundle {
  const t = themes.slate;
  return curatedCardSeed([
    artLayer(
      'rq_art',
      artHtml(
        '#e2e8f0',
        '<div class="ruler"></div>',
        '.ruler{position:absolute;left:0;top:0;width:360px;height:12px;background:repeating-linear-gradient(90deg,#94a3b8 0 1px,transparent 1px 12px),#cbd5e1}'
      )
    ),
    textLayer('rq_kicker', box(24, 28, 200, 20, 2), 'STUDIO NORTH', { size: 11, color: t.accent, bold: true }),
    textLayer('rq_title', box(24, 50, 312, 36, 3), 'Plan your project', { family: 'serif', size: 26, color: t.ink, bold: true }),
    inputLayer('rq_name', box(24, 100, 312, 40, 4), 'Name and company', t.field, { name: 'Name' }),
    inputLayer('rq_project', box(24, 150, 312, 64, 5), 'What are you building?', t.field, { name: 'Project' }),
    inputLayer('rq_budget', box(24, 224, 150, 40, 6), 'Budget', t.field, { name: 'Budget' }),
    inputLayer('rq_date', box(186, 224, 150, 40, 7), 'Ideal start date', t.field, { name: 'Start' }),
    buttonLayer('rq_send', box(24, 280, 312, 44, 8), 'Send request', t.primary, { behavior: 'widget.submit', label: 'Quote request' }, { radius: 10 })
  ]);
}

/** Three steps: name, email, message; submit on the last. */
export function seedFormMultistep(): SeedBundle {
  const t = themes.forest;
  const step = (id: string, frame: number) =>
    textLayer(id, box(24, 24, 200, 20, 2), `STEP ${frame + 1} OF 3`, { size: 11, color: t.accent, bold: true }, { stepFrame: frame });
  return curatedCardSeed([
    artLayer(
      'ms_art',
      artHtml(
        'linear-gradient(170deg,#052e16 0%,#14532d 100%)',
        '<div class="dot" style="left:258px"></div><div class="dot" style="left:284px"></div><div class="dot" style="left:310px"></div>',
        '.dot{position:absolute;top:28px;width:14px;height:14px;border-radius:50%;border:2px solid #86efac;box-sizing:border-box}'
      )
    ),
    step('ms_s1', 0),
    textLayer('ms_q1', box(24, 52, 312, 40, 3), 'What should we call you?', { family: 'serif', size: 22, color: t.ink, bold: true }, { stepFrame: 0 }),
    inputLayer('ms_name', box(24, 120, 312, 44, 4), 'Your name', t.field, { name: 'Name', stepFrame: 0 }),
    step('ms_s2', 1),
    textLayer('ms_q2', box(24, 52, 312, 40, 3), 'Where can we reach you?', { family: 'serif', size: 22, color: t.ink, bold: true }, { stepFrame: 1 }),
    inputLayer('ms_email', box(24, 120, 312, 44, 4), 'Email address', t.field, { name: 'Email', stepFrame: 1 }),
    step('ms_s3', 2),
    textLayer('ms_q3', box(24, 52, 312, 40, 3), 'Anything we should know?', { family: 'serif', size: 22, color: t.ink, bold: true }, { stepFrame: 2 }),
    inputLayer('ms_msg', box(24, 104, 312, 100, 4), 'A few words…', t.field, { name: 'Message', stepFrame: 2 }),
    buttonLayer('ms_send', box(24, 220, 312, 44, 6), 'Send', t.primary, { behavior: 'widget.submit', label: 'Intake form', stepFrame: 2 }, { radius: 10 }),
    buttonLayer('ms_back', box(24, 296, 100, 40, 7), 'Back', t.ghost, { behavior: 'widget.step', stepDir: 'prev' }),
    buttonLayer('ms_next', box(236, 296, 100, 40, 8), 'Next', t.primary, { behavior: 'widget.step', stepDir: 'next' })
  ]);
}
