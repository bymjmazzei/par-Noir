/** Side pane for a widget, same slot as the text and media editors. Dragging stays on the preview. */

import { useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import {
  allocateTotal,
  duplicateButton,
  getTextLayerDoc,
  patchLayerStyle,
  placeWidgetLayer,
  pollLayers,
  setAllocateTotal,
  setButtonTrigger,
  setOpenUrl,
  setRevealTarget,
  setSubmitTo,
  setTextLayerDoc,
  setVoteCorrect,
  setWidgetClosesAt,
  setWidgetHtml,
  setWidgetSvgOnLayer,
  type PenInteractiveBehavior,
  type PenPageLayer,
  type PenPageLayout,
  type PenSectionContent,
  type PenWidgetElement
} from '@par-noir/pen-protocol';
import { FormatRibbon, PageCanvas } from './PageCanvas';

const ADD: Array<{ element: PenWidgetElement | 'image'; label: string }> = [
  { element: 'text', label: 'Text' },
  { element: 'image', label: 'Image' },
  { element: 'button', label: 'Button' },
  { element: 'time', label: 'Time' },
  { element: 'html', label: 'HTML snippet' },
  { element: 'svg', label: 'SVG' }
];

function hexColor(value: string | undefined, fallback: string): string {
  return value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
}

function showsDisplayedText(layer: PenPageLayer | null): boolean {
  if (!layer) return false;
  if (
    layer.widgetElement === 'html' ||
    layer.widgetElement === 'svg' ||
    layer.widgetElement === 'time'
  ) {
    return false;
  }
  if (layer.kind === 'image' || layer.kind === 'video' || layer.kind === 'group') return false;
  return layer.kind === 'interactive' || layer.kind === 'text';
}

function WidgetTextEditor({
  layer,
  section,
  onSectionChange,
  accessToken,
  pnIdentifier,
  excludeDocId,
  pageLayout
}: {
  layer: PenPageLayer;
  section: PenSectionContent;
  onSectionChange: (next: PenSectionContent) => void;
  accessToken?: string;
  pnIdentifier?: string;
  excludeDocId?: string;
  pageLayout?: PenPageLayout;
}) {
  const [editor, setEditor] = useState<Editor | null>(null);
  if (typeof document === 'undefined') {
    return (
      <div data-widget-text-editor className="flex gap-1 border-b border-stone-200 px-2 py-1">
        <button type="button" title="Font">
          Font
        </button>
        <button type="button" title="Size">
          Size
        </button>
        <button type="button" title="Bold">
          <b>B</b>
        </button>
      </div>
    );
  }
  return (
    <div data-widget-text-editor className="flex min-h-64 flex-col border-b border-stone-200">
      <FormatRibbon
        editor={editor}
        accessToken={accessToken}
        pnIdentifier={pnIdentifier}
        excludeDocId={excludeDocId}
      />
      <div className="min-h-48 flex-1">
        <PageCanvas
          section={{ ...section, doc: getTextLayerDoc(layer) }}
          sectionTitle={layer.label || layer.name || 'Text'}
          pageLayout={pageLayout || 'flow'}
          pnIdentifier={pnIdentifier || ''}
          onEditorReady={setEditor}
          onChange={(next) => {
            onSectionChange(setTextLayerDoc(section, layer.id, next.doc, { syncDoc: false }));
          }}
        />
      </div>
    </div>
  );
}

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
  onPlaced,
  accessToken,
  pnIdentifier,
  excludeDocId,
  pageLayout
}: {
  layer: PenPageLayer | null;
  section: PenSectionContent;
  onSectionChange: (next: PenSectionContent) => void;
  onPlaced?: (layerId: string) => void;
  accessToken?: string;
  pnIdentifier?: string;
  excludeDocId?: string;
  pageLayout?: PenPageLayout;
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
      {showsDisplayedText(layer) && layer && (
        <WidgetTextEditor
          layer={layer}
          section={section}
          onSectionChange={onSectionChange}
          accessToken={accessToken}
          pnIdentifier={pnIdentifier}
          excludeDocId={excludeDocId}
          pageLayout={pageLayout}
        />
      )}
      {layer && (
        <div className="flex flex-col gap-3 border-b border-stone-200 px-3 py-3 text-sm">
          <label className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">Fill</span>
            <input
              aria-label="Fill color"
              type="color"
              className="h-7 w-10 border border-stone-300"
              value={hexColor(layer.backgroundColor, '#0f766e')}
              onChange={(event) =>
                onSectionChange(patchLayerStyle(section, layer.id, { backgroundColor: event.target.value }))
              }
            />
          </label>
          <label className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">Text</span>
            <input
              aria-label="Text color"
              type="color"
              className="h-7 w-10 border border-stone-300"
              value={hexColor(layer.textColor, '#ffffff')}
              onChange={(event) =>
                onSectionChange(patchLayerStyle(section, layer.id, { textColor: event.target.value }))
              }
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">
              Opacity {layer.opacity ?? 100}
            </span>
            <input
              aria-label="Opacity"
              type="range"
              min={0}
              max={100}
              value={layer.opacity ?? 100}
              onChange={(event) =>
                onSectionChange(
                  patchLayerStyle(section, layer.id, { opacity: Number(event.target.value) })
                )
              }
            />
          </label>
          <label className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">Stroke</span>
            <input
              aria-label="Stroke color"
              type="color"
              className="h-7 w-10 border border-stone-300"
              value={hexColor(layer.strokeColor, '#000000')}
              onChange={(event) =>
                onSectionChange(
                  patchLayerStyle(section, layer.id, {
                    strokeColor: event.target.value,
                    strokeWidth: layer.strokeWidth || 1
                  })
                )
              }
            />
          </label>
          <input
            aria-label="Stroke width"
            type="range"
            min={0}
            max={24}
            value={layer.strokeWidth ?? 0}
            onChange={(event) =>
              onSectionChange(
                patchLayerStyle(section, layer.id, { strokeWidth: Number(event.target.value) || undefined })
              )
            }
          />
        </div>
      )}
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
          {layer.behavior === 'cta.open' && (
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">Link</span>
              <input
                aria-label="Link"
                className="border border-stone-300 px-2 py-1"
                value={layer.openUrl || ''}
                placeholder="https://"
                onChange={(event) => onSectionChange(setOpenUrl(section, layer.id, event.target.value))}
              />
            </label>
          )}
          {layer.behavior === 'widget.submit' && (
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">
                Send to
              </span>
              <input
                aria-label="Submit destination"
                className="border border-stone-300 px-2 py-1"
                value={layer.submitTo || ''}
                placeholder="email or pn"
                onChange={(event) => onSectionChange(setSubmitTo(section, layer.id, event.target.value))}
              />
            </label>
          )}
          {layer.behavior === 'widget.allocate' && (
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">
                Allocate amount
              </span>
              <input
                aria-label="Allocate amount"
                type="number"
                min={1}
                className="border border-stone-300 px-2 py-1"
                value={allocateTotal(section, layer.parentGroupId || null)}
                onChange={(event) =>
                  onSectionChange(
                    setAllocateTotal(section, layer.parentGroupId || null, Number(event.target.value) || 100)
                  )
                }
              />
            </label>
          )}
          {layer.behavior === 'widget.reveal' && (
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">
                Reveal target
              </span>
              <select
                aria-label="Reveal target"
                className="border border-stone-300 bg-white px-2 py-1"
                value={layer.revealLayerId || ''}
                onChange={(event) =>
                  onSectionChange(setRevealTarget(section, layer.id, event.target.value || null))
                }
              >
                <option value="">Choose a layer</option>
                {pollLayers(section, layer.parentGroupId || null)
                  .filter((item) => item.id !== layer.id)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label || item.name || item.id}
                    </option>
                  ))}
              </select>
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
