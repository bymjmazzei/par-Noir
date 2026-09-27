/** Add a layer onto the preview. The menu sits on the toolbar, not inside the Layers dialog. */

import { useState } from 'react';
import type { PenWidgetElement } from '@par-noir/pen-protocol';

export const PREVIEW_ADD_ITEMS: Array<{ element: PenWidgetElement | 'image'; label: string }> = [
  { element: 'text', label: 'Text' },
  { element: 'image', label: 'Image' },
  { element: 'button', label: 'Button' },
  { element: 'time', label: 'Time' },
  { element: 'html', label: 'HTML snippet' },
  { element: 'svg', label: 'SVG' }
];

export function PreviewAddMenu({
  onAdd
}: {
  onAdd: (element: PenWidgetElement | 'image') => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        title="Add layer"
        aria-label="Add layer"
        aria-expanded={open}
        className="inline-flex h-6 items-center rounded px-1.5 text-[11px] font-bold text-neutral-700 hover:text-black"
        onClick={() => setOpen((value) => !value)}
      >
        Add
      </button>
      <div
        role="menu"
        aria-label="Add layer menu"
        hidden={!open}
        className="absolute left-0 top-full z-50 mt-1 w-40 rounded border border-neutral-200 bg-white py-1 shadow-lg"
      >
          {PREVIEW_ADD_ITEMS.map((item) => (
            <button
              key={item.element}
              type="button"
              role="menuitem"
              className="block w-full px-3 py-1.5 text-left text-[11px] hover:bg-neutral-50"
              onClick={() => {
                setOpen(false);
                onAdd(item.element);
              }}
            >
              {item.label}
            </button>
          ))}
      </div>
    </div>
  );
}
