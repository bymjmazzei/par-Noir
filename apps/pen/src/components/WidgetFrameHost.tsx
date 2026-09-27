/** Maps a widget group onto the shared HTML frame and writes element edits back. */

import { WidgetFrame, type WidgetFrameElement, type WidgetFrameModel } from '@par-noir/feed-tile';
import {
  duplicateAnswerButton,
  formatCountdown,
  pollIsClosed,
  sanitizeWidgetMarkup,
  setWidgetClosesAt,
  setWidgetHtml,
  setWidgetText,
  structureFromLayers,
  widgetCountsOn,
  widgetElementLayers,
  widgetQuestionText,
  type PenPageLayer,
  type PenSectionContent
} from '@par-noir/pen-protocol';

export function WidgetFrameHost({
  section,
  groupId,
  mode,
  voted,
  now,
  onSectionChange,
  onVote
}: {
  section: PenSectionContent;
  groupId: string | null;
  mode: 'author' | 'voter';
  voted?: boolean;
  now?: number;
  onSectionChange: (next: PenSectionContent) => void;
  onVote?: (layer: PenPageLayer) => void;
}) {
  const elements = widgetElementLayers(section, groupId);
  const structure = structureFromLayers(section, groupId);
  const clock = now ?? Date.now();
  const closed = structure.closesAt ? pollIsClosed(structure.closesAt, clock) : false;
  const model: WidgetFrameModel = {
    elements: elements.map(toFrameElement),
    counts: widgetCountsOn(section, groupId) || undefined,
    voted,
    now: clock,
    closed,
    countdownLabel: structure.closesAt ? formatCountdown(structure.closesAt, clock) : undefined
  };
  return (
    <WidgetFrame
      model={model}
      mode={mode}
      onText={(id, text) => onSectionChange(setWidgetText(section, id, text))}
      onButtonLabel={(id, label) => onSectionChange(setWidgetText(section, id, label))}
      onDuplicate={(id) => onSectionChange(duplicateAnswerButton(section, id))}
      onClosesAt={(id, closesAt) => onSectionChange(setWidgetClosesAt(section, id, closesAt))}
      onHtml={(id, html) => onSectionChange(setWidgetHtml(section, id, html))}
      onVote={(optionId) => {
        const layer = elements.find(
          (item) => item.widgetElement === 'button' && (item.bindRowId || item.id) === optionId
        );
        if (layer) onVote?.(layer);
      }}
    />
  );
}

function toFrameElement(layer: PenPageLayer): WidgetFrameElement {
  if (layer.widgetElement === 'svg') {
    return { id: layer.id, kind: 'svg', svg: sanitizeWidgetMarkup(layer.svgSrc || '') };
  }
  if (layer.widgetElement === 'button') {
    return {
      id: layer.id,
      kind: 'button',
      label: layer.label || layer.name || 'Answer',
      optionId: layer.bindRowId || layer.id
    };
  }
  if (layer.widgetElement === 'time') {
    return { id: layer.id, kind: 'time', closesAt: layer.closesAt ?? null };
  }
  if (layer.widgetElement === 'html') {
    return { id: layer.id, kind: 'html', html: sanitizeWidgetMarkup(layer.htmlSource || '') };
  }
  return { id: layer.id, kind: 'text', text: widgetQuestionText(layer) };
}
