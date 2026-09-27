/** Left pane for a widget group or a widget document. A poll edits the sheet structure. */

import { useEffect, useState } from 'react';
import {
  docToPlainText,
  getTextLayerDoc,
  POLL_WIDGET_TEMPLATE_ID,
  pollLayers,
  setTextLayerDoc,
  structureFromLayers,
  syncPollLayers,
  type PenSectionContent,
  type PenTipTapNode,
  type PollStructure
} from '@par-noir/pen-protocol';
import type { PenSession } from '../services/penSession';
import { createPollSheet, putPollStructure, readPollCache } from '../services/pollCloud';

function plainDoc(text: string): PenTipTapNode {
  return {
    type: 'doc',
    content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }]
  };
}

export function WidgetEditorPanel({
  section,
  groupId,
  widgetTemplateId,
  spreadsheetId,
  docId,
  session,
  onSectionChange,
  onSpreadsheetId,
  onError
}: {
  section: PenSectionContent;
  groupId: string | null;
  widgetTemplateId: string;
  spreadsheetId: string | null;
  docId: string;
  session: PenSession;
  onSectionChange: (next: PenSectionContent) => void;
  onSpreadsheetId: (id: string) => void;
  onError: (message: string) => void;
}) {
  const poll = widgetTemplateId === POLL_WIDGET_TEMPLATE_ID;
  const [structure, setStructure] = useState<PollStructure>(() =>
    structureFromLayers(section, groupId)
  );
  const [countsLabel, setCountsLabel] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setStructure((current) => {
      const fromLayers = structureFromLayers(section, groupId);
      return { ...fromLayers, closesAt: current.closesAt };
    });
  }, [section, groupId]);

  useEffect(() => {
    if (!poll || !spreadsheetId) return;
    let cancelled = false;
    void readPollCache({ session, pollId: spreadsheetId })
      .then(({ structure: remote, counts }) => {
        if (cancelled) return;
        setStructure(remote);
        const lines = remote.options
          .map((option) => `${option.label} ${counts.byOption[option.id] || 0}`)
          .join(' · ');
        setCountsLabel(counts.total ? lines : 'No votes yet');
        onSectionChange(syncPollLayers(section, groupId, remote, counts));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // Load once per sheet. Layer edits must not refetch over in-progress typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poll, spreadsheetId, session.pnIdentifier]);

  async function savePoll(next: PollStructure) {
    setSaving(true);
    try {
      let sheetId = spreadsheetId;
      if (!sheetId) {
        sheetId = await createPollSheet({
          session,
          docId,
          groupId: groupId || docId,
          structure: next
        });
        onSpreadsheetId(sheetId);
      } else {
        await putPollStructure({ session, docId, spreadsheetId: sheetId, structure: next });
      }
      onSectionChange(syncPollLayers(section, groupId, next));
    } catch (e) {
      onError(e instanceof Error ? e.message : 'poll_save_failed');
    } finally {
      setSaving(false);
    }
  }

  if (!poll) {
    const texts = pollLayers(section, groupId).filter((layer) => layer.kind === 'text' && layer.name !== 'Card');
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto bg-white p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">Widget</p>
        {texts.map((layer) => (
          <label key={layer.id} className="flex flex-col gap-1 text-sm text-stone-700">
            {layer.name || 'Text'}
            <input
              className="rounded border border-stone-300 px-2 py-1"
              value={docToPlainText(getTextLayerDoc(layer))}
              onChange={(e) => {
                onSectionChange(
                  setTextLayerDoc(section, layer.id, plainDoc(e.target.value), { syncDoc: false })
                );
              }}
            />
          </label>
        ))}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto bg-white p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">Poll</p>
      <label className="flex flex-col gap-1 text-sm text-stone-700">
        Question
        <input
          className="rounded border border-stone-300 px-2 py-1"
          value={structure.question}
          onChange={(e) => setStructure({ ...structure, question: e.target.value })}
        />
      </label>
      <div className="flex flex-col gap-2">
        <span className="text-sm text-stone-700">Options</span>
        {structure.options.map((option, index) => (
          <div key={option.id} className="flex gap-2">
            <input
              className="flex-1 rounded border border-stone-300 px-2 py-1 text-sm"
              aria-label={`Option ${index + 1}`}
              value={option.label}
              onChange={(e) => {
                const options = structure.options.map((item) =>
                  item.id === option.id ? { ...item, label: e.target.value } : item
                );
                setStructure({ ...structure, options });
              }}
            />
            <button
              type="button"
              className="rounded px-2 text-sm text-stone-500 hover:text-black"
              onClick={() =>
                setStructure({
                  ...structure,
                  options: structure.options.filter((item) => item.id !== option.id)
                })
              }
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className="self-start text-sm text-teal-800"
          onClick={() =>
            setStructure({
              ...structure,
              options: [
                ...structure.options,
                { id: `opt_${crypto.randomUUID().slice(0, 8)}`, label: 'New option' }
              ]
            })
          }
        >
          Add option
        </button>
      </div>
      <label className="flex flex-col gap-1 text-sm text-stone-700">
        Close time
        <input
          type="datetime-local"
          className="rounded border border-stone-300 px-2 py-1"
          value={toLocalInput(structure.closesAt)}
          onChange={(e) =>
            setStructure({
              ...structure,
              closesAt: e.target.value ? new Date(e.target.value).toISOString() : null
            })
          }
        />
      </label>
      {countsLabel ? <p className="text-sm text-stone-600">{countsLabel}</p> : null}
      <button
        type="button"
        disabled={saving || structure.options.length === 0}
        className="self-start rounded bg-stone-800 px-3 py-1 text-sm text-white disabled:opacity-40"
        onClick={() => void savePoll(structure)}
      >
        {saving ? 'Saving…' : 'Save poll'}
      </button>
    </div>
  );
}

function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
