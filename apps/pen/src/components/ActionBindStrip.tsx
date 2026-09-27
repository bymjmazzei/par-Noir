/** Edit bind target, behavior, and label on an embed or interactive layer. */

import { patchLayerStyle, type PenPageLayer, type PenSectionContent } from '@par-noir/pen-protocol';
import type { PenSession } from '../services/penSession';
import { listLocalTableDocs, loadTablePayload, tableDocTitle, tableRowLabel } from '../services/tableDocs';

export function ActionBindStrip({
  layer,
  section,
  session,
  onSectionChange
}: {
  layer: PenPageLayer;
  section: PenSectionContent;
  session?: PenSession | null;
  onSectionChange: (next: PenSectionContent) => void;
}) {
  if (layer.kind !== 'embed' && layer.kind !== 'interactive') return null;
  const pn = session?.pnIdentifier || '';
  const tables = pn ? listLocalTableDocs(pn) : [];
  const boundId = (layer.kind === 'embed' ? layer.refDocId : layer.bindDocId) || '';
  const payload = pn && boundId ? loadTablePayload(pn, boundId) : null;
  const known = tables.some((t) => t.docId === boundId);

  function patch(next: Parameters<typeof patchLayerStyle>[2]) {
    onSectionChange(patchLayerStyle(section, layer.id, next));
  }

  function onTable(docId: string) {
    const id = docId.trim();
    if (!id) return;
    if (layer.kind === 'embed') {
      patch({ refDocId: id });
      return;
    }
    patch({ bindDocId: id, bindRowId: undefined });
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1 text-[11px] text-neutral-700">
      {layer.kind === 'interactive' && (
        <>
          <input
            aria-label="Action label"
            className="w-24 border border-neutral-300 bg-white px-1 py-0.5"
            value={layer.label || ''}
            onChange={(e) => patch({ label: e.target.value, name: e.target.value || layer.name })}
          />
          <select
            aria-label="Action behavior"
            className="border border-neutral-300 bg-white px-1 py-0.5"
            value={layer.behavior || ''}
            onChange={(e) => {
              const behavior = e.target.value as NonNullable<PenPageLayer['behavior']> | '';
              if (!behavior) {
                patch({ behavior: undefined, bindRowId: undefined, correct: undefined });
                return;
              }
              patch(
                behavior === 'poll.vote'
                  ? { behavior, bindRowId: layer.bindRowId || layer.id }
                  : { behavior, bindRowId: undefined, correct: undefined }
              );
            }}
          >
            <option value="">None</option>
            <option value="poll.vote">Vote</option>
            <option value="cta.open">Open</option>
            <option value="widget.submit">Submit</option>
            <option value="widget.toggle">Toggle</option>
            <option value="widget.stamp">Stamp</option>
            <option value="widget.rank">Rank</option>
            <option value="widget.allocate">Allocate</option>
            <option value="widget.reveal">Reveal</option>
          </select>
          {layer.behavior === 'poll.vote' && (
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                aria-label="Correct answer"
                checked={Boolean(layer.correct)}
                onChange={(e) => patch({ correct: e.target.checked || undefined })}
              />
              Correct
            </label>
          )}
        </>
      )}
      <select
        aria-label="Bound table"
        className="max-w-[9rem] border border-neutral-300 bg-white px-1 py-0.5"
        value={boundId}
        onChange={(e) => onTable(e.target.value)}
      >
        {!known && boundId && (
          <option value={boundId}>{pn ? tableDocTitle(pn, boundId) : 'Table'}</option>
        )}
        {tables.map((t) => (
          <option key={t.docId} value={t.docId}>
            {t.title || 'Untitled table'}
          </option>
        ))}
      </select>
      {layer.kind === 'interactive' && layer.behavior === 'poll.vote' && payload && (
        <select
          aria-label="Bound row"
          className="max-w-[8rem] border border-neutral-300 bg-white px-1 py-0.5"
          value={layer.bindRowId || ''}
          onChange={(e) => {
            const row = payload.rows.find((r) => r.id === e.target.value);
            if (!row) return;
            patch({ bindRowId: row.id, label: tableRowLabel(row), name: tableRowLabel(row) });
          }}
        >
          {!layer.bindRowId && <option value="">Row</option>}
          {payload.rows.map((row) => (
            <option key={row.id} value={row.id}>
              {tableRowLabel(row)}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
