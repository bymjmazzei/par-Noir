/**
 * One-shot generator for curated widget seed modules. Run from packages/pen-protocol:
 * node scripts/generate-curated-widgets.mjs
 */
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'src', 'curated');

const CATEGORIES = {
  polls: [
    ['widget.poll_quick.v1', 'Quick poll', 'One question and three tap options.', 'Keep the three vote buttons.'],
    ['widget.poll_writein.v1', 'Poll with write-in', 'Three options, Other field, countdown.', 'Keep vote buttons and write-in.'],
    ['widget.poll_thisorthat.v1', 'This or that', 'Pick between two bold options.', 'Two vote buttons only.'],
    ['widget.poll_rating.v1', 'Rating scale', 'Rate from 1 to 5.', 'Five vote buttons in a row.'],
    ['widget.poll_hottake.v1', 'Hot take meter', 'Agree or disagree on a spicy prompt.', 'Two vote buttons.'],
    ['widget.poll_hidden.v1', 'Hidden result poll', 'Vote first, reveal totals after.', 'Reveal shows results text.'],
    ['widget.poll_rank.v1', 'Rank favorites', 'Rank three items with drag-free taps.', 'Rank trigger on options.'],
    ['widget.poll_budget.v1', 'Budget split', 'Allocate points across three buckets.', 'Allocate trigger.']
  ],
  quizzes: [
    ['widget.quiz.v1', 'Trivia quiz', 'Three answers, one correct, reveal explanation.', 'Mark correct answer.'],
    ['widget.quiz_truefalse.v1', 'True or false', 'A single statement to judge.', 'Two answer buttons.'],
    ['widget.quiz_image.v1', 'Guess the image', 'Blur lifts on reveal.', 'Reveal target is art caption.'],
    ['widget.quiz_riddle.v1', 'Riddle of the day', 'Riddle with hidden answer.', 'Reveal shows answer.'],
    ['widget.quiz_personality.v1', 'Personality pick', 'Choose the vibe that fits you.', 'Three vote options.'],
    ['widget.quiz_multi.v1', 'Multi-question quiz', 'Step through questions with score.', 'Step + answer + score.'],
    ['widget.quiz_uncover.v1', 'Tap to uncover', 'Toggle hidden message.', 'Toggle reveal mode.']
  ],
  events: [
    ['widget.rsvp.v1', 'RSVP', 'Going, Maybe, Can\'t go with countdown.', 'Edit event copy and countdown.'],
    ['widget.event_launch.v1', 'Launch countdown', 'Countdown with notify CTA.', 'Open link on notify.'],
    ['widget.event_live.v1', 'Live now banner', 'Wide banner for a live stream.', 'Open stream link.'],
    ['widget.event_checkin.v1', 'Event check-in', 'Stamp when you arrive.', 'Stamp trigger.'],
    ['widget.event_savedate.v1', 'Save the date', 'Add to calendar button.', 'Calendar CTA.'],
    ['widget.event_agenda.v1', 'Agenda card', 'Three agenda items revealed.', 'Tab reveal per item.']
  ],
  links: [
    ['widget.link_card.v1', 'Link card', 'Headline and open button.', 'Set open URL.'],
    ['widget.link_bio.v1', 'Link in bio', 'Three links stacked.', 'Three open buttons.'],
    ['widget.link_teaser.v1', 'Read more teaser', 'Teaser with reveal body.', 'Reveal long copy.'],
    ['widget.link_appbadge.v1', 'App badge', 'Download badge CTA.', 'Open store link.'],
    ['widget.link_swipeup.v1', 'Story swipe-up', 'Tall story CTA.', 'Open link.'],
    ['widget.link_message.v1', 'Message me', 'Start a conversation.', 'Open messaging handoff.']
  ],
  forms: [
    ['widget.form_newsletter.v1', 'Newsletter', 'Email field and subscribe.', 'Submit sends row.'],
    ['widget.form_contact.v1', 'Contact', 'Name, email, message.', 'Submit form.'],
    ['widget.form_feedback.v1', 'Feedback box', 'Short feedback field.', 'Submit.'],
    ['widget.form_waitlist.v1', 'Waitlist', 'Join waitlist field.', 'Submit.'],
    ['widget.form_quote.v1', 'Request a quote', 'Project details field.', 'Submit.'],
    ['widget.form_multistep.v1', 'Multi-step form', 'Three steps with next.', 'Step through fields.']
  ],
  community: [
    ['widget.community_features.v1', 'Feature board', 'Rank three feature ideas.', 'Rank buttons.'],
    ['widget.community_guestbook.v1', 'Guestbook', 'Sign with stamp + note.', 'Stamp and input.'],
    ['widget.community_challenge.v1', 'Challenge tracker', 'Toggle daily habits.', 'Toggle rows.'],
    ['widget.community_reactions.v1', 'Reaction bar', 'Pick a reaction.', 'Vote options.'],
    ['widget.community_ama.v1', 'AMA box', 'Ask a question field.', 'Submit question.']
  ],
  social: [
    ['widget.social_quote.v1', 'Quote card', 'Pull quote typography.', 'Open source link.'],
    ['widget.social_announce.v1', 'Announcement', 'Bold news headline.', 'Open details.'],
    ['widget.social_beforeafter.v1', 'Before / after', 'Tab between two shots.', 'Tab reveal.'],
    ['widget.social_tip.v1', 'Tip of the day', 'Hidden tip on tap.', 'Reveal tip.'],
    ['widget.social_stat.v1', 'Stat highlight', 'Big number story.', 'Open report.'],
    ['widget.social_bts.v1', 'Behind the scenes', 'Photo with caption reveal.', 'Reveal caption.'],
    ['widget.social_milestone.v1', 'Milestone', 'Celebrate with stamp.', 'Stamp celebration.']
  ],
  creator: [
    ['widget.creator_product.v1', 'Product card', 'Product pitch and buy link.', 'Open shop.'],
    ['widget.creator_tipjar.v1', 'Tip jar', 'Support link.', 'Open tip URL.'],
    ['widget.creator_portfolio.v1', 'Portfolio piece', 'Case study teaser.', 'Open project.']
  ],
  website: [
    ['widget.web_nav.v1', 'Nav bar', 'Home About Contact links.', 'Page go buttons.'],
    ['widget.web_hero.v1', 'Hero', 'Hero headline band.', 'Open CTA.'],
    ['widget.web_features.v1', 'Feature grid', 'Three feature blurbs.', 'Static layout.'],
    ['widget.web_testimonial.v1', 'Testimonial', 'Quote from a customer.', 'Open case study.'],
    ['widget.web_pricing.v1', 'Pricing tiers', 'Three plan buttons.', 'Open checkout links.'],
    ['widget.web_team.v1', 'Team', 'Three team cards.', 'Open profiles.'],
    ['widget.web_gallery.v1', 'Gallery carousel', 'Step through slides.', 'Step frames.'],
    ['widget.web_contact.v1', 'Contact section', 'Contact form strip.', 'Submit.'],
    ['widget.web_footer.v1', 'Footer', 'Links and copyright.', 'Open links.'],
    ['widget.web_stats.v1', 'Stats strip', 'Three metrics banner.', 'Open report.'],
    ['widget.web_logos.v1', 'Logo wall', 'Partner logos row.', 'Open partners.'],
    ['widget.web_cta.v1', 'CTA band', 'Full-width call to action.', 'Open signup.'],
    ['widget.web_faq.v1', 'FAQ accordion', 'Questions with tab answers.', 'Tab reveal.'],
    ['widget.web_tabs.v1', 'Tabs section', 'Switch tab panels.', 'Tab reveal.']
  ],
  education: [
    ['widget.edu_flashcard.v1', 'Flashcard', 'Term with toggle definition.', 'Toggle back.'],
    ['widget.edu_deck.v1', 'Flashcard deck', 'Step through cards.', 'Step + toggle.'],
    ['widget.edu_checklist.v1', 'Lesson checklist', 'Toggle lesson items.', 'Toggle rows.'],
    ['widget.edu_check.v1', 'Knowledge check', 'One question quiz.', 'Answer buttons.'],
    ['widget.edu_vocab.v1', 'Vocabulary card', 'Word and reveal meaning.', 'Reveal definition.']
  ],
  utilities: [
    ['widget.util_countdown.v1', 'Countdown', 'Event countdown clock.', 'Edit end time.'],
    ['widget.util_clock.v1', 'Clock', 'Live clock face.', 'Set clock time.'],
    ['widget.util_banner.v1', 'Announcement banner', 'Wide promo strip.', 'Open link.'],
    ['widget.util_checklist.v1', 'Checklist', 'Toggle tasks.', 'Toggle items.'],
    ['widget.util_tally.v1', 'Tally counter', 'Increment counter stamps.', 'Stamp tally.']
  ]
};

