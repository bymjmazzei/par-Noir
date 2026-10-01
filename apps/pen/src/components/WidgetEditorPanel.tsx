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
  setWidgetHtml,
  setWidgetSvgOnLayer,
  type PenInteractiveBehavior,
  type PenPageLayer,
  type PenPageLayout,
  type PenSectionContent,
  type PenWidgetElement
} from '@par-noir/pen-protocol';
import type { PenSession } from '../services/penSession';
import { FormatRibbon, PageCanvas } from './PageCanvas';
import { ColorSwatchButton, ValueSliderButton } from './PanelValueControls';
import { SectionTimeline } from './SectionTimeline';

const ADD: Array<{ element: PenWidgetElement | 'image'; label: string }> = [
  { element: 'text', label: 'Text' },
  { element: 'input', label: 'Text input' },
  { element: 'image', label: 'Image' },
  { element: 'button', label: 'Button' },
  { element: 'time', label: 'Time' },
  { element: 'html', label: 'HTML snippet' }
];

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
  const sectionRef = useRef(section);
  sectionRef.current = section;
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
    <div data-widget-text-editor className="border-b border-stone-200">
      <FormatRibbon
        editor={editor}
        accessToken={accessToken}
        pnIdentifier={pnIdentifier}
        excludeDocId={excludeDocId}
      />
      <PageCanvas
        compact
        section={{ ...section, doc: getTextLayerDoc(layer) }}
        sectionTitle={layer.label || layer.name || 'Text'}
        pageLayout={pageLayout || 'flow'}
        pnIdentifier={pnIdentifier || ''}
        onEditorReady={setEditor}
        onChange={(next) => {
          onSectionChange(
            setTextLayerDoc(sectionRef.current, layer.id, next.doc, { syncDoc: false })
          );
        }}
      />
    </div>
  );
}

