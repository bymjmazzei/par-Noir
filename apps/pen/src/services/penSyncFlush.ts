/**
 * Flush offline sync queue → cloud apply-inbound.
 */

import {
  bootstrapDocCloud,
  publishDocCloud,
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
import type { PenDraftManifest, PenDocComment, PenSuggestion } from '@par-noir/pen-protocol';

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