const GRADIENTS = [
  'linear-gradient(150deg,#0f766e 0%,#1e3a8a 60%,#312e81 100%)',
  'linear-gradient(160deg,#f97316 0%,#db2777 70%,#9d174d 100%)',
  'radial-gradient(circle at 30% 20%,#4c1d95 0%,#111827 70%)',
  'linear-gradient(135deg,#fef3c7 0%,#fde68a 45%,#f59e0b 100%)',
  'linear-gradient(145deg,#0ea5e9 0%,#6366f1 55%,#312e81 100%)',
  'linear-gradient(120deg,#14532d 0%,#166534 50%,#052e16 100%)',
  'linear-gradient(165deg,#1c1917 0%,#44403c 40%,#78716c 100%)',
  'linear-gradient(155deg,#be123c 0%,#9f1239 50%,#4c0519 100%)'
];

function shapes(i) {
  const a = 180 + (i % 5) * 20;
  return `<div class="s" style="width:${a}px;height:${a}px;right:-50px;top:-40px;background:rgba(255,255,255,0.15)"></div><div class="s" style="width:90px;height:90px;left:-30px;bottom:-30px;background:rgba(255,255,255,0.1)"></div>`;
}

function usesOpt(behavior) {
  return ['vote', 'reveal', 'toggleReveal', 'step', 'quiz', 'toggle', 'rank', 'allocate', 'pagego'].includes(behavior);
}

