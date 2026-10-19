/**
 * Button taps on published posts. One Taps widget per doc (`docId:taps`) logs every
 * open, go-to-page, and calendar press to the post's tracking sheet, anonymous viewers included.
 */

import { docToPlainText } from './richDoc.js';
import type { PenPageLayer, PenSectionContent } from './types.js';
import { buildWidgetActionRow, type WidgetActionRow } from './widgetElements.js';
import { encodeWidgetId } from './widgetView.js';

export const TAP_BEHAVIORS = ['cta.open', 'page.go', 'cta.calendar'] as const;

export type TapBehavior = (typeof TAP_BEHAVIORS)[number];

export const TAP_WIDGET_GROUP = 'taps';

export const TAP_COLUMNS = ['button', 'action', 'target'] as const;

export function isTapBehavior(behavior: string | undefined): behavior is TapBehavior {
  return TAP_BEHAVIORS.includes(behavior as TapBehavior);
}

export function tapWidgetId(docId: string): string | undefined {
  return docId.trim() ? encodeWidgetId(docId, TAP_WIDGET_GROUP) : undefined;
}

export function sectionsHaveTapButtons(sections: PenSectionContent[] | null | undefined): boolean {
  return (sections || []).some((section) =>
    (section.layers || []).some((layer) => layer.kind === 'interactive' && isTapBehavior(layer.behavior))
  );
}

const TAP_ACTION: Record<TapBehavior, string> = {
  'cta.open': 'open',
  'page.go': 'go to page',
  'cta.calendar': 'calendar'
};

/** Page slug for `slug:` jumps; relative jumps (next, first…) stay as written. */
function goToTarget(goTo: string): string {
  return goTo.startsWith('slug:') ? goTo.slice(5) : goTo;
}

export function tapRow(input: {
  layer: PenPageLayer;
  /** Link host, page target, or event title. */
  target: string;
  actorId: string;
  actionId: string;
  createdAt?: string;
}): WidgetActionRow {
  const { layer } = input;
  const behavior = layer.behavior as TapBehavior;
  const button = docToPlainText(layer.textDoc).trim() || layer.label || layer.name || layer.id;
  const target = behavior === 'page.go' ? goToTarget(input.target) : input.target;
  return buildWidgetActionRow({
    trigger: 'widget.tap',
    actorId: input.actorId,
    actionId: input.actionId,
    createdAt: input.createdAt,
    headers: [...TAP_COLUMNS],
    cells: [button, TAP_ACTION[behavior], target]
  }).row;
}
