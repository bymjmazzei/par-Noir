/**
 * Background upload queue: each local blob uploads at most once, in-flight uploads are
 * shared, and failures back off (30s → 2m → 10m) instead of retrying on every save.
 * Autosave calls {@link queueDocMedia} and never waits; publish awaits {@link awaitDocMedia}.
 */

import { uploadPenMedia } from './drive';
import {
  isPenLocalMediaRef,
  MEDIA_SRC_FIELDS,
  parsePenLocalMediaId,
  penMediaRef,
  PRESENTATION_MEDIA_FIELDS
} from './refs';
import { getLocalMedia, setLocalMediaDriveFileId } from './store';

export const UPLOAD_BACKOFF_MS = [30_000, 120_000, 600_000] as const;

type MediaTrack = { src?: string };
type MediaLayer = { audioTracks?: MediaTrack[] };
type MediaSection = { layers?: MediaLayer[] };
type MediaPresentation = { backgroundImage?: string; backgroundVideo?: string };

export type DocMediaJob<S extends MediaSection, P extends MediaPresentation> = {
  pnIdentifier: string;
  docId: string;
  sections: S[];
  pagePresentation?: P;
  /** Called with penlocal → penmedia ref swaps; apply them to the editor's current state. */
  onRewritten?: (map: Map<string, string>) => void;
};

type UploadState = {
  fileId?: string;
  inflight?: Promise<string | null>;
  failures: number;
  nextAt: number;
};

const uploads = new Map<string, UploadState>();
const latestJob = new Map<string, DocMediaJob<MediaSection, MediaPresentation>>();
const retryTimers = new Map<string, ReturnType<typeof setTimeout>>();

function layerRefs(layer: MediaLayer): string[] {
  const rec = layer as Record<string, unknown>;
  const out: string[] = [];
  for (const field of MEDIA_SRC_FIELDS) {
    const v = rec[field];
    if (typeof v === 'string') out.push(v);
  }
  for (const t of layer.audioTracks || []) if (typeof t.src === 'string') out.push(t.src);
  return out;
}

export function collectLocalMediaRefs(
  sections: MediaSection[],
  pagePresentation?: MediaPresentation
): string[] {
  const out = new Set<string>();
  for (const s of sections) {
    for (const layer of s.layers || []) {
      for (const v of layerRefs(layer)) if (isPenLocalMediaRef(v)) out.add(v);
    }
  }
  for (const field of PRESENTATION_MEDIA_FIELDS) {
    const v = pagePresentation?.[field];
    if (isPenLocalMediaRef(v)) out.add(v as string);
  }
  return [...out];
}

/** Swap refs in layer + presentation media fields; untouched objects keep identity. */
export function rewriteDocMediaRefs<S extends MediaSection, P extends MediaPresentation>(
  sections: S[],
  pagePresentation: P | undefined,
  map: Map<string, string>
): { sections: S[]; pagePresentation: P | undefined } {
  if (!map.size) return { sections, pagePresentation };
  const swap = (v: unknown) => (typeof v === 'string' ? map.get(v) : undefined);
  const nextSections = sections.map((s) => {
    if (!s.layers?.length) return s;
    let changed = false;
    const layers = s.layers.map((layer) => {
      const rec = layer as Record<string, unknown>;
      let next: Record<string, unknown> | null = null;
      for (const field of MEDIA_SRC_FIELDS) {
        const to = swap(rec[field]);
        if (to) (next ??= { ...rec })[field] = to;
      }
      if (layer.audioTracks?.some((t) => swap(t.src))) {
        (next ??= { ...rec }).audioTracks = layer.audioTracks.map((t) => {
          const to = swap(t.src);
          return to ? { ...t, src: to } : t;
        });
      }
      if (!next) return layer;
      changed = true;
      return next as MediaLayer;
    });
    return changed ? { ...s, layers } : s;
  });
  let nextPres = pagePresentation;
  if (pagePresentation) {
    for (const field of PRESENTATION_MEDIA_FIELDS) {
      const to = swap(pagePresentation[field]);
      if (to) nextPres = { ...(nextPres as P), [field]: to };
    }
  }
  return { sections: nextSections as S[], pagePresentation: nextPres };
}