function usesBodyStyle(behavior) {
  return ['reveal', 'toggleReveal', 'step'].includes(behavior);
}

function usesCountdown(id) {
  return id.includes('countdown') || id.includes('launch');
}

function kitImportLine(behaviors, ids) {
  const names = new Set(['artHtml', 'artLayer', 'buttonLayer', 'curatedCardSeed', 'kickerStyle', 'textLayer', 'titleStyle']);
  for (const b of behaviors) {
    if (usesBodyStyle(b)) names.add('bodyStyle');
  }
  for (const id of ids) {
    if (usesCountdown(id)) names.add('countdownLayer');
  }
  return `import { ${[...names].sort().join(', ')} } from './kit.js';`;
}

function layerLines(id, title, category, aspect, gi, behavior) {
  const h = aspect === 'story' ? 640 : aspect === 'banner' ? 120 : 360;
  const prefix = id.replace(/\./g, '_').replace(/widget_/g, 'w_');
  const grad = GRADIENTS[gi % GRADIENTS.length];
  const lines = [];
  lines.push(`export function seed${toSeedName(id)}(): SeedBundle {`);
  if (usesOpt(behavior)) {
    lines.push(`  const opt = { fill: 'rgba(255,255,255,0.16)', color: '#ffffff' };`);
  }
  lines.push(`  return curatedCardSeed([`);
  lines.push(`    artLayer('${prefix}_art', artHtml('${grad}', '${shapes(gi)}'), ${h}),`);
  lines.push(`    textLayer('${prefix}_k', { x: 24, y: 12, w: 280, h: 28, z: 2 }, '${category.toUpperCase()}', kickerStyle),`);
  lines.push(`    textLayer('${prefix}_t', { x: 24, y: 44, w: 312, h: 56, z: 3 }, '${title.replace(/'/g, "\\'")}', titleStyle),`);
  return { lines, prefix, h };
}

