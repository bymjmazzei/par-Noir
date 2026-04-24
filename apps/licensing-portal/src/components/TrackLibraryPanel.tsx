import { useCallback, useEffect, useState } from 'react';
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

  return (
    <section className="max-w-4xl mx-auto px-6 py-10 text-left space-y-8">
      <div>
        <h2 className="text-2xl font-semibold mb-2">Track library</h2>
        <p className="text-neutral-400 text-sm">
          Registered tracks power the licensed library and creator-fund music pool. Rows are scoped to your
          signed-in par Noir identity.
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
                  <th className="p-3 font-medium w-40">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tracks.map((t) => (
                  <tr key={t.id} className="border-b border-white/5 last:border-0">
                    <td className="p-3 text-white">{t.title}</td>
                    <td className="p-3 text-neutral-300">{t.displayArtist || '—'}</td>
                    <td className="p-3 text-neutral-400 font-mono text-xs">{t.isrc || '—'}</td>
                    <td className="p-3">
                      <span className="text-neutral-300">{t.status}</span>
                    </td>
                    <td className="p-3">
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
