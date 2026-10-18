/**
 * A widget is a template. Layers sit where the user dragged them.
 * A button has no trigger until one is set. Vote is the only trigger
 * that writes the poll sheet.
 */

import { PEN_WIDGET_ACTION_KIND } from './outbox.js';
import { upsertLayer } from './layers.js';
import {
  pollIsClosed,
  pollLayers,
  structureFromLayers,
  upsertUserRow,
  type PollCounts
} from './pollSheet.js';
import { docToPlainText } from './richDoc.js';
import { socialPresentation, type SeedBundle } from './starterSeeds.js';
import type {
  PenInteractiveBehavior,
  PenPageLayer,
  PenSectionContent,
  PenTipTapNode,
  PenWidgetElement
} from './types.js';

export const WIDGET_TEMPLATE_ID = 'widget.v1';

export const DEFAULT_WIDGET_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80" preserveAspectRatio="none"><rect width="120" height="80" rx="8" fill="#101418"/></svg>`;

const SHEET_TRIGGERS = ['widget.toggle', 'widget.stamp', 'widget.rank', 'widget.allocate'] as const;

export type WidgetSheetTrigger = (typeof SHEET_TRIGGERS)[number];

/** Sheet write that is not a press trigger. Submit records a form row. */
export type WidgetWriteTrigger = WidgetSheetTrigger | 'widget.submit';

export const WIDGET_TAB: Record<WidgetSheetTrigger, 'Toggle' | 'Stamp' | 'Rank' | 'Allocate'> = {
  'widget.toggle': 'Toggle',
  'widget.stamp': 'Stamp',
  'widget.rank': 'Rank',
  'widget.allocate': 'Allocate'
};

export type WidgetActionRow = {
  actionId: string;
  trigger: WidgetWriteTrigger;
  actorId: string;
  createdAt: string;
  fields?: Record<string, string>;
  present?: boolean;
  /** Column labels after `user`. */
  headers?: string[];
  /** Cells aligned with headers. */
  cells?: string[];
  order?: string[];
  split?: Record<string, number>;
};

function elementId(): string {
  return `el_${Math.random().toString(36).slice(2, 10)}`;
}

export function plainDoc(text: string): PenTipTapNode {
  return {
    type: 'doc',
    content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }]
  };
}

export function sanitizeWidgetMarkup(source: string): string {
  return source
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '');
}

/** A placed widget element, button, or imported widget group. Media stays in the media editor. */
export function layerOpensWidgetEditor(layer: PenPageLayer | null | undefined): boolean {
  if (!layer || layer.kind === 'guide' || layer.kind === 'image' || layer.kind === 'video') return false;
  if (layer.widgetElement) return true;
  if (layer.kind === 'interactive') return true;
  if (layer.kind === 'group' && layer.widgetTemplateId) return true;
  return false;
}

export function timeLayerCaption(
  layer: Pick<PenPageLayer, 'timeFace' | 'clockTime' | 'closesAt'>,
  now = Date.now()
): string {
  const mode = layer.timeFace ?? (layer.closesAt ? 'countdown' : 'blank');
  if (mode === 'blank') return '';
  if (mode === 'clock') return layer.clockTime || '';
  if (!layer.closesAt) return '';
  return formatCountdown(layer.closesAt, now);
}

