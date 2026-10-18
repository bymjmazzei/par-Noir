import type { SeedBundle } from '../starterSeeds.js';
import { artHtml, artLayer, bodyStyle, buttonLayer, curatedCardSeed, kickerStyle, textLayer, titleStyle } from './kit.js';

export function seedFormNewsletter(): SeedBundle {
  return curatedCardSeed([
    artLayer('w_form_newsletter_v1_art', artHtml('linear-gradient(135deg,#fef3c7 0%,#fde68a 45%,#f59e0b 100%)', '<div class="s" style="width:220px;height:220px;right:-50px;top:-40px;background:rgba(255,255,255,0.15)"></div><div class="s" style="width:90px;height:90px;left:-30px;bottom:-30px;background:rgba(255,255,255,0.1)"></div>'), 360),
    textLayer('w_form_newsletter_v1_k', { x: 24, y: 12, w: 280, h: 28, z: 2 }, 'FORMS', kickerStyle),
    textLayer('w_form_newsletter_v1_t', { x: 24, y: 44, w: 312, h: 56, z: 3 }, 'Newsletter', titleStyle),
    { id: 'w_form_newsletter_v1_in', kind: 'text' as const, widgetElement: 'input' as const, name: 'Field', label: 'Your reply…', x: 24, y: 280, w: 312, h: 36, zIndex: 5, positionLocked: false, backgroundColor: '#fff', textColor: '#111', cornerRadius: 8 },
    buttonLayer('w_form_newsletter_v1_send', { x: 24, y: 324, w: 120, h: 36, z: 6 }, 'Send', { fill: '#0f766e', color: '#fff' }, { behavior: 'widget.submit' })
  ]);
}

export function seedFormContact(): SeedBundle {
  return curatedCardSeed([
    artLayer('w_form_contact_v1_art', artHtml('linear-gradient(145deg,#0ea5e9 0%,#6366f1 55%,#312e81 100%)', '<div class="s" style="width:240px;height:240px;right:-50px;top:-40px;background:rgba(255,255,255,0.15)"></div><div class="s" style="width:90px;height:90px;left:-30px;bottom:-30px;background:rgba(255,255,255,0.1)"></div>'), 360),
    textLayer('w_form_contact_v1_k', { x: 24, y: 12, w: 280, h: 28, z: 2 }, 'FORMS', kickerStyle),
    textLayer('w_form_contact_v1_t', { x: 24, y: 44, w: 312, h: 56, z: 3 }, 'Contact', titleStyle),
    { id: 'w_form_contact_v1_in', kind: 'text' as const, widgetElement: 'input' as const, name: 'Field', label: 'Your reply…', x: 24, y: 280, w: 312, h: 36, zIndex: 5, positionLocked: false, backgroundColor: '#fff', textColor: '#111', cornerRadius: 8 },
    buttonLayer('w_form_contact_v1_send', { x: 24, y: 324, w: 120, h: 36, z: 6 }, 'Send', { fill: '#0f766e', color: '#fff' }, { behavior: 'widget.submit' })
  ]);
}

export function seedFormFeedback(): SeedBundle {
  return curatedCardSeed([
    artLayer('w_form_feedback_v1_art', artHtml('linear-gradient(120deg,#14532d 0%,#166534 50%,#052e16 100%)', '<div class="s" style="width:260px;height:260px;right:-50px;top:-40px;background:rgba(255,255,255,0.15)"></div><div class="s" style="width:90px;height:90px;left:-30px;bottom:-30px;background:rgba(255,255,255,0.1)"></div>'), 360),
    textLayer('w_form_feedback_v1_k', { x: 24, y: 12, w: 280, h: 28, z: 2 }, 'FORMS', kickerStyle),
    textLayer('w_form_feedback_v1_t', { x: 24, y: 44, w: 312, h: 56, z: 3 }, 'Feedback box', titleStyle),
    { id: 'w_form_feedback_v1_in', kind: 'text' as const, widgetElement: 'input' as const, name: 'Field', label: 'Your reply…', x: 24, y: 280, w: 312, h: 36, zIndex: 5, positionLocked: false, backgroundColor: '#fff', textColor: '#111', cornerRadius: 8 },
    buttonLayer('w_form_feedback_v1_send', { x: 24, y: 324, w: 120, h: 36, z: 6 }, 'Send', { fill: '#0f766e', color: '#fff' }, { behavior: 'widget.submit' })
  ]);
}

