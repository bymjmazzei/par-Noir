/**
 * Cloud media picker — default to Drive feed/library media; optional device upload.
 */
import { useEffect, useState } from 'react';
import {
  downloadCloudImageAsDataUrl,
  fileToDataUrl,
  listCloudMedia,
  pickDeviceImageFile,
  pickDeviceVideoFile,
  type CloudImageItem
} from '../services/penAttach';
import type { PenSession } from '../services/penSession';

export function CloudFeedMediaPicker({
  open,
  onClose,
  session,
  kind,
  docId,
  onPickDataUrl
}: {
  open: boolean;
  onClose: () => void;
  session: PenSession | null;
  kind: 'image' | 'video';
  docId?: string;
  onPickDataUrl: (dataUrl: string) => void;
}) {
  const [items, setItems] = useState<CloudImageItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !session) return;
    let cancelled = false;
    setBusy(true);
    setError(null);
    void listCloudMedia(session.accessToken, session.pnIdentifier, kind)
      .then((list) => {
        if (!cancelled) setItems(list);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load cloud media');
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, session, kind]);

  if (!open) return null;

  async function pickCloud(item: CloudImageItem) {
    if (!session) return;
    setLoadingId(item.id);
    setError(null);
    try {
      const url = await downloadCloudImageAsDataUrl(
        session.accessToken,
        item.id,
        session.pnIdentifier,
        docId
      );
      onPickDataUrl(url);
      onClose();
    } catch {
      setError('Could not open that file');
    } finally {
      setLoadingId(null);
    }
  }

  async function uploadDevice() {
    const file =
      kind === 'image' ? await pickDeviceImageFile() : await pickDeviceVideoFile();
    if (!file) return;
    const url = await fileToDataUrl(file);
    onPickDataUrl(url);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4">
      <div
        className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-lg bg-white shadow-xl"
        role="dialog"
        aria-label="Choose media"
      >
        <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
          <div>
            <h2 className="text-sm font-bold text-black">Cloud media</h2>
            <p className="text-[11px] text-neutral-500">
              Feed posts and library {kind}s from your cloud
            </p>
          </div>
          <button
            type="button"
            className="text-sm text-neutral-500 hover:text-black"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <div className="border-b border-neutral-100 px-4 py-2">
          <button
            type="button"
            className="text-[12px] font-bold text-black hover:opacity-60"
            onClick={() => void uploadDevice()}
          >
            Upload from device…
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-3">
          {busy && <p className="text-sm text-neutral-500">Loading…</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
          {!busy && items.length === 0 && (
            <p className="text-sm text-neutral-500">
              No cloud {kind}s yet. Upload from device or publish feed media first.
            </p>
          )}
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  disabled={loadingId === item.id}
                  className="flex w-full flex-col gap-1 rounded border border-neutral-200 p-2 text-left hover:border-black disabled:opacity-50"
                  onClick={() => void pickCloud(item)}
                >
                  <span className="flex aspect-square items-center justify-center rounded bg-neutral-100 text-[10px] uppercase text-neutral-400">
                    {item.mimeType?.startsWith('video/') ? 'Video' : 'Image'}
                  </span>
                  <span className="truncate text-[11px] text-neutral-700">{item.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
