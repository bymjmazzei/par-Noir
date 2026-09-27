/** Adds widget elements. The card itself is the form. */

import { useRef } from 'react';
import {
  addWidgetElement,
  setWidgetSvg,
  type PenSectionContent,
  type PenWidgetElement
} from '@par-noir/pen-protocol';

const ADD: Array<{ element: PenWidgetElement; label: string }> = [
  { element: 'text', label: 'Add text' },
  { element: 'button', label: 'Add answer' },
  { element: 'time', label: 'Add expiry' },
  { element: 'html', label: 'Add HTML snippet' }
];

export function WidgetEditorPanel({
  section,
  groupId,
  onSectionChange
}: {
  section: PenSectionContent;
  groupId: string | null;
  onSectionChange: (next: PenSectionContent) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto bg-white p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">Widget</p>
      <p className="text-sm text-stone-600">
        The card is the form. Add elements here. They render as HTML inside the SVG box.
      </p>
      <button
        type="button"
        className="self-start rounded border border-stone-300 px-3 py-1 text-sm"
        onClick={() => fileRef.current?.click()}
      >
        Upload SVG box
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/svg+xml,.svg"
        className="hidden"
        aria-label="Upload SVG box"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          void file.text().then((svg) => {
            onSectionChange(setWidgetSvg(section, groupId, svg));
          });
        }}
      />
      {ADD.map((item) => (
        <button
          key={item.element}
          type="button"
          className="self-start text-sm text-teal-800"
          onClick={() => onSectionChange(addWidgetElement(section, groupId, item.element))}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
