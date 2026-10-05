/** Lists the music registry and attaches the chosen track to a media layer. */

import { useEffect, useState } from 'react';
import type { PenSectionContent } from '@par-noir/pen-protocol';
import {
  attachCatalogTrack,
  fetchMusicCatalog,
  soundHostLayer,
  type CatalogTrack
} from '../services/soundCatalog';

export function SoundCatalogMenu({
  section,
  activeLayerId,
  onSectionChange,
  onCancel
}: {
  section: PenSectionContent;
  activeLayerId: string | null;
  onSectionChange: (next: PenSectionContent) => void;
  onCancel: () => void;
}) {
  const host = soundHostLayer(section, activeLayerId);
  const [tracks, setTracks] = useState<CatalogTrack[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!host) return;
    let cancelled = false;
    void fetchMusicCatalog()
      .then((rows) => {
        if (!cancelled) setTracks(rows);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load the music catalog');
      });
    return () => {
      cancelled = true;
    };
  }, [host]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-label="Add sound"
        className="flex max-h-[70vh] w-full max-w-sm flex-col rounded border border-neutral-200 bg-white text-[12px] text-neutral-800 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-200 px-3 py-2">
          <span className="font-semibold">Sound</span>
          <button type="button" className="text-neutral-500 hover:text-black" onClick={onCancel}>
            Close
          </button>
        </div>
        {!host ? (
          <p className="px-3 py-3 text-neutral-600">Nothing on this page can hold a sound.</p>
        ) : (
          <>
            <div className="px-3 pt-2">
              <input
                aria-label="Search music"
                value={query}
                placeholder="Search"
                className="w-full rounded border border-neutral-300 px-2 py-1"
                onChange={(event) => {
                  const next = event.target.value;
                  setQuery(next);
                  void fetchMusicCatalog(next)
                    .then(setTracks)
                    .catch(() => setError('Could not load the music catalog'));
                }}
              />
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-auto px-2 py-2">
              {tracks.length === 0 && !error && (
                <p className="px-1 py-2 text-neutral-500">No tracks</p>
              )}
              {tracks.map((track) => (
                <button
                  key={track.id}
                  type="button"
                  className="w-full rounded px-2 py-1 text-left hover:bg-neutral-50"
                  onClick={() => {
                    onSectionChange(attachCatalogTrack(section, host.id, track));
                    onCancel();
                  }}
                >
                  {track.title}
                  {track.displayArtist ? ` — ${track.displayArtist}` : ''}
                </button>
              ))}
            </div>
          </>
        )}
        {error && <p className="px-3 pb-2 text-red-600">{error}</p>}
      </div>
    </div>
  );
}
