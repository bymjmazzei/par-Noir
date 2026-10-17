/**
 * Cloud media picker — stores penmedia: refs (never giant data URLs). Device files
 * upload to Drive here, behind a progress bar, before the layer can be edited.
 */
import { useEffect, useRef, useState } from 'react';
import { attachMediaFile, ensurePenMediaUrl, penMediaRef } from '@par-noir/pen-media';
import {
  listCloudMedia,
  pickDeviceImageFile,
  pickDeviceVideoFile,
  type CloudImageItem
} from '../services/penAttach';
import { setAttachPoster } from '../services/attachPosterCache';
import type { PenSession } from '../services/penSession';

type UploadState = { file: File; sent: number; total: number; failed: string | null };

function uploadErrorText(e: unknown): string {
  const msg = e instanceof Error ? e.message : '';
  if (msg === 'cloud_on_device') return 'Cloud is not connected on this device.';
  if (msg === 'doc_key_required') return 'This document has no key on this device.';
  return 'Upload failed. Check your connection and retry.';
}

function UploadProgress({
  upload,
  onCancel,
  onRetry
}: {
  upload: UploadState;
  onCancel: () => void;
  onRetry: () => void;
}) {
  const pct = upload.total ? Math.min(100, Math.round((upload.sent / upload.total) * 100)) : 0;
  return (
    <div className="flex flex-col gap-1" aria-live="polite">
      <div className="flex items-center justify-between gap-2 text-[12px]">
        <span className="truncate text-neutral-700">
          {upload.failed ? upload.failed : `Uploading ${upload.file.name} — ${pct}%`}
        </span>
        <span className="flex shrink-0 gap-3">
          {upload.failed && (
            <button type="button" className="font-bold text-black hover:opacity-60" onClick={onRetry}>
              Retry
            </button>
          )}
          <button type="button" className="text-neutral-500 hover:text-black" onClick={onCancel}>
            Cancel
          </button>
        </span>
      </div>
      {!upload.failed && (
        <div
          className="h-1.5 w-full overflow-hidden rounded bg-neutral-100"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
        >
          <div className="h-full bg-black transition-[width]" style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

export function CloudFeedMediaPicker({
  open,
  onClose,
  session,
  kind,
  docId,
  onPickMediaSrc,
  kindSwitch = false,
  onKindChange
}: {
  open: boolean;
  onClose: () => void;
  session: PenSession | null;
  kind: 'image' | 'video';
  docId?: string;
  /** Tiny ref: penlocal:{id} or penmedia:{fileId} */
  onPickMediaSrc: (src: string, meta?: { blobUrl?: string }) => void;
  kindSwitch?: boolean;
  onKindChange?: (kind: 'image' | 'video') => void;
}) {
  const [items, setItems] = useState<CloudImageItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [upload, setUpload] = useState<UploadState | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

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

  function close() {
    abortRef.current?.abort();
    abortRef.current = null;
    setUpload(null);
    onClose();
  }

  async function pickCloud(item: CloudImageItem) {
    if (!session || !docId) {
      setError('Document required to attach media');
      return;
    }
    setLoadingId(item.id);
    setError(null);
    try {
      const ref = penMediaRef(item.id);
      const blobUrl = await ensurePenMediaUrl({ src: ref, docId, pnIdentifier: session.pnIdentifier });
      if (!blobUrl) throw new Error('cloud_media_unavailable');
      setAttachPoster(ref, blobUrl);
      onPickMediaSrc(ref, { blobUrl });
      onClose();
    } catch {
      setError('Could not open that file');
    } finally {
      setLoadingId(null);
    }
  }

  async function runUpload(file: File) {
    if (!session || !docId) {
      setError('Document required to attach media');
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setError(null);
    setUpload({ file, sent: 0, total: file.size, failed: null });
    try {
      const out = await attachMediaFile({
        pnIdentifier: session.pnIdentifier,
        docId,
        file,
        signal: controller.signal,
        onProgress: (sent, total) =>
          setUpload((u) => (u && u.file === file ? { ...u, sent, total } : u))
      });
      if (controller.signal.aborted) return;
      abortRef.current = null;
      setUpload(null);
      setAttachPoster(out.ref, out.blobUrl);
      onPickMediaSrc(out.ref, { blobUrl: out.blobUrl });
      onClose();
    } catch (e) {
      if (controller.signal.aborted) return;
      abortRef.current = null;
      setUpload({ file, sent: 0, total: file.size, failed: uploadErrorText(e) });
    }
  }

  async function uploadDevice() {
    const file =
      kind === 'image' ? await pickDeviceImageFile() : await pickDeviceVideoFile();
    if (file) await runUpload(file);
  }

  function cancelUpload() {
    abortRef.current?.abort();
    abortRef.current = null;
    setUpload(null);
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
            onClick={close}
          >
            Close
          </button>
        </div>
        {kindSwitch && onKindChange && (
          <div className="flex gap-2 border-b border-neutral-100 px-4 py-2">
            <button
              type="button"
              aria-pressed={kind === 'image'}
              className={`text-[12px] ${kind === 'image' ? 'font-bold text-black' : 'text-neutral-500'}`}
              onClick={() => onKindChange('image')}
            >
              Image
            </button>
            <button
              type="button"
              aria-pressed={kind === 'video'}
              className={`text-[12px] ${kind === 'video' ? 'font-bold text-black' : 'text-neutral-500'}`}
              onClick={() => onKindChange('video')}
            >
              Video
            </button>
          </div>
        )}
        <div className="border-b border-neutral-100 px-4 py-2">
          {upload ? (
            <UploadProgress
              upload={upload}
              onCancel={cancelUpload}
              onRetry={() => void runUpload(upload.file)}
            />
          ) : (
            <button
              type="button"
              className="text-[12px] font-bold text-black hover:opacity-60"
              onClick={() => void uploadDevice()}
            >
              Upload from device…
            </button>
          )}
        </div>
        <div
          className={`min-h-0 flex-1 overflow-auto p-3 ${upload ? 'pointer-events-none opacity-40' : ''}`}
          aria-disabled={upload ? true : undefined}
        >
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