function toSeedName(id) {
  const base = id.replace(/^widget\./, '').replace(/\.v1$/, '');
  return base.split(/[._]/).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('');
}

function behaviorFor(id, title) {
  if (id.includes('rank') || id.includes('features')) return 'rank';
  if (id.includes('budget') || id.includes('allocate')) return 'allocate';
  if (id.includes('checkin') || id.includes('milestone') || id.includes('tally') || id.includes('guestbook')) return 'stamp';
  if (id.includes('challenge') || id.includes('checklist') || id.includes('lesson')) return 'toggle';
  if (id.includes('multistep') || id.includes('deck') || id.includes('gallery')) return 'step';
  if (id.includes('multi') || id.includes('check.v1')) return 'quiz';
  if (id.includes('savedate')) return 'calendar';
  if (id.includes('nav')) return 'pagego';
  if (id.includes('message')) return 'mailto';
  if (
    id.includes('form_') ||
    id.includes('ama') ||
    id.includes('contact') ||
    id.includes('newsletter') ||
    id.includes('feedback') ||
    id.includes('waitlist') ||
    id.includes('quote')
  )
    return 'submit';
  if (
    id.includes('hidden') ||
    id.includes('teaser') ||
    id.includes('riddle') ||
    id.includes('tip') ||
    id.includes('bts') ||
    id.includes('vocab') ||
    id.includes('image') ||
    id.includes('faq') ||
    id.includes('tabs') ||
    id.includes('beforeafter')
  )
    return 'reveal';
  if (id.includes('uncover') || id.includes('flashcard')) return 'toggleReveal';
  if (id.includes('poll') || id.includes('rating') || id.includes('hottake') || id.includes('thisorthat') || id.includes('personality') || id.includes('reactions') || id.includes('truefalse'))
    return 'vote';
  return 'open';
}

