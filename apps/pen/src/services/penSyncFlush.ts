/**
 * Flush offline sync queue → cloud apply-inbound.
 */

import {
  bootstrapDocCloud,
  publishDocCloud,
  updateDocMetaCloud,
  upsertDraftCloud
} from './penCloudStore';
import {
  applyPenCommentInbound,
  applyPenSuggestionInbound,
  promotePenOutboxAndFanout
} from './penCollab';
import {
  enqueueSyncJob,
  listSyncJobs,
  markSyncJobFailed,
  removeSyncJob,
  type PenSyncJob
} from './penSyncQueue';
import type { PenSession } from './penSession';
import type { LocalDocBundle } from './penLocalStore';
import { loadLocalDoc, saveLocalDoc } from './penLocalStore';
import type { PenDraftManifest, PenDocComment, PenSuggestion } from '@par-noir/pen-protocol';
import { uploadLocalGalleryBlob, withGalleryPreview } from './penGalleryPreview';

/**
 * Local-first create: enqueue cloud bootstrap and flush in the background.
 * Callers return immediately after saveLocalDoc so the editor can open.
 */
export function scheduleDocCloudBootstrap(params: {
  session: PenSession;
  bundle: LocalDocBundle;
  draft: PenDraftManifest;
}): void {
  const docId = params.bundle.manifest.docId;
  enqueueSyncJob(params.session.pnIdentifier, {
    kind: 'bootstrap',
    docId,
    payload: { bundle: params.bundle, draft: params.draft }
  });
  void flushPenSyncQueue(params.session);
}

export async function flushPenSyncQueue(session: PenSession): Promise<{
  flushed: number;
  failed: number;
}> {
  const jobs = listSyncJobs(session.pnIdentifier);
  let flushed = 0;
  let failed = 0;
  for (const job of jobs) {
    try {
      await applySyncJob(session, job);
      removeSyncJob(session.pnIdentifier, job.id);
      flushed += 1;
    } catch (e) {
      markSyncJobFailed(
        session.pnIdentifier,
        job.id,
        e instanceof Error ? e.message : 'flush_failed'
      );
      failed += 1;
      // Stop on cloud_token_required / offline
      if (e instanceof Error && /cloud_token|Failed to fetch|NetworkError/i.test(e.message)) {
        break;
      }
    }
  }
  try {
    await promotePenOutboxAndFanout(session);
  } catch {
    /* best-effort outbox */
  }
  return { flushed, failed };
}

async function applySyncJob(session: PenSession, job: PenSyncJob): Promise<void> {
  const pn = session.pnIdentifier;
  if (job.kind === 'bootstrap') {
    const bundle = job.payload.bundle as LocalDocBundle;
    const draft = job.payload.draft as PenDraftManifest;
    await bootstrapDocCloud({
      userPnIdentifier: pn,
      bundle,
      draft,
      session
    });
    return;
  }
  if (job.kind === 'draft_upsert') {
    await upsertDraftCloud({
      userPnIdentifier: pn,
      manifest: job.payload.manifest as LocalDocBundle['manifest'],
      draft: job.payload.draft as PenDraftManifest,
      sections: job.payload.sections as LocalDocBundle['sections']
    });
    return;
  }
  if (job.kind === 'publish') {
    await publishDocCloud({
      userPnIdentifier: pn,
      manifest: job.payload.manifest as LocalDocBundle['manifest'],
      sections: job.payload.sections as LocalDocBundle['sections'],
      link: job.payload.link as never,
      sourceDraftId: job.payload.sourceDraftId as string | undefined
    });
    return;
  }
  if (job.kind === 'gallery_preview') {
    const localMediaId = String(job.payload.localMediaId || '');
    const posterLocalMediaId = job.payload.posterLocalMediaId
      ? String(job.payload.posterLocalMediaId)
      : undefined;
    const kind = job.payload.kind === 'video' ? 'video' : 'image';
    const commitHash = String(job.payload.commitHash || '');
    if (!localMediaId) throw new Error('gallery_preview_media_missing');
    const previewRef = await uploadLocalGalleryBlob({
      session,
      docId: job.docId,
      mediaId: localMediaId,
      fileName: 'gallery-preview.penmedia'
    });
    if (!previewRef) throw new Error('gallery_preview_upload_failed');
    let posterRef: string | undefined;
    if (posterLocalMediaId) {
      posterRef =
        (await uploadLocalGalleryBlob({
          session,
          docId: job.docId,
          mediaId: posterLocalMediaId,
          fileName: 'gallery-preview-poster.penmedia'
        })) || undefined;
    }
    const bundle = loadLocalDoc(pn, job.docId);
    if (bundle) {
      const nextManifest = withGalleryPreview(bundle.manifest, {
        galleryPreviewRef: previewRef,
        galleryPreviewKind: kind,
        galleryPreviewPosterRef: posterRef,
        galleryPreviewCommitHash: commitHash || bundle.manifest.galleryPreviewCommitHash || ''
      });
      saveLocalDoc(pn, { ...bundle, manifest: nextManifest });
      await updateDocMetaCloud({
        userPnIdentifier: pn,
        docId: job.docId,
        galleryPreviewRef: nextManifest.galleryPreviewRef,
        galleryPreviewKind: nextManifest.galleryPreviewKind,
        galleryPreviewPosterRef: nextManifest.galleryPreviewPosterRef,
        galleryPreviewCommitHash: nextManifest.galleryPreviewCommitHash
      });
    }
    return;
  }
  if (job.kind === 'comment') {
    const res = await applyPenCommentInbound({
      userPnIdentifier: pn,
      docId: job.docId,
      groupId: job.payload.groupId as string | undefined,
      comment: job.payload.comment as PenDocComment
    });
    if (!res.ok) throw new Error(`comment_${res.status}`);
    return;
  }
  if (job.kind === 'suggestion') {
    const res = await applyPenSuggestionInbound({
      userPnIdentifier: pn,
      docId: job.docId,
      groupId: job.payload.groupId as string | undefined,
      suggestion: job.payload.suggestion as PenSuggestion,
      acceptPromote: job.payload.acceptPromote as Record<string, unknown> | undefined
    });
    if (!res.ok) throw new Error(`suggestion_${res.status}`);
  }
}
