/** Sets the trigger on the selected button. Layout stays on the preview. */

import { useRef } from 'react';
import {
  duplicateButton,
  setButtonTrigger,
  setVoteCorrect,
  setWidgetClosesAt,
  setWidgetHtml,
  setWidgetSvgOnLayer,
  type PenInteractiveBehavior,
  type PenPageLayer,
  type PenSectionContent
} from '@par-noir/pen-protocol';

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
  onSectionChange
}: {
  layer: PenPageLayer;
  section: PenSectionContent;
  onSectionChange: (next: PenSectionContent) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  if (layer.kind === 'interactive') {
    return (
      <div className="flex flex-wrap items-center gap-2 border-b border-stone-200 bg-white px-3 py-2 text-sm">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">
          Button trigger
        </span>
        <select
          aria-label="Button trigger"
          className="border border-stone-300 bg-white px-1 py-0.5"
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
          <label className="flex items-center gap-1 text-stone-700">
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
          className="text-teal-800"
          onClick={() => onSectionChange(duplicateButton(section, layer.id))}
        >
          Duplicate
        </button>
      </div>
    );
  }
  if (layer.widgetElement === 'time') {
    const value = layer.closesAt ? layer.closesAt.slice(0, 16) : '';
    return (
      <label className="flex items-center gap-2 border-b border-stone-200 bg-white px-3 py-2 text-sm">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">
          Hide results until
        </span>
        <input
          aria-label="Hide results until"
          type="datetime-local"
          className="border border-stone-300 px-1 py-0.5"
          value={value}
          onChange={(event) => {
            const next = event.target.value;
            onSectionChange(
              setWidgetClosesAt(section, layer.id, next ? new Date(next).toISOString() : null)
            );
          }}
        />
      </label>
    );
  }
  if (layer.widgetElement === 'html') {
    return (
      <label className="flex flex-col gap-1 border-b border-stone-200 bg-white px-3 py-2 text-sm">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">
          HTML snippet
        </span>
        <textarea
          aria-label="HTML snippet"
          className="min-h-16 border border-stone-300 px-1 py-0.5 font-mono text-xs"
          value={layer.htmlSource || ''}
          onChange={(event) => onSectionChange(setWidgetHtml(section, layer.id, event.target.value))}
        />
      </label>
    );
  }
  if (layer.widgetElement === 'svg') {
    return (
      <div className="border-b border-stone-200 bg-white px-3 py-2">
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
            if (!file) return;
            void file.text().then((svg) => {
              onSectionChange(setWidgetSvgOnLayer(section, layer.id, svg));
            });
          }}
        />
      </div>
    );
  }
  return null;
}