function finishSeed({ lines, prefix, h, id, behavior }) {
  const yBase = h === 120 ? 72 : h === 640 ? 520 : 280;
  if (behavior === 'vote') {
    lines.push(`    buttonLayer('${prefix}_a', { x: 24, y: ${yBase}, w: 312, h: 36, z: 5 }, 'Option A', opt, { behavior: 'poll.vote', bindRowId: '${prefix}_a' }),`);
    lines.push(`    buttonLayer('${prefix}_b', { x: 24, y: ${yBase + 44}, w: 312, h: 36, z: 6 }, 'Option B', opt, { behavior: 'poll.vote', bindRowId: '${prefix}_b' })`);
  } else if (behavior === 'open') {
    lines.push(`    buttonLayer('${prefix}_go', { x: 24, y: ${yBase}, w: 200, h: 40, z: 5 }, 'Open', { fill: '#111827', color: '#fff' }, { behavior: 'cta.open', openUrl: 'https://parnoir.com' })`);
  } else if (behavior === 'reveal') {
    lines.push(`    buttonLayer('${prefix}_rv', { x: 24, y: ${yBase}, w: 140, h: 36, z: 5 }, 'Show', opt, { behavior: 'widget.reveal', revealLayerId: '${prefix}_body', revealMode: '${id.includes('faq') || id.includes('tabs') || id.includes('beforeafter') || id.includes('agenda') ? 'tab' : 'show'}' }),`);
    lines.push(`    textLayer('${prefix}_body', { x: 24, y: ${yBase + 44}, w: 312, h: 48, z: 6 }, 'More detail lives here.', bodyStyle, { visible: false })`);
  } else if (behavior === 'toggleReveal') {
    lines.push(`    buttonLayer('${prefix}_tg', { x: 24, y: ${yBase}, w: 160, h: 36, z: 5 }, 'Flip', opt, { behavior: 'widget.reveal', revealLayerId: '${prefix}_back', revealMode: 'toggle' }),`);
    lines.push(`    textLayer('${prefix}_back', { x: 24, y: ${yBase + 44}, w: 312, h: 48, z: 6 }, 'Back side text.', bodyStyle, { visible: false })`);
  } else if (behavior === 'calendar') {
    lines.push(`    buttonLayer('${prefix}_cal', { x: 24, y: ${yBase}, w: 200, h: 40, z: 5 }, 'Add to calendar', { fill: '#fde68a', color: '#111' }, { behavior: 'cta.calendar', eventTitle: '${id}', eventDurationMin: 60 })`);
  } else if (behavior === 'step') {
    lines.push(`    textLayer('${prefix}_f0', { x: 24, y: ${yBase - 40}, w: 312, h: 36, z: 4 }, 'Step 1', bodyStyle, { stepFrame: 0 }),`);
    lines.push(`    textLayer('${prefix}_f1', { x: 24, y: ${yBase - 40}, w: 312, h: 36, z: 4 }, 'Step 2', bodyStyle, { stepFrame: 1 }),`);
    lines.push(`    buttonLayer('${prefix}_next', { x: 24, y: ${yBase}, w: 120, h: 36, z: 5 }, 'Next', opt, { behavior: 'widget.step', stepDir: 'next' })`);
  } else if (behavior === 'quiz') {
    lines.push(`    buttonLayer('${prefix}_ans', { x: 24, y: ${yBase}, w: 312, h: 36, z: 5 }, 'Answer', opt, { behavior: 'quiz.answer', correct: true }),`);
    lines.push(`    { id: '${prefix}_score', kind: 'text' as const, widgetElement: 'score' as const, name: 'Score', x: 24, y: ${yBase + 44}, w: 120, h: 32, zIndex: 6, positionLocked: false, backgroundColor: 'transparent', textColor: '#fff' }`);
  } else if (behavior === 'submit') {
    lines.push(`    { id: '${prefix}_in', kind: 'text' as const, widgetElement: 'input' as const, name: 'Field', label: 'Your reply…', x: 24, y: ${yBase}, w: 312, h: 36, zIndex: 5, positionLocked: false, backgroundColor: '#fff', textColor: '#111', cornerRadius: 8 },`);
    lines.push(`    buttonLayer('${prefix}_send', { x: 24, y: ${yBase + 44}, w: 120, h: 36, z: 6 }, 'Send', { fill: '#0f766e', color: '#fff' }, { behavior: 'widget.submit' })`);
  } else if (behavior === 'stamp') {
    lines.push(`    buttonLayer('${prefix}_st', { x: 24, y: ${yBase}, w: 160, h: 40, z: 5 }, 'Check in', { fill: '#34d399', color: '#111' }, { behavior: 'widget.stamp' })`);
  } else if (behavior === 'toggle') {
    lines.push(`    buttonLayer('${prefix}_t1', { x: 24, y: ${yBase}, w: 312, h: 36, z: 5 }, 'Task one', opt, { behavior: 'widget.toggle', bindRowId: '${prefix}_t1' })`);
  } else if (behavior === 'rank') {
    lines.push(`    buttonLayer('${prefix}_r1', { x: 24, y: ${yBase}, w: 312, h: 36, z: 5 }, 'Idea A', opt, { behavior: 'widget.rank', bindRowId: '${prefix}_r1' })`);
  } else if (behavior === 'allocate') {
    lines.push(`    buttonLayer('${prefix}_al', { x: 24, y: ${yBase}, w: 312, h: 36, z: 5 }, 'Bucket A', opt, { behavior: 'widget.allocate', bindRowId: '${prefix}_al' })`);
  } else if (behavior === 'pagego') {
    lines.push(`    buttonLayer('${prefix}_h', { x: 24, y: ${yBase}, w: 90, h: 32, z: 5 }, 'Home', opt, { behavior: 'page.go', goTo: 'page:0' }),`);
    lines.push(`    buttonLayer('${prefix}_a', { x: 120, y: ${yBase}, w: 90, h: 32, z: 6 }, 'About', opt, { behavior: 'page.go', goTo: 'page:1' }),`);
    lines.push(`    buttonLayer('${prefix}_c', { x: 216, y: ${yBase}, w: 90, h: 32, z: 7 }, 'Contact', opt, { behavior: 'page.go', goTo: 'page:2' })`);
  } else if (behavior === 'mailto') {
    lines.push(`    buttonLayer('${prefix}_msg', { x: 24, y: ${yBase}, w: 200, h: 40, z: 5 }, 'Message', { fill: '#6366f1', color: '#fff' }, { behavior: 'cta.open', openUrl: 'mailto:hello@parnoir.com' })`);
  }
  const needsCountdown = usesCountdown(id);
  if (needsCountdown) {
    lines.push(`,`);
    lines.push(`    countdownLayer('${prefix}_cd', { x: 24, y: ${yBase - 60}, w: 120, h: 24, z: 4 }, '#fde68a', 3)`);
  }
  lines.push(`  ]);`);
  lines.push(`}`);
  return lines.join('\n');
}

