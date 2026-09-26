/**
 * Layers add menu: embed a kit table, or place a vote / open sticker bound to one.
 * Refuses insert until a real doc id is chosen.
 */
import { useState, type ReactNode } from 'react';
import type { PenSession } from '../services/penSession';
import { createTablePrimitiveDoc } from '../services/createDocFromTemplate';
import { listLocalTableDocs, loadTablePayload, tableRowLabel } from '../services/tableDocs';

export type ActionLayerSpec =
  | { kind: 'embed'; docId: string }
  | { kind: 'open'; docId: string; label: string }
  | { kind: 'vote'; docId: string; rowId: string; label: string };

type ActionKind = 'embed' | 'vote' | 'open';

export function ActionLayerMenu({
  session,
  onCommit,
  onCancel
}: {
  session?: PenSession | null;
  onCommit: (spec: ActionLayerSpec) => void;
  onCancel: () => void;
}) {
  const pn = session?.pnIdentifier || '';
  const [kind, setKind] = useState<ActionKind | null>(null);
  const [docId, setDocId] = useState<string | null>(null);
  const [openLabel, setOpenLabel] = useState('Open');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tables = pn ? listLocalTableDocs(pn) : [];
  const rows = pn && docId ? loadTablePayload(pn, docId)?.rows || [] : [];

  async function mintTable(): Promise<string | null> {
    if (!session?.pnIdentifier) {
      setError('Unlock to create a table');
      return null;
    }
    setBusy(true);
    setError(null);
    try {
      const bundle = await createTablePrimitiveDoc({ session });
      return bundle.manifest.docId;
    } catch {
      setError('Could not create a table');
      return null;
    } finally {
      setBusy(false);
    }
  }

  function pickTable(id: string) {
    const trimmed = id.trim();
    if (!trimmed) return;
    if (kind === 'embed') {
      onCommit({ kind: 'embed', docId: trimmed });
      return;
    }
    if (kind === 'open') {
      onCommit({ kind: 'open', docId: trimmed, label: openLabel.trim() || 'Open' });
      return;
    }
    setDocId(trimmed);
  }

  return (
    <div className="border-b border-neutral-200 bg-neutral-50 px-2 py-2 text-[11px] text-neutral-700">
      {!kind && (
        <div className="flex flex-col gap-1">
          <MenuBtn onClick={() => setKind('embed')}>Embed table</MenuBtn>
          <MenuBtn onClick={() => setKind('vote')}>Vote sticker</MenuBtn>
          <MenuBtn onClick={() => setKind('open')}>Open sticker</MenuBtn>
        </div>
      )}
      {kind === 'open' && !docId && (
        <label className="mb-1 flex items-center gap-1">
          Label
          <input
            className="min-w-0 flex-1 border border-neutral-300 bg-white px-1 py-0.5"
            value={openLabel}
            onChange={(e) => setOpenLabel(e.target.value)}
          />
        </label>
      )}
      {kind && !docId && (
        <div className="flex flex-col gap-1">
          <div className="font-bold uppercase tracking-wide text-neutral-500">Bind table</div>
          {tables.length === 0 && (
            <div className="text-neutral-500">No tables yet</div>
          )}
          {tables.map((t) => (
            <MenuBtn key={t.docId} onClick={() => pickTable(t.docId)}>
              {t.title || 'Untitled table'}
            </MenuBtn>
          ))}
          <MenuBtn
            disabled={busy || !pn}
            onClick={() => {
              void mintTable().then((id) => {
                if (id) pickTable(id);
              });
            }}
          >
            {busy ? 'Creating…' : 'New table'}
          </MenuBtn>
          <MenuBtn onClick={() => setKind(null)}>Back</MenuBtn>
        </div>
      )}
      {kind === 'vote' && docId && (
        <div className="flex flex-col gap-1">
          <div className="font-bold uppercase tracking-wide text-neutral-500">Vote row</div>
          {rows.length === 0 && <div className="text-neutral-500">This table has no rows</div>}
          {rows.map((row) => (
            <MenuBtn
              key={row.id}
              onClick={() =>
                onCommit({
                  kind: 'vote',
                  docId,
                  rowId: row.id,
                  label: tableRowLabel(row)
                })
              }
            >
              {tableRowLabel(row)}
            </MenuBtn>
          ))}
          <MenuBtn onClick={() => setDocId(null)}>Back</MenuBtn>
        </div>
      )}
      {error && <div className="mt-1 text-red-700">{error}</div>}
      <button
        type="button"
        className="mt-1 text-[10px] uppercase tracking-wide text-neutral-500 hover:text-black"
        onClick={onCancel}
      >
        Cancel
      </button>
    </div>
  );
}

function MenuBtn({
  children,
  onClick,
  disabled
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className="rounded px-1 py-1 text-left font-medium text-black hover:bg-white disabled:opacity-40"
      onClick={onClick}
    >
      {children}
    </button>
  );
}