export function seedFormWaitlist(): SeedBundle {
  return curatedCardSeed([
    artLayer('w_form_waitlist_v1_art', artHtml('linear-gradient(165deg,#1c1917 0%,#44403c 40%,#78716c 100%)', '<div class="s" style="width:180px;height:180px;right:-50px;top:-40px;background:rgba(255,255,255,0.15)"></div><div class="s" style="width:90px;height:90px;left:-30px;bottom:-30px;background:rgba(255,255,255,0.1)"></div>'), 360),
    textLayer('w_form_waitlist_v1_k', { x: 24, y: 12, w: 280, h: 28, z: 2 }, 'FORMS', kickerStyle),
    textLayer('w_form_waitlist_v1_t', { x: 24, y: 44, w: 312, h: 56, z: 3 }, 'Waitlist', titleStyle),
    { id: 'w_form_waitlist_v1_in', kind: 'text' as const, widgetElement: 'input' as const, name: 'Field', label: 'Your reply…', x: 24, y: 280, w: 312, h: 36, zIndex: 5, positionLocked: false, backgroundColor: '#fff', textColor: '#111', cornerRadius: 8 },
    buttonLayer('w_form_waitlist_v1_send', { x: 24, y: 324, w: 120, h: 36, z: 6 }, 'Send', { fill: '#0f766e', color: '#fff' }, { behavior: 'widget.submit' })
  ]);
}

export function seedFormQuote(): SeedBundle {
  return curatedCardSeed([
    artLayer('w_form_quote_v1_art', artHtml('linear-gradient(155deg,#be123c 0%,#9f1239 50%,#4c0519 100%)', '<div class="s" style="width:200px;height:200px;right:-50px;top:-40px;background:rgba(255,255,255,0.15)"></div><div class="s" style="width:90px;height:90px;left:-30px;bottom:-30px;background:rgba(255,255,255,0.1)"></div>'), 360),
    textLayer('w_form_quote_v1_k', { x: 24, y: 12, w: 280, h: 28, z: 2 }, 'FORMS', kickerStyle),
    textLayer('w_form_quote_v1_t', { x: 24, y: 44, w: 312, h: 56, z: 3 }, 'Request a quote', titleStyle),
    { id: 'w_form_quote_v1_in', kind: 'text' as const, widgetElement: 'input' as const, name: 'Field', label: 'Your reply…', x: 24, y: 280, w: 312, h: 36, zIndex: 5, positionLocked: false, backgroundColor: '#fff', textColor: '#111', cornerRadius: 8 },
    buttonLayer('w_form_quote_v1_send', { x: 24, y: 324, w: 120, h: 36, z: 6 }, 'Send', { fill: '#0f766e', color: '#fff' }, { behavior: 'widget.submit' })
  ]);
}

export function seedFormMultistep(): SeedBundle {
  const opt = { fill: 'rgba(255,255,255,0.16)', color: '#ffffff' };
  return curatedCardSeed([
    artLayer('w_form_multistep_v1_art', artHtml('linear-gradient(150deg,#0f766e 0%,#1e3a8a 60%,#312e81 100%)', '<div class="s" style="width:220px;height:220px;right:-50px;top:-40px;background:rgba(255,255,255,0.15)"></div><div class="s" style="width:90px;height:90px;left:-30px;bottom:-30px;background:rgba(255,255,255,0.1)"></div>'), 360),
    textLayer('w_form_multistep_v1_k', { x: 24, y: 12, w: 280, h: 28, z: 2 }, 'FORMS', kickerStyle),
    textLayer('w_form_multistep_v1_t', { x: 24, y: 44, w: 312, h: 56, z: 3 }, 'Multi-step form', titleStyle),
    textLayer('w_form_multistep_v1_f0', { x: 24, y: 240, w: 312, h: 36, z: 4 }, 'Step 1', bodyStyle, { stepFrame: 0 }),
    textLayer('w_form_multistep_v1_f1', { x: 24, y: 240, w: 312, h: 36, z: 4 }, 'Step 2', bodyStyle, { stepFrame: 1 }),
    buttonLayer('w_form_multistep_v1_next', { x: 24, y: 280, w: 120, h: 36, z: 5 }, 'Next', opt, { behavior: 'widget.step', stepDir: 'next' })
  ]);
}