function uploadOnce(
  pnIdentifier: string,
  docId: string,
  mediaId: string,
  force: boolean
): Promise<string | null> {
  let st = uploads.get(mediaId);
  if (!st) {
    st = { failures: 0, nextAt: 0 };
    uploads.set(mediaId, st);
  }
  if (st.fileId) return Promise.resolve(st.fileId);
  if (st.inflight) return st.inflight;
  if (!force && Date.now() < st.nextAt) return Promise.resolve(null);
  const state = st;
  state.inflight = (async () => {
    const hit = await getLocalMedia(mediaId);
    if (!hit) throw new Error('pen_media_missing_local');
    const fileId =
      hit.driveFileId ||
      (await uploadPenMedia({ pnIdentifier, docId, blob: hit.blob, fileName: `media-${mediaId}.pnm` }));
    if (!hit.driveFileId) await setLocalMediaDriveFileId(mediaId, fileId);
    state.fileId = fileId;
    state.failures = 0;
    return fileId;
  })()
    .catch((e: unknown) => {
      state.failures += 1;
      const wait = UPLOAD_BACKOFF_MS[Math.min(state.failures, UPLOAD_BACKOFF_MS.length) - 1];
      state.nextAt = Date.now() + wait;
      console.warn('[pen-media] upload failed; retry in', `${wait / 1000}s`, e instanceof Error ? e.message : e);
      return null;
    })
    .finally(() => {
      state.inflight = undefined;
    });
  return state.inflight;
}

function scheduleRetry(docId: string, mediaIds: string[]): void {
  if (retryTimers.has(docId)) return;
  const soonest = Math.min(...mediaIds.map((id) => uploads.get(id)?.nextAt ?? Infinity));
  if (!Number.isFinite(soonest)) return;
  const timer = setTimeout(() => {
    retryTimers.delete(docId);
    const job = latestJob.get(docId);
    if (job) void runDoc(job, false);
  }, Math.max(0, soonest - Date.now()));
  retryTimers.set(docId, timer);
}

async function runDoc<S extends MediaSection, P extends MediaPresentation>(
  job: DocMediaJob<S, P>,
  force: boolean
): Promise<{ sections: S[]; pagePresentation: P | undefined; pending: number }> {
  const refs = collectLocalMediaRefs(job.sections, job.pagePresentation);
  const map = new Map<string, string>();
  const failed: string[] = [];
  await Promise.all(
    refs.map(async (ref) => {
      const mediaId = parsePenLocalMediaId(ref);
      if (!mediaId) return;
      const fileId = await uploadOnce(job.pnIdentifier, job.docId, mediaId, force);
      if (fileId) map.set(ref, penMediaRef(fileId));
      else failed.push(mediaId);
    })
  );
  if (map.size) job.onRewritten?.(map);
  if (failed.length && !force) scheduleRetry(job.docId, failed);
  const out = rewriteDocMediaRefs(job.sections, job.pagePresentation, map);
  return { ...out, pending: refs.length - map.size };
}

/** Fire-and-forget: start/continue uploads for every local ref in the doc. */
export function queueDocMedia<S extends MediaSection, P extends MediaPresentation>(
  job: DocMediaJob<S, P>
): void {
  latestJob.set(job.docId, job as unknown as DocMediaJob<MediaSection, MediaPresentation>);
  if (!collectLocalMediaRefs(job.sections, job.pagePresentation).length) return;
  void runDoc(job, false);
}

/** Publish path: upload now (ignoring backoff) and return the doc with Drive refs. */
export function awaitDocMedia<S extends MediaSection, P extends MediaPresentation>(
  job: DocMediaJob<S, P>
): Promise<{ sections: S[]; pagePresentation: P | undefined; pending: number }> {
  latestJob.set(job.docId, job as unknown as DocMediaJob<MediaSection, MediaPresentation>);
  return runDoc(job, true);
}

/** Upload one stored blob now (shares any in-flight upload). Null when offline or failed. */
export function uploadLocalMedia(params: {
  pnIdentifier: string;
  docId: string;
  mediaId: string;
}): Promise<string | null> {
  return uploadOnce(params.pnIdentifier, params.docId, params.mediaId, true);
}

export function resetPenMediaQueueForTests(): void {
  for (const t of retryTimers.values()) clearTimeout(t);
  retryTimers.clear();
  uploads.clear();
  latestJob.clear();
}