async function main() {
  await mkdir(outDir, { recursive: true });

  const kit = `/** Shared layer builders for curated widget starters. */
import { socialPresentation, type SeedBundle } from '../starterSeeds.js';
import { plainDoc } from '../widgetElements.js';
import type { PenPageLayer, PenTipTapNode } from '../types.js';

export const CURATED_SANS = 'Montserrat, Helvetica, sans-serif';
export const CURATED_SERIF = 'Source Serif 4, Georgia, serif';

export const kickerStyle = { fontFamily: CURATED_SANS, fontSize: 11, color: '#fde68a', bold: true as const };
export const titleStyle = { fontFamily: CURATED_SERIF, fontSize: 24, color: '#ffffff', bold: true as const };
export const bodyStyle = { fontFamily: CURATED_SANS, fontSize: 14, color: '#ffffff', bold: true as const };

function styledDoc(text: string, style: { fontFamily: string; fontSize: number; color: string; bold?: boolean }): PenTipTapNode {
  const marks: NonNullable<PenTipTapNode['marks']> = [{ type: 'textStyle', attrs: { fontFamily: style.fontFamily, fontSize: \`\${style.fontSize}px\`, color: style.color } }];
  if (style.bold) marks.push({ type: 'bold' });
  return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text, marks }] }] };
}

export function curatedCardSeed(layers: PenPageLayer[]): SeedBundle {
  return {
    seedPageLayout: 'flow',
    seedPagePresentation: socialPresentation({
      backgroundColor: 'transparent',
      backgroundGradient: undefined,
      backgroundImage: undefined,
      fontFamily: 'Source Serif 4, Georgia, serif',
      fontSize: 28,
      textAlign: 'left',
      textColor: '#141414',
      padding: 0,
      dropShadowBlur: 0,
      dropShadowOffsetX: 0,
      dropShadowOffsetY: 0
    }),
    seedSections: [{ slug: 'card', doc: plainDoc(''), layers }]
  };
}

export function artLayer(id: string, htmlSource: string, h = 360): PenPageLayer {
  return { id, kind: 'text', widgetElement: 'html', name: 'Art', x: 0, y: 0, w: 360, h, zIndex: 1, positionLocked: false, htmlSource };
}

export function artHtml(background: string, shapes: string): string {
  return \`<style>html,body{margin:0;height:100%;overflow:hidden}body{background:\${background}}.s{position:absolute;border-radius:50%}</style>\${shapes}\`;
}

export function textLayer(id: string, box: { x: number; y: number; w: number; h: number; z: number }, text: string, style: { fontFamily: string; fontSize: number; color: string; bold?: boolean }, extra: Partial<PenPageLayer> = {}): PenPageLayer {
  return { id, kind: 'text', widgetElement: 'text', name: text.slice(0, 24), x: box.x, y: box.y, w: box.w, h: box.h, zIndex: box.z, positionLocked: false, backgroundColor: 'transparent', textDoc: styledDoc(text, style), ...extra };
}

export function buttonLayer(id: string, box: { x: number; y: number; w: number; h: number; z: number }, face: string, look: { fill: string; color: string }, extra: Partial<PenPageLayer>): PenPageLayer {
  return { id, kind: 'interactive', widgetElement: 'button', name: face, label: face, x: box.x, y: box.y, w: box.w, h: box.h, zIndex: box.z, positionLocked: false, backgroundColor: look.fill, textColor: look.color, cornerRadius: Math.round(box.h / 2), textDoc: styledDoc(face, { fontFamily: CURATED_SANS, fontSize: 14, color: look.color, bold: true }), ...extra };
}

export function countdownLayer(id: string, box: { x: number; y: number; w: number; h: number; z: number }, color: string, days: number): PenPageLayer {
  return { id, kind: 'text', widgetElement: 'time', name: 'Countdown', x: box.x, y: box.y, w: box.w, h: box.h, zIndex: box.z, positionLocked: false, backgroundColor: 'transparent', textColor: color, timeFace: 'countdown', closesAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString() };
}
`;

  await writeFile(path.join(outDir, 'kit.ts'), kit);

  let gi = 0;
  const meta = [];
  const seedExports = [];
  const categoryFiles = [];

  for (const [cat, items] of Object.entries(CATEGORIES)) {
    const fileSeeds = [];
    const fileBehaviors = [];
    const fileIds = [];
    const LEGACY_IDS = new Set([
      'widget.poll_writein.v1',
      'widget.quiz.v1',
      'widget.rsvp.v1',
      'widget.link_card.v1'
    ]);
    for (const [id, title, desc, focus] of items) {
      if (LEGACY_IDS.has(id)) {
        const legacySeed = {
          'widget.poll_writein.v1': 'seedPollWriteInWidget',
          'widget.quiz.v1': 'seedQuizWidget',
          'widget.rsvp.v1': 'seedRsvpWidget',
          'widget.link_card.v1': 'seedLinkCardWidget'
        }[id];
        meta.push({ id, category: cat, title, description: desc, focus, seedExport: legacySeed });
        gi++;
        continue;
      }
      const aspect = id.includes('live') || id.includes('banner') || id.includes('stats') || id.includes('cta') || id.includes('logos') ? 'banner' : id.includes('swipeup') ? 'story' : 'square';
      const behavior = behaviorFor(id, title);
      fileBehaviors.push(behavior);
      fileIds.push(id);
      const partial = layerLines(id, title, cat, aspect, gi, behavior);
      fileSeeds.push(finishSeed({ ...partial, id, behavior }));
      fileSeeds.push('');
      meta.push({ id, category: cat, title, description: desc, focus, seedExport: `seed${toSeedName(id)}` });
      seedExports.push(`seed${toSeedName(id)}`);
      gi++;
    }
    const fname = `${cat}.ts`;
    categoryFiles.push(fname);
    const header = [
      `import type { SeedBundle } from '../starterSeeds.js';`,
      kitImportLine(fileBehaviors, fileIds),
      ''
    ];
    await writeFile(path.join(outDir, fname), [...header, ...fileSeeds].join('\n'));
  }

  const legacy = `/** Hand-authored starters (richer than generated defaults). */
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
`;
  await writeFile(path.join(outDir, 'legacy.ts'), legacy);

  // Override generated seeds for legacy ids - remove duplicates from category files by using legacy imports in index
  const index = `import type { SeedBundle } from '../starterSeeds.js';
import type { PenTemplate } from '../templates.js';
import { proseStarter, withSeedBundle } from './registerHelpers.js';
import * as polls from './polls.js';
import * as quizzes from './quizzes.js';
import * as events from './events.js';
import * as links from './links.js';
import * as forms from './forms.js';
import * as community from './community.js';
import * as social from './social.js';
import * as creator from './creator.js';
import * as website from './website.js';
import * as education from './education.js';
import * as utilities from './utilities.js';
import * as legacy from './legacy.js';

export type CuratedWidgetCategory =
  | 'polls'
  | 'quizzes'
  | 'events'
  | 'links'
  | 'forms'
  | 'community'
  | 'social'
  | 'creator'
  | 'website'
  | 'education'
  | 'utilities';

export const CURATED_WIDGET_CATEGORIES: { id: CuratedWidgetCategory; label: string }[] = [
  { id: 'polls', label: 'Polls' },
  { id: 'quizzes', label: 'Quizzes & games' },
  { id: 'events', label: 'Events' },
  { id: 'links', label: 'Links' },
  { id: 'forms', label: 'Forms' },
  { id: 'community', label: 'Community' },
  { id: 'social', label: 'Social posts' },
  { id: 'creator', label: 'Creator' },
  { id: 'website', label: 'Website sections' },
  { id: 'education', label: 'Education' },
  { id: 'utilities', label: 'Utilities' }
];

type Entry = {
  id: string;
  category: CuratedWidgetCategory;
  title: string;
  description: string;
  focus: string;
  seed: () => SeedBundle;
};

type CuratedMetaRow = {
  id: string;
  category: CuratedWidgetCategory;
  title: string;
  description: string;
  focus: string;
  seedExport: string;
};

const LEGACY: Record<string, () => SeedBundle> = {
  'widget.poll_writein.v1': legacy.seedPollWriteInWidget,
  'widget.quiz.v1': legacy.seedQuizWidget,
  'widget.rsvp.v1': legacy.seedRsvpWidget,
  'widget.link_card.v1': legacy.seedLinkCardWidget
};

const META: CuratedMetaRow[] = ${JSON.stringify(meta, null, 2)};

const seedModules = { ...polls, ...quizzes, ...events, ...links, ...forms, ...community, ...social, ...creator, ...website, ...education, ...utilities, ...legacy } as Record<string, () => SeedBundle>;

export const CURATED_WIDGET_ENTRIES: Entry[] = META.map((row) => {
  const legacyFn = LEGACY[row.id];
  const fn = legacyFn || seedModules[row.seedExport];
  if (!fn) throw new Error(\`missing seed \${row.seedExport} for \${row.id}\`);
  const { seedExport: _seedExport, ...rest } = row;
  return { ...rest, seed: fn };
});

export const CURATED_WIDGET_IDS = CURATED_WIDGET_ENTRIES.map((e) => e.id);

export function curatedWidgetTemplates(): PenTemplate[] {
  return CURATED_WIDGET_ENTRIES.map((entry) =>
    withSeedBundle(
      {
        id: entry.id,
        classId: 'widgets.widget',
        docType: 'widget',
        version: '1',
        title: entry.title,
        description: entry.description,
        widgetCategory: entry.category,
        sections: [{ slug: 'card', title: 'Card', required: true }],
        seedGalleryAspect: entry.id.includes('swipeup') ? '9/16' : entry.id.includes('banner') || entry.id.includes('live') || entry.id.includes('stats') || entry.id.includes('cta') || entry.id.includes('logos') ? '16/9' : '1/1',
        agentStarter: proseStarter({ title: entry.title, focus: entry.focus })
      },
      entry.seed()
    )
  );
}

export {
  seedPollWriteInWidget,
  seedQuizWidget,
  seedRsvpWidget,
  seedLinkCardWidget
} from './legacy.js';
`;

  await writeFile(
    path.join(outDir, 'registerHelpers.ts'),
    `import type { PenTemplate } from '../templates.js';
import type { SeedBundle } from '../starterSeeds.js';

export function proseStarter(input: { title: string; focus: string }): string {
  return [
    \`You are authoring a Pen document with template {{template_id}} ("\${input.title}").\`,
    input.focus,
    'Sections for this template: {{section_list}}.',
    'Emit ONLY a PenAgentBuild JSON object: { "templateId", "title", "sections": [{ "slug", "plainText" }] }.',
    'Use only the section slugs listed. Do not invent folder paths, file layouts, or parallel formats.',
    'Never include secrets, pn name, passcodes, tokens, or raw account identifiers.',
    'User request:',
    '{{user_input}}'
  ].join('\\n');
}

export function withSeedBundle(base: Omit<PenTemplate, 'seedSections' | 'seedPagePresentation' | 'seedPageLayout'>, seed: SeedBundle): PenTemplate {
  return { ...base, seedSections: seed.seedSections, seedPagePresentation: seed.seedPagePresentation, seedPageLayout: seed.seedPageLayout };
}
`
  );

  await writeFile(path.join(outDir, 'index.ts'), index);

  console.log('Wrote', categoryFiles.length, 'category files,', meta.length, 'widgets');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