export function formatCountdown(closesAt: string, now = Date.now()): string {
  if (pollIsClosed(closesAt, now)) return '00:00:00';
  const remain = Math.max(0, Date.parse(closesAt) - now);
  const total = Math.floor(remain / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return `${hours}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
}

function cardSeed(layers: PenPageLayer[]): SeedBundle {
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

/** Empty template. Nothing is pre-arranged and no button is a vote. */
export function seedWidget(): SeedBundle {
  return cardSeed([]);
}

/** One text layer that rises in. The motion is the preset. */
export function seedAnimationPreset(): SeedBundle {
  return cardSeed([
    {
      id: 'anim_sample',
      kind: 'text',
      name: 'Rise',
      x: 48,
      y: 56,
      w: 200,
      h: 48,
      zIndex: 1,
      positionLocked: false,
      textDoc: plainDoc('Rise'),
      motion: {
        keys: [],
        animation: { in: 'rise', durationSec: 0.4 }
      }
    }
  ]);
}

/** Two clips on one track. The second fades in from the first. */
export function seedTransitionPreset(): SeedBundle {
  return cardSeed([
    {
      id: 'clip_out',
      kind: 'text',
      name: 'Out',
      x: 48,
      y: 56,
      w: 160,
      h: 48,
      zIndex: 1,
      positionLocked: false,
      textDoc: plainDoc('Out'),
      timelineTrackId: 'join',
      inSec: 0,
      outSec: 2
    },
    {
      id: 'clip_in',
      kind: 'text',
      name: 'In',
      x: 48,
      y: 120,
      w: 160,
      h: 48,
      zIndex: 2,
      positionLocked: false,
      textDoc: plainDoc('In'),
      timelineTrackId: 'join',
      inSec: 2,
      outSec: 4,
      transitionIn: { preset: 'crossfade', durationSec: 0.5 }
    }
  ]);
}

/** One styled sample: family, size, color, stroke, and shadow. */
export function seedTextPreset(): SeedBundle {
  return cardSeed([
    {
      id: 'text_sample',
      kind: 'text',
      name: 'Sample',
      x: 32,
      y: 48,
      w: 240,
      h: 64,
      zIndex: 1,
      positionLocked: false,
      textColor: '#141414',
      strokeColor: '#141414',
      strokeWidth: 1,
      strokeStyle: 'solid',
      shadowColor: '#000000',
      shadowBlur: 8,
      shadowOffsetX: 0,
      shadowOffsetY: 2,
      textDoc: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'Sample',
                marks: [
                  {
                    type: 'textStyle',
                    attrs: {
                      fontFamily: 'Source Serif 4, Georgia, serif',
                      fontSize: '28px',
                      color: '#141414'
                    }
                  }
                ]
              }
            ]
          }
        ]
      }
    }
  ]);
}

const CURATED_SANS = 'Montserrat, Helvetica, sans-serif';
const CURATED_SERIF = 'Source Serif 4, Georgia, serif';

/** Starters with designed art; each ships a screenshot poster in the Pen app. */
export const CURATED_WIDGET_IDS = [
  'widget.poll_writein.v1',
  'widget.quiz.v1',
  'widget.rsvp.v1',
  'widget.link_card.v1'
] as const;

function styledDoc(
  text: string,
  style: { fontFamily: string; fontSize: number; color: string; bold?: boolean }
): PenTipTapNode {
  const marks: NonNullable<PenTipTapNode['marks']> = [
    {
      type: 'textStyle',
      attrs: { fontFamily: style.fontFamily, fontSize: `${style.fontSize}px`, color: style.color }
    }
  ];
  if (style.bold) marks.push({ type: 'bold' });
  return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text, marks }] }] };
}

function artLayer(id: string, htmlSource: string): PenPageLayer {
  return {
    id,
    kind: 'text',
    widgetElement: 'html',
    name: 'Art',
    x: 0,
    y: 0,
    w: 360,
    h: 360,
    zIndex: 1,
    positionLocked: false,
    htmlSource
  };
}

function artHtml(background: string, shapes: string): string {
  return `<style>html,body{margin:0;height:100%;overflow:hidden}body{background:${background}}.s{position:absolute;border-radius:50%}</style>${shapes}`;
}

function textLayer(
  id: string,
  box: { x: number; y: number; w: number; h: number; z: number },
  text: string,
  style: { fontFamily: string; fontSize: number; color: string; bold?: boolean },
  extra: Partial<PenPageLayer> = {}
): PenPageLayer {
  return {
    id,
    kind: 'text',
    widgetElement: 'text',
    name: text.slice(0, 24),
    x: box.x,
    y: box.y,
    w: box.w,
    h: box.h,
    zIndex: box.z,
    positionLocked: false,
    backgroundColor: 'transparent',
    textDoc: styledDoc(text, style),
    ...extra
  };
}

function buttonLayer(
  id: string,
  box: { x: number; y: number; w: number; h: number; z: number },
  face: string,
  look: { fill: string; color: string },
  extra: Partial<PenPageLayer>
): PenPageLayer {
  return {
    id,
    kind: 'interactive',
    widgetElement: 'button',
    name: face,
    label: face,
    x: box.x,
    y: box.y,
    w: box.w,
    h: box.h,
    zIndex: box.z,
    positionLocked: false,
    backgroundColor: look.fill,
    textColor: look.color,
    cornerRadius: Math.round(box.h / 2),
    textDoc: styledDoc(face, { fontFamily: CURATED_SANS, fontSize: 14, color: look.color, bold: true }),
    ...extra
  };
}

function countdownLayer(
  id: string,
  box: { x: number; y: number; w: number; h: number; z: number },
  color: string,
  days: number
): PenPageLayer {
  return {
    id,
    kind: 'text',
    widgetElement: 'time',
    name: 'Countdown',
    x: box.x,
    y: box.y,
    w: box.w,
    h: box.h,
    zIndex: box.z,
    positionLocked: false,
    backgroundColor: 'transparent',
    textColor: color,
    timeFace: 'countdown',
    closesAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
  };
}

/** Question, three options, a typed Other answer, and a countdown on a drawn card. */
export function seedPollWriteInWidget(): SeedBundle {
  const option = { fill: 'rgba(255,255,255,0.16)', color: '#ffffff' };
  return cardSeed([
    artLayer(
      'pw_art',
      artHtml(
        'linear-gradient(150deg,#0f766e 0%,#1e3a8a 60%,#312e81 100%)',
        '<div class="s" style="width:220px;height:220px;right:-60px;top:-70px;background:rgba(253,230,138,0.25)"></div><div class="s" style="width:140px;height:140px;left:-40px;bottom:-50px;background:rgba(255,255,255,0.12)"></div>'
      )
    ),
    textLayer('pw_kicker', { x: 24, y: 12, w: 200, h: 32, z: 2 }, 'COMMUNITY POLL', {
      fontFamily: CURATED_SANS,
      fontSize: 11,
      color: '#fde68a',
      bold: true
    }),
    textLayer('pw_question', { x: 24, y: 42, w: 312, h: 56, z: 3 }, 'What should we build next?', {
      fontFamily: CURATED_SERIF,
      fontSize: 24,
      color: '#ffffff',
      bold: true
    }, { name: 'Question' }),
    countdownLayer('pw_time', { x: 22, y: 100, w: 90, h: 20, z: 4 }, '#fde68a', 2),
    buttonLayer('pw_opt_a', { x: 24, y: 130, w: 312, h: 36, z: 5 }, 'Live audio rooms', option, {
      behavior: 'poll.vote',
      bindRowId: 'pw_opt_a'
    }),
    buttonLayer('pw_opt_b', { x: 24, y: 174, w: 312, h: 36, z: 6 }, 'Shared notebooks', option, {
      behavior: 'poll.vote',
      bindRowId: 'pw_opt_b'
    }),
    buttonLayer('pw_opt_c', { x: 24, y: 218, w: 312, h: 36, z: 7 }, 'Offline mode', option, {
      behavior: 'poll.vote',
      bindRowId: 'pw_opt_c'
    }),
    {
      id: 'pw_writein_field',
      kind: 'text',
      widgetElement: 'input',
      name: 'Write-in',
      label: 'Something else…',
      x: 24,
      y: 268,
      w: 216,
      h: 36,
      zIndex: 8,
      positionLocked: false,
      backgroundColor: '#ffffff',
      textColor: '#141414',
      cornerRadius: 18
    },
    buttonLayer(
      'pw_writein',
      { x: 248, y: 268, w: 88, h: 36, z: 9 },
      'Vote',
      { fill: '#fde68a', color: '#1e1b4b' },
      { behavior: 'poll.vote', bindRowId: 'pw_writein', writeIn: true, label: 'Other', name: 'Other' }
    ),
    textLayer('pw_note', { x: 24, y: 314, w: 312, h: 32, z: 10 }, 'Only the creator sees write-in answers.', {
      fontFamily: CURATED_SANS,
      fontSize: 11,
      color: 'rgba(255,255,255,0.7)'
    })
  ]);
}

/** Question, three answers with one correct, and a Reveal for the explanation. */
export function seedQuizWidget(): SeedBundle {
  const answer = { fill: '#ffffff', color: '#7c2d12' };
  return cardSeed([
    artLayer(
      'qz_art',
      artHtml(
        'linear-gradient(160deg,#f97316 0%,#db2777 70%,#9d174d 100%)',
        '<div class="s" style="width:180px;height:180px;right:-50px;bottom:-40px;background:rgba(255,255,255,0.18)"></div><div class="s" style="width:60px;height:60px;left:280px;top:24px;background:rgba(255,255,255,0.3)"></div>'
      )
    ),
    textLayer('qz_kicker', { x: 24, y: 12, w: 200, h: 32, z: 2 }, 'QUICK QUIZ', {
      fontFamily: CURATED_SANS,
      fontSize: 11,
      color: '#ffedd5',
      bold: true
    }),
    textLayer('qz_question', { x: 24, y: 42, w: 260, h: 64, z: 3 }, 'Which planet has the most moons?', {
      fontFamily: CURATED_SERIF,
      fontSize: 24,
      color: '#ffffff',
      bold: true
    }, { name: 'Question' }),
    buttonLayer('qz_a', { x: 24, y: 120, w: 312, h: 36, z: 4 }, 'Jupiter', answer, {
      behavior: 'poll.vote',
      bindRowId: 'qz_a'
    }),
    buttonLayer('qz_b', { x: 24, y: 164, w: 312, h: 36, z: 5 }, 'Saturn', answer, {
      behavior: 'poll.vote',
      bindRowId: 'qz_b',
      correct: true
    }),
    buttonLayer('qz_c', { x: 24, y: 208, w: 312, h: 36, z: 6 }, 'Neptune', answer, {
      behavior: 'poll.vote',
      bindRowId: 'qz_c'
    }),
    buttonLayer(
      'qz_reveal',
      { x: 24, y: 260, w: 140, h: 32, z: 7 },
      'Show answer',
      { fill: 'rgba(0,0,0,0.25)', color: '#ffffff' },
      { behavior: 'widget.reveal', revealLayerId: 'qz_answer' }
    ),
    textLayer(
      'qz_answer',
      { x: 24, y: 300, w: 312, h: 44, z: 8 },
      'Saturn. It has 146 confirmed moons.',
      { fontFamily: CURATED_SANS, fontSize: 14, color: '#ffffff', bold: true },
      { visible: false }
    )
  ]);
}

/** Invitation art, event details, a countdown, and Going / Maybe / Can't go. */
export function seedRsvpWidget(): SeedBundle {
  const pick = { fill: 'rgba(255,255,255,0.14)', color: '#ffffff' };
  return cardSeed([
    artLayer(
      'rv_art',
      artHtml(
        'radial-gradient(circle at 30% 20%,#4c1d95 0%,#111827 70%)',
        '<div class="s" style="width:10px;height:10px;left:300px;top:40px;background:#f472b6"></div><div class="s" style="width:6px;height:6px;left:260px;top:90px;background:#fde68a"></div><div class="s" style="width:14px;height:14px;left:320px;top:130px;background:#34d399"></div><div class="s" style="width:8px;height:8px;left:230px;top:30px;background:#60a5fa"></div><div class="s" style="width:200px;height:200px;left:-80px;bottom:-90px;background:rgba(244,114,182,0.2)"></div>'
      )
    ),
    textLayer('rv_kicker', { x: 24, y: 16, w: 200, h: 32, z: 2 }, "YOU'RE INVITED", {
      fontFamily: CURATED_SANS,
      fontSize: 11,
      color: '#f9a8d4',
      bold: true
    }),
    textLayer('rv_title', { x: 24, y: 48, w: 312, h: 72, z: 3 }, 'Rooftop launch party', {
      fontFamily: CURATED_SERIF,
      fontSize: 30,
      color: '#ffffff',
      bold: true
    }, { name: 'Question' }),
    textLayer('rv_details', { x: 24, y: 116, w: 312, h: 40, z: 4 }, 'Friday · 7pm · Pier 17', {
      fontFamily: CURATED_SANS,
      fontSize: 15,
      color: 'rgba(255,255,255,0.85)'
    }),
    textLayer('rv_starts', { x: 24, y: 162, w: 120, h: 32, z: 5 }, 'Starts in', {
      fontFamily: CURATED_SANS,
      fontSize: 12,
      color: 'rgba(255,255,255,0.7)'
    }),
    countdownLayer('rv_time', { x: 22, y: 192, w: 90, h: 28, z: 6 }, '#fde68a', 2),
    buttonLayer('rv_going', { x: 24, y: 280, w: 100, h: 40, z: 7 }, 'Going', { fill: '#f472b6', color: '#111827' }, {
      behavior: 'poll.vote',
      bindRowId: 'rv_going'
    }),
    buttonLayer('rv_maybe', { x: 130, y: 280, w: 100, h: 40, z: 8 }, 'Maybe', pick, {
      behavior: 'poll.vote',
      bindRowId: 'rv_maybe'
    }),
    buttonLayer('rv_no', { x: 236, y: 280, w: 100, h: 40, z: 9 }, "Can't go", pick, {
      behavior: 'poll.vote',
      bindRowId: 'rv_no'
    })
  ]);
}

/** Drawn card with a headline and an Open button. */
export function seedLinkCardWidget(): SeedBundle {
  return cardSeed([
    artLayer(
      'lk_art',
      artHtml(
        'linear-gradient(135deg,#fef3c7 0%,#fde68a 45%,#f59e0b 100%)',
        '<div class="s" style="width:260px;height:260px;right:-90px;top:-90px;background:rgba(255,255,255,0.45)"></div><div style="position:absolute;left:32px;top:108px;width:64px;height:6px;background:#111827"></div>'
      )
    ),
    textLayer('lk_kicker', { x: 24, y: 16, w: 200, h: 32, z: 2 }, 'NEW ON THE BLOG', {
      fontFamily: CURATED_SANS,
      fontSize: 11,
      color: '#92400e',
      bold: true
    }),
    textLayer('lk_title', { x: 24, y: 120, w: 312, h: 88, z: 3 }, 'How we built a calmer feed', {
      fontFamily: CURATED_SERIF,
      fontSize: 30,
      color: '#111827',
      bold: true
    }),
    textLayer('lk_sub', { x: 24, y: 208, w: 312, h: 64, z: 4 }, 'Six choices that put people before engagement.', {
      fontFamily: CURATED_SANS,
      fontSize: 14,
      color: '#3f3f46'
    }),
    buttonLayer(
      'lk_open',
      { x: 24, y: 288, w: 160, h: 44, z: 5 },
      'Read the story',
      { fill: '#111827', color: '#ffffff' },
      { behavior: 'cta.open', openUrl: 'https://parnoir.com' }
    )
  ]);
}

export function placeWidgetLayer(
  section: PenSectionContent,
  groupId: string | null,
  element: PenWidgetElement | 'image'
): { section: PenSectionContent; layerId: string } {
  const peers = section.layers || [];
  const n = peers.length;
  const id = elementId();
  const shared = {
    id,
    x: 24 + (n % 4) * 20,
    y: 24 + (n % 6) * 12,
    zIndex: peers.reduce((m, layer) => Math.max(m, layer.zIndex), 0) + 1,
    parentGroupId: groupId || undefined,
    positionLocked: false
  };
  let layer: PenPageLayer;
  if (element === 'image') {
    layer = { ...shared, kind: 'image', name: 'Image', w: 160, h: 120 };
  } else if (element === 'button') {
    layer = {
      ...shared,
      kind: 'interactive',
      widgetElement: 'button',
      name: 'Button',
      label: 'Button',
      textDoc: plainDoc('Button'),
      w: 120,
      h: 40,
      backgroundColor: 'rgba(15,118,110,0.85)',
      textColor: '#ffffff'
    };
  } else if (element === 'text') {
    layer = {
      ...shared,
      kind: 'text',
      widgetElement: 'text',
      name: 'Text',
      w: 200,
      h: 40,
      textDoc: plainDoc('')
    };
  } else if (element === 'time') {
    layer = {
      ...shared,
      kind: 'text',
      widgetElement: 'time',
      name: 'Time',
      w: 160,
      h: 32,
      closesAt: null
    };
  } else if (element === 'html') {
    layer = {
      ...shared,
      kind: 'text',
      widgetElement: 'html',
      name: 'Snippet',
      w: 200,
      h: 80,
      htmlSource: ''
    };
  } else if (element === 'input') {
    layer = {
      ...shared,
      kind: 'text',
      widgetElement: 'input',
      name: 'Field',
      label: '',
      w: 200,
      h: 36,
      backgroundColor: '#ffffff',
      textColor: '#141414',
      strokeColor: '#d6d3d1',
      strokeWidth: 1
    };
  } else {
    layer = {
      ...shared,
      kind: 'text',
      widgetElement: 'svg',
      name: 'SVG',
      w: 120,
      h: 80,
      svgSrc: DEFAULT_WIDGET_SVG
    };
  }
  return { section: upsertLayer(section, layer), layerId: id };
}

export function duplicateButton(section: PenSectionContent, buttonId: string): PenSectionContent {
  const button = (section.layers || []).find(
    (layer) => layer.id === buttonId && layer.kind === 'interactive'
  );
  if (!button) return section;
  const id = elementId();
  const clone: PenPageLayer = {
    ...button,
    id,
    y: button.y + button.h + 8,
    zIndex: button.zIndex + 1,
    correct: undefined
  };
  if (button.behavior === 'poll.vote') clone.bindRowId = id;
  return upsertLayer(section, clone);
}

export function setButtonTrigger(
  section: PenSectionContent,
  layerId: string,
  behavior: PenInteractiveBehavior | null
): PenSectionContent {
  const layer = (section.layers || []).find((item) => item.id === layerId);
  if (!layer || layer.kind !== 'interactive') return section;
  const next: PenPageLayer = { ...layer, widgetElement: 'button' };
  if (!behavior) {
    delete next.behavior;
    delete next.bindRowId;
    delete next.correct;
    return upsertLayer(section, next);
  }
  next.behavior = behavior;
  if (behavior === 'poll.vote') {
    next.bindRowId = layer.bindRowId || layer.id;
    delete next.openUrl;
    delete next.submitTo;
    delete next.revealLayerId;
  } else {
    delete next.bindRowId;
    delete next.correct;
    if (behavior !== 'cta.open') delete next.openUrl;
    if (behavior !== 'widget.submit') delete next.submitTo;
    if (behavior !== 'widget.reveal') delete next.revealLayerId;
  }
  return upsertLayer(section, next);
}

export function setOpenUrl(section: PenSectionContent, layerId: string, url: string): PenSectionContent {
  return patchButton(section, layerId, { openUrl: url });
}

export function setSubmitTo(section: PenSectionContent, layerId: string, to: string): PenSectionContent {
  return patchButton(section, layerId, { submitTo: to });
}

function patchButton(
  section: PenSectionContent,
  layerId: string,
  patch: Partial<PenPageLayer>
): PenSectionContent {
  const layer = (section.layers || []).find((item) => item.id === layerId);
  if (!layer || layer.kind !== 'interactive') return section;
  return upsertLayer(section, { ...layer, ...patch });
}

/** One correct option in the group. Clearing it returns the result to a tally. */
export function setVoteCorrect(
  section: PenSectionContent,
  layerId: string,
  correct: boolean
): PenSectionContent {
  const layer = (section.layers || []).find((item) => item.id === layerId);
  if (!layer || layer.behavior !== 'poll.vote') return section;
  const groupId = layer.parentGroupId || null;
  let next = section;
  for (const peer of pollLayers(section, groupId)) {
    if (peer.behavior !== 'poll.vote') continue;
    const on = correct && peer.id === layerId;
    next = upsertLayer(next, { ...peer, correct: on || undefined });
  }
  return next;
}

/** One write-in option per group: the vote that sends the group's text input. */
export function setVoteWriteIn(
  section: PenSectionContent,
  layerId: string,
  writeIn: boolean
): PenSectionContent {
  const layer = (section.layers || []).find((item) => item.id === layerId);
  if (!layer || layer.behavior !== 'poll.vote') return section;
  let next = section;
  for (const peer of pollLayers(section, layer.parentGroupId || null)) {
    if (peer.behavior !== 'poll.vote') continue;
    const on = writeIn && peer.id === layerId;
    next = upsertLayer(next, { ...peer, writeIn: on || undefined });
  }
  return next;
}

export function setWidgetHtml(
  section: PenSectionContent,
  layerId: string,
  html: string
): PenSectionContent {
  const layer = (section.layers || []).find((item) => item.id === layerId);
  if (!layer) return section;
  return upsertLayer(section, { ...layer, htmlSource: html });
}

export function setWidgetSvgOnLayer(
  section: PenSectionContent,
  layerId: string,
  svg: string
): PenSectionContent {
  const layer = (section.layers || []).find((item) => item.id === layerId);
  if (!layer) return section;
  return upsertLayer(section, { ...layer, svgSrc: sanitizeWidgetMarkup(svg) });
}

export function setWidgetClosesAt(
  section: PenSectionContent,
  layerId: string,
  closesAt: string | null
): PenSectionContent {
  const layer = (section.layers || []).find((item) => item.id === layerId);
  if (!layer) return section;
  return upsertLayer(section, { ...layer, closesAt });
}

export type VoteFace =
  | { kind: 'countdown'; text: string }
  | { kind: 'passfail'; text: 'Correct' | 'Incorrect' }
  | { kind: 'tally'; text: string }
  | { kind: 'label'; text: string };

/** Countdown hides every result. A correct mark is pass/fail. Otherwise the tally. */
export function voteFace(input: {
  optionId: string;
  label: string;
  counts: PollCounts | null;
  correctOptionId: string | null;
  closesAt: string | null;
  votedOptionId: string | null;
  now?: number;
}): VoteFace {
  if (!input.votedOptionId) return { kind: 'label', text: input.label };
  if (input.closesAt && !pollIsClosed(input.closesAt, input.now)) {
    return { kind: 'countdown', text: formatCountdown(input.closesAt, input.now) };
  }
  if (input.correctOptionId) {
    if (input.optionId !== input.votedOptionId) return { kind: 'label', text: input.label };
    return {
      kind: 'passfail',
      text: input.votedOptionId === input.correctOptionId ? 'Correct' : 'Incorrect'
    };
  }
  const n = input.counts?.byOption[input.optionId] || 0;
  return { kind: 'tally', text: `${input.label} ${n}` };
}

export function voteFaceForLayer(
  section: PenSectionContent,
  layer: PenPageLayer,
  votedOptionId: string | null,
  counts: PollCounts | null,
  now?: number
): VoteFace {
  const structure = structureFromLayers(section, layer.parentGroupId || null);
  return voteFace({
    optionId: layer.bindRowId || layer.id,
    label: layer.label || 'Button',
    counts,
    correctOptionId: structure.correctOptionId || null,
    closesAt: structure.closesAt,
    votedOptionId,
    now
  });
}

export function setRevealTarget(
  section: PenSectionContent,
  buttonId: string,
  targetId: string | null
): PenSectionContent {
  const button = (section.layers || []).find((item) => item.id === buttonId);
  if (!button) return section;
  let next = upsertLayer(section, {
    ...button,
    revealLayerId: targetId || undefined
  });
  if (!targetId) return next;
  const target = (next.layers || []).find((item) => item.id === targetId);
  if (!target) return next;
  return upsertLayer(next, { ...target, visible: false });
}

/** Show the layer the author picked. A press does not write a sheet row. */
export function revealSibling(section: PenSectionContent, layerId: string): PenSectionContent {
  const layer = (section.layers || []).find((item) => item.id === layerId);
  const targetId = layer?.revealLayerId;
  if (!targetId) return section;
  const target = (section.layers || []).find((item) => item.id === targetId);
  if (!target) return section;
  return upsertLayer(section, { ...target, visible: true });
}

export function cornerRadiusFromPull(
  current: number,
  dx: number,
  dy: number,
  w: number,
  h: number
): number {
  const max = Math.floor(Math.min(Math.max(0, w), Math.max(0, h)) / 2);
  const pull = Math.max(dx, dy);
  return Math.max(0, Math.min(max, Math.round((current || 0) + pull)));
}

function buttonsWith(
  section: PenSectionContent,
  groupId: string | null,
  behavior: PenInteractiveBehavior
): PenPageLayer[] {
  return pollLayers(section, groupId).filter((layer) => layer.behavior === behavior);
}

export function setAllocateTotal(
  section: PenSectionContent,
  groupId: string | null,
  amount: number
): PenSectionContent {
  const total = Math.max(1, Math.round(amount));
  let next = section;
  for (const layer of buttonsWith(section, groupId, 'widget.allocate')) {
    next = upsertLayer(next, { ...layer, allocateTotal: total });
  }
  return next;
}

export function allocateTotal(section: PenSectionContent, groupId: string | null): number {
  const button = buttonsWith(section, groupId, 'widget.allocate').find(
    (layer) => typeof layer.allocateTotal === 'number'
  );
  return button?.allocateTotal || 100;
}

/** First press is rank 1. Pressing a ranked button starts that person's order over. */
export function nextRankPress(ranks: Record<string, number>, buttonId: string): Record<string, number> {
  if (ranks[buttonId]) return { [buttonId]: 1 };
  const next = Object.keys(ranks).length + 1;
  return { ...ranks, [buttonId]: next };
}

export function nextAllocatePress(
  amounts: Record<string, number>,
  buttonId: string,
  total: number
): { amounts: Record<string, number>; remaining: number; complete: boolean } {
  const spent = Object.values(amounts).reduce((sum, value) => sum + value, 0);
  if (spent >= total) return { amounts, remaining: 0, complete: true };
  const next = { ...amounts, [buttonId]: (amounts[buttonId] || 0) + 1 };
  const remaining = total - spent - 1;
  return { amounts: next, remaining, complete: remaining <= 0 };
}

export function rankColumnKeys(section: PenSectionContent, groupId: string | null): string[] {
  return buttonsWith(section, groupId, 'widget.rank').map((layer) => layer.label || layer.name || layer.id);
}

export function allocateColumnKeys(section: PenSectionContent, groupId: string | null): string[] {
  return buttonsWith(section, groupId, 'widget.allocate').map(
    (layer) => layer.label || layer.name || layer.id
  );
}

export function cellsForRanks(
  section: PenSectionContent,
  groupId: string | null,
  ranks: Record<string, number>
): string[] {
  return buttonsWith(section, groupId, 'widget.rank').map((layer) =>
    ranks[layer.id] ? String(ranks[layer.id]) : ''
  );
}

export function cellsForAmounts(
  section: PenSectionContent,
  groupId: string | null,
  amounts: Record<string, number>
): string[] {
  return buttonsWith(section, groupId, 'widget.allocate').map((layer) =>
    String(amounts[layer.id] || 0)
  );
}

export function applyWidgetSheetRows(input: {
  trigger: WidgetWriteTrigger;
  user: string;
  createdAt: string;
  present?: boolean;
  headers: string[];
  cells?: string[];
  existing: string[][];
}): { tab: 'Toggle' | 'Stamp' | 'Rank' | 'Allocate' | 'Submit'; headers: string[]; rows: string[][] } {
  if (input.trigger === 'widget.submit') {
    const headers = ['user', ...input.headers];
    return {
      tab: 'Submit',
      headers,
      rows: [...input.existing, [input.user, ...(input.cells || [])]]
    };
  }
  const tab = WIDGET_TAB[input.trigger];
  if (input.trigger === 'widget.toggle') {
    const headers = ['user', 'on'];
    const kept = input.existing.filter((row) => String(row[0] ?? '') !== input.user);
    const rows = input.present === false ? kept : [...kept, [input.user, '1']];
    return { tab, headers, rows };
  }
  if (input.trigger === 'widget.stamp') {
    return {
      tab,
      headers: ['user', 'stamped_at'],
      rows: [...input.existing, [input.user, input.createdAt]]
    };
  }
  const headers = ['user', ...input.headers];
  const row = [input.user, ...(input.cells || [])];
  return { tab, headers, rows: upsertUserRow(input.existing, row) };
}

export function isSheetTrigger(behavior: string | undefined): behavior is WidgetSheetTrigger {
  return SHEET_TRIGGERS.includes(behavior as WidgetSheetTrigger);
}

export function inputLayers(
  section: PenSectionContent,
  groupId?: string | null
): PenPageLayer[] {
  return pollLayers(section, groupId).filter((layer) => layer.widgetElement === 'input');
}

const SECRET_PROMPT =
  /\b(pass\s*code|password|pass\s*phrase|seed(\s*phrase)?|recovery|private\s*key|pin|2fa|otp|one[-\s]?time\s*code|verification\s*code|security\s*code|cvv|card\s*number|ssn|social\s*security)\b/i;

/**
 * Inputs, or text beside them, that ask a viewer for a secret. A form like this never submits.
 */
export function secretPromptLayers(
  section: PenSectionContent,
  groupId?: string | null
): PenPageLayer[] {
  const inputs = inputLayers(section, groupId);
  if (!inputs.length) return [];
  return pollLayers(section, groupId).filter((layer) => {
    if (layer.widgetElement === 'input') {
      return SECRET_PROMPT.test(`${layer.name || ''} ${layer.label || ''}`);
    }
    if (layer.kind === 'text') {
      return SECRET_PROMPT.test(`${layer.label || ''} ${docToPlainText(layer.textDoc)}`);
    }
    return false;
  });
}

/**
 * Inputs plus a Send button with no email or pN. That button appends a row.
 * A destination sends the values and does not mint a sheet.
 */
export function formCollectsToSheet(
  section: PenSectionContent,
  groupId?: string | null
): boolean {
  if (!inputLayers(section, groupId).length) return false;
  return pollLayers(section, groupId).some(
    (layer) => layer.behavior === 'widget.submit' && !(layer.submitTo || '').trim()
  );
}

/** Vote, Toggle, Stamp, Rank, Allocate, and a collecting form need a tracking sheet. */
export function groupNeedsTrackingSheet(
  section: PenSectionContent,
  groupId?: string | null
): boolean {
  if (formCollectsToSheet(section, groupId)) return true;
  return pollLayers(section, groupId).some(
    (layer) => layer.behavior === 'poll.vote' || isSheetTrigger(layer.behavior)
  );
}

export function inputColumnKeys(section: PenSectionContent, groupId: string | null): string[] {
  return inputLayers(section, groupId).map((layer) => (layer.name || layer.id).trim() || layer.id);
}

export function cellsForInputs(
  section: PenSectionContent,
  groupId: string | null,
  values: Record<string, string>
): string[] {
  return inputLayers(section, groupId).map((layer) => values[layer.id] ?? '');
}

/** Live input values keyed by field name. Static text on the page is not a field. */
export function submitFields(
  section: PenSectionContent,
  groupId: string | null,
  values: Record<string, string> = {}
): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const layer of inputLayers(section, groupId)) {
    const key = (layer.name || layer.id).trim() || layer.id;
    fields[key] = values[layer.id] ?? '';
  }
  return fields;
}

export function buildWidgetActionRow(input: {
  trigger: WidgetWriteTrigger;
  actorId: string;
  actionId: string;
  createdAt?: string;
  fields?: Record<string, string>;
  present?: boolean;
  headers?: string[];
  cells?: string[];
  order?: string[];
  split?: Record<string, number>;
}): { kind: typeof PEN_WIDGET_ACTION_KIND; row: WidgetActionRow } {
  const row: WidgetActionRow = {
    actionId: input.actionId,
    trigger: input.trigger,
    actorId: input.actorId,
    createdAt: input.createdAt || new Date().toISOString()
  };
  if (input.fields) row.fields = input.fields;
  if (input.present != null) row.present = input.present;
  if (input.headers) row.headers = input.headers;
  if (input.cells) row.cells = input.cells;
  if (input.order) row.order = input.order;
  if (input.split) row.split = input.split;
  return { kind: PEN_WIDGET_ACTION_KIND, row };
}

/** Second press drops this person. The result is who is currently on. */
export function applyToggle(
  rows: WidgetActionRow[],
  actorId: string,
  actionId: string,
  createdAt: string
): WidgetActionRow[] {
  const on = rows.some(
    (row) => row.trigger === 'widget.toggle' && row.actorId === actorId && row.present !== false
  );
  if (on) {
    return rows.filter((row) => !(row.trigger === 'widget.toggle' && row.actorId === actorId));
  }
  return [
    ...rows,
    buildWidgetActionRow({
      trigger: 'widget.toggle',
      actorId,
      actionId,
      createdAt,
      present: true
    }).row
  ];
}

