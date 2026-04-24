import { Fragment, useCallback, useEffect, useState } from 'react';
import { API_ENDPOINT } from '../config/api';
import { useLicensingSession } from '../context/LicensingSessionContext';

export type TrackStatus = 'draft' | 'active' | 'retired';

export interface RegistryTrack {
  id: string;
  ownerPnIdentifier: string;
  title: string;
  displayArtist: string | null;
  isrc: string | null;
  status: TrackStatus;
  splitsMetadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export type MusicPayeeFormRow = { pn_identifier: string; basis_points: number };

function parsePayeesFromMetadata(meta: Record<string, unknown>): MusicPayeeFormRow[] {
  const raw = meta.payees;
  if (!Array.isArray(raw)) return [];
  const out: MusicPayeeFormRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const o = item as Record<string, unknown>;
    const pn = String(o.pn_identifier ?? o.identity_id ?? '').trim();
    const bp = Math.floor(Number(o.basis_points ?? o.basisPoints ?? 0));
    if (!pn || !Number.isFinite(bp) || bp <= 0) continue;
    out.push({ pn_identifier: pn, basis_points: bp });
  }
  return out;
}

export function TrackLibraryPanel() {
  const { authHeaders, signedIn, refreshUser } = useLicensingSession();
  const [tracks, setTracks] = useState<RegistryTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [displayArtist, setDisplayArtist] = useState('');
  const [isrc, setIsrc] = useState('');
  const [newStatus, setNewStatus] = useState<TrackStatus>('draft');
  const [saving, setSaving] = useState(false);
  const [splitsTrackId, setSplitsTrackId] = useState<string | null>(null);
  const [payeeRows, setPayeeRows] = useState<MusicPayeeFormRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`${API_ENDPOINT}/api/v1/music/registry/tracks`, {
        headers: authHeaders()
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error_description?: string };
        throw new Error(j.error_description || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { tracks?: RegistryTrack[] };
      setTracks(Array.isArray(data.tracks) ? data.tracks : []);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load tracks');
      setTracks([]);
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    if (signedIn) void load();
  }, [signedIn, load]);

  const addTrack = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    setLoadError(null);
    try {
      const res = await fetch(`${API_ENDPOINT}/api/v1/music/registry/tracks`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          title: title.trim(),
          displayArtist: displayArtist.trim() || undefined,
          isrc: isrc.trim() || undefined,
          status: newStatus
        })
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error_description?: string };
        throw new Error(j.error_description || `HTTP ${res.status}`);
      }
      setTitle('');
      setDisplayArtist('');
      setIsrc('');
      setNewStatus('draft');
      await load();
      await refreshUser();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const patchStatus = async (id: string, status: TrackStatus) => {
    setSaving(true);
    setLoadError(null);
    try {
      const res = await fetch(`${API_ENDPOINT}/api/v1/music/registry/tracks/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ status })
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error_description?: string };
        throw new Error(j.error_description || `HTTP ${res.status}`);
      }
      await load();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  const openSplitsEditor = (t: RegistryTrack) => {
    setSplitsTrackId(t.id);
    setPayeeRows(parsePayeesFromMetadata(t.splitsMetadata));
  };

  const cancelSplitsEditor = () => {
    setSplitsTrackId(null);
    setPayeeRows([]);
  };

  const saveSplitsMetadata = async (t: RegistryTrack) => {
    const normalized: MusicPayeeFormRow[] = payeeRows
      .map((r) => ({
        pn_identifier: r.pn_identifier.trim(),
        basis_points: Math.floor(Number(r.basis_points))
      }))
      .filter((r) => r.pn_identifier.length > 0 && Number.isFinite(r.basis_points) && r.basis_points > 0);

    if (normalized.length > 0) {
      const sum = normalized.reduce((a, r) => a + r.basis_points, 0);
      if (sum !== 10000) {
        setLoadError(`Payee basis_points must sum to 10_000 (currently ${sum}).`);
        return;
      }
    }

    setSaving(true);
    setLoadError(null);
    try {
      const nextMeta: Record<string, unknown> = { ...t.splitsMetadata };
      if (normalized.length === 0) {
        delete nextMeta.payees;
      } else {
        nextMeta.payees = normalized.map((r) => ({
          pn_identifier: r.pn_identifier,
          basis_points: r.basis_points
        }));
      }
      const res = await fetch(`${API_ENDPOINT}/api/v1/music/registry/tracks/${encodeURIComponent(t.id)}`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ splitsMetadata: nextMeta })
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error_description?: string };
        throw new Error(j.error_description || `HTTP ${res.status}`);
      }
      cancelSplitsEditor();
      await load();
      await refreshUser();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="max-w-4xl mx-auto px-6 py-10 text-left space-y-8">
      <div>
        <h2 className="text-2xl font-semibold mb-2">Track library</h2>
        <p className="text-neutral-400 text-sm">
          Registered tracks power the licensed library and creator-fund music pool. Rows are scoped to your
          signed-in par Noir identity.
        </p>
        <p className="text-neutral-500 text-xs mt-2 max-w-2xl">
          Optional multiparty splits: use the table editor below or PATCH{' '}
          <code className="text-neutral-300">splitsMetadata</code> with{' '}
          <code className="text-neutral-300">payees</code> — each{' '}
          <code className="text-neutral-300">&#123; pn_identifier, basis_points &#125;</code>, summing to 10_000 (100%).
          Cleared list → 100% to the track owner for the music-pool share.
        </p>
      </div>

      {loadError && (
        <div className="rounded-lg border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          {loadError}
        </div>
      )}

      <form onSubmit={addTrack} className="space-y-4 rounded-lg border border-white/10 bg-neutral-900/50 p-4">
        <h3 className="font-medium">Add track</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="block text-xs text-neutral-400 mb-1">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-neutral-900/80 border border-white/20 text-white focus:outline-none focus:border-white/40"
              placeholder="Track title"
              required
            />
          </div>
          <div>
            <label className="block text-xs text-neutral-400 mb-1">Display artist</label>
            <input
              value={displayArtist}
              onChange={(e) => setDisplayArtist(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-neutral-900/80 border border-white/20 text-white focus:outline-none focus:border-white/40"
              placeholder="Artist as shown"
            />
          </div>
          <div>
            <label className="block text-xs text-neutral-400 mb-1">ISRC (optional)</label>
            <input
              value={isrc}
              onChange={(e) => setIsrc(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-neutral-900/80 border border-white/20 text-white focus:outline-none focus:border-white/40"
              placeholder="e.g. USXXX0000000"
            />
          </div>
          <div>
            <label className="block text-xs text-neutral-400 mb-1">Initial status</label>
            <select
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value as TrackStatus)}
              className="w-full px-3 py-2 rounded-lg bg-neutral-900/80 border border-white/20 text-white focus:outline-none focus:border-white/40"
            >
              <option value="draft">draft</option>
              <option value="active">active</option>
              <option value="retired">retired</option>
            </select>
          </div>
        </div>
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 rounded-lg border border-white/30 text-white text-sm font-medium hover:bg-white/10 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Add track'}
        </button>
      </form>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium">Your tracks</h3>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="text-sm text-neutral-400 hover:text-white disabled:opacity-50"
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
        {tracks.length === 0 && !loading ? (
          <p className="text-sm text-neutral-500">No tracks yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-white/10">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-neutral-400">
                  <th className="p-3 font-medium">Title</th>
                  <th className="p-3 font-medium">Artist</th>
                  <th className="p-3 font-medium">ISRC</th>
                  <th className="p-3 font-medium">Status</th>
                  <th className="p-3 font-medium w-52">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tracks.map((t) => (
                  <Fragment key={t.id}>
                    <tr className="border-b border-white/5">
                      <td className="p-3 text-white">{t.title}</td>
                      <td className="p-3 text-neutral-300">{t.displayArtist || '—'}</td>
                      <td className="p-3 text-neutral-400 font-mono text-xs">{t.isrc || '—'}</td>
                      <td className="p-3">
                        <span className="text-neutral-300">{t.status}</span>
                      </td>
                      <td className="p-3">
                        <div className="flex flex-col gap-2">
                          <div className="flex flex-wrap gap-1">
                            {(['draft', 'active', 'retired'] as const).map((s) => (
                              <button
                                key={s}
                                type="button"
                                disabled={saving || t.status === s}
                                onClick={() => void patchStatus(t.id, s)}
                                className="px-2 py-1 rounded text-xs border border-white/15 hover:bg-white/10 disabled:opacity-40"
                              >
                                {s}
                              </button>
                            ))}
                          </div>
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() =>
                              splitsTrackId === t.id ? cancelSplitsEditor() : openSplitsEditor(t)
                            }
                            className="text-left text-xs text-neutral-400 hover:text-white underline-offset-2 hover:underline"
                          >
                            {splitsTrackId === t.id ? 'Close splits' : 'Edit music-pool splits'}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {splitsTrackId === t.id && (
                      <tr className="border-b border-white/5 bg-neutral-950/60">
                        <td colSpan={5} className="p-4 space-y-3">
                          <p className="text-xs text-neutral-500">
                            Music-pool (25%) multiparty payees. Basis points must total 10_000. Leave empty for 100% to
                            you (track owner).
                          </p>
                          <div className="space-y-2">
                            {payeeRows.length === 0 ? (
                              <p className="text-sm text-neutral-400">No co-payees — owner receives full music share.</p>
                            ) : (
                              payeeRows.map((row, idx) => (
                                <div key={idx} className="flex flex-wrap gap-2 items-end">
                                  <div className="flex-1 min-w-[12rem]">
                                    <label className="block text-[10px] text-neutral-500 mb-0.5">pn_identifier</label>
                                    <input
                                      value={row.pn_identifier}
                                      onChange={(e) => {
                                        const next = [...payeeRows];
                                        next[idx] = { ...next[idx], pn_identifier: e.target.value };
                                        setPayeeRows(next);
                                      }}
                                      className="w-full px-2 py-1.5 rounded bg-neutral-900 border border-white/15 text-sm text-white"
                                      placeholder="Identity id"
                                    />
                                  </div>
                                  <div className="w-28">
                                    <label className="block text-[10px] text-neutral-500 mb-0.5">basis_points</label>
                                    <input
                                      type="number"
                                      min={1}
                                      max={10000}
                                      value={row.basis_points || ''}
                                      onChange={(e) => {
                                        const next = [...payeeRows];
                                        next[idx] = {
                                          ...next[idx],
                                          basis_points: parseInt(e.target.value, 10) || 0
                                        };
                                        setPayeeRows(next);
                                      }}
                                      className="w-full px-2 py-1.5 rounded bg-neutral-900 border border-white/15 text-sm text-white"
                                    />
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => setPayeeRows(payeeRows.filter((_, i) => i !== idx))}
                                    className="px-2 py-1.5 text-xs text-red-300 hover:text-red-200"
                                  >
                                    Remove
                                  </button>
                                </div>
                              ))
                            )}
                          </div>
                          <div className="flex flex-wrap gap-2 items-center">
                            <button
                              type="button"
                              onClick={() =>
                                setPayeeRows([...payeeRows, { pn_identifier: '', basis_points: 0 }])
                              }
                              className="px-3 py-1.5 rounded text-xs border border-white/20 hover:bg-white/10"
                            >
                              Add payee
                            </button>
                            {payeeRows.length > 0 && (
                              <span className="text-xs text-neutral-500">
                                Sum:{' '}
                                {payeeRows.reduce((a, r) => a + (Number.isFinite(r.basis_points) ? r.basis_points : 0), 0)}{' '}
                                / 10_000
                              </span>
                            )}
                          </div>
                          <div className="flex gap-2 pt-1">
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => void saveSplitsMetadata(t)}
                              className="px-3 py-1.5 rounded text-sm border border-white/30 text-white hover:bg-white/10 disabled:opacity-50"
                            >
                              Save splits
                            </button>
                            <button
                              type="button"
                              disabled={saving}
                              onClick={cancelSplitsEditor}
                              className="px-3 py-1.5 rounded text-sm text-neutral-400 hover:text-white"
                            >
                              Cancel
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
