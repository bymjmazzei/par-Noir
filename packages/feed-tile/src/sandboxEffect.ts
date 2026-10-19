/**
 * Test mode press handling: buttons behave, nothing reaches a backend.
 * Pure so the overlay and its test share one rule set.
 */

import type { PenActionEffect, WidgetViewPayload } from '@par-noir/pen-protocol';

export type SandboxOutcome = {
  widgetViews: Record<string, WidgetViewPayload>;
  /** Short line shown over the tile. */
  notice?: string;
  /** Real link the host may open in a new tab. */
  openUrl?: string;
};

const ROW_NOTICE: Record<string, string> = {
  'widget.submit': 'Test: this form would send a row to your sheet.',
  'widget.toggle': 'Test: this toggle would be recorded.',
  'widget.stamp': 'Test: this stamp would be recorded.',
  'widget.rank': 'Test: this ranking would be recorded.',
  'widget.allocate': 'Test: this allocation would be recorded.'
};

function localVoteView(
  prior: WidgetViewPayload | undefined,
  widgetId: string,
  optionId: string
): WidgetViewPayload {
  const lines = prior?.results?.kind === 'poll' ? prior.results.options : [];
  const counts: Record<string, number> = {};
  for (const line of lines) counts[line.optionId] = line.count;
  counts[optionId] = (counts[optionId] || 0) + 1;
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  return {
    widgetId,
    phase: 'results',
    revealPolicy: 'after_response',
    closesAt: null,
    myResponse: { optionId },
    results: {
      kind: 'poll',
      total,
      options: Object.entries(counts).map(([id, count]) => ({
        optionId: id,
        label: lines.find((line) => line.optionId === id)?.label || '',
        count,
        percent: total > 0 ? Math.round((count / total) * 100) : 0
      }))
    }
  };
}

export function sandboxEffect(
  effect: PenActionEffect,
  widgetViews: Record<string, WidgetViewPayload>
): SandboxOutcome {
  switch (effect.kind) {
    case 'vote':
      if (!effect.widgetId) return { widgetViews, notice: 'Test: vote counted on this screen only.' };
      return {
        widgetViews: {
          ...widgetViews,
          [effect.widgetId]: localVoteView(widgetViews[effect.widgetId], effect.widgetId, effect.optionId)
        },
        notice: 'Test: vote counted on this screen only.'
      };
    case 'widget_row':
      return {
        widgetViews,
        notice: ROW_NOTICE[effect.row.trigger] || 'Test: this would be recorded.'
      };
    case 'open':
      return { widgetViews, openUrl: effect.url };
    case 'mailto':
      return { widgetViews, notice: `Test: would start an email to ${effect.to}.` };
    case 'messaging':
      return { widgetViews, notice: 'Test: would open Messaging with this message.' };
    default:
      return { widgetViews };
  }
}