const TRIGGERS: Array<{ id: PenInteractiveBehavior; label: string }> = [
  { id: 'poll.vote', label: 'Vote' },
  { id: 'cta.open', label: 'Open' },
  { id: 'widget.submit', label: 'Send' },
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
  playheadSec = 0,
  playing = false,
  onPlayhead,
  onPlaying,
  onSelectLayer,
  accessToken,
  pnIdentifier,
  excludeDocId,
  pageLayout,
  docId,
  session,
  scopeGroupId = null,
  onEnterGroup
}: {
  layer: PenPageLayer | null;
  section: PenSectionContent;
  onSectionChange: (next: PenSectionContent) => void;
  onPlaced?: (layerId: string) => void;
  playheadSec?: number;
  playing?: boolean;
  onPlayhead?: (time: number) => void;
  onPlaying?: (playing: boolean) => void;
  onSelectLayer?: (id: string) => void;
  accessToken?: string;
  pnIdentifier?: string;
  excludeDocId?: string;
  pageLayout?: PenPageLayout;
  docId?: string;
  session?: PenSession | null;
  scopeGroupId?: string | null;
  onEnterGroup?: (id: string | null) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  function add(element: PenWidgetElement | 'image') {
    const groupId = layer?.kind === 'group' ? layer.id : layer?.parentGroupId || null;
    const placed = placeWidgetLayer(section, groupId, element);
    onSectionChange(placed.section);
    onPlaced?.(placed.layerId);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white" data-widget-editor="panel">
      <div className="min-h-0 flex-1 overflow-auto">
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
        <div className="border-b border-stone-200 px-3 py-2">
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">Label</span>
            <WidgetTextEditor
              layer={layer}
              section={section}
              onSectionChange={onSectionChange}
              accessToken={accessToken}
              pnIdentifier={pnIdentifier}
              excludeDocId={excludeDocId}
              pageLayout={pageLayout}
            />
          </div>
        </div>
      )}
      {layer?.widgetElement === 'input' && (
        <div className="flex flex-col gap-2 border-b border-stone-200 px-3 py-2">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">
              Field name
            </span>
            <input
              aria-label="Field name"
              className="border border-stone-300 px-2 py-1 text-sm"
              value={layer.name || ''}
              onChange={(event) =>
                onSectionChange(patchLayerStyle(section, layer.id, { name: event.target.value }))
              }
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">
              Placeholder
            </span>
            <input
              aria-label="Placeholder"
              className="border border-stone-300 px-2 py-1 text-sm"
              value={layer.label || ''}
              onChange={(event) =>
                onSectionChange(patchLayerStyle(section, layer.id, { label: event.target.value }))
              }
            />
          </label>
        </div>
      )}
      {layer?.widgetElement === 'text' && (
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
        <div
          className={`grid gap-4 border-b border-stone-200 px-3 py-3 ${
            layer.kind === 'interactive' ? 'grid-cols-2' : 'grid-cols-1'
          }`}
        >
          {layer.kind === 'interactive' && (
            <div className="flex min-w-0 flex-col gap-2 text-sm">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">
                Trigger
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
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">Object</span>
            <ColorSwatchButton
              row
              label="Fill"
              value={layer.backgroundColor || '#0f766e'}
              onChange={(value) =>
                onSectionChange(patchLayerStyle(section, layer.id, { backgroundColor: value }))
              }
            />
            <ColorSwatchButton
              row
              label="Stroke"
              value={layer.strokeColor || '#000000'}
              onChange={(value) =>
                onSectionChange(
                  patchLayerStyle(section, layer.id, {
                    strokeColor: value,
                    strokeWidth: layer.strokeWidth || 1
                  })
                )
              }
            />
            <ValueSliderButton
              row
              label="Width"
              min={0}
              max={24}
              value={layer.strokeWidth ?? 0}
              display={`${layer.strokeWidth ?? 0}px`}
              onChange={(value) =>
                onSectionChange(
                  patchLayerStyle(section, layer.id, {
                    strokeWidth: value || undefined,
                    strokeColor: value ? layer.strokeColor || '#000000' : undefined
                  })
                )
              }
            />
            <ValueSliderButton
              row
              label="Opacity"
              min={0}
              max={100}
              value={layer.opacity ?? 100}
              display={`${layer.opacity ?? 100}%`}
              onChange={(value) =>
                onSectionChange(patchLayerStyle(section, layer.id, { opacity: value }))
              }
            />
          </div>
        </div>
      )}
      {layer?.widgetElement === 'time' && (
        <div className="flex flex-col gap-2 border-b border-stone-200 px-3 py-3 text-sm">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">
              Time
            </span>
            <select
              aria-label="Time mode"
              className="border border-stone-300 bg-white px-2 py-1"
              value={layer.timeFace ?? (layer.closesAt ? 'countdown' : 'blank')}
              onChange={(event) =>
                onSectionChange(
                  patchLayerStyle(section, layer.id, {
                    timeFace: event.target.value as NonNullable<PenPageLayer['timeFace']>
                  })
                )
              }
            >
              <option value="clock">Clock</option>
              <option value="countdown">Countdown</option>
              <option value="blank">Blank</option>
            </select>
          </label>
          {(layer.timeFace ?? (layer.closesAt ? 'countdown' : 'blank')) === 'clock' && (
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">
                Clock
              </span>
              <input
                aria-label="Clock time"
                type="time"
                className="border border-stone-300 px-2 py-1"
                value={layer.clockTime || ''}
                onChange={(event) =>
                  onSectionChange(
                    patchLayerStyle(section, layer.id, { timeFace: 'clock', clockTime: event.target.value })
                  )
                }
              />
            </label>
          )}
          {(layer.timeFace ?? (layer.closesAt ? 'countdown' : 'blank')) === 'countdown' && (
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">
                Countdown
              </span>
              <input
                aria-label="Countdown"
                type="datetime-local"
                className="border border-stone-300 px-2 py-1"
                value={layer.closesAt ? layer.closesAt.slice(0, 16) : ''}
                onChange={(event) => {
                  const next = event.target.value;
                  onSectionChange(
                    patchLayerStyle(section, layer.id, {
                      timeFace: 'countdown',
                      closesAt: next ? new Date(next).toISOString() : null
                    })
                  );
                }}
              />
            </label>
          )}
        </div>
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
      <SectionTimeline
        section={section}
        activeLayerId={layer?.id ?? null}
        playheadSec={playheadSec}
        playing={playing}
        docId={docId}
        session={session}
        onPlayhead={onPlayhead || (() => undefined)}
        onPlaying={onPlaying || (() => undefined)}
        onSelectLayer={onSelectLayer || (() => undefined)}
        onSectionChange={onSectionChange}
        scopeGroupId={scopeGroupId}
        onEnterGroup={onEnterGroup}
      />
    </div>
  );
}
