/** Side pane for a widget, same slot as the text and media editors. Dragging stays on the preview. */

import { useRef } from 'react';
import {
  duplicateButton,
  placeWidgetLayer,
  setButtonTrigger,
  setVoteCorrect,
  setWidgetClosesAt,
  setWidgetHtml,
  setWidgetSvgOnLayer,
  type PenInteractiveBehavior,
  type PenPageLayer,
  type PenSectionContent,
  type PenWidgetElement
} from '@par-noir/pen-protocol';

const ADD: Array<{ element: PenWidgetElement | 'image'; label: string }> = [
  { element: 'text', label: 'Text' },
  { element: 'image', label: 'Image' },
  { element: 'button', label: 'Button' },
  { element: 'time', label: 'Time' },
  { element: 'html', label: 'HTML snippet' },
  { element: 'svg', label: 'SVG' }
];

const TRIGGERS: Array<{ id: PenInteractiveBehavior; label: string }> = [
  { id: 'poll.vote', label: 'Vote' },
  { id: 'cta.open', label: 'Open' },
  { id: 'widget.submit', label: 'Submit' },
  { id: 'widget.toggle', label: 'Toggle' },
  { id: 'widget.stamp', label: 'Stamp' },
  { id: 'widget.rank', label: 'Rank' },
  { id: 'widget.allocate', label: 'Allocate' },
  { id: 'widget.reveal', label: 'Reveal' }
];

export function WidgetEditorPanel({
  layer,
  section,
  onSectionChange,
  onPlaced
}: {
  layer: PenPageLayer | null;
  section: PenSectionContent;
  onSectionChange: (next: PenSectionContent) => void;
  onPlaced?: (layerId: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  function add(element: PenWidgetElement | 'image') {
    const groupId = layer?.kind === 'group' ? layer.id : layer?.parentGroupId || null;
    const placed = placeWidgetLayer(section, groupId, element);
    onSectionChange(placed.section);
    onPlaced?.(placed.layerId);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto bg-white" data-widget-editor="panel">
      <div
        role="toolbar"
        aria-label="Widget layers"
        className="flex shrink-0 flex-wrap items-center gap-1 border-b border-stone-300 bg-stone-50 px-2 py-1.5"
      >
        {ADD.map((item) => (
          <button
            key={item.element}
            type="button"
            className="rounded bg-white px-2 py-1 text-[12px] font-medium text-stone-800 hover:bg-stone-100"
            onClick={() => add(item.element)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {layer?.kind === 'interactive' && (
        <div className="flex flex-col gap-3 border-b border-stone-200 px-3 py-3 text-sm">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">
            Button trigger
          </span>
          <select
            aria-label="Button trigger"
            className="border border-stone-300 bg-white px-2 py-1"
            value={layer.behavior || ''}
            onChange={(event) => {
              const value = event.target.value;
              onSectionChange(
                setButtonTrigger(section, layer.id, value ? (value as PenInteractiveBehavior) : null)
              );
            }}
          >
            <option value="">None</option>
            {TRIGGERS.map((trigger) => (
              <option key={trigger.id} value={trigger.id}>
                {trigger.label}
              </option>
            ))}
          </select>
          {layer.behavior === 'poll.vote' && (
            <label className="flex items-center gap-2 text-stone-700">
              <input
                type="checkbox"
                aria-label="Correct answer"
                checked={Boolean(layer.correct)}
                onChange={(event) =>
                  onSectionChange(setVoteCorrect(section, layer.id, event.target.checked))
                }
              />
              Correct answer
            </label>
          )}
          <button
            type="button"
            className="self-start text-teal-800"
            onClick={() => onSectionChange(duplicateButton(section, layer.id))}
          >
            Duplicate
          </button>
        </div>
      )}
      {layer?.widgetElement === 'time' && (
        <label className="flex flex-col gap-2 border-b border-stone-200 px-3 py-3 text-sm">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">
            Hide results until
          </span>
          <input
            aria-label="Hide results until"
            type="datetime-local"
            className="border border-stone-300 px-2 py-1"
            value={layer.closesAt ? layer.closesAt.slice(0, 16) : ''}
            onChange={(event) => {
              const next = event.target.value;
              onSectionChange(
                setWidgetClosesAt(section, layer.id, next ? new Date(next).toISOString() : null)
              );
            }}
          />
        </label>
      )}
      {layer?.widgetElement === 'html' && (
        <label className="flex flex-col gap-2 border-b border-stone-200 px-3 py-3 text-sm">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">
            HTML snippet
          </span>
          <textarea
            aria-label="HTML snippet"
            className="min-h-24 border border-stone-300 px-2 py-1 font-mono text-xs"
            value={layer.htmlSource || ''}
            onChange={(event) => onSectionChange(setWidgetHtml(section, layer.id, event.target.value))}
          />
        </label>
      )}
      {layer?.widgetElement === 'svg' && (
        <div className="border-b border-stone-200 px-3 py-3">
          <button
            type="button"
            className="text-sm text-teal-800"
            onClick={() => fileRef.current?.click()}
          >
            Replace SVG
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/svg+xml,.svg"
            className="hidden"
            aria-label="Replace SVG"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (!file || !layer) return;
              void file.text().then((svg) => {
                onSectionChange(setWidgetSvgOnLayer(section, layer.id, svg));
              });
            }}
          />
        </div>
      )}
    </div>
  );
}
